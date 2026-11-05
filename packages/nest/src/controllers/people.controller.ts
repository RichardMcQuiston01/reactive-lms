import { Controller, Get, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { PersonSummaryDto } from '@richardmcquiston01/reactive-lms-shared';
import { LmsRequestService } from '../identity/lms-request.service';
import { PersonDirectory } from '../identity/person-directory';

/**
 * Person lookup for admin pickers, such as choosing who to enrol.
 */
@ApiTags('people')
@Controller('people')
export class PeopleController {
  /**
   * @param people - Person directory
   * @param request - Identity / capability
   */
  constructor(
    private readonly people: PersonDirectory,
    private readonly request: LmsRequestService,
  ) {}

  /**
   * Finds people by name, email, or host identifier.
   *
   * @param req - Host request
   * @param search - Text to look for; empty lists everyone
   * @param limit - Rows to return (default 200, at most 500)
   * @param offset - Rows to skip
   */
  @Get()
  @ApiOperation({ summary: 'Search people' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'offset', required: false })
  async search(
    @Req() req: unknown,
    @Query('search') search?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<PersonSummaryDto[]> {
    await this.request.assertCan(req, 'enrol.manage', {
      type: 'person',
      id: '*',
    });
    return this.people.search(search ?? '', {
      limit: limit === undefined ? undefined : Number(limit),
      offset: offset === undefined ? undefined : Number(offset),
    });
  }
}
