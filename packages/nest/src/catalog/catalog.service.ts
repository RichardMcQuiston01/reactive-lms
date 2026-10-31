import { Inject, Injectable } from '@nestjs/common';
import {
  ActivityNode,
  Attempt,
  ContentPackage,
  CourseModule,
  CourseOffering,
  CourseSection,
  CourseTemplate,
  EnrolmentMethod,
  LineItem,
  NormalizedProgress,
  Registration,
  type CompletionRule,
  type EnrolmentMethodKind,
} from '@richardmcquiston01/reactive-lms-persistence';
import {
  LmsError,
  MODULE_HAS_CHILDREN,
  MODULE_IN_USE,
  PACKAGE_IN_USE,
  MODULE_NOT_FOUND,
  PACKAGE_NOT_FOUND,
  REGISTRATION_NOT_FOUND,
  httpStatusForLmsCode,
  parseAvailability,
  type ContentPackageDto,
  type CourseModuleDto,
  type CourseSectionDto,
  type NormalizedProgress as NormalizedProgressDto,
  type BlobStorageAdapter,
} from '@richardmcquiston01/reactive-lms-shared';
import {
  rowLock,
  assertBlockAvailability,
  assertCanParent,
  isBlockModule,
  normalizeAvailabilityInput,
  requireBlob,
  type AvailabilityInput,
} from '@richardmcquiston01/reactive-lms-core';
import { randomUUID } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { RLMS_DATA_SOURCE, RLMS_BLOB_STORAGE_ADAPTER } from '../tokens';

/** Rows returned by a list call when the caller gives no `limit`. */
export const DEFAULT_LIST_LIMIT = 200;

/** Most rows a list call returns, whatever `limit` asks for. */
export const MAX_LIST_LIMIT = 500;

/**
 * Paging for list calls.
 */
export interface ListPage {
  /** Rows to return; defaults to {@link DEFAULT_LIST_LIMIT}, capped at {@link MAX_LIST_LIMIT}. */
  limit?: number;
  /** Rows to skip; defaults to 0. */
  offset?: number;
}

/**
 * Turns caller-supplied paging into safe numbers: whole, non-negative, and
 * capped. Anything unusable falls back to the default rather than failing.
 *
 * @param page - Raw paging (query-string values may arrive as numbers or strings)
 */
export function clampPage(page: ListPage): { take: number; skip: number } {
  const whole = (value: unknown): number | undefined => {
    const parsed = typeof value === 'string' ? Number(value) : value;
    return typeof parsed === 'number' && Number.isInteger(parsed)
      ? parsed
      : undefined;
  };
  const limit = whole(page.limit);
  const offset = whole(page.offset);
  return {
    take:
      limit === undefined || limit < 1
        ? DEFAULT_LIST_LIMIT
        : Math.min(limit, MAX_LIST_LIMIT),
    skip: offset === undefined || offset < 0 ? 0 : offset,
  };
}

/**
 * Imported package plus flattened activity nodes.
 */
export interface ContentPackageDetail extends ContentPackageDto {
  /** Activity nodes belonging to the package. */
  activities: Array<{
    id: string;
    title: string;
    href?: string;
    parentId?: string;
    sortOrder: number;
  }>;
}

/**
 * Minimal fields to create a course template.
 */
export interface CreateTemplateInput {
  title: string;
  code?: string;
  description?: string;
}

/**
 * Minimal fields to create a course offering.
 */
export interface CreateOfferingInput {
  courseTemplateId: string;
  title: string;
  startsAt?: string;
  endsAt?: string;
}

/**
 * Minimal fields to create a course section.
 */
export interface CreateSectionInput {
  courseOfferingId: string;
  title: string;
  courseCategoryId?: string;
  completionRule?: CompletionRule;
}

/**
 * PATCH body for a course module.
 */
export interface UpdateModuleInput {
  title?: string;
  sortOrder?: number;
  /** Version 1 rules, the older single-object form, or `null` to clear. */
  availability?: AvailabilityInput | null;
  /** Block to move the module into, or `null` for the top level. */
  parentModuleId?: string | null;
}

/**
 * Enrolment-method create body.
 */
export interface CreateEnrolmentMethodInput {
  method: EnrolmentMethodKind;
  isEnabled?: boolean;
  configJson?: Record<string, unknown>;
}

