import { describe, expect, test } from 'bun:test';
import type { ScormCmiDto } from '@richardmcquiston01/reactive-lms-shared';
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
    const puts: ScormCmiDto[] = [];
    const bridge = new ScormApiBridge({
      getCmi: async () => ({ values: {} }),
      putCmi: async (body) => {
        puts.push(body);
      },
    });
    await bridge.install(host);
    bridge.uninstall(host);
    expect(host.API).toBeUndefined();
    expect(puts).toEqual([]);
  });

  test('uninstall does not delete a newer window.API', async () => {
    const host: { API?: unknown } = {};
    const older = new ScormApiBridge({
      getCmi: async () => ({ values: { owner: 'older' } }),
      putCmi: async () => undefined,
    });
    const newer = new ScormApiBridge({
      getCmi: async () => ({ values: { owner: 'newer' } }),
      putCmi: async () => undefined,
    });
    const olderApi = await older.install(host);
    const newerApi = await newer.install(host);
    expect(host.API).toBe(newerApi);
    older.uninstall(host);
    expect(host.API).toBe(newerApi);
    expect(host.API).not.toBe(olderApi);
    newer.uninstall(host);
    expect(host.API).toBeUndefined();
  });

  test('install skips assigning API when shouldApply is false', async () => {
    const host: { API?: unknown } = {};
    const newer = new ScormApiBridge({
      getCmi: async () => ({ values: {} }),
      putCmi: async () => undefined,
    });
    const newerApi = await newer.install(host);
    const stale = new ScormApiBridge({
      getCmi: async () => ({ values: { stale: '1' } }),
      putCmi: async () => undefined,
    });
    await stale.install(host, { shouldApply: () => false });
    expect(host.API).toBe(newerApi);
    stale.uninstall(host);
    expect(host.API).toBe(newerApi);
  });

  test('uninstall flushes a pending debounced Commit', async () => {
    const scheduled: Array<{ handler: () => void; ms: number }> = [];
    const puts: ScormCmiDto[] = [];
    const host: { API?: unknown } = {};
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

    const api = await bridge.install(host);
    api.LMSInitialize('');
    api.LMSSetValue('cmi.core.lesson_location', 'page-9');
    expect(api.LMSCommit('')).toBe('true');
    expect(puts).toEqual([]);

    bridge.uninstall(host);
    expect(host.API).toBeUndefined();
    expect(puts).toHaveLength(1);
    expect(puts[0]?.values['cmi.core.lesson_location']).toBe('page-9');
    expect(puts[0]?.finished).toBe(false);
  });

  describe('ordered saves', () => {
    function gate(): { promise: Promise<void>; open: () => void } {
      let open!: () => void;
      const promise = new Promise<void>((resolve) => {
        open = resolve;
      });
      return { promise, open };
    }

    function manualTimers(): {
      setTimeoutFn: (handler: () => void, ms: number) => unknown;
      clearTimeoutFn: (handle: unknown) => void;
      fire: () => void;
    } {
      let pending: (() => void) | undefined;
      return {
        setTimeoutFn: (handler) => {
          pending = handler;
          return 1;
        },
        clearTimeoutFn: () => {
          pending = undefined;
        },
        fire: () => {
          const handler = pending;
          pending = undefined;
          handler?.();
        },
      };
    }

    test('a slow debounced commit cannot land after LMSFinish', async () => {
      const timers = manualTimers();
      const landed: string[] = [];
      const first = gate();
      let call = 0;
      const bridge = new ScormApiBridge({
        getCmi: async () => ({ values: {} }),
        putCmi: async (body) => {
          call += 1;
          if (call === 1) {
            await first.promise;
          }
          landed.push(String(body.values['cmi.core.lesson_status']));
        },
        ...timers,
      });
      const api = await bridge.install({});
      api.LMSInitialize('');
      api.LMSSetValue('cmi.core.lesson_status', 'incomplete');
      api.LMSCommit('');
      timers.fire();
      api.LMSSetValue('cmi.core.lesson_status', 'completed');
      api.LMSFinish('');
      expect(call).toBe(1);

      first.open();
      await bridge.flush();

      expect(landed).toEqual(['incomplete', 'completed']);
    });

    test('uninstall resolves only after the in-flight save has finished', async () => {
      const timers = manualTimers();
      const inFlight = gate();
      let saved = false;
      const host: { API?: unknown } = {};
      const bridge = new ScormApiBridge({
        getCmi: async () => ({ values: {} }),
        putCmi: async () => {
          await inFlight.promise;
          saved = true;
        },
        ...timers,
      });
      const api = await bridge.install(host);
      api.LMSInitialize('');
      api.LMSSetValue('cmi.core.lesson_location', 'p9');
      api.LMSCommit('');

      let done = false;
      const uninstalling = bridge.uninstall(host).then(() => {
        done = true;
      });
      await Promise.resolve();
      await Promise.resolve();

      expect(host.API).toBeUndefined();
      expect(done).toBe(false);
      inFlight.open();
      await uninstalling;
      expect(saved).toBe(true);
      expect(done).toBe(true);
    });

    test('a failed save is reported, kept, and sent again by flush', async () => {
      const timers = manualTimers();
      const errors: string[] = [];
      let recovered = 0;
      let attempts = 0;
      const sent: string[] = [];
      const bridge = new ScormApiBridge({
        getCmi: async () => ({ values: {} }),
        putCmi: async (body) => {
          attempts += 1;
          if (attempts === 1) {
            throw new Error('offline');
          }
          sent.push(String(body.values['cmi.core.lesson_status']));
        },
        onSaveError: (error) => errors.push((error as Error).message),
        onSaveRecovered: () => {
          recovered += 1;
        },
        ...timers,
      });
      const api = await bridge.install({});
      api.LMSInitialize('');
      api.LMSSetValue('cmi.core.lesson_status', 'completed');
      expect(api.LMSFinish('')).toBe('true');
      await bridge.retrySave();
      await Promise.resolve();
      expect(errors).toEqual(['offline']);
      expect(sent).toEqual(['completed']);
      expect(recovered).toBe(1);
    });

    test('a failing save never becomes an unhandled rejection', async () => {
      const timers = manualTimers();
      const bridge = new ScormApiBridge({
        getCmi: async () => ({ values: {} }),
        putCmi: async () => {
          throw new Error('down');
        },
        ...timers,
      });
      const api = await bridge.install({});
      api.LMSInitialize('');
      api.LMSFinish('');

      await expect(bridge.flush()).resolves.toBeUndefined();
    });
  });
});
