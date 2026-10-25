import { Body, Controller, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { RequireRoles } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AccessRequestQueryService } from '../access-request/access-request-query.service';
import { toWire } from '../access-request/access-request.wire';
import { LineClosureBodyDto, LineParamsDto } from './group-decision.dto';
import { GroupLineClosureService } from './group-line-closure.service';
import { GroupResponseDto } from './group-request.dto';
import { toGroupRequestApiException } from './group-request.http-errors';

/**
 * The IT Admin removes one person who left from a request for a group, without ending the request for the people who remain
 * (`US-03-04` AC-25, `US-05-17`). Finance, a department head and an employee are refused, and the Super Admin does no business work.
 */
@ApiTags('group-requests')
@Controller({ path: 'access-requests', version: '1' })
@RequireRoles('IT_ADMIN')
export class GroupLineClosureController {
  constructor(
    private readonly closures: GroupLineClosureService,
    private readonly queries: AccessRequestQueryService,
  ) {}

  @Post(':id/lines/:employeeId/departure-closure')
  @ApiOperation({
    operationId: 'accessRequestLineCloseForDeparture',
    summary: 'Remove one person who left from a request for a group',
  })
  @ApiSuccessResponse(GroupResponseDto, {
    message: 'ACCESS_REQUEST.LINE_CANCELLED',
    description:
      'The line of the person ends as cancelled, with who closed it, when and why, and the request goes on for the people who remain. Only the task of that person’s grant is cancelled, with its assignment so the seat is free (a task being worked only with the evidence that the work was undone), and only their share of the commitment goes back to the budget. The request is priced again for the people left, the step that nobody waits on any more closes, and when no person is left the request ends. The requester and the person are told of their own line only.',
  })
  @ApiErrorResponses(
    UNAUTHENTICATED_RESPONSE,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only an IT Admin removes a person who left from a request for a group.',
    },
    {
      status: HttpStatus.NOT_FOUND,
      description:
        'The request does not exist, is not a request for a group, or has no such person (ACCESS_REQUEST.NOT_FOUND).',
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The line has ended already (ACCESS_REQUEST.ALREADY_ENDED), the withdrawal of the person waits for the IT Admin to close their task (ACCESS_REQUEST.WITHDRAWAL_PENDING), or the person still works, handing over included (ACCESS_REQUEST.BENEFICIARY_NOT_LEFT). Nothing changes.',
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The ids or the body are invalid (VALIDATION_ERROR), or the task of the grant is being worked and no evidence says the work was undone (ACCESS_REQUEST.EVIDENCE_REQUIRED). Nothing is saved.',
    },
    GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  )
  async close(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: LineParamsDto,
    @Body() body: LineClosureBodyDto,
  ) {
    try {
      const record = await this.closures.close(actor, params.id, params.employeeId, body);

      return { request: toWire(await this.queries.view(record)) };
    } catch (error) {
      throw toGroupRequestApiException(error);
    }
  }
}
