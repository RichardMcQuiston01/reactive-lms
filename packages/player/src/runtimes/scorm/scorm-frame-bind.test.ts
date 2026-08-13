import { describe, expect, test } from 'bun:test';
import type { ScormCmiDto } from '@reactive-lms/shared';
import { bindScormFrame } from './scorm-frame-bind';

describe('bindScormFrame', () => {
  test('installs API and returns the SCO url after hydrate', async () => {
    const host: { API?: unknown } = {};
    const result = await bindScormFrame({
      attemptId: 'att-1',
      contentUrl: '/lms/content/sco.html',
      host,
      getCmi: async () => ({
        values: { 'cmi.core.lesson_location': 'p1' },
      }),
      putCmi: async () => undefined,
    });

    expect(result.error).toBeNull();
    expect(result.iframeSrc).toBe('/lms/content/sco.html');
    expect(host.API).toBeDefined();
    expect(result.bridge).toBeDefined();
  });

  test('surfaces a hydrate failure and does not set iframe src', async () => {
    const host: { API?: unknown } = {};
    const result = await bindScormFrame({
      attemptId: 'att-1',
      contentUrl: '/lms/content/sco.html',
      host,
      getCmi: async () => {
        throw new Error('Attempt not found.');
      },
      putCmi: async () => undefined,
    });

    expect(result.iframeSrc).toBeNull();
    expect(result.error).toBe('Attempt not found.');
    expect(host.API).toBeUndefined();
    expect(result.bridge).toBeUndefined();
  });

  test('rebind uninstalls the previous bridge and flushes a pending commit', async () => {
    const host: { API?: unknown } = {};
    const puts: ScormCmiDto[] = [];
    const first = await bindScormFrame({
      attemptId: 'att-1',
      contentUrl: '/lms/content/a.html',
      host,
      getCmi: async () => ({ values: {} }),
      putCmi: async (body) => {
        puts.push(body);
      },
    });

    const api = host.API;
    expect(api).toBeDefined();
    api?.LMSInitialize('');
    api?.LMSSetValue('cmi.core.lesson_location', 'keep-me');
    api?.LMSCommit('');

    const second = await bindScormFrame({
      attemptId: 'att-2',
      contentUrl: '/lms/content/b.html',
      host,
      previous: first.bridge,
      getCmi: async () => ({ values: {} }),
      putCmi: async (body) => {
        puts.push(body);
      },
    });

    expect(second.iframeSrc).toBe('/lms/content/b.html');
    expect(second.error).toBeNull();
    expect(
      puts.some((body) => body.values['cmi.core.lesson_location'] === 'keep-me'),
    ).toBe(true);
  });

  test('a stale bind does not wipe a newer window.API', async () => {
    const host: { API?: unknown } = {};
    let generation = 1;
    let releaseFirst!: (value: ScormCmiDto) => void;
    const firstHydrate = new Promise<ScormCmiDto>((resolve) => {
      releaseFirst = resolve;
    });

    const firstPromise = bindScormFrame({
      attemptId: 'att-1',
      contentUrl: '/lms/content/a.html',
      host,
      shouldApply: () => generation === 1,
      getCmi: () => firstHydrate,
      putCmi: async () => undefined,
    });

    generation = 2;
    const second = await bindScormFrame({
      attemptId: 'att-2',
      contentUrl: '/lms/content/b.html',
      host,
      shouldApply: () => generation === 2,
      getCmi: async () => ({ values: { gen: '2' } }),
      putCmi: async () => undefined,
    });
    const newerApi = host.API;
    expect(newerApi).toBeDefined();
    expect(second.iframeSrc).toBe('/lms/content/b.html');

    releaseFirst({ values: { gen: '1' } });
    const first = await firstPromise;
    first.bridge?.uninstall(host);

    expect(host.API).toBe(newerApi);
    expect(host.API).toBeDefined();
  });
});
