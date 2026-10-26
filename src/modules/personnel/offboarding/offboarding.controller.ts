import { Body, Controller, Get, HttpStatus, Param, Post, Query } from '@nestjs/common';
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
import {
  CancelOffboardingBodyDto,
  ChangeLastDayBodyDto,
  ListOffboardingQueryDto,
  MarkLeftBodyDto,
  OffboardingChangePageResponseDto,
  OffboardingDetailResponseDto,
  OffboardingIdParamDto,
  OffboardingPageQueryDto,
  OffboardingPageResponseDto,
  OffboardingRevocationsOpenedResponseDto,
  OffboardingRightPageResponseDto,
  OpenRevocationsBodyDto,
  RecordAccountLockBodyDto,
  RecordOffboardingBodyDto,
} from './offboarding.dto';
import { OFFBOARDING_ERROR_EXAMPLES, toOffboardingApiException } from './offboarding.http-errors';
import { OffboardingChangeService } from './offboarding-change.service';
import { OffboardingLeftService } from './offboarding-left.service';
import { OffboardingRevocationService } from './offboarding-revocation.service';
import { OffboardingViewService } from './offboarding-view.service';
import { OffboardingService } from './offboarding.service';

const E = OFFBOARDING_ERROR_EXAMPLES;
const FORBIDDEN = {
  status: HttpStatus.FORBIDDEN,
  description: 'Only an IT Admin records, changes, closes or reads the departure of a person.',
  examples: [FORBIDDEN_EXAMPLE],
} as const;
const COMMON = [UNAUTHENTICATED_RESPONSE, FORBIDDEN, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The offboarding case does not exist (OFFBOARDING_CASE.NOT_FOUND).',
  examples: [E.NOT_FOUND],
} as const;
const ID_INVALID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: 'The id is not valid (VALIDATION_ERROR).',
  examples: [VALIDATION_EXAMPLE],
} as const;
const PAGE_INVALID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: 'The id or a page parameter is not valid (VALIDATION_ERROR).',
  examples: [VALIDATION_EXAMPLE],
} as const;
const SELF = 'an IT Admin does it for themselves while another IT Admin can (SELF_EVENT_NEEDS_ANOTHER_IT_ADMIN)';
const CONCURRENT = 'the person or the case was changed meanwhile (CONCURRENT_CHANGE)';
const NOT_UNDER_WAY = [E.CASE_LEFT, E.NOT_HANDING_OVER] as const;
const SELF_OR_CONCURRENT = [E.SELF_EVENT_NEEDS_ANOTHER_IT_ADMIN, E.CONCURRENT_CHANGE] as const;
const PERSON_REFUSALS = [E.EMPLOYEE_LEFT, E.ALREADY_HANDING_OVER, E.PENDING_EVENT_EXISTS] as const;
const DAY_REFUSALS = [E.LAST_WORKING_DAY_INVALID, E.SUCCESSOR_NOT_A_MEMBER_ON_DATE] as const;
const LOCK_REFUSALS = [E.ACCOUNT_LOCK_NOT_RECORDED, E.ALREADY_RECORDED] as const;

const GROUNDS_REFUSALS =
  'the basis is empty or lacks a part (OFFBOARDING_CASE.GROUNDS_REQUIRED, GROUNDS_INCOMPLETE) or is the code of a notice and not a document (GROUNDS_IS_NOTICE)';
const GROUNDS_EXAMPLES = [E.GROUNDS_REQUIRED, E.GROUNDS_INCOMPLETE, E.GROUNDS_IS_NOTICE] as const;

/**
 * The departure of a person: a handover with the last working day and the basis it rests on, or an abrupt departure, the list of the
 * rights the person holds, the lock of the company account, the revocations the IT Admin asks for and the closing of the case. IT Admin
 * only: Finance, a department head and an employee are refused, and the Super Admin does no business work. Nothing is revoked by itself.
 */
@ApiTags('offboarding-cases')
@Controller({ path: 'offboarding-cases', version: '1' })
@RequireRoles('IT_ADMIN')
export class OffboardingController {
  constructor(
    private readonly offboarding: OffboardingService,
    private readonly changes: OffboardingChangeService,
    private readonly left: OffboardingLeftService,
    private readonly revocations: OffboardingRevocationService,
    private readonly view: OffboardingViewService,
  ) {}

