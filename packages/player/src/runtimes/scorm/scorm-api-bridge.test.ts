import { describe, expect, test } from 'bun:test';
import type { ScormCmiDto } from '@reactive-lms/shared';
import { ScormApiBridge } from './scorm-api-bridge';

describe('ScormApiBridge', () => {
  test('installs window.API before any commit and hydrates CMI', async () => {
    const host: { API?: unknown } = {};
    const puts: ScormCmiDto[] = [];
    const bridge = new ScormApiBridge({
      getCmi: async () => ({
        values: { 'cmi.core.lesson_location': 'bookmark' },
      }),
      putCmi: async (body) => {
        puts.push(body);
      },
    });

    const api = await bridge.install(host);
    expect(host.API).toBe(api);
    expect(api.LMSInitialize('')).toBe('true');
    expect(api.LMSGetValue('cmi.core.lesson_location')).toBe('bookmark');
    expect(puts).toEqual([]);
  });

  test('debounces LMSCommit by 500ms', async () => {
    const scheduled: Array<{ handler: () => void; ms: number }> = [];
    const puts: ScormCmiDto[] = [];
    const bridge = new ScormApiBridge({
      getCmi: async () => ({ values: {} }),
      putCmi: async (body) => {
        puts.push(body);
      },
      setTimeoutFn: (handler, ms) => {
        scheduled.push({ handler, ms });
        return scheduled.length;
      },
      clearTimeoutFn: () => {
        scheduled.pop();
      },
    });

    const api = await bridge.install({});
    api.LMSInitialize('');
    api.LMSSetValue('cmi.core.lesson_status', 'completed');
    expect(api.LMSCommit('')).toBe('true');
    expect(api.LMSCommit('')).toBe('true');
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]?.ms).toBe(500);
    expect(puts).toEqual([]);

    scheduled[0]?.handler();
    expect(puts).toHaveLength(1);
    expect(puts[0]?.values['cmi.core.lesson_status']).toBe('completed');
    expect(puts[0]?.finished).toBe(false);
  });

  test('LMSFinish commits immediately with finished=true', async () => {
    const puts: ScormCmiDto[] = [];
    const bridge = new ScormApiBridge({
      getCmi: async () => ({ values: {} }),
      putCmi: async (body) => {
        puts.push(body);
      },
      setTimeoutFn: () => 1,
      clearTimeoutFn: () => undefined,
    });

    const api = await bridge.install({});
    api.LMSInitialize('');
    api.LMSSetValue('cmi.core.lesson_status', 'completed');
    expect(api.LMSFinish('')).toBe('true');
    expect(puts).toEqual([
      expect.objectContaining({
        finished: true,
        values: expect.objectContaining({
          'cmi.core.lesson_status': 'completed',
        }),
      }),
    ]);
  });

  test('uninstall removes window.API', async () => {
    const host: { API?: unknown } = {};
    const bridge = new ScormApiBridge({
      getCmi: async () => ({ values: {} }),
      putCmi: async () => undefined,
    });
    await bridge.install(host);
    bridge.uninstall(host);
    expect(host.API).toBeUndefined();
  });
});
