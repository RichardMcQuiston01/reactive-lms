import { describe, expect, test } from 'bun:test';
import type { ScormCmiService } from '@reactive-lms/core';
import type { ScormCmiDto } from '@reactive-lms/shared';
import type { LmsRequestService } from '../identity/lms-request.service';
import { ScormRuntimeController } from './scorm-runtime.controller';

const CMI: ScormCmiDto = {
  values: {
    'cmi.core.lesson_status': 'completed',
    'cmi.core.score.raw': '80',
  },
};

describe('ScormRuntimeController', () => {
  test('GET hydrates CMI through ScormCmiService', async () => {
    const ctl = new ScormRuntimeController(
      {
        getCmi: async () => CMI,
      } as unknown as ScormCmiService,
      { assertCan: async () => undefined } as LmsRequestService,
    );

    expect(await ctl.getCmi('att-1', {})).toEqual(CMI);
  });

  test('PUT commits CMI through ScormCmiService', async () => {
    const calls: unknown[] = [];
    const ctl = new ScormRuntimeController(
      {
        putCmi: async (id, body) => {
          calls.push({ id, body });
          return body;
        },
      } as unknown as ScormCmiService,
      { assertCan: async () => undefined } as LmsRequestService,
    );

    const body: ScormCmiDto = { ...CMI, finished: true };
    expect(await ctl.putCmi('att-1', body, {})).toEqual(body);
    expect(calls).toEqual([{ id: 'att-1', body }]);
  });
});
