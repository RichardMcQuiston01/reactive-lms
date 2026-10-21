import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import {
  RLMS_IDENTITY_ADAPTER,
  RLMS_STORAGE_ADAPTER,
} from '@reactive-lms/nest';
import {
  LmsError,
  STORAGE_KEY_NOT_FOUND,
  httpStatusForLmsCode,
  type IdentityAdapter,
  type StorageAdapter,
} from '@reactive-lms/shared';
import type { NextFunction, Request, Response } from 'express';

/**
 * Serves extracted package files under `/lms/content/**`.
 * Authz stub: any request that resolves a learner (the demo user) is allowed.
 */
@Injectable()
export class ContentMiddleware implements NestMiddleware {
  /**
   * @param storage - Filesystem (or host) blob store
   * @param identity - Standalone identity adapter
   */
  constructor(
    @Inject(RLMS_STORAGE_ADAPTER)
    private readonly storage: StorageAdapter,
    @Inject(RLMS_IDENTITY_ADAPTER)
    private readonly identity: IdentityAdapter,
  ) {}

  /**
   * Resolves the learner, then streams the storage object.
   *
   * @param req - Express request
   * @param res - Express response
   * @param next - Error-forwarding next
   */
  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await this.identity.resolveLearner(req);
      const key = contentKey(req);
      const body = await this.storage.get(key);
      res.setHeader('Content-Type', contentTypeFor(key));
      res.status(200).end(Buffer.from(body));
    } catch (error) {
      next(error);
    }
  }
}

function contentKey(req: Request): string {
  const full = (req.originalUrl ?? req.url).split('?')[0] ?? '';
  const marker = '/lms/content/';
  const index = full.indexOf(marker);
  const raw = index >= 0 ? full.slice(index + marker.length) : '';
  const key = decodeURIComponent(raw).replace(/^\/+/, '');
  if (!key) {
    throw new LmsError({
      status: httpStatusForLmsCode(STORAGE_KEY_NOT_FOUND),
      code: STORAGE_KEY_NOT_FOUND,
      message: 'Missing content key.',
    });
  }
  return key;
}

function contentTypeFor(key: string): string {
  const lower = key.toLowerCase();
  if (lower.endsWith('.html') || lower.endsWith('.htm')) {
    return 'text/html; charset=utf-8';
  }
  if (lower.endsWith('.css')) {
    return 'text/css; charset=utf-8';
  }
  if (lower.endsWith('.js') || lower.endsWith('.mjs')) {
    return 'text/javascript; charset=utf-8';
  }
  if (lower.endsWith('.json')) {
    return 'application/json; charset=utf-8';
  }
  if (lower.endsWith('.svg')) {
    return 'image/svg+xml';
  }
  if (lower.endsWith('.png')) {
    return 'image/png';
  }
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
    return 'image/jpeg';
  }
  if (lower.endsWith('.gif')) {
    return 'image/gif';
  }
  if (lower.endsWith('.webp')) {
    return 'image/webp';
  }
  if (lower.endsWith('.woff2')) {
    return 'font/woff2';
  }
  if (lower.endsWith('.wasm')) {
    return 'application/wasm';
  }
  return 'application/octet-stream';
}
