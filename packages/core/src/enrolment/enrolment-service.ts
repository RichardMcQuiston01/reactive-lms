import { randomUUID } from 'node:crypto';
import {
  EnrolmentMethod,
  Membership,
  Registration,
} from '@reactive-lms/persistence';
import type { EnrolmentMethodKind } from '@reactive-lms/persistence';
import {
  ENROLMENT_GROUP_REQUIRED,
  ENROLMENT_KEY_REQUIRED,
  ENROLMENT_METHOD_UNAVAILABLE,
  ENROLMENT_WINDOW_CLOSED,
  LmsError,
  httpStatusForLmsCode,
} from '@reactive-lms/shared';
import type { DataSource, EntityManager } from 'typeorm';
import { EventLogService } from '../audit/event-log.service';

/**
 * Result of a successful (or repeat) enrolment.
 */
export interface EnrolmentResult {
  /** Registration id for the person on the section. */
  registrationId: string;
}

/**
 * Optional knobs for {@link EnrolmentService.self}.
 */
export interface SelfEnrolmentOptions {
  /** Enrolment key when `config_json.requiresKey` is set. */
  key?: string;
  /** Evaluation instant; defaults to now (tests may inject). */
  now?: Date;
}

/**
 * Enrols a person on a course section via manual, self, or group methods.
 * Creates section `Membership` + `Registration` when missing; repeat enrol
 * returns the existing registration.
 */
export class EnrolmentService {
  /**
   * @param dataSource - Caller-owned TypeORM DataSource
   * @param events - Audit writer; constructed from `dataSource` when omitted
   */
  constructor(
    private readonly dataSource: DataSource,
    private readonly events: EventLogService = new EventLogService(dataSource),
  ) {}

  /**
   * Instructor-driven enrol. Uses an enabled `manual` method, or creates one.
   *
   * @param sectionId - Course section to join
   * @param personId - Learner being enrolled
   * @param actorPersonId - Instructor / actor who initiated the enrol
   */
  async manual(
    sectionId: string,
    personId: string,
    actorPersonId: string,
  ): Promise<EnrolmentResult> {
    return this.dataSource.transaction(async (manager) => {
      const method =
        (await this.findEnabledMethod(manager, sectionId, 'manual')) ??
        (await this.createManualMethod(manager, sectionId, actorPersonId));
      return this.completeEnrol(manager, {
        sectionId,
        personId,
        method,
        actorPersonId,
      });
    });
  }

  /**
   * Learner self-enrol. Requires an enabled `self` method and honors
   * `config_json.openFrom` / `openUntil` / `requiresKey`.
   *
   * @param sectionId - Course section to join
   * @param personId - Learner joining
   * @param options - Optional key and clock
   */
  async self(
    sectionId: string,
    personId: string,
    options?: SelfEnrolmentOptions,
  ): Promise<EnrolmentResult> {
    return this.dataSource.transaction(async (manager) => {
      const method = await this.findEnabledMethod(manager, sectionId, 'self');
      if (!method) {
        throw gate(
          ENROLMENT_METHOD_UNAVAILABLE,
          'Self-enrolment is not enabled for this section.',
          { sectionId },
        );
      }
      assertSelfWindow(method.configJson, options?.now ?? new Date());
      assertSelfKey(method.configJson, options?.key);
      return this.completeEnrol(manager, {
        sectionId,
        personId,
        method,
      });
    });
  }

  /**
   * Group enrol. Person must hold membership in `config_json.groupId`.
   *
   * @param sectionId - Course section to join
   * @param personId - Learner being enrolled
   */
  async group(sectionId: string, personId: string): Promise<EnrolmentResult> {
    return this.dataSource.transaction(async (manager) => {
      const method = await this.findEnabledMethod(manager, sectionId, 'group');
      if (!method) {
        throw gate(
          ENROLMENT_METHOD_UNAVAILABLE,
          'Group enrolment is not enabled for this section.',
          { sectionId },
        );
      }
      const groupId = readString(method.configJson, 'groupId');
      if (!groupId) {
        throw gate(
          ENROLMENT_METHOD_UNAVAILABLE,
          'Group enrolment is missing config_json.groupId.',
          { sectionId },
        );
      }
      const groupMembership = await manager.findOne(Membership, {
        where: {
          personId,
          collectionType: 'group',
          collectionId: groupId,
        },
      });
      if (!groupMembership) {
        throw gate(
          ENROLMENT_GROUP_REQUIRED,
          'Person is not a member of the required group.',
          { sectionId, personId, groupId },
        );
      }
      return this.completeEnrol(manager, {
        sectionId,
        personId,
        method,
      });
    });
  }

