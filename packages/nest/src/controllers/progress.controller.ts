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
import { ProgressSinkService } from '@reactive-lms/core';
import {
  LmsError,
  MODULE_NOT_FOUND,
  httpStatusForLmsCode,
  type NormalizedProgress,
} from '@reactive-lms/shared';
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
   * Upserts HTML5 / player progress for a registration.
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
    const activityNodeId =
      body.activityNodeId ??
      (await this.catalog.moduleActivityNodeId(body.courseModuleId)) ??
      (await this.catalog.packageEntryActivityNodeId(body.courseModuleId));
    if (!activityNodeId) {
      throw new LmsError({
        status: httpStatusForLmsCode(MODULE_NOT_FOUND),
        code: MODULE_NOT_FOUND,
        message:
          'activityNodeId is required when the module has no default node.',
        details: { courseModuleId: body.courseModuleId },
      });
    }
    await this.sink.upsert({
      registrationId: id,
      courseModuleId: body.courseModuleId,
      activityNodeId,
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
