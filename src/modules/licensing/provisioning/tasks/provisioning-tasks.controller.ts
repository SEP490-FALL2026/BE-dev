import { Body, Controller, Get, HttpStatus, Param, Post, Query } from '@nestjs/common';
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
import {
  CloseFailedBodyDto,
  CompleteBodyDto,
  FailureBodyDto,
  GrantBodyDto,
  GrantResponseDto,
  HandOffBodyDto,
  ListTasksQueryDto,
  TaskIdParamDto,
  TaskPageResponseDto,
  TaskResponseDto,
} from '../provisioning.dto';
import {
  PROVISIONING_ERROR_EXAMPLES,
  PROVISIONING_GRANT_EXAMPLES,
  toProvisioningApiException,
} from '../provisioning.http-errors';
import { ProvisioningDecisionService } from './provisioning-decision.service';
import { ProvisioningGrantService } from './provisioning-grant.service';
import { ProvisioningService } from './provisioning.service';
import { toSummaryWire, toWire } from '../provisioning-task.mapper';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const IT_ONLY = {
  status: HttpStatus.FORBIDDEN,
  description: 'Only an IT Admin works the queue of provisioning tasks.',
  examples: [FORBIDDEN_EXAMPLE],
} as const;
/** The task routes: the role guard, and the IT Admin who is the beneficiary of the task while another can work it. */
const TASK_WORKER_FORBIDDEN = {
  status: HttpStatus.FORBIDDEN,
  description: 'Not an IT Admin, or PROVISIONING.ANOTHER_IT_ADMIN_NEEDED.',
  examples: [FORBIDDEN_EXAMPLE, PROVISIONING_ERROR_EXAMPLES.ANOTHER_IT_ADMIN_NEEDED],
} as const;
const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The task does not exist (PROVISIONING_TASK.NOT_FOUND).',
  examples: [PROVISIONING_ERROR_EXAMPLES.TASK_NOT_FOUND],
} as const;

/**
 * The queue of the work that makes a seat real (`US-07-01`, `US-07-02`): the grant of a request, and the task a person
 * takes, completes with evidence, or reports as not done. Nothing here completes, fails or deletes a task by itself or by
 * time, and nothing takes or stores a password or a key: the account of the IT Admin who works is their own.
 */
@ApiTags('provisioning-tasks')
@Controller({ path: 'provisioning-tasks', version: '1' })
export class ProvisioningTasksController {
  constructor(
    private readonly provisioning: ProvisioningService,
    private readonly grants: ProvisioningGrantService,
    private readonly decisions: ProvisioningDecisionService,
  ) {}

