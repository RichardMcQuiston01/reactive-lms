import type { LearnerRef } from '../models/learner-ref';

/**
 * Host-supplied identity bridge. ReactiveLMS never owns host auth strategy.
 * Standalone mode provides a local JWT adapter implementing this contract.
 */
export interface IdentityAdapter {
  /**
   * Resolves the current learner from a host request object (e.g. Express/Fastify req).
   *
   * @param request - Opaque host request; shape is host-defined
   */
  resolveLearner(request: unknown): Promise<LearnerRef>;
}
