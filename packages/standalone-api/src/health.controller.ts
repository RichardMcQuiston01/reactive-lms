import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

/**
 * Liveness probe (not under the `/lms` prefix).
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  /**
   * Returns `{ status: 'ok' }` when the process is up.
   */
  @Get()
  @ApiOperation({ summary: 'Liveness probe' })
  health(): { status: 'ok' } {
    return { status: 'ok' };
  }
}
