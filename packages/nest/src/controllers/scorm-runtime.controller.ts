import { Body, Controller, Get, Param, Put, Req } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ScormCmiService } from '@richardmcquiston01/reactive-lms-core';
import type { ScormCmiDto } from '@richardmcquiston01/reactive-lms-shared';
import { LmsRequestService } from '../identity/lms-request.service';

/**
 * SCORM 1.2 CMI hydrate / commit used by the browser `window.API` bridge.
 */
@ApiTags('scorm')
@Controller('scorm/attempts')
export class ScormRuntimeController {
  /**
   * @param cmi - Core CMI persist service
   * @param request - Identity / capability
   */
  constructor(
    private readonly cmi: ScormCmiService,
    private readonly request: LmsRequestService,
  ) {}

  /**
   * Hydrates CMI for a launch attempt.
   *
   * @param id - Attempt id
   * @param req - Host request
   */
  @Get(':id/cmi')
  @ApiOperation({ summary: 'Hydrate SCORM 1.2 CMI for an attempt' })
  @ApiParam({ name: 'id' })
  async getCmi(
    @Param('id') id: string,
    @Req() req: unknown,
  ): Promise<ScormCmiDto> {
    await this.request.assertCan(req, 'launch', {
      type: 'attempt',
      id,
    });
    return this.cmi.getCmi(id);
  }

  /**
   * Commits CMI (and optionally finishes the attempt).
   *
   * @param id - Attempt id
   * @param body - CMI values and optional `finished` flag
   * @param req - Host request
   */
  @Put(':id/cmi')
  @ApiOperation({ summary: 'Commit SCORM 1.2 CMI for an attempt' })
  @ApiParam({ name: 'id' })
  async putCmi(
    @Param('id') id: string,
    @Body() body: ScormCmiDto,
    @Req() req: unknown,
  ): Promise<ScormCmiDto> {
    await this.request.assertCan(req, 'launch', {
      type: 'attempt',
      id,
    });
    return this.cmi.putCmi(id, body);
  }
}
