import { randomUUID } from 'node:crypto';
import {
  ActivityNode,
  ContentPackage,
  CourseModule,
  CourseSection,
} from '@richardmcquiston01/reactive-lms-persistence';
import {
  AVAILABILITY_INVALID,
  LmsError,
  MODULE_NOT_FOUND,
  MODULE_TREE_INVALID,
  PACKAGE_NOT_FOUND,
  httpStatusForLmsCode,
  type AvailabilityNode,
  type AvailabilityV1,
} from '@richardmcquiston01/reactive-lms-shared';
import type { DataSource, EntityManager } from 'typeorm';
import { rowLock } from '../db/row-lock';
import { assertCanParent } from './module-tree';
import {
  normalizeAvailabilityInput,
  type AvailabilityInput,
} from '../launch/availability';

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
  /** Block to place the module in; omit for the top level of the section. */
  parentModuleId?: string;
  /** Explicit sort position; defaults to append after the current siblings. */
  sortOrder?: number;
  /**
   * Conditions that must hold for the module to launch. Accepts version 1
   * rules or the older single-object form; stored as version 1.
   */
  availability?: AvailabilityInput;
}

/**
 * Input for {@link ModuleService.placeBlock}.
 */
export interface PlaceBlockInput {
  /** Chapter title. */
  title: string;
  /** Block to nest this one in; omit for the top level of the section. */
  parentModuleId?: string;
  /** Explicit sort position; defaults to append after the current siblings. */
  sortOrder?: number;
  /**
   * Conditions that must hold for everything inside the block. A `min_score`
   * condition must name a `moduleId`, because a block has no score of its own.
   */
  availability?: AvailabilityInput;
}

/**
 * Places, nests, and reorders course modules inside a section.
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
      await lockSection(manager, sectionId);
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

      const parentModuleId = input.parentModuleId ?? null;
      const moduleId = randomUUID();
      if (parentModuleId) {
        assertCanParent(
          await sectionModules(manager, sectionId),
          moduleId,
          parentModuleId,
        );
      }

      const sortOrder =
        input.sortOrder ??
        (await nextSortOrder(manager, sectionId, parentModuleId));

      const availabilityJson = normalizeAvailabilityInput(input.availability);
      const module = manager.create(CourseModule, {
        id: moduleId,
        courseSectionId: sectionId,
        parentModuleId,
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
   * Adds a block: a chapter that groups child modules and can carry rules that
   * apply to everything inside it.
   *
   * @param sectionId - Course section that will own the block
   * @param input - Title, optional parent block, order, availability
   */
  async placeBlock(
    sectionId: string,
    input: PlaceBlockInput,
  ): Promise<{ moduleId: string }> {
    const availabilityJson = normalizeAvailabilityInput(input.availability);
    assertBlockAvailability(availabilityJson);

    return this.dataSource.transaction(async (manager) => {
      await lockSection(manager, sectionId);
      const parentModuleId = input.parentModuleId ?? null;
      const moduleId = randomUUID();
      if (parentModuleId) {
        assertCanParent(
          await sectionModules(manager, sectionId),
          moduleId,
          parentModuleId,
        );
      }
      const block = manager.create(CourseModule, {
        id: moduleId,
        courseSectionId: sectionId,
        parentModuleId,
        contentPackageId: null,
        activityNodeId: null,
        title: input.title,
        sortOrder:
          input.sortOrder ??
          (await nextSortOrder(manager, sectionId, parentModuleId)),
        availabilityJson,
      });
      await manager.save(block);
      return { moduleId };
    });
  }

  /**
   * Moves a module (and everything beneath it) under another block, or to the
   * top level when `parentModuleId` is `null`.
   *
   * @param moduleId - Module to move
   * @param parentModuleId - New parent block, or `null` for the top level
   * @param sortOrder - Position among the new siblings; defaults to last
   */
  async move(
    moduleId: string,
    parentModuleId: string | null,
    sortOrder?: number,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const row = await manager.findOne(CourseModule, {
        where: { id: moduleId },
      });
      if (!row) {
        throw new LmsError({
          status: httpStatusForLmsCode(MODULE_NOT_FOUND),
          code: MODULE_NOT_FOUND,
          message: 'Course module not found.',
          details: { moduleId },
        });
      }
      await lockSection(manager, row.courseSectionId);
      assertCanParent(
        await sectionModules(manager, row.courseSectionId),
        moduleId,
        parentModuleId,
      );
      const nextOrder =
        sortOrder ??
        (await nextSortOrder(manager, row.courseSectionId, parentModuleId));
      row.parentModuleId = parentModuleId;
      row.sortOrder = nextOrder;
      await manager.save(row);
    });
  }

  /**
   * Rewrites `sort_order` to match `moduleIds` (0-based).
   *
   * When `parentModuleId` is given (`null` for the top level), every id must
   * be a direct child of that parent, so a reorder can only change the order
   * of siblings. Without it, any modules of the section are accepted, as
   * before the tree existed.
   *
   * @param sectionId - Section that owns the modules
   * @param moduleIds - Desired order of module ids
   * @param parentModuleId - Parent whose children are being ordered
   */
  async reorder(
    sectionId: string,
    moduleIds: string[],
    parentModuleId?: string | null,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await lockSection(manager, sectionId);
      const existing = await sectionModules(manager, sectionId);
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
        if (
          parentModuleId !== undefined &&
          (row.parentModuleId ?? null) !== parentModuleId
        ) {
          throw new LmsError({
            status: httpStatusForLmsCode(MODULE_TREE_INVALID),
            code: MODULE_TREE_INVALID,
            message: `Module ${moduleId} is not a direct child of ${parentModuleId ?? 'the section'}, so it cannot be reordered with its siblings.`,
            details: { sectionId, moduleId, parentModuleId },
          });
        }
        row.sortOrder = index;
        await manager.save(row);
      }
    });
  }
}

/**
 * Locks the section row so tree changes in one section run one after another.
 * Each change validates against the tree as it stands, so without this two
 * administrators could each make a move that is valid alone and together leave
 * a cycle, or both append at the same sort position.
 */
async function lockSection(
  manager: EntityManager,
  sectionId: string,
): Promise<void> {
  await manager.findOne(CourseSection, {
    where: { id: sectionId },
    ...rowLock(manager),
  });
}

async function sectionModules(
  manager: EntityManager,
  sectionId: string,
): Promise<CourseModule[]> {
  return manager.find(CourseModule, { where: { courseSectionId: sectionId } });
}

async function nextSortOrder(
  manager: EntityManager,
  sectionId: string,
  parentModuleId: string | null,
): Promise<number> {
  const siblings = (await sectionModules(manager, sectionId)).filter(
    (row) => (row.parentModuleId ?? null) === parentModuleId,
  );
  const max = Math.max(-1, ...siblings.map((row) => row.sortOrder));
  return max + 1;
}

/**
 * A block has no score of its own, so a `min_score` rule on a block must say
 * which module's score to read.
 */
export function assertBlockAvailability(rules: AvailabilityV1 | null): void {
  const visit = (node: AvailabilityNode): void => {
    if ('type' in node) {
      if (node.type === 'min_score' && node.moduleId === undefined) {
        throw new LmsError({
          status: httpStatusForLmsCode(AVAILABILITY_INVALID),
          code: AVAILABILITY_INVALID,
          message:
            'A min_score condition on a block must name a moduleId, because a block has no score of its own.',
          details: { errors: ['min_score on a block needs a moduleId.'] },
        });
      }
      return;
    }
    for (const child of 'all' in node ? node.all : node.any) {
      visit(child);
    }
  };
  if (rules) {
    visit(rules);
  }
}
