import { Controller, Get, HttpStatus, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  FORBIDDEN_EXAMPLE,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
  VALIDATION_EXAMPLE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { RequireRoles } from '../../../infrastructure/security/decorators/access.decorators';
import { AuditFlagQueryDto, RequestAuditFlagPageResponseDto } from './request-history.dto';
import { toRequestHistoryApiException } from './request-history.http-errors';
import { RequestAuditFlagsService } from './request-audit-flags.service';

/**
 * The flags of requests on the audit report of the Super Admin, who files and decides no request and reads none (`SoD-1`): only the
 * narrow facts of the flag. Read only, with no action on the request.
 */
@ApiTags('access-requests')
@Controller({ version: '1' })
export class RequestAuditFlagsController {
  constructor(private readonly flags: RequestAuditFlagsService) {}

  @Get('access-request-audit-flags')
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({
    operationId: 'accessRequestAuditFlagList',
    summary: 'List the requests flagged for the audit report',
  })
  @ApiSuccessResponse(RequestAuditFlagPageResponseDto, {
    message: 'ACCESS_REQUEST_HISTORY.AUDIT_FLAGS_LISTED',
    description:
      'One page of the requests that carry the flag, the newest sent first and then by id: pageSize 1 to 100, 20 when left out, narrowed by the moment sent. NO_NEED_APPROVER: free internal software sent through the one-step route, so no head approved the need, because the requester heads the department, the department has no head or its head left. A paid request is never flagged: it still has a spend step. Each row names who sent it, the department, the software and plan, why it went the one-step route, and who completed the grant and when (null until it is completed). No price, amount, budget, commitment, evidence or reason the requester wrote is answered, and the flag is only read: nothing is approved, refused or cleared here.',
  })
  @ApiErrorResponses(
    UNAUTHENTICATED_RESPONSE,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only the Super Admin reads the flags of the audit report (AUTHORIZATION.FORBIDDEN).',
      examples: [FORBIDDEN_EXAMPLE],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The flag, the page, its size or the window of the moment sent is invalid, or a parameter that is not listed is given (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
    GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  )
  async list(@Query() query: AuditFlagQueryDto) {
    try {
      return await this.flags.page(query);
    } catch (error) {
      throw toRequestHistoryApiException(error);
    }
  }
}
