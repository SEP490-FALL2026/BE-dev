import { Body, Controller, Get, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  FORBIDDEN_EXAMPLE,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
  VALIDATION_EXAMPLE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { AuthenticatedOnly, RequireRoles } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { MonitoringNoticeResponseDto, NoticeVersionBodyDto } from './notice.dto';
import { NOTICE_ERROR_EXAMPLES, toNoticeApiException } from './notice.http-errors';
import { toMonitoringNotice } from './notice.mapper';
import { NoticeService } from './notice.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;

/** The notice that tells the holders what is collected from the company machine they use. */
@ApiTags('monitoring-notices')
@Controller({ version: '1' })
export class NoticeController {
  constructor(private readonly notices: NoticeService) {}

  @Post('monitoring-notice-versions')
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'monitoringNoticeVersionCreate', summary: 'Publish a version of the monitoring notice' })
  @ApiSuccessResponse(MonitoringNoticeResponseDto, {
    status: HttpStatus.CREATED,
    message: 'MONITORING_NOTICE.PUBLISHED',
    description:
      'The new version, numbered after the last. When it asks for a new acknowledgement every open registration waits for one again.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only the Super Admin publishes the notice.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The request is invalid (VALIDATION_ERROR), or the version adds the status of tools without asking for a new acknowledgement (MONITORING_NOTICE.REACKNOWLEDGEMENT_REQUIRED).',
      examples: [VALIDATION_EXAMPLE, NOTICE_ERROR_EXAMPLES.REACKNOWLEDGEMENT_REQUIRED],
    },
  )
  async publish(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: NoticeVersionBodyDto) {
    try {
      return toMonitoringNotice(await this.notices.publish(actor, body));
    } catch (error) {
      throw toNoticeApiException(error);
    }
  }

  @Get('monitoring-notices/current')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'monitoringNoticeCurrentGet', summary: 'Read the monitoring notice in force' })
  @ApiSuccessResponse(MonitoringNoticeResponseDto, {
    message: 'MONITORING_NOTICE.FETCHED',
    description: 'The version of the notice in force, with the id a holder acknowledges.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, {
    status: HttpStatus.NOT_FOUND,
    description: 'No version has been published yet (MONITORING_NOTICE.NOT_PUBLISHED).',
    examples: [NOTICE_ERROR_EXAMPLES.NOT_PUBLISHED],
  })
  async current() {
    try {
      return toMonitoringNotice(await this.notices.current());
    } catch (error) {
      throw toNoticeApiException(error);
    }
  }
}
