import {
  ActivityNode,
  Attempt,
  InteractionResponse,
  NormalizedProgress as NormalizedProgressRow,
  Person,
  Registration,
} from '@richardmcquiston01/reactive-lms-persistence';
import {
  ATTEMPT_NOT_FOUND,
  CMI_VALUE_INVALID,
  CmiStore,
  LmsError,
  applyMasteryScore,
  coerceCmiValue,
  httpStatusForLmsCode,
  mapCmiToProgress,
  type CmiValues,
  type LaunchMode,
  type ScormCmiDto,
} from '@richardmcquiston01/reactive-lms-shared';
import type { DataSource } from 'typeorm';
import { ProgressSinkService } from '../../progress/progress-sink';
import { extractInteractions } from './interaction-records';

/**
 * Hydrates and commits SCORM 1.2 CMI for an attempt, mapping
 * `lesson_status` and score onto {@link ProgressSinkService}.
 */
export class ScormCmiService {
  /**
   * @param dataSource - Caller-owned TypeORM DataSource
   * @param sink - Format-agnostic progress writer
   */
  constructor(
    private readonly dataSource: DataSource,
    private readonly sink: ProgressSinkService,
  ) {}

  /**
   * Returns the CMI map for an attempt (student fields + persisted values).
   *
   * @param attemptId - Attempt id from launch
   */
  async getCmi(attemptId: string): Promise<ScormCmiDto> {
    const ctx = await this.loadContext(attemptId);
    return { values: this.seedStore(ctx).snapshot() };
  }

  /**
   * Returns the CMI values exactly as stored, with nothing dropped for a new
   * session. {@link getCmi} leaves out the previous session's `session_time`
   * and `exit`; content that talks to the server directly (AICC) needs them to
   * carry a session's values from one request to the next.
   *
   * @param attemptId - Attempt id from launch
   */
  async getStoredCmi(attemptId: string): Promise<CmiValues> {
    const ctx = await this.loadContext(attemptId);
    return { ...ctx.persisted };
  }

  /**
   * Checks a CMI snapshot from the browser, then persists it and rolls it into
   * {@link ProgressSinkService}.
   *
   * The snapshot is not trusted. Every value it changes is replayed through
   * the same {@link CmiStore} that the SCORM API uses, so anything the API
   * would have refused (a score out of range, text that is too long, a status
   * outside the vocabulary, an element that does not exist) is refused here
   * too. Read-only values the browser sends back are ignored, because the LMS
   * owns them, and the total time is worked out here from the session time
   * when the session finishes. A snapshot with any refused value saves nothing.
   *
   * @param attemptId - Attempt id from launch
   * @param body - Committed CMI values; `finished` closes the attempt
   * @throws {LmsError} `CMI_VALUE_INVALID` naming every refused element
   */
  async putCmi(attemptId: string, body: ScormCmiDto): Promise<ScormCmiDto> {
    const ctx = await this.loadContext(attemptId);
    const submitted = body.values ?? {};
    const store = this.seedStore(ctx);
    const problems = replaySubmitted(store, submitted);
    if (problems.length > 0) {
      throw invalidCmiError(attemptId, problems);
    }
    if (body.finished && ctx.attempt.termination === 'still_open') {
      // Adds this session's time to the total, as the SCO's LMSFinish does. A
      // finish for an attempt that is already closed (a save that was retried
      // after its reply was lost) has already been added, so it adds nothing.
      store.LMSFinish('');
    }
    return this.commit(
      ctx,
      attemptId,
      store,
      submitted,
      body.finished === true,
    );
  }

  /**
   * Persists a CMI snapshot that the caller has already checked, such as the
   * AICC endpoint, which checks each value with its own {@link CmiStore}. The
   * values are saved as given.
   *
   * @param attemptId - Attempt id from launch
   * @param body - Checked CMI values; `finished` closes the attempt
   */
  async putValidatedCmi(
    attemptId: string,
    body: ScormCmiDto,
  ): Promise<ScormCmiDto> {
    const ctx = await this.loadContext(attemptId);
    const submitted = body.values ?? {};
    const store = this.seedStore(ctx);
    store.loadValues(submitted);
    return this.commit(
      ctx,
      attemptId,
      store,
      submitted,
      body.finished === true,
    );
  }

