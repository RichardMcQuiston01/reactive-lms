import { randomUUID } from 'node:crypto';
import {
  ActivityNode,
  Attempt,
  ContentPackage,
  CourseModule,
  Membership,
  NormalizedProgress as NormalizedProgressRow,
  Registration,
} from '@richardmcquiston01/reactive-lms-persistence';
import type {
  ContentRuntime,
  LaunchDescriptor,
  LaunchRequest,
} from '@richardmcquiston01/reactive-lms-shared';
import {
  ACTIVITY_NODE_INVALID,
  LAUNCH_NOT_IMPLEMENTED,
  LmsError,
  referencedGroupIds,
  MODULE_NOT_FOUND,
  MODULE_NOT_LAUNCHABLE,
  REGISTRATION_NOT_FOUND,
  httpStatusForLmsCode,
} from '@richardmcquiston01/reactive-lms-shared';
import type { DataSource, EntityManager } from 'typeorm';
import {
  DEFAULT_CONTENT_URL_PREFIX,
  contentUrlForKey,
} from '../content/content-serving';
import { EventLogService } from '../audit/event-log.service';
import { Html5Runtime } from '../runtimes/html5/html5-runtime';
import { Scorm12Runtime } from '../runtimes/scorm/scorm-12-runtime';
import type { AvailabilityProgress } from './availability';
import { assertChainAvailable, readStoredAvailability } from './availability';
import { ancestorsOf, isBlockModule } from '../courses/module-tree';
import { rowLock } from '../db/row-lock';

const LAUNCHABLE = new Set(['html5', 'scorm_12']);

/**
 * Options for {@link LaunchService}.
 */
export interface LaunchServiceOptions {
  /**
   * URL prefix under which the API serves extracted package files. Defaults to
   * `/lms/content`.
   */
  contentUrlPrefix?: string;
}

/**
 * Creates an attempt, checks availability, and asks the matching
 * content runtime for a launch descriptor. HTML5 and SCORM 1.2
 * are implemented in this slice.
 */
export class LaunchService {
  /**
   * @param dataSource - Caller-owned TypeORM DataSource
   * @param runtimes - Registered content runtimes (HTML5 / SCORM 1.2)
   * @param options - Content URL prefix
   * @param events - Audit writer; constructed from `dataSource` when omitted
   */
  constructor(
    private readonly dataSource: DataSource,
    private readonly runtimes: ContentRuntime[],
    private readonly options: LaunchServiceOptions = {},
    private readonly events: EventLogService = new EventLogService(dataSource),
  ) {}

