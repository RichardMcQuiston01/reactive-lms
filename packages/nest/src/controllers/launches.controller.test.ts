import { describe, expect, test } from 'bun:test';
import type { LaunchService } from '@richardmcquiston01/reactive-lms-core';
import type {
  LaunchDto,
  LearnerRef,
} from '@richardmcquiston01/reactive-lms-shared';
import type { LmsRequestService } from '../identity/lms-request.service';
import type { RegistrationAccess } from '../identity/registration-access';
import { LaunchesController } from './launches.controller';

const LEARNER: LearnerRef = {
  externalId: 'standalone-demo-learner',
  displayName: 'Demo Learner',
};

const DESCRIPTOR: LaunchDto = {
  attemptId: 'att-1',
  sessionId: 'sess-1',
  packageType: 'html5',
  playerKind: 'iframe',
  contentUrl: '/lms/content/packages/p/content/index.html',
  runtimeConfig: { launchMode: 'Normal' },
};

describe('LaunchesController', () => {
  test('POST maps CreateLaunchDto onto LaunchService.launch', async () => {
    const calls: unknown[] = [];
    const checks: string[] = [];
    const ctl = new LaunchesController(
      {
        launch: async (request) => {
          calls.push(request);
          return DESCRIPTOR;
        },
      } as unknown as LaunchService,
      { resolveLearner: async () => LEARNER } as LmsRequestService,
      {
        assertRegistration: async (_req, action, registrationId) => {
          checks.push(`${action}:${registrationId}`);
        },
      } as RegistrationAccess,
    );

    const result = await ctl.create(
      'reg-1',
      { courseModuleId: 'mod-1', activityNodeId: 'node-1' },
      {},
    );

    expect(result).toEqual(DESCRIPTOR);
    expect(checks).toEqual(['launch:reg-1']);
    expect(calls).toEqual([
      {
        registrationId: 'reg-1',
        courseModuleId: 'mod-1',
        activityNodeId: 'node-1',
        learner: LEARNER,
        launchMode: 'Normal',
      },
    ]);
  });
});