  /** Saves a session's CMI, rolls it into progress, and closes the attempt when finished. */
  private async commit(
    ctx: CmiContext,
    attemptId: string,
    store: CmiStore,
    submitted: CmiValues,
    finished: boolean,
  ): Promise<ScormCmiDto> {
    store.applyLmsOwned(lmsOwnedFrom(ctx));
    // When a SCO finishes, the mastery score (if the manifest set one) decides
    // pass or fail from the raw score, whatever status the SCO wrote.
    // Interactions are replaced when this session reported any, and kept as
    // they were when it did not (for example a review session that records none).
    const carried = hasInteractions(submitted)
      ? {}
      : onlyInteractions(ctx.persisted);
    const reported = { ...store.snapshot(), ...carried };
    const values = finished ? applyMasteryScore(reported) : reported;
    const activityNodeId = ctx.activityNodeId;
    if (!activityNodeId) {
      throw new LmsError({
        status: httpStatusForLmsCode(ATTEMPT_NOT_FOUND),
        code: ATTEMPT_NOT_FOUND,
        message: 'Attempt has no activity node to record CMI against.',
        details: { attemptId },
      });
    }

    await this.sink.upsert(
      mapCmiToProgress(values, {
        registrationId: ctx.attempt.registrationId,
        courseModuleId: ctx.attempt.courseModuleId,
        activityNodeId,
      }),
    );

    // Only a session that reported interactions replaces what was stored for
    // its attempt; one that reported none leaves the earlier answers alone.
    if (hasInteractions(submitted)) {
      await this.replaceInteractions(ctx, activityNodeId, values);
    }

    if (finished) {
      ctx.attempt.termination = 'terminated';
      ctx.attempt.endedAt = new Date();
      await this.dataSource.manager.save(ctx.attempt);
    }

    return { values };
  }

  /** Replaces the stored answers for the attempt with what the SCO reported. */
  private async replaceInteractions(
    ctx: CmiContext,
    activityNodeId: string,
    values: CmiValues,
  ): Promise<void> {
    const records = extractInteractions(values);
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(InteractionResponse, { attemptId: ctx.attempt.id });
      if (records.length === 0) {
        return;
      }
      await manager.insert(
        InteractionResponse,
        records.map((record) => ({
          ...record,
          attemptId: ctx.attempt.id,
          registrationId: ctx.attempt.registrationId,
          courseModuleId: ctx.attempt.courseModuleId,
          activityNodeId,
        })),
      );
    });
  }

  /**
   * Builds the store for a session from what was saved. `cmi.core.entry`
   * follows SCORM 1.2: `ab-initio` the first time, `resume` when the last
   * session ended with `cmi.core.exit` set to `suspend`, and empty otherwise.
   * The saved exit belongs to the session that set it, so it is dropped here
   * and cannot make a later session look suspended. Interactions are dropped
   * too: they are write only, and a SCO numbers them from 0 in every session,
   * so loading the last session's would mix old and new under the same
   * indexes.
   */
  private seedStore(ctx: CmiContext): CmiStore {
    const persisted = withoutInteractions({ ...ctx.persisted });
    delete persisted['cmi.core.session_time'];
    const exit = persisted['cmi.core.exit'];
    delete persisted['cmi.core.exit'];
    const hasPriorSession = Object.keys(ctx.persisted).length > 0;
    const entry =
      exit === 'suspend' ? 'resume' : hasPriorSession ? '' : 'ab-initio';
    const store = new CmiStore({
      ...lmsOwnedFrom(ctx),
      values: persisted,
    });
    store.loadValues({ 'cmi.core.entry': entry });
    store.applyLmsOwned(lmsOwnedFrom(ctx));
    return store;
  }

  private async loadContext(attemptId: string): Promise<CmiContext> {
    const attempt = await this.dataSource.manager.findOne(Attempt, {
      where: { id: attemptId },
    });
    if (!attempt) {
      throw new LmsError({
        status: httpStatusForLmsCode(ATTEMPT_NOT_FOUND),
        code: ATTEMPT_NOT_FOUND,
        message: 'Attempt not found.',
        details: { attemptId },
      });
    }

    const registration = await this.dataSource.manager.findOne(Registration, {
      where: { id: attempt.registrationId },
    });
    const person = registration
      ? await this.dataSource.manager.findOne(Person, {
          where: { id: registration.personId },
        })
      : null;

    const activityNodeId = attempt.activityNodeId ?? undefined;
    const activityNode = activityNodeId
      ? await this.dataSource.manager.findOne(ActivityNode, {
          where: { id: activityNodeId },
        })
      : null;

    const progress = activityNodeId
      ? await this.dataSource.manager.findOne(NormalizedProgressRow, {
          where: {
            registrationId: attempt.registrationId,
            courseModuleId: attempt.courseModuleId,
            activityNodeId,
          },
        })
      : null;

    const extras = progress?.extrasJson ?? null;
    const persisted = extractCmi(extras);

    return {
      attempt,
      activityNodeId,
      studentId: person?.externalId ?? '',
      studentName: person?.displayName ?? '',
      launchData: launchDataFrom(activityNode?.metadataJson),
      masteryScore: masteryScoreFrom(activityNode?.metadataJson),
      maxTimeAllowed: textFrom(activityNode?.metadataJson, 'maxTimeAllowed'),
      timeLimitAction: textFrom(activityNode?.metadataJson, 'timeLimitAction'),
      persisted,
    };
  }
}

interface CmiContext {
  attempt: Attempt;
  activityNodeId?: string;
  studentId: string;
  studentName: string;
  launchData?: string;
  masteryScore?: string;
  maxTimeAllowed?: string;
  timeLimitAction?: string;
  persisted: CmiValues;
}

/** One value of a refused snapshot, and why the SCORM data model refused it. */
interface RefusedValue {
  element: string;
  value: string;
  /** SCORM 1.2 error code, such as `405`. */
  code: string;
  reason: string;
}