/**
 * Thin TypeORM catalog used by Nest controllers.
 * Import, place, enrol, launch, and progress stay in `@richardmcquiston01/reactive-lms-core`.
 */
@Injectable()
export class CatalogService {
  /**
   * @param dataSource - Host TypeORM DataSource
   * @param storage - Blob store for package delete
   */
  constructor(
    @Inject(RLMS_DATA_SOURCE)
    private readonly dataSource: DataSource,
    @Inject(RLMS_BLOB_STORAGE_ADAPTER)
    private readonly storage: BlobStorageAdapter,
  ) {}

  /**
   * Loads a package and its activity nodes.
   *
   * @param id - Content package id
   */
  async getPackage(id: string): Promise<ContentPackageDetail> {
    const row = await this.dataSource.manager.findOne(ContentPackage, {
      where: { id },
    });
    if (!row) {
      throw notFound(PACKAGE_NOT_FOUND, 'Content package not found.', {
        contentPackageId: id,
      });
    }
    const nodes = await this.dataSource.manager.find(ActivityNode, {
      where: { contentPackageId: id },
      order: { sortOrder: 'ASC' },
    });
    return {
      ...toPackageDto(row),
      activities: nodes.map((node) => ({
        id: node.id,
        title: node.title,
        href: node.href ?? undefined,
        parentId: node.parentId ?? undefined,
        sortOrder: node.sortOrder,
      })),
    };
  }

  /**
   * Lists imported packages, newest first.
   *
   * @param page - Paging
   */
  async listPackages(page: ListPage = {}): Promise<ContentPackageDto[]> {
    const rows = await this.dataSource.manager.find(ContentPackage, {
      order: { createdAt: 'DESC' },
      ...clampPage(page),
    });
    return rows.map(toPackageDto);
  }

  /**
   * Lists course sections by title.
   *
   * @param page - Paging
   * @param courseOfferingId - Only sections of this offering
   */
  async listSections(
    page: ListPage = {},
    courseOfferingId?: string,
  ): Promise<CourseSectionDto[]> {
    const rows = await this.dataSource.manager.find(CourseSection, {
      ...(courseOfferingId ? { where: { courseOfferingId } } : {}),
      order: { title: 'ASC' },
      ...clampPage(page),
    });
    return rows.map((row) => ({
      id: row.id,
      courseOfferingId: row.courseOfferingId,
      title: row.title,
      createdAt: toIso(row.createdAt),
      updatedAt: toIso(row.updatedAt),
    }));
  }

  /**
   * Deletes a package, its activity nodes, and stored files.
   *
   * @param id - Content package id
   */
  async deletePackage(id: string): Promise<void> {
    const row = await this.dataSource.manager.findOne(ContentPackage, {
      where: { id },
    });
    if (!row) {
      throw notFound(PACKAGE_NOT_FOUND, 'Content package not found.', {
        contentPackageId: id,
      });
    }
    const placements = await this.dataSource.manager.count(CourseModule, {
      where: { contentPackageId: id },
    });
    if (placements > 0) {
      throw new LmsError({
        status: httpStatusForLmsCode(PACKAGE_IN_USE),
        code: PACKAGE_IN_USE,
        message: `"${row.title}" is placed in ${placements} module${placements === 1 ? '' : 's'}. Remove ${placements === 1 ? 'that placement' : 'those placements'} before deleting the package.`,
        details: { contentPackageId: id, placements },
      });
    }
    await this.dataSource.transaction(async (manager) => {
      await manager.delete(ActivityNode, { contentPackageId: id });
      await manager.delete(ContentPackage, { id });
    });
    requireBlob(await this.storage.removePrefix(`packages/${id}/`));
  }

  /**
   * Creates a course template.
   *
   * @param input - Title and optional catalog fields
   * @param actorPersonId - Audit user
   */
  async createTemplate(
    input: CreateTemplateInput,
    actorPersonId?: string,
  ): Promise<{ id: string }> {
    const row = this.dataSource.manager.create(CourseTemplate, {
      id: randomUUID(),
      title: input.title,
      code: input.code ?? null,
      description: input.description ?? null,
      createdByUserId: actorPersonId ?? null,
    });
    const saved = await this.dataSource.manager.save(row);
    return { id: saved.id };
  }

