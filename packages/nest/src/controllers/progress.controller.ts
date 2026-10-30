import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ProgressSinkService } from '@richardmcquiston01/reactive-lms-core';
import type { NormalizedProgress } from '@richardmcquiston01/reactive-lms-shared';
import { CatalogService } from '../catalog/catalog.service';
import { LmsRequestService } from '../identity/lms-request.service';

/**
 * HTML5 postMessage sink and progress listing.
 */
@ApiTags('progress')
@Controller('registrations')
export class ProgressController {
  /**
   * @param sink - Core progress writer
   * @param catalog - Progress listing and module lookup
   * @param request - Identity / capability
   */
  constructor(
    private readonly sink: ProgressSinkService,
    private readonly catalog: CatalogService,
    private readonly request: LmsRequestService,
  ) {}

  /**
   * Lists normalized progress for a registration.
   *
   * @param id - Registration id
   * @param req - Host request
   */
  @Get(':id/progress')
  @ApiOperation({ summary: 'List normalized progress' })
  @ApiParam({ name: 'id' })
  async list(
    @Param('id') id: string,
    @Req() req: unknown,
  ): Promise<NormalizedProgress[]> {
    await this.request.assertCan(req, 'grade.view', {
      type: 'registration',
      id,
    });
    return this.catalog.listProgress(id);
  }

  /**
   * Records progress that HTML5 content reports from a launch. The module
   * must have an open attempt for the registration, and the activity node is
   * the one that was launched; see `ProgressSinkService.upsertFromLaunch`.
   *
   * @param id - Registration id
   * @param body - Partial {@link NormalizedProgress}
   * @param req - Host request
   */
  @Post(':id/progress')
  @HttpCode(204)
  @ApiOperation({ summary: 'Write HTML5 progress' })
  @ApiParam({ name: 'id' })
  async upsert(
    @Param('id') id: string,
    @Body() body: Partial<NormalizedProgress> & { courseModuleId: string },
    @Req() req: unknown,
  ): Promise<void> {
    await this.request.assertCan(req, 'launch', {
      type: 'registration',
      id,
    });
    await this.sink.upsertFromLaunch({
      registrationId: id,
      courseModuleId: body.courseModuleId,
      activityNodeId: body.activityNodeId,
      completionStatus: body.completionStatus ?? 'unknown',
      successStatus: body.successStatus ?? 'unknown',
      scoreScaled: body.scoreScaled,
      scoreRaw: body.scoreRaw,
      scoreMin: body.scoreMin,
      scoreMax: body.scoreMax,
      progressMeasure: body.progressMeasure,
      location: body.location,
      totalTime: body.totalTime,
      suspendData: body.suspendData,
    });
  }
}
