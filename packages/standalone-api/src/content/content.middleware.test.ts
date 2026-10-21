import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { MemoryBlobStorageAdapter } from '@richardmcquiston01/reactive-lms-core';
import type { IdentityAdapter } from '@richardmcquiston01/reactive-lms-shared';
import type { NextFunction, Request, Response } from 'express';
import { ContentMiddleware } from './content.middleware';

const identity = {
  resolveLearner: async () => ({ externalId: 'u1', displayName: 'Ada' }),
} as unknown as IdentityAdapter;

/** Serves the middleware over real HTTP, adding Express's `res.status()`. */
async function serve(
  middleware: ContentMiddleware,
): Promise<{ server: Server; base: string }> {
  const server = createServer((req, res) => {
    const express = res as unknown as Response;
    express.status = (code: number) => {
      res.statusCode = code;
      return express;
    };
    const next: NextFunction = (error?: unknown) => {
      const status =
        typeof error === 'object' && error !== null && 'status' in error
          ? Number((error as { status: number }).status)
          : 500;
      res.statusCode = status;
      res.end(error instanceof Error ? error.message : 'error');
    };
    void middleware.use(req as unknown as Request, express, next);
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  return { server, base: `http://127.0.0.1:${port}` };
}

describe('ContentMiddleware', () => {
  let server: Server;
  let base: string;
  let store: MemoryBlobStorageAdapter;

  beforeEach(async () => {
    store = new MemoryBlobStorageAdapter();
    await store.put(
      'packages/p/content/index.html',
      new TextEncoder().encode('<html>hello</html>'),
    );
    await store.put(
      'packages/p/content/digits.txt',
      new TextEncoder().encode('0123456789'),
    );
    ({ server, base } = await serve(new ContentMiddleware(store, identity)));
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  test('streams a stored file with its content type and length', async () => {
    const response = await fetch(
      `${base}/lms/content/packages/p/content/index.html`,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe(
      'text/html; charset=utf-8',
    );
    expect(response.headers.get('content-length')).toBe('18');
    expect(response.headers.get('accept-ranges')).toBe('bytes');
    expect(await response.text()).toBe('<html>hello</html>');
  });

  test('serves a byte range as 206 with Content-Range', async () => {
    const response = await fetch(
      `${base}/lms/content/packages/p/content/digits.txt`,
      { headers: { Range: 'bytes=2-5' } },
    );

    expect(response.status).toBe(206);
    expect(response.headers.get('content-range')).toBe('bytes 2-5/10');
    expect(response.headers.get('content-length')).toBe('4');
    expect(await response.text()).toBe('2345');
  });

  test('serves a suffix range', async () => {
    const response = await fetch(
      `${base}/lms/content/packages/p/content/digits.txt`,
      { headers: { Range: 'bytes=-3' } },
    );

    expect(response.status).toBe(206);
    expect(await response.text()).toBe('789');
  });

  test('a range past the end is 416 with the object size', async () => {
    const response = await fetch(
      `${base}/lms/content/packages/p/content/digits.txt`,
      { headers: { Range: 'bytes=50-' } },
    );

    expect(response.status).toBe(416);
    expect(response.headers.get('content-range')).toBe('bytes */10');
  });

  test('a missing file is 404', async () => {
    const response = await fetch(`${base}/lms/content/packages/p/nope.html`);
    expect(response.status).toBe(404);
  });

  test('a missing key is 404', async () => {
    const response = await fetch(`${base}/lms/content/`);
    expect(response.status).toBe(404);
  });
});