  @Post()
  @ApiOperation({ operationId: 'offboardingCaseRecord', summary: 'Record a person who leaves' })
  @ApiSuccessResponse(OffboardingDetailResponseDto, {
    status: HttpStatus.CREATED,
    message: 'OFFBOARDING_CASE.RECORDED',
    description:
      'The handover was recorded with the last working day and the basis, or the departure was recorded as having happened (an abrupt one is left at once). The placement of the person ends the day after the last working day, the head of the department they leave is handed over or left empty as chosen (a warning says from when), a long leave ends, a transfer that would take effect later is cancelled with the reason given, and the head of the department is asked to confirm the handover of every tool. No seat is taken away and no task is made.',
  })
  @ApiErrorResponses(
    ...COMMON,
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The employee does not exist (OFFBOARDING_CASE.EMPLOYEE_NOT_FOUND).',
      examples: [E.EMPLOYEE_NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description: `The person has left (OFFBOARDING_CASE.EMPLOYEE_LEFT) or is handing over already (ALREADY_HANDING_OVER), has a transfer that takes effect before the last working day or another event waiting (PENDING_EVENT_EXISTS), ${SELF}, or ${CONCURRENT}.`,
      examples: [...PERSON_REFUSALS, ...SELF_OR_CONCURRENT, E.PLACEMENT_OVERLAP],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: `The body is invalid (VALIDATION_ERROR), there is no last working day or it is not allowed (OFFBOARDING_CASE.LAST_WORKING_DAY_REQUIRED, LAST_WORKING_DAY_INVALID), ${GROUNDS_REFUSALS}, the reason to cancel the transfer that waits is missing (TRANSFER_CANCELLATION_REASON_REQUIRED), or the person chosen to follow the head cannot take the department that day (SUCCESSOR_NOT_A_MEMBER_ON_DATE): nothing is saved.`,
      examples: [
        VALIDATION_EXAMPLE,
        E.LAST_WORKING_DAY_REQUIRED,
        ...DAY_REFUSALS,
        ...GROUNDS_EXAMPLES,
        E.TRANSFER_CANCELLATION_REASON_REQUIRED,
      ],
    },
  )
  async record(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: RecordOffboardingBodyDto) {
    try {
      return await this.view.detailOf(await this.offboarding.record(actor, body));
    } catch (error) {
      throw toOffboardingApiException(error);
    }
  }

