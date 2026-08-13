import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CatalogService,
  type CreateOfferingInput,
  type CreateSectionInput,
  type CreateTemplateInput,
} from '../catalog/catalog.service';
import { LmsRequestService } from '../identity/lms-request.service';

/**
 * Creates course templates, offerings, and sections.
 */
@ApiTags('courses')
@Controller()
export class CoursesController {
  /**
   * @param catalog - Catalog writes
   * @param request - Identity / capability
   */
  constructor(
    private readonly catalog: CatalogService,
    private readonly request: LmsRequestService,
  ) {}

  /**
   * Creates a catalog course template.
   *
   * @param body - Title and optional code/description
   * @param req - Host request
   */
  @Post('course-templates')
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a course template' })
  async createTemplate(
    @Body() body: CreateTemplateInput,
    @Req() req: unknown,
  ): Promise<{ id: string }> {
    await this.request.assertCan(req, 'section.manage', {
      type: 'course_template',
      id: '*',
    });
    const actorPersonId = await this.request.ensurePersonId(req);
    return this.catalog.createTemplate(body, actorPersonId);
  }

  /**
   * Creates a dated offering of a template.
   *
   * @param body - Template id, title, optional dates
   * @param req - Host request
   */
  @Post('course-offerings')
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a course offering' })
  async createOffering(
    @Body() body: CreateOfferingInput,
    @Req() req: unknown,
  ): Promise<{ id: string }> {
    await this.request.assertCan(req, 'section.manage', {
      type: 'course_template',
      id: body.courseTemplateId,
    });
    const actorPersonId = await this.request.ensurePersonId(req);
    return this.catalog.createOffering(body, actorPersonId);
  }

  /**
   * Creates an enrollable section.
   *
   * @param body - Offering id, title, optional completion rule
   * @param req - Host request
   */
  @Post('course-sections')
  @HttpCode(201)
  @ApiOperation({ summary: 'Create a course section' })
  async createSection(
    @Body() body: CreateSectionInput,
    @Req() req: unknown,
  ): Promise<{ id: string }> {
    await this.request.assertCan(req, 'section.manage', {
      type: 'course_offering',
      id: body.courseOfferingId,
    });
    const actorPersonId = await this.request.ensurePersonId(req);
    return this.catalog.createSection(body, actorPersonId);
  }
}
