import {
  ActivityNode,
  Attempt,
  ContentPackage,
} from '@richardmcquiston01/reactive-lms-persistence';
import {
  AICC_ERROR,
  CmiStore,
  type CmiValues,
  type AiccErrorCode,
  type HacpResponseDto,
} from '@richardmcquiston01/reactive-lms-shared';
import type { DataSource } from 'typeorm';
import { ScormCmiService } from '../scorm/scorm-cmi.service';
import { aiccDataToCmi, cmiToAiccData, hacpVersionFor } from './hacp-data';

/** Longest session id looked up; real ones are UUIDs. */
const MAX_SESSION_ID_LENGTH = 128;

/**
 * CMI key that records which attempt wrote the session values below. The CMI
 * blob is shared by every attempt on a module, so without it a new attempt
 * could pick up the time or exit flag of an earlier one that never ended.
 */
const SESSION_OWNER_KEY = 'rlms.aicc.session_attempt';

/** CMI values that belong to one session: its time so far and how it left. */
const SESSION_KEYS = ['cmi.core.session_time', 'cmi.core.exit'] as const;

/** Commands that are answered with success and otherwise ignored. */
const IGNORED_COMMANDS = new Set([
  'putcomments',
  'putobjectives',
  'putinteractions',
  'putpath',
  'putperformance',
]);

/**
 * Answers the requests that AICC content makes to the LMS (HACP). The content
 * is identified only by the session id it was launched with, which is the
 * attempt's session id: it works while the attempt is open and stops working
 * when `ExitAU` ends it, or a newer launch replaces it.
 *
 * Values are held in the SCORM 1.2 CMI model, so they are checked by the same
 * store and persisted and rolled up by the same service as SCORM content.
 */
export class AiccHacpService {
  /**
   * @param dataSource - Caller-owned TypeORM DataSource
   * @param cmi - CMI hydrate, persist, and finish
   */
  constructor(
    private readonly dataSource: DataSource,
    private readonly cmi: ScormCmiService,
  ) {}

  /**
   * Handles one HACP request.
   *
   * @param form - Form fields of the request; names match without regard to case
   */
  async handle(form: Record<string, unknown>): Promise<HacpResponseDto> {
    const fields = lowerCaseStrings(form);
    const version = hacpVersionFor(fields.get('version'));
    const command = (fields.get('command') ?? '').trim().toLowerCase();

    if (command === '') {
      return refuse(
        version,
        AICC_ERROR.invalidCommand,
        'The request has no command.',
      );
    }
    const known =
      command === 'getparam' ||
      command === 'putparam' ||
      command === 'exitau' ||
      IGNORED_COMMANDS.has(command);
    if (!known) {
      return refuse(
        version,
        AICC_ERROR.invalidCommand,
        `The command "${truncate(command)}" is not one this LMS answers.`,
      );
    }

    const attemptId = await this.openAttemptId(fields.get('session_id'));
    if (attemptId === undefined) {
      return refuse(version, AICC_ERROR.invalidSession);
    }

    switch (command) {
      case 'getparam':
        return this.getParam(attemptId, version);
      case 'putparam':
        return this.putParam(attemptId, version, fields.get('aicc_data'));
      case 'exitau':
        return this.exitAu(attemptId, version);
      default:
        return succeed(version);
    }
  }

  /** Answers `GetParam` with what the LMS holds for the attempt. */
  private async getParam(
    attemptId: string,
    version: string,
  ): Promise<HacpResponseDto> {
    const { values } = await this.cmi.getCmi(attemptId);
    return succeed(version, cmiToAiccData(values));
  }

  /**
   * Answers `PutParam`: checks every value the content reported with a CMI
   * store and saves them all, or refuses the request and saves nothing.
   */
  private async putParam(
    attemptId: string,
    version: string,
    data: string | undefined,
  ): Promise<HacpResponseDto> {
    if (data === undefined || data.trim() === '') {
      return refuse(
        version,
        AICC_ERROR.invalidCommand,
        'PutParam needs aicc_data, but it is empty.',
      );
    }
    const { writes, problems } = aiccDataToCmi(data);
    const store = await this.sessionStore(attemptId);
    store.LMSInitialize('');
    for (const write of writes) {
      if (store.LMSSetValue(write.element, write.value) === 'false') {
        const code = store.LMSGetLastError();
        problems.push(
          `${write.source} "${truncate(write.value)}" was refused (error ${code}: ${store.LMSGetErrorString(code)}).`,
        );
      }
    }
    if (problems.length > 0) {
      return refuse(version, AICC_ERROR.invalidCommand, problems.join(' '));
    }
    if (writes.length > 0) {
      await this.cmi.putCmi(attemptId, {
        values: { ...store.snapshot(), [SESSION_OWNER_KEY]: attemptId },
      });
    }
    return succeed(version);
  }