  @Get()
  @ApiOperation({ operationId: 'offboardingCaseList', summary: 'List the departures' })
  @ApiSuccessResponse(OffboardingPageResponseDto, {
    message: 'OFFBOARDING_CASE.LISTED',
    description:
      'A page of departures, by last working day, optionally of one person, one state, those handing over whose last working day has passed, or those whose company account is not recorded as locked, or those whose person held one of the roles that need someone to take over when the departure was recorded (the Super Admin, Finance, an approval role, the IT Admin in charge of a department, the head of a department, the owner or administrator of a workspace). Each row says who, where the case stands, the days, how many rights the person still holds and which of those roles they hold now.',
  })
  @ApiErrorResponses(...COMMON, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'A filter is invalid (VALIDATION_ERROR).',
    examples: [VALIDATION_EXAMPLE],
  })
  async list(@Query() query: ListOffboardingQueryDto) {
    try {
      return await this.view.list(query);
    } catch (error) {
      throw toOffboardingApiException(error);
    }
  }

  @Get(':id')
  @ApiOperation({ operationId: 'offboardingCaseGet', summary: 'Read a departure in full' })
  @ApiSuccessResponse(OffboardingDetailResponseDto, {
    message: 'OFFBOARDING_CASE.RETRIEVED',
    description:
      'The case with its basis, who follows the head of the department, the four steps of the checklist in the order they are done, what keeps the case from closing and what needs a person.',
  })
  @ApiErrorResponses(...COMMON, NOT_FOUND, ID_INVALID)
  async get(@Param() params: OffboardingIdParamDto) {
    try {
      return await this.view.get(params.id);
    } catch (error) {
      throw toOffboardingApiException(error);
    }
  }

  @Get(':id/rights')
  @ApiOperation({ operationId: 'offboardingCaseRightList', summary: 'List the rights the person still holds' })
  @ApiSuccessResponse(OffboardingRightPageResponseDto, {
    message: 'OFFBOARDING_CASE.RIGHTS_LISTED',
    description:
      'A page of the personal seats the person holds, oldest first: the tool and plan, the way it is taken away and what to do first, whether it loses data, the confirmation of the handover of the tool and the task that takes it away. Service accounts are not among them.',
  })
  @ApiErrorResponses(...COMMON, NOT_FOUND, PAGE_INVALID)
  async rights(@Param() params: OffboardingIdParamDto, @Query() query: OffboardingPageQueryDto) {
    try {
      return await this.view.rights(params.id, query);
    } catch (error) {
      throw toOffboardingApiException(error);
    }
  }

  @Get(':id/changes')
  @ApiOperation({ operationId: 'offboardingCaseChangeList', summary: 'List what was done to a departure' })
  @ApiSuccessResponse(OffboardingChangePageResponseDto, {
    message: 'OFFBOARDING_CASE.CHANGES_LISTED',
    description:
      'A page of what was done to the case, oldest first: the record, each move of the last working day with its reason, the cancellation, the departure, the lock of the account, the revocations opened and the closing.',
  })
  @ApiErrorResponses(...COMMON, NOT_FOUND, PAGE_INVALID)
  async listChanges(@Param() params: OffboardingIdParamDto, @Query() query: OffboardingPageQueryDto) {
    try {
      return await this.view.changes(params.id, query);
    } catch (error) {
      throw toOffboardingApiException(error);
    }
  }

  @Post(':id/last-day-changes')
  @ApiOperation({ operationId: 'offboardingCaseChangeLastDay', summary: 'Move the last working day of a handover' })
  @ApiSuccessResponse(OffboardingDetailResponseDto, {
    message: 'OFFBOARDING_CASE.LAST_DAY_CHANGED',
    description:
      'The last working day moved: the placement of the person and the handover of the head move with it, the day the confirmation is due is counted again, and a reason is kept. Only a handover under way before its last working day can move.',
  })
  @ApiErrorResponses(
    ...COMMON,
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description: `The person has left (OFFBOARDING_CASE.CASE_LEFT), the handover is not under way (NOT_HANDING_OVER), the last working day has passed (LAST_DAY_ALREADY_PASSED), ${SELF}, or ${CONCURRENT}.`,
      examples: [...NOT_UNDER_WAY, E.LAST_DAY_ALREADY_PASSED, ...SELF_OR_CONCURRENT],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The body is invalid (VALIDATION_ERROR), no reason is given (OFFBOARDING_CASE.REASON_REQUIRED), the day is the same or not allowed (NO_CHANGE, LAST_WORKING_DAY_INVALID), or the head of the department cannot be handed over on the new day (SUCCESSOR_NOT_A_MEMBER_ON_DATE): nothing is saved, and the old day and the old choice stay.',
      examples: [VALIDATION_EXAMPLE, E.REASON_REQUIRED, E.NO_CHANGE, ...DAY_REFUSALS],
    },
  )
  async changeLastDay(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: OffboardingIdParamDto,
    @Body() body: ChangeLastDayBodyDto,
  ) {
    try {
      const record = await this.changes.changeLastDay(actor, params.id, { ...body, reason: body.reason ?? '' });

      return await this.view.detailOf(record);
    } catch (error) {
      throw toOffboardingApiException(error);
    }
  }

  @Post(':id/cancellation')
  @ApiOperation({ operationId: 'offboardingCaseCancel', summary: 'Cancel a handover' })
  @ApiSuccessResponse(OffboardingDetailResponseDto, {
    message: 'OFFBOARDING_CASE.CANCELLED',
    description:
      'The handover was cancelled: the person keeps the department and, if they headed it, the head, the confirmations that waited are cancelled, and they are back to what they were doing (a long leave still ahead included). No task is made or taken away.',
  })
  @ApiErrorResponses(
    ...COMMON,
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description: `The person has left (OFFBOARDING_CASE.CASE_LEFT), the handover is not under way (NOT_HANDING_OVER), ${SELF}, or ${CONCURRENT}.`,
      examples: [...NOT_UNDER_WAY, ...SELF_OR_CONCURRENT],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The body is invalid (VALIDATION_ERROR) or no reason is given (OFFBOARDING_CASE.REASON_REQUIRED).',
      examples: [VALIDATION_EXAMPLE, E.REASON_REQUIRED],
    },
  )
  async cancel(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: OffboardingIdParamDto,
    @Body() body: CancelOffboardingBodyDto,
  ) {
    try {
      const record = await this.changes.cancel(actor, params.id, { reason: body.reason ?? '' });

      return await this.view.detailOf(record);
    } catch (error) {
      throw toOffboardingApiException(error);
    }
  }

  @Post(':id/departure')
  @ApiOperation({ operationId: 'offboardingCaseMarkLeft', summary: 'Record that the person has left' })
  @ApiSuccessResponse(OffboardingDetailResponseDto, {
    message: 'OFFBOARDING_CASE.LEFT',
    description:
      'The person has left, at any time and also after the last working day (a day past it takes nothing away by itself). From the next action the sign-in and every call of the person are refused although the account is not locked; the Super Admin is reminded to lock it. The rights are listed, never revoked here.',
  })
  @ApiErrorResponses(
    ...COMMON,
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description: `The person has left already (OFFBOARDING_CASE.CASE_LEFT), the handover is not under way (NOT_HANDING_OVER), or ${CONCURRENT}.`,
      examples: NOT_UNDER_WAY,
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The body is invalid (VALIDATION_ERROR) or the day the person left is ahead or before the handover was recorded (OFFBOARDING_CASE.DEPARTED_ON_INVALID).',
      examples: [VALIDATION_EXAMPLE, E.DEPARTED_ON_INVALID],
    },
  )
  async markLeft(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: OffboardingIdParamDto,
    @Body() body: MarkLeftBodyDto,
  ) {
    try {
      return await this.view.detailOf(await this.left.markLeft(actor, params.id, body));
    } catch (error) {
      throw toOffboardingApiException(error);
    }
  }

  @Post(':id/account-lock')
  @ApiOperation({ operationId: 'offboardingCaseRecordAccountLock', summary: 'Record the lock of the company account' })
  @ApiSuccessResponse(OffboardingDetailResponseDto, {
    message: 'OFFBOARDING_CASE.ACCOUNT_LOCK_RECORDED',
    description:
      'Who locked the company account, the sessions and the device credentials of the person, outside the system, when, and what was done, written once. The revocations of the rights need it first or with them.',
  })
  @ApiErrorResponses(
    ...COMMON,
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'The person has not left yet (OFFBOARDING_CASE.CASE_NOT_LEFT) or the lock was recorded already (ALREADY_RECORDED).',
      examples: [E.CASE_NOT_LEFT, E.ALREADY_RECORDED],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The body is invalid or the note is empty (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async recordAccountLock(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: OffboardingIdParamDto,
    @Body() body: RecordAccountLockBodyDto,
  ) {
    try {
      return await this.view.detailOf(await this.left.recordAccountLock(actor, params.id, body));
    } catch (error) {
      throw toOffboardingApiException(error);
    }
  }

  @Post(':id/revocations')
  @ApiOperation({ operationId: 'offboardingCaseOpenRevocations', summary: 'Take the rights of the person away' })
  @ApiSuccessResponse(OffboardingRevocationsOpenedResponseDto, {
    message: 'OFFBOARDING_CASE.REVOCATIONS_OPENED',
    description:
      'A task of the queue was made for each right chosen (all that have none when none is named), after the lock of the company account is recorded or together with it, with one reason for all and the count the IT Admin typed. The seats stay whole until each task is done; nothing is transferred to anyone. A seat that has a task already gets the reason added.',
  })
  @ApiErrorResponses(
    ...COMMON,
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description: `The person has not left yet (OFFBOARDING_CASE.CASE_NOT_LEFT) or the case is closed (CASE_CLOSED), the lock of the company account is not recorded (ACCOUNT_LOCK_NOT_RECORDED) or was recorded already (ALREADY_RECORDED), a seat named has no revocation (REVOCATION_NOT_SUPPORTED), ${SELF}, or ${CONCURRENT}.`,
      examples: [E.CASE_NOT_LEFT, E.CASE_CLOSED, ...LOCK_REFUSALS, E.REVOCATION_NOT_SUPPORTED],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The body is invalid (VALIDATION_ERROR), no reason is given (OFFBOARDING_CASE.REASON_REQUIRED), the number does not match the rights chosen, which the answer states (COUNT_MISMATCH), or a seat named is not held or has a task (ASSIGNMENT_NOT_AVAILABLE): nothing is made.',
      examples: [VALIDATION_EXAMPLE, E.REASON_REQUIRED, E.COUNT_MISMATCH, E.ASSIGNMENT_NOT_AVAILABLE],
    },
  )
  async openRevocations(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: OffboardingIdParamDto,
    @Body() body: OpenRevocationsBodyDto,
  ) {
    try {
      const opened = await this.revocations.openRevocations(actor, params.id, { ...body, reason: body.reason ?? '' });
      const detail = await this.view.detailOf(opened.record);

      return { ...detail, revocations: { created: opened.created, reasonAdded: opened.reasonAdded } };
    } catch (error) {
      throw toOffboardingApiException(error);
    }
  }

  @Post(':id/closure')
  @ApiOperation({ operationId: 'offboardingCaseClose', summary: 'Close a departure' })
  @ApiSuccessResponse(OffboardingDetailResponseDto, {
    message: 'OFFBOARDING_CASE.CLOSED',
    description:
      'The case is closed: the company account is recorded as locked and the person holds no personal right any more, and nothing registered by the flows that come after keeps it open.',
  })
  @ApiErrorResponses(
    ...COMMON,
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'The person has not left yet (OFFBOARDING_CASE.CASE_NOT_LEFT), or something keeps the case open (CASE_NOT_CLOSEABLE, with the codes in the details): the lock of the account is not recorded, a personal right is held (also one whose access runs on to the end of the paid period), or a later flow still waits.',
      examples: [E.CASE_NOT_LEFT, E.CASE_NOT_CLOSEABLE],
    },
    ID_INVALID,
  )
  async close(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: OffboardingIdParamDto) {
    try {
      return await this.view.detailOf(await this.revocations.close(actor, params.id));
    } catch (error) {
      throw toOffboardingApiException(error);
    }
  }
}
