import { Body, Controller, Header, HttpCode, Post } from '@nestjs/common';
import {
  ApiBody,
  ApiConsumes,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import {
  AiccHacpService,
  formatHacpResponse,
} from '@richardmcquiston01/reactive-lms-core';
import type { HacpRequestDto } from '@richardmcquiston01/reactive-lms-shared';

/**
 * The address AICC content calls (`AICC_URL`). It speaks HACP, the AICC
 * protocol over HTTP: the request is an HTML form and the reply is plain text.
 *
 * It does not use the host's identity or capability checks. The content calls
 * it from the learner's browser, and the protocol identifies the learner only
 * by the session id the LMS gave it at launch (`AICC_SID`). That id is long,
 * random, and good only while the launch's attempt is open.
 */
@ApiTags('aicc')
@Controller('aicc')
export class AiccHacpController {
  /**
   * @param hacp - Core HACP service
   */
  constructor(private readonly hacp: AiccHacpService) {}

  /**
   * Answers a HACP command (`GetParam`, `PutParam`, `ExitAU`, and the `Put*`
   * commands that are accepted and ignored). HACP reports every outcome in the
   * body of an HTTP 200 reply, including refusals, so a client that treats a
   * non-200 reply as a network failure keeps working.
   *
   * @param body - Form fields of the request
   * @returns The reply as HACP plain text
   */
  @Post('hacp')
  @HttpCode(200)
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Answer an AICC HACP request from launched content',
    description:
      'Form-encoded request, plain-text reply (error, error_text, version, aicc_data). Every result, including a refusal, is an HTTP 200 reply with a non-zero error code, as HACP requires. Error 1 is an invalid command or data, with the reason in error_text; error 3 is an invalid or ended session.',
  })
  @ApiConsumes('application/x-www-form-urlencoded')
  @ApiProduces('text/plain')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['command', 'session_id'],
      properties: {
        command: {
          type: 'string',
          example: 'GetParam',
          description: 'GetParam, PutParam, ExitAU, or an ignored Put* command',
        },
        version: { type: 'string', example: '3.5' },
        session_id: {
          type: 'string',
          description: 'The AICC_SID given to the content at launch',
        },
        au_password: { type: 'string', description: 'Not used' },
        aicc_data: {
          type: 'string',
          description: 'INI-style data for PutParam',
        },
      },
    },
  })
  @ApiOkResponse({
    description:
      'HACP plain text, such as "error=0\\r\\nerror_text=Successful"',
    content: { 'text/plain': { schema: { type: 'string' } } },
  })
  async handle(@Body() body: Partial<HacpRequestDto>): Promise<string> {
    const reply = await this.hacp.handle(body ?? {});
    return formatHacpResponse(reply);
  }
}