  /**
   * Creates a dated offering of a template.
   *
   * @param input - Template, title, optional dates
   * @param actorPersonId - Audit user
   */
  async createOffering(
    input: CreateOfferingInput,
    actorPersonId?: string,
  ): Promise<{ id: string }> {
    const row = this.dataSource.manager.create(CourseOffering, {
      id: randomUUID(),
      courseTemplateId: input.courseTemplateId,
      title: input.title,
      startsAt: parseDate(input.startsAt),
      endsAt: parseDate(input.endsAt),
      createdByUserId: actorPersonId ?? null,
    });
    const saved = await this.dataSource.manager.save(row);
    return { id: saved.id };
  }

  /**
   * Creates an enrollable section.
   *
   * @param input - Offering, title, optional completion rule
   * @param actorPersonId - Audit user
   */
  async createSection(
    input: CreateSectionInput,
    actorPersonId?: string,
  ): Promise<{ id: string }> {
    const row = this.dataSource.manager.create(CourseSection, {
      id: randomUUID(),
      courseOfferingId: input.courseOfferingId,
      courseCategoryId: input.courseCategoryId ?? null,
      title: input.title,
      completionRule: input.completionRule ?? { allModules: true },
      createdByUserId: actorPersonId ?? null,
    });
    const saved = await this.dataSource.manager.save(row);
    return { id: saved.id };
  }

  /**
   * Lists every module and block of a section, ordered by `sort_order`, with
   * availability read as version 1. Callers build the tree from
   * `parentModuleId`.
   *
   * @param sectionId - Course section id
   */
  async listModules(sectionId: string): Promise<CourseModuleDto[]> {
    const rows = await this.dataSource.manager.find(CourseModule, {
      where: { courseSectionId: sectionId },
      order: { sortOrder: 'ASC' },
    });
    return rows.map((row) => {
      const parsed = parseAvailability(row.availabilityJson);
      return {
        id: row.id,
        courseSectionId: row.courseSectionId,
        parentModuleId: row.parentModuleId ?? null,
        contentPackageId: row.contentPackageId ?? null,
        title: row.title,
        sortOrder: row.sortOrder,
        isBlock: isBlockModule(row),
        availability: parsed.ok ? parsed.value : null,
        availabilityInvalid: !parsed.ok,
      };
    });
  }

  /**
   * Updates title, order, or availability on a placed module.
   *
   * @param id - Course module id
   * @param input - Patch fields
   */
  async updateModule(
    id: string,
    input: UpdateModuleInput,
  ): Promise<{ id: string }> {
    return this.dataSource.transaction(async (manager) => {
      const row = await manager.findOne(CourseModule, { where: { id } });
      if (!row) {
        throw notFound(MODULE_NOT_FOUND, 'Course module not found.', {
          courseModuleId: id,
        });
      }
      if (input.title !== undefined) {
        row.title = input.title;
      }
      if (input.sortOrder !== undefined) {
        row.sortOrder = input.sortOrder;
      }
      if (input.availability !== undefined) {
        const rules = normalizeAvailabilityInput(input.availability);
        if (isBlockModule(row)) {
          assertBlockAvailability(rules);
        }
        row.availabilityJson = rules;
      }
      if (input.parentModuleId !== undefined) {
        // Lock the section so a concurrent move cannot pass the same check on
        // the same snapshot and together leave a cycle.
        await manager.findOne(CourseSection, {
          where: { id: row.courseSectionId },
          ...rowLock(manager),
        });
        const siblings = await manager.find(CourseModule, {
          where: { courseSectionId: row.courseSectionId },
        });
        assertCanParent(siblings, row.id, input.parentModuleId);
        row.parentModuleId = input.parentModuleId;
      }
      await manager.save(row);
      return { id: row.id };
    });
  }

