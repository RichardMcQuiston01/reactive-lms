import {
  Body,
  Controller,
  HttpCode,
  Inject,
  Optional,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { LaunchService } from '@richardmcquiston01/reactive-lms-core';
import type {
  CreateLaunchDto,
  LaunchDto,
} from '@richardmcquiston01/reactive-lms-shared';
import { LmsRequestService } from '../identity/lms-request.service';
import { RegistrationAccess } from '../identity/registration-access';
import type { ReactiveLmsModuleOptions } from '../reactive-lms.module';
import { RLMS_MODULE_OPTIONS } from '../tokens';
import { callbackBaseUrl } from './callback-url';

/**
 * Creates launch attempts for an existing registration.
 */
@ApiTags('launches')
@Controller('registrations')
export class LaunchesController {
  /**
   * @param launches - Core launch service
   * @param request - Identity
   * @param access - Registration ownership / capability checks
   * @param options - Module options; `publicBaseUrl` shapes the callback address
   */
  constructor(
    private readonly launches: LaunchService,
    private readonly request: LmsRequestService,
    private readonly access: RegistrationAccess,
    @Optional()
    @Inject(RLMS_MODULE_OPTIONS)
    private readonly options?: Pick<ReactiveLmsModuleOptions, 'publicBaseUrl'>,
  ) {}

  /**
   * Launches a module for the registration.
   *
   * @param id - Registration id
   * @param body - Course module and optional activity node
   * @param req - Host request
   */
  @Post(':id/launches')
  @HttpCode(201)
  @ApiOperation({ summary: 'Launch a course module' })
  @ApiParam({ name: 'id' })
  async create(
    @Param('id') id: string,
    @Body() body: CreateLaunchDto,
    @Req() req: unknown,
  ): Promise<LaunchDto> {
    await this.access.assertRegistration(req, 'launch', id);
    const learner = await this.request.resolveLearner(req);
    return this.launches.launch({
      registrationId: id,
      courseModuleId: body.courseModuleId,
      activityNodeId: body.activityNodeId,
      learner,
      launchMode: body.launchMode ?? 'Normal',
      callbackBaseUrl: callbackBaseUrl(req, this.options?.publicBaseUrl),
    });
  }
}
