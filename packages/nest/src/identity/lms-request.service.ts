import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  LmsError,
  type CapabilityAdapter,
  type IdentityAdapter,
  type LearnerRef,
  type LmsAction,
  type LmsResourceRef,
} from '@reactive-lms/shared';
import { RLMS_CAPABILITY_ADAPTER, RLMS_IDENTITY_ADAPTER } from '../tokens';
import { PersonDirectory } from './person-directory';

/**
 * Resolves the current learner and optional capability checks.
 */
@Injectable()
export class LmsRequestService {
  /**
   * @param identity - Host identity adapter
   * @param persons - Person upsert helper
   * @param capability - Optional host capability adapter
   */
  constructor(
    @Inject(RLMS_IDENTITY_ADAPTER)
    private readonly identity: IdentityAdapter,
    private readonly persons: PersonDirectory,
    @Optional()
    @Inject(RLMS_CAPABILITY_ADAPTER)
    private readonly capability: CapabilityAdapter | null,
  ) {}

  /**
   * Resolves the caller via the host identity adapter.
   *
   * @param request - Opaque HTTP request
   */
  async resolveLearner(request: unknown): Promise<LearnerRef> {
    return this.identity.resolveLearner(request);
  }

  /**
   * Resolves the caller and ensures a `Person` row exists.
   *
   * @param request - Opaque HTTP request
   */
  async ensurePersonId(request: unknown): Promise<string> {
    const learner = await this.resolveLearner(request);
    const person = await this.persons.ensure(learner);
    return person.id;
  }

  /**
   * Throws 403 when a capability adapter is configured and denies the action.
   *
   * @param request - Opaque HTTP request
   * @param action - LMS action code
   * @param resource - Target resource
   */
  async assertCan(
    request: unknown,
    action: LmsAction,
    resource: LmsResourceRef,
  ): Promise<void> {
    if (!this.capability) {
      return;
    }
    const learner = await this.resolveLearner(request);
    const allowed = await this.capability.can(learner, action, resource);
    if (!allowed) {
      throw new LmsError({
        status: 403,
        code: 'FORBIDDEN',
        message: `Not allowed to ${action} on ${resource.type}.`,
        details: { action, resource },
      });
    }
  }
}
