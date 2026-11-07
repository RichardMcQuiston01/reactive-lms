import { describe, expect, test } from 'bun:test';
import {
  ADMIN_LMS_ACTIONS,
  type CapabilityAdapter,
  type LmsAction,
} from '@richardmcquiston01/reactive-lms-shared';
import { LmsRequestService } from './lms-request.service';
import type { PersonDirectory } from './person-directory';

const LEARNER = { externalId: 'learner-1', displayName: 'Learner' };
const RESOURCE = { type: 'course_section', id: 'sec-1' };

function serviceWith(
  capability: CapabilityAdapter | null,
  allowUnrestrictedAdmin?: boolean | null,
): LmsRequestService {
  return new LmsRequestService(
    { resolveLearner: async () => LEARNER },
    {} as PersonDirectory,
    capability,
    allowUnrestrictedAdmin,
  );
}

async function failureOf(attempt: Promise<void>): Promise<unknown> {
  try {
    await attempt;
  } catch (error) {
    return error;
  }
  return undefined;
}

describe('LmsRequestService.assertCan without a capability adapter', () => {
  test('refuses every administrative action with a message that says how to fix it', async () => {
    const service = serviceWith(null);

    for (const action of ADMIN_LMS_ACTIONS) {
      const error = (await failureOf(
        service.assertCan({}, action, RESOURCE),
      )) as {
        status?: number;
        code?: string;
        message?: string;
        details?: unknown;
      };

      expect(error?.status).toBe(403);
      expect(error?.code).toBe('FORBIDDEN');
      expect(error?.message).toContain(`"${action}"`);
      expect(error?.message).toContain('no capability adapter is configured');
      expect(error?.message).toContain('allowUnrestrictedAdmin');
      expect(error?.details).toMatchObject({
        action,
        reason: 'no_capability_adapter',
      });
    }
  });

  test('leaves learner actions to the ownership checks', async () => {
    const service = serviceWith(null);
    const learnerActions: LmsAction[] = ['launch', 'grade.view'];

    for (const action of learnerActions) {
      expect(await failureOf(service.assertCan({}, action, RESOURCE))).toBe(
        undefined,
      );
    }
  });

  test('allows administrative actions once the host opts in', async () => {
    const service = serviceWith(null, true);

    for (const action of ADMIN_LMS_ACTIONS) {
      expect(await failureOf(service.assertCan({}, action, RESOURCE))).toBe(
        undefined,
      );
    }
  });

  test('only a true opt-in counts', async () => {
    for (const flag of [false, null, undefined]) {
      const error = await failureOf(
        serviceWith(null, flag).assertCan({}, 'enrol.manage', RESOURCE),
      );
      expect(error).toBeDefined();
    }
  });
});

describe('LmsRequestService.assertCan with a capability adapter', () => {
  test('the adapter decides, and the opt-in does not override a denial', async () => {
    const asked: string[] = [];
    const deny: CapabilityAdapter = {
      can: async (_learner, action) => {
        asked.push(action);
        return false;
      },
    };

    const error = (await failureOf(
      serviceWith(deny, true).assertCan({}, 'enrol.manage', RESOURCE),
    )) as { status?: number };

    expect(error?.status).toBe(403);
    expect(asked).toEqual(['enrol.manage']);
  });

  test('an allowing adapter admits administrative actions without the opt-in', async () => {
    const allow: CapabilityAdapter = { can: async () => true };

    expect(
      await failureOf(
        serviceWith(allow).assertCan({}, 'package.import', RESOURCE),
      ),
    ).toBe(undefined);
  });
});