  /** Answers `ExitAU`: ends the session and the attempt. */
  private async exitAu(
    attemptId: string,
    version: string,
  ): Promise<HacpResponseDto> {
    const store = await this.sessionStore(attemptId);
    store.LMSInitialize('');
    // Finishing adds the session time to the total, as a SCO's LMSFinish does.
    store.LMSFinish('');
    const values = store.snapshot();
    // The time has been added; a repeated exit must not add it again.
    delete values['cmi.core.session_time'];
    await this.cmi.putCmi(attemptId, {
      values: { ...values, [SESSION_OWNER_KEY]: attemptId },
      finished: true,
    });
    return succeed(version);
  }

  /**
   * A CMI store holding what the attempt has so far: the hydrated values, plus
   * the time and exit flag that earlier requests of this same session reported.
   * An earlier session's time and exit flag are not carried over.
   */
  private async sessionStore(attemptId: string): Promise<CmiStore> {
    const { values } = await this.cmi.getCmi(attemptId);
    const stored = await this.cmi.getStoredCmi(attemptId);
    const sessionValues: CmiValues = {};
    if (stored[SESSION_OWNER_KEY] === attemptId) {
      for (const key of SESSION_KEYS) {
        const value = stored[key];
        if (value !== undefined) {
          sessionValues[key] = value;
        }
      }
    }
    return new CmiStore({ values: { ...values, ...sessionValues } });
  }

  /**
   * The attempt for a session id, when the session can still be used: the
   * attempt is open and its package is an AICC package. Every other case is
   * the same answer, so a caller cannot tell a wrong id from an ended one.
   */
  private async openAttemptId(
    sessionId: string | undefined,
  ): Promise<string | undefined> {
    const id = sessionId?.trim() ?? '';
    if (id === '' || id.length > MAX_SESSION_ID_LENGTH) {
      return undefined;
    }
    const manager = this.dataSource.manager;
    const attempt = await manager.findOne(Attempt, {
      where: { sessionId: id },
    });
    if (!attempt || attempt.termination !== 'still_open') {
      return undefined;
    }
    const node = attempt.activityNodeId
      ? await manager.findOne(ActivityNode, {
          where: { id: attempt.activityNodeId },
        })
      : null;
    const contentPackage = node
      ? await manager.findOne(ContentPackage, {
          where: { id: node.contentPackageId },
        })
      : null;
    return contentPackage?.packageType === 'aicc' ? attempt.id : undefined;
  }
}

/** A successful reply, with the data of a `GetParam` when there is some. */
function succeed(version: string, aiccData = ''): HacpResponseDto {
  return {
    errorCode: AICC_ERROR.successful,
    errorText: 'Successful',
    version,
    aiccData,
  };
}

const ERROR_TEXT: Record<AiccErrorCode, string> = {
  [AICC_ERROR.successful]: 'Successful',
  [AICC_ERROR.invalidCommand]: 'Invalid Command',
  [AICC_ERROR.invalidPassword]: 'Invalid AU Password',
  [AICC_ERROR.invalidSession]: 'Invalid Session ID',
};

/** A refusal. The session error carries no reason, so it reveals nothing about ids. */
function refuse(
  version: string,
  errorCode: AiccErrorCode,
  reason?: string,
): HacpResponseDto {
  const text = ERROR_TEXT[errorCode];
  return {
    errorCode,
    errorText: reason === undefined ? text : `${text}: ${reason}`,
    version,
    aiccData: '',
  };
}

/** String fields of a parsed form body, keyed by lower-cased name. */
function lowerCaseStrings(form: Record<string, unknown>): Map<string, string> {
  const fields = new Map<string, string>();
  for (const [name, value] of Object.entries(form)) {
    const text = Array.isArray(value) ? value[value.length - 1] : value;
    if (typeof text === 'string') {
      fields.set(name.toLowerCase(), text);
    }
  }
  return fields;
}

/** Shortens a value echoed in an error message. */
function truncate(text: string): string {
  return text.length > 40 ? `${text.slice(0, 40)}…` : text;
}