  /**
   * Removes a module placement. The package remains.
   *
   * @param id - Course module id
   */
  async deleteModule(id: string): Promise<void> {
    const row = await this.dataSource.manager.findOne(CourseModule, {
      where: { id },
    });
    if (!row) {
      throw notFound(MODULE_NOT_FOUND, 'Course module not found.', {
        courseModuleId: id,
      });
    }
    const children = await this.dataSource.manager.find(CourseModule, {
      where: { parentModuleId: id },
    });
    if (children.length > 0) {
      throw new LmsError({
        status: httpStatusForLmsCode(MODULE_HAS_CHILDREN),
        code: MODULE_HAS_CHILDREN,
        message: `"${row.title}" still contains ${children.length} module${children.length === 1 ? '' : 's'}. Move or delete them first.`,
        details: { courseModuleId: id, childCount: children.length },
      });
    }
    await this.assertModuleHasNoHistory(row);
    await this.dataSource.manager.delete(CourseModule, { id });
  }

  /**
   * Refuses to remove a module learners have already used. Launch attempts,
   * progress rows, and grade line items reference the module, so removing it
   * would either fail inside the database or erase their history.
   */
  private async assertModuleHasNoHistory(row: CourseModule): Promise<void> {
    const { manager } = this.dataSource;
    const where = { courseModuleId: row.id };
    const [attempts, progressRows, lineItems] = await Promise.all([
      manager.count(Attempt, { where }),
      manager.count(NormalizedProgress, { where }),
      manager.count(LineItem, { where }),
    ]);
    if (attempts + progressRows + lineItems === 0) {
      return;
    }
    throw new LmsError({
      status: httpStatusForLmsCode(MODULE_IN_USE),
      code: MODULE_IN_USE,
      message: `"${row.title}" has been launched ${attempts} time${attempts === 1 ? '' : 's'} and has ${progressRows} progress record${progressRows === 1 ? '' : 's'}, so it cannot be removed without erasing learner history.`,
      details: {
        courseModuleId: row.id,
        attempts,
        progressRows,
        lineItems,
      },
    });
  }

  /**
   * Enables an enrolment method on a section.
   *
   * @param sectionId - Course section id
   * @param input - Method kind and optional config
   * @param actorPersonId - Audit user
   */
  async createEnrolmentMethod(
    sectionId: string,
    input: CreateEnrolmentMethodInput,
    actorPersonId?: string,
  ): Promise<{ id: string }> {
    const row = this.dataSource.manager.create(EnrolmentMethod, {
      id: randomUUID(),
      courseSectionId: sectionId,
      method: input.method,
      isEnabled: input.isEnabled ?? true,
      configJson: input.configJson ?? null,
      createdByUserId: actorPersonId ?? null,
    });
    const saved = await this.dataSource.manager.save(row);
    return { id: saved.id };
  }

  /**
   * Lists normalized progress rows for a registration.
   *
   * @param registrationId - Registration id
   */
  async listProgress(registrationId: string): Promise<NormalizedProgressDto[]> {
    const registration = await this.dataSource.manager.findOne(Registration, {
      where: { id: registrationId },
    });
    if (!registration) {
      throw notFound(REGISTRATION_NOT_FOUND, 'Registration not found.', {
        registrationId,
      });
    }
    const rows = await this.dataSource.manager.find(NormalizedProgress, {
      where: { registrationId },
    });
    return rows.map(toProgressDto);
  }
}

function toPackageDto(row: ContentPackage): ContentPackageDto {
  return {
    id: row.id,
    packageType: row.packageType,
    title: row.title,
    version: row.version ?? undefined,
    entryHref: row.entryHref ?? undefined,
    storageKey: row.storageKey,
    extractedKey: row.extractedKey ?? undefined,
    checksumSha256: row.checksumSha256 ?? undefined,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

function toProgressDto(row: NormalizedProgress): NormalizedProgressDto {
  return {
    registrationId: row.registrationId,
    courseModuleId: row.courseModuleId,
    activityNodeId: row.activityNodeId,
    completionStatus: row.completionStatus,
    successStatus: row.successStatus,
    scoreScaled: toNumber(row.scoreScaled),
    scoreRaw: toNumber(row.scoreRaw),
    scoreMin: toNumber(row.scoreMin),
    scoreMax: toNumber(row.scoreMax),
    progressMeasure: toNumber(row.progressMeasure),
    location: row.location ?? undefined,
    totalTime: row.totalTimeIso8601 ?? undefined,
    suspendData: row.suspendData ?? undefined,
  };
}

function parseDate(value?: string): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIso(value: Date | string | undefined): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  return new Date(0).toISOString();
}

function toNumber(value: string | null | undefined): number | undefined {
  if (value == null) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function notFound(
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
