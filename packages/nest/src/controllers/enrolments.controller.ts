import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import { EnrolmentService } from '@richardmcquiston01/reactive-lms-core';
import type { SectionRegistrationDto } from '@richardmcquiston01/reactive-lms-shared';
import type { EnrolmentMethodKind } from '@richardmcquiston01/reactive-lms-persistence';
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
   * Lists the people registered on a section with their status and score.
   *
   * @param id - Course section id
   * @param req - Host request
   * @param limit - Rows to return (default 200, at most 500)
   * @param offset - Rows to skip
   */
  @Get(':id/registrations')
  @ApiOperation({ summary: 'List a section roster' })
  @ApiParam({ name: 'id' })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'offset', required: false })
  async listRegistrations(
    @Param('id') id: string,
    @Req() req: unknown,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<SectionRegistrationDto[]> {
    await this.request.assertCan(req, 'enrol.manage', {
      type: 'course_section',
      id,
    });
    return this.catalog.listSectionRegistrations(id, {
      limit: limit === undefined ? undefined : Number(limit),
      offset: offset === undefined ? undefined : Number(offset),
    });
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
