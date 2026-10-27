import { afterEach, describe, expect, test } from 'bun:test';
import { lmsFetch } from './lms-http';

const config = {
  apiBaseUrl: 'http://api.test/lms/',
  getAccessToken: () => 'secret',
};

const realFetch = globalThis.fetch;

function stubFetch(respond: () => Response): {
  calls: Array<{ url: string; init: RequestInit }>;
} {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return respond();
  }) as typeof fetch;
  return { calls };
}

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('lmsFetch', () => {
  test('sends a string body as JSON with the bearer token', async () => {
    const { calls } = stubFetch(
      () => new Response('{"ok":true}', { status: 200 }),
    );

    const result = await lmsFetch<{ ok: boolean }>(config, '/modules', {
      method: 'POST',
      body: JSON.stringify({ a: 1 }),
    });

    expect(result).toEqual({ ok: true });
    expect(calls[0]?.url).toBe('http://api.test/lms/modules');
    const headers = calls[0]?.init.headers as Headers;
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('Authorization')).toBe('Bearer secret');
  });

  test('leaves the content type to the browser for a FormData body', async () => {
    const { calls } = stubFetch(
      () => new Response('{"id":"p1"}', { status: 201 }),
    );
    const form = new FormData();
    form.append('file', new Blob(['zip']), 'a.zip');

    await lmsFetch(config, '/packages', { method: 'POST', body: form });

    const headers = calls[0]?.init.headers as Headers;
    expect(headers.has('Content-Type')).toBe(false);
    expect(calls[0]?.init.body).toBe(form);
  });

  test('keeps a caller-supplied content type', async () => {
    const { calls } = stubFetch(() => new Response('{}', { status: 200 }));

    await lmsFetch(config, '/x', {
      method: 'POST',
      body: 'a=b',
      headers: { 'Content-Type': 'text/plain' },
    });

    expect((calls[0]?.init.headers as Headers).get('Content-Type')).toBe(
      'text/plain',
    );
  });

  test('turns an error body into a thrown message', async () => {
    stubFetch(
      () =>
        new Response(
          '{"code":"PACKAGE_NOT_DETECTED","message":"Not a package."}',
          {
            status: 400,
          },
        ),
    );

    await expect(
      lmsFetch(config, '/packages', { method: 'POST', body: '{}' }),
    ).rejects.toThrow('Not a package.');
  });

  test('returns undefined for 204', async () => {
    stubFetch(() => new Response(null, { status: 204 }));
    expect(await lmsFetch(config, '/x', { method: 'DELETE' })).toBeUndefined();
  });
});