/** The most refused values named in the message; the details hold more. */
const MESSAGE_LIMIT = 10;
const DETAILS_LIMIT = 100;

/**
 * Replays the values a snapshot changes through a CMI store, as `LMSSetValue`
 * calls. A value the store already holds is skipped: it is the server's own
 * data coming back. A read-only or keyword element is skipped too, since the
 * LMS owns those and a browser cannot change them. Anything else the store
 * refuses is returned.
 *
 * @param store - Store holding the server's state; changed as values are applied
 * @param submitted - The snapshot from the browser
 * @returns The refused values; empty when every value was accepted or skipped
 */
function replaySubmitted(
  store: CmiStore,
  submitted: Record<string, unknown>,
): RefusedValue[] {
  const held = store.snapshot();
  store.LMSInitialize('');
  const refused: RefusedValue[] = [];
  for (const [element, raw] of Object.entries(submitted)) {
    const value = coerceCmiValue(raw);
    if (value === undefined) {
      refused.push({
        element,
        value: describeValue(raw),
        code: '201',
        reason: 'it is not text or a number',
      });
      continue;
    }
    if (held[element] === value) {
      continue;
    }
    if (store.LMSSetValue(element, value) === 'true') {
      continue;
    }
    const code = store.LMSGetLastError();
    if (code === '402' || code === '403') {
      continue;
    }
    refused.push({
      element,
      value,
      code,
      reason: `error ${code}: ${store.LMSGetErrorString(code)}`,
    });
  }
  return refused;
}

function describeValue(value: unknown): string {
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function shortened(text: string): string {
  return text.length > 40 ? `${text.slice(0, 40)}…` : text;
}

function invalidCmiError(attemptId: string, refused: RefusedValue[]): LmsError {
  const named = refused
    .slice(0, MESSAGE_LIMIT)
    .map(
      (entry) =>
        `${entry.element} "${shortened(entry.value)}" was refused (${entry.reason})`,
    );
  const more =
    refused.length > MESSAGE_LIMIT
      ? ` and ${refused.length - MESSAGE_LIMIT} more`
      : '';
  return new LmsError({
    status: httpStatusForLmsCode(CMI_VALUE_INVALID),
    code: CMI_VALUE_INVALID,
    message: `The SCORM data was not saved. ${named.join('; ')}${more}.`,
    details: {
      attemptId,
      refused: refused
        .slice(0, DETAILS_LIMIT)
        .map(({ element, code }) => ({ element, code })),
    },
  });
}

function extractCmi(extras: Record<string, unknown> | null): CmiValues {
  if (!extras) {
    return {};
  }
  const cmi = extras.cmi;
  if (cmi && typeof cmi === 'object' && !Array.isArray(cmi)) {
    const values: CmiValues = {};
    for (const [key, value] of Object.entries(cmi as Record<string, unknown>)) {
      const text = coerceCmiValue(value);
      if (text !== undefined) {
        values[key] = text;
      }
    }
    return values;
  }
  return {};
}

/** LMS-owned CMI fields taken from the current person / attempt. */
function lmsOwnedFrom(ctx: CmiContext) {
  return {
    studentId: ctx.studentId,
    studentName: ctx.studentName,
    lessonMode: lessonModeFrom(ctx.attempt.launchMode),
    launchData: ctx.launchData ?? '',
    masteryScore: ctx.masteryScore ?? '',
    maxTimeAllowed: ctx.maxTimeAllowed ?? '',
    timeLimitAction: ctx.timeLimitAction ?? '',
  };
}

function launchDataFrom(
  metadata: Record<string, unknown> | null | undefined,
): string | undefined {
  const value = metadata?.['launchData'];
  return typeof value === 'string' ? value : undefined;
}

const INTERACTION_PREFIX = 'cmi.interactions.';

function hasInteractions(values: CmiValues): boolean {
  return Object.keys(values).some((key) => key.startsWith(INTERACTION_PREFIX));
}

function withoutInteractions(values: CmiValues): CmiValues {
  return Object.fromEntries(
    Object.entries(values).filter(
      ([key]) => !key.startsWith(INTERACTION_PREFIX),
    ),
  );
}

function onlyInteractions(values: CmiValues): CmiValues {
  return Object.fromEntries(
    Object.entries(values).filter(([key]) =>
      key.startsWith(INTERACTION_PREFIX),
    ),
  );
}

function textFrom(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
): string | undefined {
  const value = metadata?.[key];
  return typeof value === 'string' ? value : undefined;
}

/** The manifest's mastery score as the text a SCO reads, or `undefined` when none was set. */
function masteryScoreFrom(
  metadata: Record<string, unknown> | null | undefined,
): string | undefined {
  const value = metadata?.['masteryScore'];
  return typeof value === 'number' && Number.isFinite(value)
    ? String(value)
    : undefined;
}

function lessonModeFrom(mode: LaunchMode): string {
  if (mode === 'Browse') {
    return 'browse';
  }
  if (mode === 'Review') {
    return 'review';
  }
  return 'normal';
}
