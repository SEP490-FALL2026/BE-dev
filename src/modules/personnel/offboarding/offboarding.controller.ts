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
import { PERSONNEL_ACCESS_ERROR_EXAMPLES } from '../personnel-access.http-errors';
import { userActor } from '../public/personnel.types';
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
  OffboardingRightPageResponseDto,
  RecordOffboardingBodyDto,
} from './offboarding.dto';
import { OFFBOARDING_ERROR_EXAMPLES, toOffboardingApiException } from './offboarding.http-errors';
import { OffboardingChangeService } from './change/offboarding-change.service';
import { OffboardingLeftService } from './offboarding-left.service';
import { OffboardingDetailService } from './detail/offboarding-detail.service';
import { OffboardingViewService } from './offboarding-view.service';
import { OffboardingService } from './offboarding.service';

const E = OFFBOARDING_ERROR_EXAMPLES;
const FORBIDDEN = {
  status: HttpStatus.FORBIDDEN,
  description:
    'Only the Super Admin records, changes, cancels or marks the departure of a person, and reads it in full; the IT Admin reads the technical case and takes the steps that follow (AUTHORIZATION.FORBIDDEN).',
  examples: [FORBIDDEN_EXAMPLE],
} as const;
/** A write by the Super Admin is also refused about themselves: the controlled procedure records that event. */
const FORBIDDEN_WRITE = {
  ...FORBIDDEN,
  description: `${FORBIDDEN.description} The Super Admin does not record or change a departure about themselves in the application (PERSONNEL.SELF_CHANGE_FORBIDDEN): the controlled procedure does.`,
  examples: [FORBIDDEN_EXAMPLE, PERSONNEL_ACCESS_ERROR_EXAMPLES.SELF_CHANGE_FORBIDDEN],
} as const;
const COMMON = [UNAUTHENTICATED_RESPONSE, FORBIDDEN, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const WRITE_COMMON = [UNAUTHENTICATED_RESPONSE, FORBIDDEN_WRITE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description:
    'The offboarding case does not exist, or an IT Admin reads one of a department they are not in charge of (OFFBOARDING_CASE.NOT_FOUND).',
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
const CONCURRENT = 'the person or the case was changed meanwhile (CONCURRENT_CHANGE)';
const NOT_UNDER_WAY = [E.CASE_LEFT, E.NOT_HANDING_OVER] as const;
const CONCURRENT_EXAMPLES = [E.CONCURRENT_CHANGE] as const;
const PERSON_REFUSALS = [E.EMPLOYEE_LEFT, E.ALREADY_HANDING_OVER, E.PENDING_EVENT_EXISTS] as const;
const DAY_REFUSALS = [E.LAST_WORKING_DAY_INVALID, E.SUCCESSOR_NOT_A_MEMBER_ON_DATE] as const;

const GROUNDS_REFUSALS =
  'the basis (groundsNote) is only the code of a notice and not a document (OFFBOARDING_CASE.GROUNDS_IS_NOTICE); a basis that is missing, blank or over 500 characters is a VALIDATION_ERROR';
const GROUNDS_EXAMPLES = [E.GROUNDS_IS_NOTICE] as const;

/**
 * The departure of a person: a handover with the last working day and the basis it rests on, blocked from the last working day or from the day it is recorded (the Super Admin
 * records, moves, cancels and marks it, `QĐ-87a`), the list of the rights the person holds, the lock of the company account, the
 * revocations the IT Admin asks for and the closing of the case (the IT Admin's technical steps). Finance, a department head and an
 * employee are refused. The role is judged again by the service, so this guard is only the outer layer. Nothing is revoked by itself.
 */
@ApiTags('offboarding-cases')
@Controller({ path: 'offboarding-cases', version: '1' })
export class OffboardingController {
  constructor(
    private readonly offboarding: OffboardingService,
    private readonly changes: OffboardingChangeService,
    private readonly left: OffboardingLeftService,
    private readonly view: OffboardingViewService,
    private readonly detail: OffboardingDetailService,
  ) {}

  @Post()
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'offboardingCaseRecord', summary: 'Record a person who leaves' })
  @ApiSuccessResponse(OffboardingDetailResponseDto, {
    status: HttpStatus.CREATED,
    message: 'OFFBOARDING_CASE.RECORDED',
    description:
      'The handover was recorded with the last working day and the basis, or, blocked now, the departure was recorded with the access of the person refused from the next request (a last working day that is today or past leaves the person at once). The placement of the person ends the day after the last working day, the head of the department they leave is handed over or left empty as chosen (a warning says from when), a long leave ends, a transfer that would take effect later is cancelled with the reason given. No seat is taken away and no task is made. A person with no placement in force (department null) is recorded the same way with no placement to end and no head handover; a first placement not yet in force that starts after the last working day is cancelled with the record, and put back if the case is cancelled.',
  })
  @ApiErrorResponses(
    ...WRITE_COMMON,
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The employee does not exist (OFFBOARDING_CASE.EMPLOYEE_NOT_FOUND).',
      examples: [E.EMPLOYEE_NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description: `The person has left (OFFBOARDING_CASE.EMPLOYEE_LEFT) or is handing over already (ALREADY_HANDING_OVER), has a transfer that takes effect before the last working day or another event waiting (PENDING_EVENT_EXISTS), has placements but none in force or scheduled (PLACEMENT_OVERLAP, details.reason NO_OPEN_PLACEMENT; a person never placed is recorded on the shortened flow), has a first placement that takes effect on or before the last working day (PLACEMENT_OVERLAP, details.reason FIRST_PLACEMENT_PENDING with validFrom: pick an earlier day or record from that day), or ${CONCURRENT}.`,
      examples: [...PERSON_REFUSALS, ...CONCURRENT_EXAMPLES, E.PLACEMENT_OVERLAP],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: `The body is invalid (VALIDATION_ERROR), there is no last working day or it is not allowed (OFFBOARDING_CASE.LAST_WORKING_DAY_REQUIRED, LAST_WORKING_DAY_INVALID), ${GROUNDS_REFUSALS}, a transfer that waits would be cancelled by the departure and the confirmation is missing (TRANSFER_CANCELLATION_REQUIRED), or the person chosen to follow the head cannot take the department that day (SUCCESSOR_NOT_A_MEMBER_ON_DATE): nothing is saved.`,
      examples: [
        VALIDATION_EXAMPLE,
        E.LAST_WORKING_DAY_REQUIRED,
        ...DAY_REFUSALS,
        ...GROUNDS_EXAMPLES,
        E.TRANSFER_CANCELLATION_REQUIRED,
      ],
    },
  )
  async record(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: RecordOffboardingBodyDto) {
    try {
      return await this.detail.detailOf(await this.offboarding.record(userActor(actor), body));
    } catch (error) {
      throw toOffboardingApiException(error);
    }
  }

  @Get()
  @RequireRoles('SUPER_ADMIN', 'IT_ADMIN')
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
  async list(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Query() query: ListOffboardingQueryDto) {
    try {
      return await this.view.list(actor, query);
    } catch (error) {
      throw toOffboardingApiException(error);
    }
  }

  @Get(':id')
  @RequireRoles('SUPER_ADMIN', 'IT_ADMIN')
  @ApiOperation({ operationId: 'offboardingCaseGet', summary: 'Read a departure in full' })
  @ApiSuccessResponse(OffboardingDetailResponseDto, {
    message: 'OFFBOARDING_CASE.RETRIEVED',
    description:
      'The case with its basis, who follows the head of the department, the four steps of the checklist in the order they are done, what keeps the case from closing and what needs a person.',
  })
  @ApiErrorResponses(...COMMON, NOT_FOUND, ID_INVALID)
  async get(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: OffboardingIdParamDto) {
    try {
      return await this.view.get(actor, params.id);
    } catch (error) {
      throw toOffboardingApiException(error);
    }
  }

  @Get(':id/rights')
  @RequireRoles('SUPER_ADMIN', 'IT_ADMIN')
  @ApiOperation({ operationId: 'offboardingCaseRightList', summary: 'List the rights the person still holds' })
  @ApiSuccessResponse(OffboardingRightPageResponseDto, {
    message: 'OFFBOARDING_CASE.RIGHTS_LISTED',
    description:
      'A page of the personal seats the person holds, oldest first: the tool and plan, the way it is taken away and what to do first, whether it loses data and the task that takes it away. Service accounts are not among them.',
  })
  @ApiErrorResponses(...COMMON, NOT_FOUND, PAGE_INVALID)
  async rights(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: OffboardingIdParamDto,
    @Query() query: OffboardingPageQueryDto,
  ) {
    try {
      return await this.view.rights(actor, params.id, query);
    } catch (error) {
      throw toOffboardingApiException(error);
    }
  }

  @Get(':id/changes')
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'offboardingCaseChangeList', summary: 'List what was done to a departure' })
  @ApiSuccessResponse(OffboardingChangePageResponseDto, {
    message: 'OFFBOARDING_CASE.CHANGES_LISTED',
    description:
      'A page of what was done to the case, oldest first: the record, each move of the last working day with its reason, the cancellation, the departure, the lock of the account, the revocations opened and the closing.',
  })
  @ApiErrorResponses(...COMMON, NOT_FOUND, PAGE_INVALID)
  async listChanges(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: OffboardingIdParamDto,
    @Query() query: OffboardingPageQueryDto,
  ) {
    try {
      return await this.view.changes(actor, params.id, query);
    } catch (error) {
      throw toOffboardingApiException(error);
    }
  }

  @Post(':id/last-day-changes')
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'offboardingCaseChangeLastDay', summary: 'Move the last working day of a handover' })
  @ApiSuccessResponse(OffboardingDetailResponseDto, {
    message: 'OFFBOARDING_CASE.LAST_DAY_CHANGED',
    description:
      'The last working day moved: the placement of the person and the handover of the head move with it, and the reason and the basis are kept. Only a handover under way before its last working day can move.',
  })
  @ApiErrorResponses(
    ...WRITE_COMMON,
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description: `The person has left (OFFBOARDING_CASE.CASE_LEFT), the handover is not under way (NOT_HANDING_OVER), the last working day has passed (LAST_DAY_ALREADY_PASSED), the case cancelled a first placement and the new day is on or after the day it would take effect (PLACEMENT_OVERLAP, details.reason FIRST_PLACEMENT_PENDING with validFrom), or ${CONCURRENT}.`,
      examples: [...NOT_UNDER_WAY, E.LAST_DAY_ALREADY_PASSED, E.PLACEMENT_OVERLAP, ...CONCURRENT_EXAMPLES],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: `The body is invalid, such as one without a reason or a basis (VALIDATION_ERROR), ${GROUNDS_REFUSALS}, the day is the same or not allowed (NO_CHANGE, LAST_WORKING_DAY_INVALID), or the head of the department cannot be handed over on the new day (SUCCESSOR_NOT_A_MEMBER_ON_DATE): nothing is saved, and the old day and the old choice stay.`,
      examples: [VALIDATION_EXAMPLE, ...GROUNDS_EXAMPLES, E.NO_CHANGE, ...DAY_REFUSALS],
    },
  )
  async changeLastDay(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: OffboardingIdParamDto,
    @Body() body: ChangeLastDayBodyDto,
  ) {
    try {
      const record = await this.changes.changeLastDay(userActor(actor), params.id, body);

      return await this.detail.detailOf(record);
    } catch (error) {
      throw toOffboardingApiException(error);
    }
  }

  @Post(':id/cancellation')
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'offboardingCaseCancel', summary: 'Cancel a handover' })
  @ApiSuccessResponse(OffboardingDetailResponseDto, {
    message: 'OFFBOARDING_CASE.CANCELLED',
    description:
      'The handover was cancelled: the person keeps the department and, if they headed it, the head, and they are back to what they were doing (a long leave still ahead included). A first placement the case had cancelled is put back when its department is still active, and firstPlacementRestored says whether it was. No task is made or taken away.',
  })
  @ApiErrorResponses(
    ...WRITE_COMMON,
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description: `The person has left (OFFBOARDING_CASE.CASE_LEFT), the handover is not under way (NOT_HANDING_OVER), or ${CONCURRENT}.`,
      examples: [...NOT_UNDER_WAY, ...CONCURRENT_EXAMPLES],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: `The body is invalid, such as one without a reason or a basis (VALIDATION_ERROR), or ${GROUNDS_REFUSALS}.`,
      examples: [VALIDATION_EXAMPLE, ...GROUNDS_EXAMPLES],
    },
  )
  async cancel(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: OffboardingIdParamDto,
    @Body() body: CancelOffboardingBodyDto,
  ) {
    try {
      const record = await this.changes.cancel(userActor(actor), params.id, body);
      const detail = await this.detail.detailOf(record);
      return record.firstPlacementRestored !== undefined
        ? { ...detail, firstPlacementRestored: record.firstPlacementRestored }
        : detail;
    } catch (error) {
      throw toOffboardingApiException(error);
    }
  }

  @Post(':id/departure')
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'offboardingCaseMarkLeft', summary: 'Record that the person has left' })
  @ApiSuccessResponse(OffboardingDetailResponseDto, {
    message: 'OFFBOARDING_CASE.LEFT',
    description:
      'The person has left, at any time and also after the last working day (a day past it takes nothing away by itself). From the next action the sign-in and every call of the person are refused although the account is not locked; the Super Admin is reminded to lock it. The rights are listed, never revoked here.',
  })
  @ApiErrorResponses(
    ...WRITE_COMMON,
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description: `The person has left already (OFFBOARDING_CASE.CASE_LEFT), the handover is not under way (NOT_HANDING_OVER), the last working day has not come yet (LAST_WORKING_DAY_AHEAD, details.lastWorkingDay), or ${CONCURRENT}.`,
      examples: [...NOT_UNDER_WAY, E.LAST_WORKING_DAY_AHEAD],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The body is invalid (VALIDATION_ERROR): it takes no field.',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async markLeft(
    // Validated only: the body is a strict empty object, so a client that still sends `departedOn` or `accountLock` is refused.
    @Body() _body: MarkLeftBodyDto,
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: OffboardingIdParamDto,
  ) {
    try {
      return await this.detail.detailOf(await this.left.markLeft(userActor(actor), params.id));
    } catch (error) {
      throw toOffboardingApiException(error);
    }
  }
}
