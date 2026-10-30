import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { LmsRequestService } from '../identity/lms-request.service';

/**
 * Checks the `package.import` permission before the request body is read.
 *
 * Nest runs guards before interceptors, and the upload interceptor is what
 * buffers the multipart body. Checking here means a caller who may not import
 * packages is refused without their file ever being read into memory.
 */
@Injectable()
export class PackageImportGuard implements CanActivate {
  /**
   * @param request - Identity / capability
   */
  constructor(private readonly request: LmsRequestService) {}

  /**
   * @param context - Nest execution context of the upload request
   * @returns `true` when allowed; a denial throws a 403 `LmsError`
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    await this.request.assertCan(
      context.switchToHttp().getRequest<unknown>(),
      'package.import',
      { type: 'content_package', id: '*' },
    );
    return true;
  }
}
