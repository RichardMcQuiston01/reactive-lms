import { Body, Controller, HttpCode, Param, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { EnrolmentService } from '@reactive-lms/core';
import type { EnrolmentMethodKind } from '@reactive-lms/persistence';
import {
  CatalogService,
  type CreateEnrolmentMethodInput,
} from '../catalog/catalog.service';
import { LmsRequestService } from '../identity/lms-request.service';

/**
 * Body for instructor-driven membership create.
 */
export interface CreateMembershipBody {
  /** Person to enrol. */
  personId: string;
  /** Enrolment path; defaults to `manual`. */
  method?: 'manual' | 'group';
}

/**
 * Body for learner self-enrol.
 */
export interface SelfEnrolBody {
  /** Enrolment key when the method requires one. */
  key?: string;
}

/**
 * Enrolment methods, instructor memberships, and self-enrol.
 */
@ApiTags('enrolments')
@Controller('course-sections')
export class EnrolmentsController {
  /**
   * @param enrolment - Core enrolment service
   * @param catalog - Enrolment-method create
   * @param request - Identity / capability
   */
  constructor(
    private readonly enrolment: EnrolmentService,
    private readonly catalog: CatalogService,
    private readonly request: LmsRequestService,
  ) {}

  /**
   * Enables an enrolment method on a section.
   *
   * @param id - Course section id
   * @param body - Method kind and optional config
   * @param req - Host request
   */
  @Post(':id/enrolment-methods')
  @HttpCode(201)
  @ApiOperation({ summary: 'Enable an enrolment method' })
  @ApiParam({ name: 'id' })
  async createMethod(
    @Param('id') id: string,
    @Body() body: CreateEnrolmentMethodInput,
    @Req() req: unknown,
  ): Promise<{ id: string }> {
    await this.request.assertCan(req, 'enrol.manage', {
      type: 'course_section',
      id,
    });
    const actorPersonId = await this.request.ensurePersonId(req);
    return this.catalog.createEnrolmentMethod(
      id,
      {
        method: body.method as EnrolmentMethodKind,
        isEnabled: body.isEnabled,
        configJson: body.configJson,
      },
      actorPersonId,
    );
  }

  /**
   * Enrols a person via `manual` (default) or `group`.
   *
   * @param id - Course section id
   * @param body - Person id and method
   * @param req - Host request
   */
  @Post(':id/memberships')
  @HttpCode(201)
  @ApiOperation({ summary: 'Enrol a person on a section' })
  @ApiParam({ name: 'id' })
  async createMembership(
    @Param('id') id: string,
    @Body() body: CreateMembershipBody,
    @Req() req: unknown,
  ): Promise<{ registrationId: string }> {
    await this.request.assertCan(req, 'enrol.manage', {
      type: 'course_section',
      id,
    });
    const actorPersonId = await this.request.ensurePersonId(req);
    if (body.method === 'group') {
      return this.enrolment.group(id, body.personId);
    }
    return this.enrolment.manual(id, body.personId, actorPersonId);
  }

  /**
   * Learner self-enrol using the current identity.
   *
   * @param id - Course section id
   * @param body - Optional enrolment key
   * @param req - Host request
   */
  @Post(':id/self-enrol')
  @HttpCode(201)
  @ApiOperation({ summary: 'Self-enrol the current learner' })
  @ApiParam({ name: 'id' })
  async selfEnrol(
    @Param('id') id: string,
    @Body() body: SelfEnrolBody,
    @Req() req: unknown,
  ): Promise<{ registrationId: string }> {
    await this.request.assertCan(req, 'launch', {
      type: 'course_section',
      id,
    });
    const personId = await this.request.ensurePersonId(req);
    return this.enrolment.self(id, personId, { key: body?.key });
  }
}
