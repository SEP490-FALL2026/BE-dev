import { Body, Controller, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  FORBIDDEN_EXAMPLE,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
  VALIDATION_EXAMPLE,
} from '../../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../../infrastructure/http/decorators/api-success-response.decorator';
import { RequireRoles } from '../../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { AccessCutBodyDto, RevocationCompletionBodyDto, TaskIdParamDto, TaskResponseDto } from '../provisioning.dto';
import { PROVISIONING_ERROR_EXAMPLES as EXAMPLES, toProvisioningApiException } from '../provisioning.http-errors';
import { toWire } from '../provisioning-task.mapper';
import { RevocationCompletionService } from './revocation-completion.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The task does not exist (PROVISIONING_TASK.NOT_FOUND).',
  examples: [EXAMPLES.TASK_NOT_FOUND],
} as const;
/** The role guard, and the IT Admin who is the person revoked while another can work the task. */
const WORKER_EXAMPLES = [FORBIDDEN_EXAMPLE, EXAMPLES.ANOTHER_IT_ADMIN_NEEDED] as const;

/**
 * The work an IT Admin does on a revocation: completing it, which is what gives the seat back, and cutting the access of a K1
 * seat before the end of its paid period. There is no route that makes a revocation: each source that decides one (a return, a
 * departure, a transfer review, an expiry...) opens it through the licensing facade, in its own transaction.
 */
@ApiTags('provisioning-tasks')
@Controller({ path: 'provisioning-tasks', version: '1' })
export class RevocationTasksController {
  constructor(private readonly revocations: RevocationCompletionService) {}

  @Post(':id/revocation-completion')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({
    operationId: 'provisioningTaskCompleteRevocation',
    summary: 'Complete a revocation the way its kind of grant says',
  })
  @ApiSuccessResponse(TaskResponseDto, {
    message: 'PROVISIONING_TASK.REVOCATION_COMPLETED',
    description:
      'The only end of a revocation that gives the seat back. K2 is completed as ACCOUNT_REMOVED with evidence, or as ALREADY_GONE with a note when the person removed the account themselves; K5 as OFF_SYSTEM_REVOKED with evidence; K4 as KEY_DEACTIVATED with evidence, and its key goes back to the store (keyDisposition RETURN_TO_STORE, the default) or back and withdrawn from it at once (WITHDRAW, with a withdrawalReason: a key that may not move to another device), with LICENSE_KEY.RETURNED_TO_STORE (and LICENSE_KEY.WITHDRAWN) in the audit trail; K1 as RENEWAL_CANCELLED with evidence, the day the paid period ends (paidThroughOn) and what is known of the access: UNTIL_PAID_END, or CUT with the day (accessCutOn) and its evidence. The assignment ends the same day for K2, K4 and K5, and for K1 at the end of the paid period or the day the access was cut, whichever is earlier; a K1 seat whose access runs on is reported as terminating. The completion writes no saving, invoice, contract or budget.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description:
        'Only an IT Admin works the queue of provisioning tasks, and an IT Admin who is the person revoked waits for another usable IT Admin (PROVISIONING.ANOTHER_IT_ADMIN_NEEDED); with none left they may.',
      examples: WORKER_EXAMPLES,
    },
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'The task is not a revocation (PROVISIONING_TASK.NOT_REVOCATION), is not in progress or is completed already (NOT_IN_PROGRESS), is not for a person (NOT_MANUAL), is still in its grace (NOT_BEFORE, details.notBefore: the first day it can be completed), or the assignment is no longer open (LICENSE_ASSIGNMENT.NOT_OPEN): nothing changes.',
      examples: [EXAMPLES.NOT_REVOCATION, EXAMPLES.NOT_IN_PROGRESS, EXAMPLES.NOT_BEFORE],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The request is invalid (VALIDATION_ERROR), or the completion is refused and nothing is stored: REVOCATION.COMPLETION_NOT_ALLOWED (the way does not fit the kind of grant), NOTE_REQUIRED, PAID_THROUGH_REQUIRED, ACCESS_STATE_REQUIRED, ACCESS_STATE_INVALID, WITHDRAWAL_REASON_REQUIRED (a K4 key withdrawn with no reason; keyDisposition or withdrawalReason on another kind is COMPLETION_NOT_ALLOWED), or no evidence (PROVISIONING_TASK.EVIDENCE_REQUIRED).',
      examples: [
        VALIDATION_EXAMPLE,
        EXAMPLES.COMPLETION_NOT_ALLOWED,
        EXAMPLES.NOTE_REQUIRED,
        EXAMPLES.PAID_THROUGH_REQUIRED,
        EXAMPLES.ACCESS_STATE_REQUIRED,
        EXAMPLES.ACCESS_STATE_INVALID,
        EXAMPLES.WITHDRAWAL_REASON_REQUIRED,
        EXAMPLES.EVIDENCE_REQUIRED,
      ],
    },
  )
  async completeRevocation(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: TaskIdParamDto,
    @Body() body: RevocationCompletionBodyDto,
  ) {
    try {
      return { task: toWire(await this.revocations.complete(actor, params.id, body)) };
    } catch (error) {
      throw toProvisioningApiException(error);
    }
  }

  @Post(':id/access-cut')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({
    operationId: 'provisioningTaskRecordAccessCut',
    summary: 'Cut the access of a terminating K1 seat before the paid period ends',
  })
  @ApiSuccessResponse(TaskResponseDto, {
    message: 'PROVISIONING_TASK.ACCESS_CUT',
    description:
      'For a K1 seat whose renewal is cancelled and whose access was left to run to the end of the paid period: records, once, the day the access was cut and its evidence. The seat then ends that day when that is sooner than the end it has; a cut on or after that end only records the fact. A later invoice of a new period is a mismatch for the cost reconciliation, not a reason to bring the seat back.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Not an IT Admin, or PROVISIONING.ANOTHER_IT_ADMIN_NEEDED.',
      examples: WORKER_EXAMPLES,
    },
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'The task is not a revocation (PROVISIONING_TASK.NOT_REVOCATION) or its access is not running on to the end of the paid period, or was cut already (NOT_TERMINATING): nothing changes.',
      examples: [EXAMPLES.NOT_REVOCATION, EXAMPLES.NOT_TERMINATING],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The request is invalid (VALIDATION_ERROR), the day is ahead (REVOCATION.ACCESS_STATE_INVALID) or there is no evidence (PROVISIONING_TASK.EVIDENCE_REQUIRED): nothing changes.',
      examples: [VALIDATION_EXAMPLE, EXAMPLES.ACCESS_STATE_INVALID, EXAMPLES.EVIDENCE_REQUIRED],
    },
  )
  async recordAccessCut(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: TaskIdParamDto,
    @Body() body: AccessCutBodyDto,
  ) {
    try {
      return { task: toWire(await this.revocations.recordAccessCut(actor, params.id, body)) };
    } catch (error) {
      throw toProvisioningApiException(error);
    }
  }
}
