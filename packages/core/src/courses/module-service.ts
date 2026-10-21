import { randomUUID } from 'node:crypto';
import {
  ActivityNode,
  ContentPackage,
  CourseModule,
} from '@reactive-lms/persistence';
import type { ModuleAvailability } from '@reactive-lms/persistence';
import {
  LmsError,
  MODULE_NOT_FOUND,
  PACKAGE_NOT_FOUND,
  httpStatusForLmsCode,
} from '@reactive-lms/shared';
import type { DataSource, EntityManager } from 'typeorm';

/**
 * Input for {@link ModuleService.place}.
 */
export interface PlaceModuleInput {
  /** Imported package to place. */
  contentPackageId: string;
  /** Optional specific activity node (SCO/AU); omit for package entry. */
  activityNodeId?: string;
  /** Title override; defaults to the node or package title. */
  title?: string;
  /** Explicit sort position; defaults to append after the current max. */
  sortOrder?: number;
  /** Conditional availability stored on the module. */
  availability?: {
    afterModuleId?: string;
    availableFrom?: string;
    availableUntil?: string;
    minScore?: number;
  };
}

/**
 * Places and reorders course modules inside a section.
 */
export class ModuleService {
  /**
   * @param dataSource - Caller-owned TypeORM DataSource
   */
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Places an imported package (or one of its nodes) into a section.
   *
   * @param sectionId - Course section that will own the module
   * @param input - Package, optional node, title, order, availability
   */
  async place(
    sectionId: string,
    input: PlaceModuleInput,
  ): Promise<{ moduleId: string }> {
    return this.dataSource.transaction(async (manager) => {
      const contentPackage = await manager.findOne(ContentPackage, {
        where: { id: input.contentPackageId },
      });
      if (!contentPackage) {
        throw new LmsError({
          status: httpStatusForLmsCode(PACKAGE_NOT_FOUND),
          code: PACKAGE_NOT_FOUND,
          message: 'Content package not found.',
          details: { contentPackageId: input.contentPackageId },
        });
      }

      let node: ActivityNode | null = null;
      if (input.activityNodeId) {
        node = await manager.findOne(ActivityNode, {
          where: {
            id: input.activityNodeId,
            contentPackageId: input.contentPackageId,
          },
        });
      }

      const sortOrder =
        input.sortOrder ?? (await nextSortOrder(manager, sectionId));

      const availabilityJson = toAvailability(input.availability);
      const module = manager.create(CourseModule, {
        id: randomUUID(),
        courseSectionId: sectionId,
        contentPackageId: input.contentPackageId,
        activityNodeId: input.activityNodeId ?? null,
        title: input.title ?? node?.title ?? contentPackage.title,
        sortOrder,
        availabilityJson,
      });
      await manager.save(module);
      return { moduleId: module.id };
    });
  }

  /**
   * Rewrites `sort_order` to match `moduleIds` (0-based).
   *
   * @param sectionId - Section that owns the modules
   * @param moduleIds - Desired order of module ids
   */
  async reorder(sectionId: string, moduleIds: string[]): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const existing = await manager.find(CourseModule, {
        where: { courseSectionId: sectionId },
      });
      const byId = new Map(existing.map((row) => [row.id, row]));
      for (const [index, moduleId] of moduleIds.entries()) {
        const row = byId.get(moduleId);
        if (!row) {
          throw new LmsError({
            status: httpStatusForLmsCode(MODULE_NOT_FOUND),
            code: MODULE_NOT_FOUND,
            message: 'Course module is not in this section.',
            details: { sectionId, moduleId },
          });
        }
        row.sortOrder = index;
        await manager.save(row);
      }
    });
  }
}

async function nextSortOrder(
  manager: EntityManager,
  sectionId: string,
): Promise<number> {
  const rows = await manager.find(CourseModule, {
    where: { courseSectionId: sectionId },
    order: { sortOrder: 'DESC' },
  });
  const max = rows[0]?.sortOrder;
  return typeof max === 'number' ? max + 1 : 0;
}

function toAvailability(
  availability?: PlaceModuleInput['availability'],
): ModuleAvailability | null {
  if (!availability) {
    return null;
  }
  const cleaned: ModuleAvailability = {};
  if (availability.afterModuleId) {
    cleaned.afterModuleId = availability.afterModuleId;
  }
  if (availability.availableFrom) {
    cleaned.availableFrom = availability.availableFrom;
  }
  if (availability.availableUntil) {
    cleaned.availableUntil = availability.availableUntil;
  }
  if (typeof availability.minScore === 'number') {
    cleaned.minScore = availability.minScore;
  }
  return Object.keys(cleaned).length > 0 ? cleaned : null;
}
