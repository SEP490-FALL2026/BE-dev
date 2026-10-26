import { Body, Controller, HttpStatus, Param, Post } from '@nestjs/common';
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
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AccessRequestResponseDto, RequestIdParamDto } from './access-request.dto';
import { ACCESS_REQUEST_ERROR_EXAMPLES as EXAMPLES, toAccessRequestApiException } from './access-request.http-errors';
import { AccessRequestQueryService } from './access-request-query.service';
import { toWire } from './access-request.wire';
import { CancelBodyDto } from './cancellation.dto';
import { DepartureCancellationService } from './departure-cancellation.service';

/**
 * The IT Admin closes a request whose beneficiary left, one request at a time (`US-03-04`). Finance, a department head and an employee
 * are refused, and the Super Admin does no business work. Nothing closes by itself.
 */
@ApiTags('access-requests')
@Controller({ path: 'access-requests', version: '1' })
@RequireRoles('IT_ADMIN')
export class CancellationController {
  constructor(
    private readonly cancellations: DepartureCancellationService,
    private readonly queries: AccessRequestQueryService,
  ) {}

  @Post(':id/cancellation')
  @ApiOperation({
    operationId: 'accessRequestCancelForDeparture',
    summary: 'Close a request because the person it was for left',
  })
  @ApiSuccessResponse(AccessRequestResponseDto, {
    message: 'ACCESS_REQUEST.CANCELLED',
    description:
      'The request ends as cancelled, neither refused nor failed nor withdrawn, with who closed it, when and why. The open steps and the questions to Finance close, the request leaves the batch it was sent in, what was held for it goes back to the budget and the task of its grant is cancelled with its assignment so the seat is free (a task being worked only with the evidence that the work was undone). The people it concerns and Finance are told from the audit event.',
  })
  @ApiErrorResponses(
    UNAUTHENTICATED_RESPONSE,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only an IT Admin closes a request because the person it was for left.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The request does not exist (ACCESS_REQUEST.NOT_FOUND).',
      examples: [EXAMPLES.NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'Nothing is left to close (ACCESS_REQUEST.ALREADY_ENDED), the withdrawal waits for the IT Admin to close its task (WITHDRAWAL_PENDING), the request is for a group with more than one person still open (GROUP_REQUEST_UNSUPPORTED: remove each person who left on their own line) or the person it is for still works, handing over included (BENEFICIARY_NOT_LEFT). Nothing changes.',
      examples: [
        EXAMPLES.CANCELLATION_ALREADY_ENDED,
        EXAMPLES.CANCELLATION_WITHDRAWAL_PENDING,
        EXAMPLES.GROUP_REQUEST_UNSUPPORTED,
        EXAMPLES.BENEFICIARY_NOT_LEFT,
      ],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The body is invalid (VALIDATION_ERROR), or the task of the grant is being worked and no evidence says the work was undone (ACCESS_REQUEST.EVIDENCE_REQUIRED). Nothing is saved.',
      examples: [VALIDATION_EXAMPLE, EXAMPLES.EVIDENCE_REQUIRED],
    },
    GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  )
  async cancel(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: RequestIdParamDto,
    @Body() body: CancelBodyDto,
  ) {
    try {
      const record = await this.cancellations.cancel(actor, params.id, body);

      return { request: toWire(await this.queries.view(record)) };
    } catch (error) {
      throw toAccessRequestApiException(error);
    }
  }
}