  /**
   * Launches a module for an existing registration.
   *
   * @param request - Registration, module, learner, and launch mode
   */
  async launch(request: LaunchRequest): Promise<LaunchDescriptor> {
    return this.dataSource.transaction(async (manager) => {
      // Lock the registration so two launches for it run one after another:
      // each abandons the other's open attempt instead of both leaving one open.
      const registration = await manager.findOne(Registration, {
        where: { id: request.registrationId },
        ...rowLock(manager),
      });
      if (!registration) {
        throw new LmsError({
          status: httpStatusForLmsCode(REGISTRATION_NOT_FOUND),
          code: REGISTRATION_NOT_FOUND,
          message: 'Registration not found.',
          details: { registrationId: request.registrationId },
        });
      }

      const courseModule = await manager.findOne(CourseModule, {
        where: { id: request.courseModuleId },
      });
      if (
        !courseModule ||
        courseModule.courseSectionId !== registration.courseSectionId
      ) {
        throw new LmsError({
          status: httpStatusForLmsCode(MODULE_NOT_FOUND),
          code: MODULE_NOT_FOUND,
          message: 'Course module not found for this registration.',
          details: { courseModuleId: request.courseModuleId },
        });
      }

      if (isBlockModule(courseModule) || !courseModule.contentPackageId) {
        throw new LmsError({
          status: httpStatusForLmsCode(MODULE_NOT_LAUNCHABLE),
          code: MODULE_NOT_LAUNCHABLE,
          message: `"${courseModule.title}" is a block that groups other modules, so it has no content to launch. Launch one of the modules inside it.`,
          details: { courseModuleId: courseModule.id },
        });
      }

      // The module is available only if every block around it is too.
      const sectionModules = await manager.find(CourseModule, {
        where: { courseSectionId: registration.courseSectionId },
      });
      const chain = [
        ...ancestorsOf(sectionModules, courseModule.id),
        courseModule,
      ];

      const progressRows = await manager.find(NormalizedProgressRow, {
        where: { registrationId: registration.id },
      });
      const needsGroups = chain.some(
        (entry) =>
          referencedGroupIds(
            readStoredAvailability(entry.id, entry.availabilityJson),
          ).size > 0,
      );
      const groupIds = needsGroups
        ? await learnerGroupIds(manager, registration.personId)
        : new Set<string>();
      assertChainAvailable(
        chain,
        courseModule.id,
        progressMapFromRows(progressRows),
        new Date(),
        groupIds,
      );

      const contentPackage = await manager.findOne(ContentPackage, {
        where: { id: courseModule.contentPackageId },
      });
      const runtime = this.runtimes.find(
        (entry) => entry.packageType === contentPackage?.packageType,
      );
      if (
        !contentPackage ||
        !runtime ||
        !LAUNCHABLE.has(contentPackage.packageType)
      ) {
        throw new LmsError({
          status: httpStatusForLmsCode(LAUNCH_NOT_IMPLEMENTED),
          code: LAUNCH_NOT_IMPLEMENTED,
          message:
            'Launch is not implemented for ' +
            `${contentPackage?.packageType ?? 'missing package'}.`,
          details: {
            contentPackageId: courseModule.contentPackageId,
            packageType: contentPackage?.packageType,
          },
        });
      }

      // A node the caller or the placement names must belong to this module's
      // package; otherwise its href would be served from the wrong package.
      const nodeId =
        request.activityNodeId ?? courseModule.activityNodeId ?? undefined;
      let activityNode = nodeId
        ? await manager.findOne(ActivityNode, {
            where: { id: nodeId, contentPackageId: contentPackage.id },
          })
        : null;
      if (nodeId && !activityNode) {
        throw new LmsError({
          status: httpStatusForLmsCode(ACTIVITY_NODE_INVALID),
          code: ACTIVITY_NODE_INVALID,
          message: `The activity node does not belong to the package placed in "${courseModule.title}".`,
          details: {
            courseModuleId: courseModule.id,
            activityNodeId: nodeId,
            contentPackageId: contentPackage.id,
          },
        });
      }
      if (!activityNode) {
        const nodes = await manager.find(ActivityNode, {
          where: { contentPackageId: contentPackage.id },
          order: { sortOrder: 'ASC' },
        });
        activityNode =
          nodes.find((node) => node.href === contentPackage.entryHref) ??
          nodes[0] ??
          null;
      }
      const entryHref = activityNode?.href ?? contentPackage.entryHref;
      const extractedKey = contentPackage.extractedKey;
      if (!extractedKey || !entryHref) {
        throw new LmsError({
          status: httpStatusForLmsCode(LAUNCH_NOT_IMPLEMENTED),
          code: LAUNCH_NOT_IMPLEMENTED,
          message: 'Package has no extracted entry to launch.',
          details: {
            contentPackageId: contentPackage.id,
            extractedKey,
            entryHref,
          },
        });
      }

      const openAttempts = await manager.find(Attempt, {
        where: {
          registrationId: registration.id,
          courseModuleId: courseModule.id,
          termination: 'still_open',
        },
      });
      const closedAt = new Date();
      for (const open of openAttempts) {
        open.termination = 'abandoned';
        open.endedAt = closedAt;
        await manager.save(open);
      }

      const sessionId = randomUUID();
      const attempt = manager.create(Attempt, {
        id: randomUUID(),
        registrationId: registration.id,
        courseModuleId: courseModule.id,
        activityNodeId: activityNode?.id ?? null,
        sessionId,
        launchMode: request.launchMode,
        startedAt: closedAt,
        termination: 'still_open',
      });
      await manager.save(attempt);

      const launchContext = {
        attemptId: attempt.id,
        sessionId: attempt.sessionId,
        extractedKey,
        entryHref,
        activityNodeId: activityNode?.id,
        getPublicUrl: async (key: string) =>
          contentUrlForKey(
            key,
            this.options.contentUrlPrefix ?? DEFAULT_CONTENT_URL_PREFIX,
          ),
      };
      const descriptor = await createRuntimeLaunch(
        runtime,
        request,
        launchContext,
      );

      await this.events.record(
        {
          personId: registration.personId,
          action: 'launch.started',
          subjectType: 'attempt',
          subjectId: attempt.id,
          payload: {
            registrationId: registration.id,
            courseModuleId: courseModule.id,
            sessionId: attempt.sessionId,
            packageType: contentPackage.packageType,
          },
        },
        manager,
      );

      return descriptor;
    });
  }
}

async function createRuntimeLaunch(
  runtime: ContentRuntime,
  request: LaunchRequest,
  context: {
    attemptId: string;
    sessionId: string;
    extractedKey: string;
    entryHref: string;
    activityNodeId?: string;
    getPublicUrl: (key: string) => Promise<string>;
  },
) {
  if (runtime instanceof Scorm12Runtime) {
    return runtime.createLaunch(request, context);
  }
  const html5 = runtime instanceof Html5Runtime ? runtime : new Html5Runtime();
  return html5.createLaunch(request, context);
}

async function learnerGroupIds(
  manager: EntityManager,
  personId: string,
): Promise<Set<string>> {
  const memberships = await manager.find(Membership, {
    where: { personId, collectionType: 'group' },
  });
  return new Set(memberships.map((row) => row.collectionId));
}

function progressMapFromRows(
  rows: NormalizedProgressRow[],
): Map<string, AvailabilityProgress> {
  const map = new Map<string, AvailabilityProgress>();
  for (const row of rows) {
    const current = map.get(row.courseModuleId);
    const score = row.scoreScaled == null ? undefined : Number(row.scoreScaled);
    const next: AvailabilityProgress = {
      completionStatus: row.completionStatus,
      scoreScaled: Number.isFinite(score) ? score : undefined,
    };
    if (!current) {
      map.set(row.courseModuleId, next);
      continue;
    }
    map.set(row.courseModuleId, {
      completionStatus:
        current.completionStatus === 'completed' ||
        next.completionStatus === 'completed'
          ? 'completed'
          : (next.completionStatus ?? current.completionStatus),
      scoreScaled: maxOptional(current.scoreScaled, next.scoreScaled),
    });
  }
  return map;
}

function maxOptional(left?: number, right?: number): number | undefined {
  if (typeof left === 'number' && typeof right === 'number') {
    return Math.max(left, right);
  }
  return left ?? right;
}
