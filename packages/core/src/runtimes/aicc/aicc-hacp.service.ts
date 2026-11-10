import {
  ActivityNode,
  Attempt,
  ContentPackage,
} from '@richardmcquiston01/reactive-lms-persistence';
import {
  AICC_ERROR,
  CmiStore,
  type AiccErrorCode,
  type HacpResponseDto,
} from '@richardmcquiston01/reactive-lms-shared';
import type { DataSource } from 'typeorm';
import { ScormCmiService } from '../scorm/scorm-cmi.service';
import { aiccDataToCmi, cmiToAiccData, hacpVersionFor } from './hacp-data';

/** Longest session id looked up; real ones are UUIDs. */
const MAX_SESSION_ID_LENGTH = 128;

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

  private async getParam(
    attemptId: string,
    version: string,
  ): Promise<HacpResponseDto> {
    const { values } = await this.cmi.getCmi(attemptId);
    return succeed(version, cmiToAiccData(values));
  }

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
    const { values } = await this.cmi.getCmi(attemptId);
    const store = new CmiStore({ values });
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
      await this.cmi.putCmi(attemptId, { values: store.snapshot() });
    }
    return succeed(version);
  }

  private async exitAu(
    attemptId: string,
    version: string,
  ): Promise<HacpResponseDto> {
    await this.cmi.finishSession(attemptId);
    return succeed(version);
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

function truncate(text: string): string {
  return text.length > 40 ? `${text.slice(0, 40)}…` : text;
}
