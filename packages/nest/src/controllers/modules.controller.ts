import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import {
  ModuleService,
  type PlaceModuleInput,
} from '@richardmcquiston01/reactive-lms-core';
import {
  CatalogService,
  type UpdateModuleInput,
} from '../catalog/catalog.service';
import { LmsRequestService } from '../identity/lms-request.service';

/**
 * Places, updates, and removes course modules.
 */
@ApiTags('modules')
@Controller()
export class ModulesController {
  /**
   * @param modules - Core placement service
   * @param catalog - PATCH/DELETE helper
   * @param request - Identity / capability
   */
  constructor(
    private readonly modules: ModuleService,
    private readonly catalog: CatalogService,
    private readonly request: LmsRequestService,
  ) {}

  /**
   * Places an imported package (or node) into a section.
   *
   * @param id - Course section id
   * @param body - Package id and optional placement fields
   * @param req - Host request
   */
  @Post('course-sections/:id/modules')
  @HttpCode(201)
  @ApiOperation({ summary: 'Place a package as a course module' })
  @ApiParam({ name: 'id' })
  async place(
    @Param('id') id: string,
    @Body() body: PlaceModuleInput,
    @Req() req: unknown,
  ): Promise<{ moduleId: string }> {
    await this.request.assertCan(req, 'module.manage', {
      type: 'course_section',
      id,
    });
    return this.modules.place(id, body);
  }

  /**
   * Updates title, sort order, or availability.
   *
   * @param id - Course module id
   * @param body - Patch fields
   * @param req - Host request
   */
  @Patch('course-modules/:id')
  @ApiOperation({ summary: 'Update a course module' })
  @ApiParam({ name: 'id' })
  async update(
    @Param('id') id: string,
    @Body() body: UpdateModuleInput,
    @Req() req: unknown,
  ): Promise<{ id: string }> {
    await this.request.assertCan(req, 'module.manage', {
      type: 'course_module',
      id,
    });
    return this.catalog.updateModule(id, body);
  }

  /**
   * Removes a placement without deleting the package.
   *
   * @param id - Course module id
   * @param req - Host request
   */
  @Delete('course-modules/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a course module placement' })
  @ApiParam({ name: 'id' })
  async remove(@Param('id') id: string, @Req() req: unknown): Promise<void> {
    await this.request.assertCan(req, 'module.manage', {
      type: 'course_module',
      id,
    });
    await this.catalog.deleteModule(id);
  }
}
