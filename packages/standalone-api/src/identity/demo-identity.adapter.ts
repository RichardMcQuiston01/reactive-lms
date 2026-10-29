import type {
  IdentityAdapter,
  LearnerRef,
} from '@richardmcquiston01/reactive-lms-shared';

/**
 * Fixed demo learner used until standalone auth is wired.
 * `externalId` is `standalone-demo-learner`.
 */
export const DEMO_LEARNER: LearnerRef = {
  externalId: 'standalone-demo-learner',
  displayName: 'Demo Learner',
  email: 'demo@localhost',
};

/**
 * Identity adapter that always returns {@link DEMO_LEARNER}.
 */
export class DemoIdentityAdapter implements IdentityAdapter {
  /**
   * Ignores the request and returns the demo learner.
   *
   * @param _request - Unused host request
   */
  async resolveLearner(_request: unknown): Promise<LearnerRef> {
    return DEMO_LEARNER;
  }
}
