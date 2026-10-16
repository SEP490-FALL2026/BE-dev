import { Controller, Get, HttpStatus, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponses } from '../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../infrastructure/http/decorators/api-success-response.decorator';
import { toUnavailableApiException } from '../../infrastructure/http/errors/service-unavailable';
import { RequireRoles } from '../../infrastructure/security/decorators/access.decorators';
import { AuditQueryService } from './audit-query.service';
import { AuditEventPageResponseDto, ListAuditEventsQueryDto } from './dto/audit-event.dto';

/** The Audit Trail, for the Super Admin alone (`US-01-06` AC-5, AC-6). Any other role is a 403 and nothing is read. */
@ApiTags('audit')
@Controller({ path: 'audit-events', version: '1' })
@RequireRoles('SUPER_ADMIN')
export class AuditController {
  constructor(private readonly queries: AuditQueryService) {}

  @Get()
  @ApiOperation({ operationId: 'auditEventList' })
  @ApiSuccessResponse(AuditEventPageResponseDto, {
    message: 'AUDIT.EVENTS_LISTED',
    description:
      'A page of the Audit Trail, newest first, optionally narrowed by resource, actor, action and time window [occurredFrom, occurredTo).',
  })
  @ApiErrorResponses(
    { status: HttpStatus.UNAUTHORIZED, description: 'Authentication is required or the token is no longer valid.' },
    { status: HttpStatus.FORBIDDEN, description: 'Only the Super Admin may read the Audit Trail.' },
    { status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'The query is invalid (VALIDATION_ERROR).' },
    {
      status: HttpStatus.SERVICE_UNAVAILABLE,
      description:
        'Authentication or the service is temporarily unavailable (TOKEN_VERIFICATION_UNAVAILABLE from the guard, SERVICE_UNAVAILABLE after it).',
    },
  )
  async list(@Query() query: ListAuditEventsQueryDto) {
    try {
      const { occurredFrom, occurredTo, ...rest } = query;
      const page = await this.queries.list({
        ...rest,
        ...(occurredFrom !== undefined ? { occurredFrom: new Date(occurredFrom) } : {}),
        ...(occurredTo !== undefined ? { occurredTo: new Date(occurredTo) } : {}),
      });

      return {
        items: page.items.map((event) => ({ ...event, occurredAt: event.occurredAt.toISOString() })),
        pagination: page.pagination,
      };
    } catch (error) {
      throw toUnavailableApiException(error) ?? error;
    }
  }
}
