import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import {
  blobErrorToLmsError,
  contentTypeForKey,
  parseByteRange,
} from '@richardmcquiston01/reactive-lms-core';
import {
  RLMS_BLOB_STORAGE_ADAPTER,
  RLMS_IDENTITY_ADAPTER,
} from '@richardmcquiston01/reactive-lms-nest';
import {
  LmsError,
  STORAGE_KEY_NOT_FOUND,
  STORAGE_RANGE_INVALID,
  httpStatusForLmsCode,
  type BlobStorageAdapter,
  type IdentityAdapter,
} from '@richardmcquiston01/reactive-lms-shared';
import { Readable } from 'node:stream';
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
    @Inject(RLMS_BLOB_STORAGE_ADAPTER)
    private readonly storage: BlobStorageAdapter,
    @Inject(RLMS_IDENTITY_ADAPTER)
    private readonly identity: IdentityAdapter,
  ) {}

  /**
   * Resolves the learner, then streams the storage object. Supports a single
   * `Range` header so media can seek.
   *
   * @param req - Express request
   * @param res - Express response
   * @param next - Error-forwarding next
   */
  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await this.identity.resolveLearner(req);
      const key = contentKey(req);

      const info = await this.storage.head(key);
      if (!info.ok) {
        throw blobErrorToLmsError(info.error);
      }
      const range = parseByteRange(req.headers.range, info.value.size);
      if (range.kind === 'unsatisfiable') {
        res.setHeader('Content-Range', `bytes */${info.value.size}`);
        throw new LmsError({
          status: httpStatusForLmsCode(STORAGE_RANGE_INVALID),
          code: STORAGE_RANGE_INVALID,
          message: `Range "${req.headers.range}" is outside "${key}" (${info.value.size} bytes).`,
        });
      }

      const object = await this.storage.get(
        key,
        range.kind === 'range'
          ? { range: { start: range.start, end: range.end } }
          : {},
      );
      if (!object.ok) {
        throw blobErrorToLmsError(object.error);
      }

      res.setHeader('Content-Type', contentTypeForKey(key));
      res.setHeader('Accept-Ranges', 'bytes');
      if (range.kind === 'range') {
        res.status(206);
        res.setHeader(
          'Content-Range',
          `bytes ${range.start}-${range.end}/${info.value.size}`,
        );
        res.setHeader('Content-Length', String(range.end - range.start + 1));
      } else {
        res.status(200);
        res.setHeader('Content-Length', String(info.value.size));
      }

      // Stream to the client; destroy the source if the client disconnects.
      const source = Readable.from(object.value.body);
      res.on('close', () => source.destroy());
      source.on('error', (error) => {
        if (res.headersSent) {
          res.destroy(error);
        } else {
          next(error);
        }
      });
      source.pipe(res);
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
