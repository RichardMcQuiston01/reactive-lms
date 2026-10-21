import { Inject, Injectable } from '@nestjs/common';
import {
  ActivityNode,
  ContentPackage,
  CourseModule,
  CourseOffering,
  CourseSection,
  CourseTemplate,
  EnrolmentMethod,
  NormalizedProgress,
  Registration,
  type CompletionRule,
  type EnrolmentMethodKind,
} from '@richardmcquiston01/reactive-lms-persistence';
import {
  LmsError,
  MODULE_HAS_CHILDREN,
  MODULE_NOT_FOUND,
  PACKAGE_NOT_FOUND,
  REGISTRATION_NOT_FOUND,
  httpStatusForLmsCode,
  parseAvailability,
  type ContentPackageDto,
  type CourseModuleDto,
  type NormalizedProgress as NormalizedProgressDto,
  type BlobStorageAdapter,
} from '@richardmcquiston01/reactive-lms-shared';
import {
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
    const row = await this.dataSource.manager.findOne(CourseModule, {
      where: { id },
    });
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
      const siblings = await this.dataSource.manager.find(CourseModule, {
        where: { courseSectionId: row.courseSectionId },
      });
      assertCanParent(siblings, row.id, input.parentModuleId);
      row.parentModuleId = input.parentModuleId;
    }
    await this.dataSource.manager.save(row);
    return { id: row.id };
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
    await this.dataSource.manager.delete(CourseModule, { id });
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
   * Default activity node for a module, when the placement has one.
   *
   * @param courseModuleId - Course module id
   */
  async moduleActivityNodeId(
    courseModuleId: string,
  ): Promise<string | undefined> {
    const row = await this.dataSource.manager.findOne(CourseModule, {
      where: { id: courseModuleId },
    });
    return row?.activityNodeId ?? undefined;
  }

  /**
   * Package entry (or first) activity node when the module has none.
   *
   * @param courseModuleId - Course module id
   */
  async packageEntryActivityNodeId(
    courseModuleId: string,
  ): Promise<string | undefined> {
    const row = await this.dataSource.manager.findOne(CourseModule, {
      where: { id: courseModuleId },
    });
    if (!row) {
      throw notFound(MODULE_NOT_FOUND, 'Course module not found.', {
        courseModuleId,
      });
    }
    const contentPackageId = row.contentPackageId;
    if (!contentPackageId) {
      return undefined;
    }
    const contentPackage = await this.dataSource.manager.findOne(
      ContentPackage,
      { where: { id: contentPackageId } },
    );
    const nodes = await this.dataSource.manager.find(ActivityNode, {
      where: { contentPackageId },
      order: { sortOrder: 'ASC' },
    });
    const entryHref = contentPackage?.entryHref;
    const entry = entryHref
      ? nodes.find((node) => node.href === entryHref)
      : undefined;
    return entry?.id ?? nodes[0]?.id;
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