  private async findEnabledMethod(
    manager: EntityManager,
    sectionId: string,
    method: EnrolmentMethodKind,
  ): Promise<EnrolmentMethod | null> {
    return manager.findOne(EnrolmentMethod, {
      where: {
        courseSectionId: sectionId,
        method,
        isEnabled: true,
      },
    });
  }

  private async createManualMethod(
    manager: EntityManager,
    sectionId: string,
    actorPersonId: string,
  ): Promise<EnrolmentMethod> {
    const row = manager.create(EnrolmentMethod, {
      id: randomUUID(),
      courseSectionId: sectionId,
      method: 'manual',
      isEnabled: true,
      configJson: null,
      createdByUserId: actorPersonId,
    });
    return manager.save(row);
  }

  private async completeEnrol(
    manager: EntityManager,
    input: {
      sectionId: string;
      personId: string;
      method: EnrolmentMethod;
      actorPersonId?: string;
    },
  ): Promise<EnrolmentResult> {
    const existing = await manager.findOne(Registration, {
      where: {
        personId: input.personId,
        courseSectionId: input.sectionId,
      },
    });
    if (existing) {
      await this.ensureSectionMembership(manager, input);
      return { registrationId: existing.id };
    }

    await this.ensureSectionMembership(manager, input);

    const registration = manager.create(Registration, {
      id: randomUUID(),
      personId: input.personId,
      courseSectionId: input.sectionId,
      enrolmentMethodId: input.method.id,
      status: 'not_started',
      createdByUserId: input.actorPersonId ?? input.personId,
    });
    await manager.save(registration);

    await this.events.record(
      {
        personId: input.personId,
        action: 'enrol.joined',
        subjectType: 'registration',
        subjectId: registration.id,
        payload: {
          courseSectionId: input.sectionId,
          enrolmentMethodId: input.method.id,
          method: input.method.method,
          actorPersonId: input.actorPersonId,
        },
      },
      manager,
    );

    return { registrationId: registration.id };
  }

  private async ensureSectionMembership(
    manager: EntityManager,
    input: {
      sectionId: string;
      personId: string;
      actorPersonId?: string;
    },
  ): Promise<void> {
    const existing = await manager.findOne(Membership, {
      where: {
        personId: input.personId,
        collectionType: 'course_section',
        collectionId: input.sectionId,
      },
    });
    if (existing) {
      return;
    }
    const membership = manager.create(Membership, {
      id: randomUUID(),
      personId: input.personId,
      collectionType: 'course_section',
      collectionId: input.sectionId,
      role: 'learner',
      createdByUserId: input.actorPersonId ?? input.personId,
    });
    await manager.save(membership);
  }
}

function assertSelfWindow(
  config: Record<string, unknown> | null | undefined,
  now: Date,
): void {
  const openFrom = readString(config, 'openFrom');
  const openUntil = readString(config, 'openUntil');
  if (openFrom) {
    const from = new Date(openFrom);
    if (!Number.isNaN(from.getTime()) && now.getTime() < from.getTime()) {
      throw gate(
        ENROLMENT_WINDOW_CLOSED,
        'Self-enrolment is not open yet.',
        { openFrom },
      );
    }
  }
  if (openUntil) {
    const until = new Date(openUntil);
    if (!Number.isNaN(until.getTime()) && now.getTime() > until.getTime()) {
      throw gate(
        ENROLMENT_WINDOW_CLOSED,
        'Self-enrolment is no longer open.',
        { openUntil },
      );
    }
  }
}

function assertSelfKey(
  config: Record<string, unknown> | null | undefined,
  provided?: string,
): void {
  const requiresKey = config?.requiresKey;
  if (!requiresKey) {
    return;
  }
  const expected =
    typeof requiresKey === 'string'
      ? requiresKey
      : readString(config, 'key') ?? readString(config, 'enrolmentKey');
  if (!expected || provided !== expected) {
    throw gate(
      ENROLMENT_KEY_REQUIRED,
      'Self-enrolment requires a matching key.',
      { requiresKey: true },
    );
  }
}

function readString(
  config: Record<string, unknown> | null | undefined,
  key: string,
): string | undefined {
  const value = config?.[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function gate(
  code: string,
  message: string,
  details: Record<string, unknown>,
): LmsError {
  return new LmsError({
    status: httpStatusForLmsCode(code),
    code,
    message,
    details,
  });
}
