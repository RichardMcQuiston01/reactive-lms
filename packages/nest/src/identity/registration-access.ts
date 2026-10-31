import { Inject, Injectable } from '@nestjs/common';
import {
  Attempt,
  Registration,
} from '@richardmcquiston01/reactive-lms-persistence';
import {
  ATTEMPT_NOT_FOUND,
  LmsError,
  REGISTRATION_NOT_FOUND,
  httpStatusForLmsCode,
  type LmsAction,
} from '@richardmcquiston01/reactive-lms-shared';
import type { DataSource } from 'typeorm';
import { RLMS_DATA_SOURCE } from '../tokens';
import { LmsRequestService } from './lms-request.service';

/**
 * Access checks for the routes that act on one learner's registration or on
 * an attempt under it (launch, progress, SCORM CMI).
 *
 * Each check finds the owning person and then defers to
 * {@link LmsRequestService.assertCanOrOwn}: the host's capability adapter
 * decides when there is one, and otherwise only the owner may act.
 */
@Injectable()
export class RegistrationAccess {
  /**
   * @param dataSource - Host TypeORM DataSource
   * @param request - Identity / capability
   */
  constructor(
    @Inject(RLMS_DATA_SOURCE)
    private readonly dataSource: DataSource,
    private readonly request: LmsRequestService,
  ) {}

  /**
   * @param request - Opaque HTTP request
   * @param action - LMS action code
   * @param registrationId - Registration being acted on
   * @throws {LmsError} 404 `REGISTRATION_NOT_FOUND` or 403 `FORBIDDEN`
   */
  async assertRegistration(
    request: unknown,
    action: LmsAction,
    registrationId: string,
  ): Promise<void> {
    const registration = await this.findRegistration(registrationId);
    await this.request.assertCanOrOwn(
      request,
      action,
      { type: 'registration', id: registrationId },
      registration.personId,
    );
  }

  /**
   * @param request - Opaque HTTP request
   * @param action - LMS action code
   * @param attemptId - Attempt being acted on
   * @throws {LmsError} 404 `ATTEMPT_NOT_FOUND` or `REGISTRATION_NOT_FOUND`,
   *   or 403 `FORBIDDEN`
   */
  async assertAttempt(
    request: unknown,
    action: LmsAction,
    attemptId: string,
  ): Promise<void> {
    const attempt = await this.dataSource.manager.findOne(Attempt, {
      where: { id: attemptId },
    });
    if (!attempt) {
      throw new LmsError({
        status: httpStatusForLmsCode(ATTEMPT_NOT_FOUND),
        code: ATTEMPT_NOT_FOUND,
        message: 'Attempt not found.',
        details: { attemptId },
      });
    }
    const registration = await this.findRegistration(attempt.registrationId);
    await this.request.assertCanOrOwn(
      request,
      action,
      { type: 'attempt', id: attemptId },
      registration.personId,
    );
  }

  private async findRegistration(
    registrationId: string,
  ): Promise<Registration> {
    const registration = await this.dataSource.manager.findOne(Registration, {
      where: { id: registrationId },
    });
    if (!registration) {
      throw new LmsError({
        status: httpStatusForLmsCode(REGISTRATION_NOT_FOUND),
        code: REGISTRATION_NOT_FOUND,
        message: 'Registration not found.',
        details: { registrationId },
      });
    }
    return registration;
  }
}