  @Post()
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'provisioningTaskGrant', summary: 'Grant a seat to the beneficiary of a request' })
  @ApiSuccessResponse(GrantResponseDto, {
    status: HttpStatus.CREATED,
    message: 'PROVISIONING_TASK.CREATED',
    description:
      'The seat is taken from today by an assignment of source REQUEST, and a manual task is queued for the IT Admin in charge of the beneficiary department (none: the general queue, with a warning). K5 takes no subscription and no seat. For the request of a service account the IT Admin enters the account identifier (not read from the request) and may name another active person of the owning department to answer for it (responsibleEmployeeId); the assignment is a service one, owned by that department and charged to its Unit Cost Center, with the purpose as its reason.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description:
        'Only an IT Admin works the queue of provisioning tasks, and an IT Admin who answers for the service account themselves waits for another usable IT Admin to grant it (PROVISIONING.ANOTHER_IT_ADMIN_NEEDED); with none left they may.',
      examples: [FORBIDDEN_EXAMPLE, PROVISIONING_ERROR_EXAMPLES.ANOTHER_IT_ADMIN_NEEDED],
    },
    {
      status: HttpStatus.NOT_FOUND,
      description:
        'The request, the subscription, the plan or the beneficiary does not exist (REQUEST.NOT_FOUND, SUBSCRIPTION.NOT_FOUND, PLAN.NOT_FOUND, EMPLOYEE.NOT_FOUND).',
      // The plan and the beneficiary of a request always exist (plans and people are never deleted): not shown.
      examples: PROVISIONING_GRANT_EXAMPLES.NOT_FOUND,
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'PROVISIONING.REQUEST_NOT_APPROVED, REQUEST_ENDED, REQUEST_NOT_IN_CATALOG (the software is not registered in the catalog yet), REQUEST_BOUNDARY_NOT_CHECKED (a service account whose boundary the IT Admin has not accepted), RESPONSIBLE_NOT_IN_DEPARTMENT (the person who answers for a service account left its department or the company: name another), TYPE_NOT_SUPPORTED (K3, K4), BENEFICIARY_DEPARTED (details.nextStep CANCEL_REQUEST), BENEFICIARY_NOT_STARTED (details.startsOn: the person joins later), PURCHASE_NOT_ALLOWED (a `purchase` was sent while the pool of the plan still has a free seat: details.freeSeats and details.subscriptionIds), SEAT_TARGET.APPLICATION_RETIRED, or LICENSE_ASSIGNMENT.SEAT_CAPACITY.',
      examples: PROVISIONING_GRANT_EXAMPLES.CONFLICT,
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The request is invalid (VALIDATION_ERROR) or refused: PROVISIONING.PERSONAL_ACCOUNT, ACCOUNT_IDENTIFIER_REQUIRED (a service account without the identifier the IT Admin enters), RESPONSIBLE_INVALID (the person named is not active in the owning department, or the request is not for a service account), REQUEST_PARTY.INELIGIBLE (the person named is the spending approver, who answers for no account of a request), SUBSCRIPTION_REQUIRED, SUBSCRIPTION_NOT_ALLOWED, SUBSCRIPTION_PLAN_MISMATCH, SUBSCRIPTION_QUANTITY_UNKNOWN, PURCHASE_NOT_APPLICABLE (a `purchase` for a plan that is not K2 or K4), PURCHASE_REASON_REQUIRED (the pool is empty but a seat is still being taken back: say why buying cannot wait), SEAT_TARGET.SUBSCRIPTION_DRAFT (details.missing lists what the subscription lacks), LICENSE_ASSIGNMENT.OVERLAP or IDENTIFIER_IN_USE. The IT Admin gives no end day: a body with `expectedEndDate` is a VALIDATION_ERROR, and the seat ends on the day of the request or, when it names none, when its term ends.',
      examples: [VALIDATION_EXAMPLE, ...PROVISIONING_GRANT_EXAMPLES.UNPROCESSABLE],
    },
  )
  async grant(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: GrantBodyDto) {
    try {
      const { task, warnings } = await this.grants.grant(actor, body);

      return { task: toWire(task), warnings };
    } catch (error) {
      throw toProvisioningApiException(error);
    }
  }

  @Get()
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'provisioningTaskList', summary: 'List the provisioning queue' })
  @ApiSuccessResponse(TaskPageResponseDto, {
    message: 'PROVISIONING_TASK.LISTED',
    description:
      'The tasks of both channels in one queue, the oldest first, each with the time it has taken. scope MINE is the IT Admin in charge by default, GENERAL the tasks nobody in charge works, ALL every task.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, IT_ONLY, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The query is invalid (VALIDATION_ERROR).',
    examples: [VALIDATION_EXAMPLE],
  })
  async list(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Query() query: ListTasksQueryDto) {
    try {
      const page = await this.provisioning.list(actor, query);

      return { items: page.items.map(toSummaryWire), pagination: page.pagination };
    } catch (error) {
      throw toProvisioningApiException(error);
    }
  }

  @Get(':id')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'provisioningTaskGet', summary: 'Get the card of a provisioning task' })
  @ApiSuccessResponse(TaskResponseDto, {
    message: 'PROVISIONING_TASK.FETCHED',
    description: 'The task with the steps of its kind of provisioning and what ends it.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, IT_ONLY, NOT_FOUND, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The id is invalid (VALIDATION_ERROR).',
    examples: [VALIDATION_EXAMPLE],
  })
  async get(@Param() params: TaskIdParamDto) {
    try {
      return { task: toWire(await this.provisioning.get(params.id)) };
    } catch (error) {
      throw toProvisioningApiException(error);
    }
  }

  @Post(':id/claim')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'provisioningTaskClaim', summary: 'Take a provisioning task to work on it' })
  @ApiSuccessResponse(TaskResponseDto, {
    message: 'PROVISIONING_TASK.CLAIMED',
    description:
      'The task is in progress under the name of this IT Admin; an IT Admin other than the one in charge may take it, and another may take it over. Taking it again is a no-op. A revocation is taken whoever its beneficiary is, a person who left included.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    TASK_WORKER_FORBIDDEN,
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'PROVISIONING_TASK.NOT_MANUAL, NOT_CLAIMABLE (done or failed) or PROVISIONING.BENEFICIARY_DEPARTED (close the request as cancelled).',
      examples: [PROVISIONING_ERROR_EXAMPLES.NOT_CLAIMABLE, PROVISIONING_ERROR_EXAMPLES.BENEFICIARY_DEPARTED],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The id is invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async claim(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: TaskIdParamDto) {
    try {
      return { task: toWire(await this.provisioning.claim(actor, params.id)) };
    } catch (error) {
      throw toProvisioningApiException(error);
    }
  }

  @Post(':id/complete')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'provisioningTaskComplete', summary: 'Complete a provisioning task with evidence' })
  @ApiSuccessResponse(TaskResponseDto, {
    message: 'PROVISIONING_TASK.COMPLETED',
    description:
      'The task is completed under the name of this IT Admin, whoever is in charge by default. The evidence is a note of what was done, never a password or a key.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    TASK_WORKER_FORBIDDEN,
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'PROVISIONING_TASK.NOT_MANUAL or NOT_IN_PROGRESS, or IS_REVOCATION (a revocation is completed by its own route).',
      examples: [PROVISIONING_ERROR_EXAMPLES.NOT_IN_PROGRESS, PROVISIONING_ERROR_EXAMPLES.IS_REVOCATION],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The request is invalid (VALIDATION_ERROR) or has no evidence (PROVISIONING_TASK.EVIDENCE_REQUIRED): the task is unchanged.',
      examples: [VALIDATION_EXAMPLE, PROVISIONING_ERROR_EXAMPLES.EVIDENCE_REQUIRED],
    },
  )
  async complete(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: TaskIdParamDto,
    @Body() body: CompleteBodyDto,
  ) {
    try {
      return { task: toWire(await this.provisioning.complete(actor, params.id, body)) };
    } catch (error) {
      throw toProvisioningApiException(error);
    }
  }

  @Post(':id/report-failure')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'provisioningTaskReportFailure', summary: 'Record that a task could not be done' })
  @ApiSuccessResponse(TaskResponseDto, {
    message: 'PROVISIONING_TASK.FAILED',
    description:
      'The task fails with the reason and is not completed; the seat stays taken. What happens next is decided by the failure handling.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    TASK_WORKER_FORBIDDEN,
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description: 'PROVISIONING_TASK.NOT_MANUAL or NOT_IN_PROGRESS.',
      examples: [PROVISIONING_ERROR_EXAMPLES.NOT_IN_PROGRESS],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The request is invalid (VALIDATION_ERROR) or has no reason (PROVISIONING_TASK.REASON_REQUIRED): the task is unchanged.',
      examples: [VALIDATION_EXAMPLE, PROVISIONING_ERROR_EXAMPLES.REASON_REQUIRED],
    },
  )
  async reportFailure(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: TaskIdParamDto,
    @Body() body: FailureBodyDto,
  ) {
    try {
      return { task: toWire(await this.provisioning.reportFailure(actor, params.id, body)) };
    } catch (error) {
      throw toProvisioningApiException(error);
    }
  }

  @Post(':id/retry')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'provisioningTaskRetry', summary: 'Try a failed task again on its channel' })
  @ApiSuccessResponse(TaskResponseDto, {
    message: 'PROVISIONING_TASK.RETRY_REQUESTED',
    description:
      'The failed task is queued again on the same channel with its failure cleared and its tries counted from zero; the seat stays taken. The choice is recorded.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    TASK_WORKER_FORBIDDEN,
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description: 'The task is not failed (PROVISIONING_TASK.NOT_FAILED).',
      examples: [PROVISIONING_ERROR_EXAMPLES.NOT_FAILED, PROVISIONING_ERROR_EXAMPLES.WITHDRAWAL_PENDING],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The id is invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async retry(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: TaskIdParamDto) {
    try {
      return { task: toWire(await this.decisions.retry(actor, params.id)) };
    } catch (error) {
      throw toProvisioningApiException(error);
    }
  }

  @Post(':id/hand-off')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'provisioningTaskHandOff', summary: 'Hand a failed connector task to a person' })
  @ApiSuccessResponse(TaskResponseDto, {
    message: 'PROVISIONING_TASK.HANDED_OFF',
    description:
      'The failed connector task is queued again as a task by hand, with who handed it over and when; the body is empty ({}) and the last error, the failure kind and reason and the tries made stay on the task until a person takes it. No evidence is given here: it is asked when the work by hand is completed. Nothing hands a task over by itself.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    TASK_WORKER_FORBIDDEN,
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description: 'The task is not failed (NOT_FAILED) or is by hand already (PROVISIONING_TASK.ALREADY_MANUAL).',
      examples: [PROVISIONING_ERROR_EXAMPLES.NOT_FAILED, PROVISIONING_ERROR_EXAMPLES.ALREADY_MANUAL],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The request is invalid (VALIDATION_ERROR): the body is not an empty object, or the id is not a UUID.',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async handOff(
    // Validated only: the body is a strict empty object, so a client that still sends `evidence` is refused.
    @Body() _body: HandOffBodyDto,
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: TaskIdParamDto,
  ) {
    try {
      return { task: toWire(await this.decisions.handOff(actor, params.id)) };
    } catch (error) {
      throw toProvisioningApiException(error);
    }
  }

  @Post(':id/close-failed')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'provisioningTaskCloseFailed', summary: 'Close a failed task as failed, with a reason' })
  @ApiSuccessResponse(TaskResponseDto, {
    message: 'PROVISIONING_TASK.CLOSED_FAILED',
    description:
      'The only end of a failed task. A grant leaves a failed assignment and the seat is free again; a revocation leaves its assignment as it was. The request, its commitment and the notice to the requester belong to other modules, which read the audit event.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    TASK_WORKER_FORBIDDEN,
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description: 'The task is not failed (PROVISIONING_TASK.NOT_FAILED), or its assignment is no longer open.',
      examples: [PROVISIONING_ERROR_EXAMPLES.NOT_FAILED, PROVISIONING_ERROR_EXAMPLES.WITHDRAWAL_PENDING],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The request is invalid (VALIDATION_ERROR) or has no reason (PROVISIONING_TASK.REASON_REQUIRED): nothing changes.',
      examples: [VALIDATION_EXAMPLE, PROVISIONING_ERROR_EXAMPLES.REASON_REQUIRED],
    },
  )
  async closeFailed(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: TaskIdParamDto,
    @Body() body: CloseFailedBodyDto,
  ) {
    try {
      return { task: toWire(await this.decisions.closeFailed(actor, params.id, body)) };
    } catch (error) {
      throw toProvisioningApiException(error);
    }
  }

  @Post(':id/cancel')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({
    operationId: 'provisioningTaskCancel',
    summary: 'Close the failed task of a withdrawn request as cancelled',
  })
  @ApiSuccessResponse(TaskResponseDto, {
    message: 'PROVISIONING_TASK.CANCELLED',
    description:
      'The only decision left on the failed task of a request its requester withdrew: the task ends as cancelled and never as failed, its assignment becomes a cancelled one so the seat is free again, the request ends as withdrawn and what was held for it goes back to the budget.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    TASK_WORKER_FORBIDDEN,
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'The task is not failed (PROVISIONING_TASK.NOT_FAILED), or its request was not withdrawn (PROVISIONING_TASK.NO_WITHDRAWAL): nothing changes.',
      examples: [PROVISIONING_ERROR_EXAMPLES.NOT_FAILED, PROVISIONING_ERROR_EXAMPLES.NO_WITHDRAWAL],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The id is invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async cancel(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: TaskIdParamDto) {
    try {
      return { task: toWire(await this.decisions.cancel(actor, params.id)) };
    } catch (error) {
      throw toProvisioningApiException(error);
    }
  }
}
