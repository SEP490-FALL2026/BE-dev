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
  ChangeReturnDateBodyDto,
  ConfirmReturnBodyDto,
  LeaveChangePageResponseDto,
  LeaveDetailResponseDto,
  LeaveIdParamDto,
  LeavePageResponseDto,
  ListLeaveChangesQueryDto,
  ListLeavesQueryDto,
  StartLeaveBodyDto,
} from './leave.dto';
import { LEAVE_ERROR_EXAMPLES as EXAMPLES, toLeaveApiException } from './leave.http-errors';
import { LeaveQueryService } from './leave-query.service';
import { LeaveService } from './leave.service';

const FORBIDDEN = {
  status: HttpStatus.FORBIDDEN,
  description:
    'Only the Super Admin starts, moves or ends a long leave, and reads it in full; the IT Admin reads a minimal projection (AUTHORIZATION.FORBIDDEN).',
  examples: [FORBIDDEN_EXAMPLE],
} as const;
/** A write by the Super Admin is also refused about themselves: the controlled procedure records that event. */
const FORBIDDEN_WRITE = {
  ...FORBIDDEN,
  description: `${FORBIDDEN.description} The Super Admin does not record or change a long leave about themselves in the application (PERSONNEL.SELF_CHANGE_FORBIDDEN): the controlled procedure does.`,
  examples: [FORBIDDEN_EXAMPLE, PERSONNEL_ACCESS_ERROR_EXAMPLES.SELF_CHANGE_FORBIDDEN],
} as const;
const COMMON = [UNAUTHENTICATED_RESPONSE, FORBIDDEN, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const WRITE_COMMON = [UNAUTHENTICATED_RESPONSE, FORBIDDEN_WRITE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description:
    'The long leave does not exist, or an IT Admin reads one of a person outside the departments in their charge (LONG_LEAVE.NOT_FOUND).',
  examples: [EXAMPLES.NOT_FOUND],
} as const;

/** The refusals of the basis of a day, the same on every write that needs one. */
const GROUNDS_EXAMPLES = [EXAMPLES.GROUNDS_REQUIRED, EXAMPLES.GROUNDS_TOO_LONG, EXAMPLES.GROUNDS_IS_NOTICE] as const;
/** The refusal of a write on a leave that has ended. */
const ENDED_EXAMPLES = [EXAMPLES.NOT_ACTIVE] as const;

const GROUNDS_REFUSALS =
  'the basis (groundsNote) is empty (LONG_LEAVE.GROUNDS_REQUIRED), longer than 500 characters (GROUNDS_TOO_LONG) or is only the code of a notice and not a document (GROUNDS_IS_NOTICE)';

/**
 * Long leaves of employees with the day they are due back and the basis of that day. The Super Admin records them (`QĐ-87a`); the
 * IT Admin reads a minimal projection of the departments in their charge. Finance, a department head and an employee are refused.
 * The role is judged again by the service, so this guard is only the outer layer. A leave never ends by itself; a late return is
 * only listed.
 */
@ApiTags('long-leaves')
@Controller({ path: 'long-leaves', version: '1' })
export class LongLeavesController {
  constructor(
    private readonly leaves: LeaveService,
    private readonly query: LeaveQueryService,
  ) {}

  @Post()
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'longLeaveStart', summary: 'Record the start of a long leave' })
  @ApiSuccessResponse(LeaveDetailResponseDto, {
    status: HttpStatus.CREATED,
    message: 'LONG_LEAVE.STARTED',
    description:
      'The employee is on long leave from the day, due back on the approved day, which rests on the basis given. The reason for the leave is not asked for and not kept. No verification record is made for a document recorded directly.',
  })
  @ApiErrorResponses(
    ...WRITE_COMMON,
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The employee does not exist (LONG_LEAVE.EMPLOYEE_NOT_FOUND).',
      examples: [EXAMPLES.EMPLOYEE_NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The employee is on long leave already (LONG_LEAVE.ALREADY_ON_LEAVE), or is handing over or has left (EMPLOYEE_NOT_WORKING).',
      examples: [EXAMPLES.ALREADY_ON_LEAVE, EXAMPLES.EMPLOYEE_NOT_WORKING],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: `The body is invalid or names a field the route does not know (VALIDATION_ERROR), the start is in the future or before the employee joined (LONG_LEAVE.START_DATE_INVALID), the day of return is not after the start (RETURN_DATE_INVALID), or ${GROUNDS_REFUSALS}: nothing is saved.`,
      examples: [
        VALIDATION_EXAMPLE,
        EXAMPLES.START_DATE_INVALID,
        EXAMPLES.RETURN_DATE_NOT_AFTER_START,
        ...GROUNDS_EXAMPLES,
      ],
    },
  )
  async start(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: StartLeaveBodyDto) {
    try {
      return await this.query.detailOf(await this.leaves.start(userActor(actor), body));
    } catch (error) {
      throw toLeaveApiException(error);
    }
  }

  @Get()
  @RequireRoles('SUPER_ADMIN', 'IT_ADMIN')
  @ApiOperation({ operationId: 'longLeaveList', summary: 'List long leaves' })
  @ApiSuccessResponse(LeavePageResponseDto, {
    message: 'LONG_LEAVE.LISTED',
    description:
      'A page of long leaves, the nearest approved day of return first, optionally of one employee or one state. Each row says whether the person is overdue: the approved day has passed and they are not back. With overdueReturn=true this is the list of people to be reminded about. An IT Admin reads only the leaves of people in the departments they are in charge of.',
  })
  @ApiErrorResponses(...COMMON, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'A filter is invalid (VALIDATION_ERROR).',
    examples: [VALIDATION_EXAMPLE],
  })
  async list(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Query() query: ListLeavesQueryDto) {
    try {
      return await this.query.list(actor, query);
    } catch (error) {
      throw toLeaveApiException(error);
    }
  }

  @Get(':id')
  @RequireRoles('SUPER_ADMIN', 'IT_ADMIN')
  @ApiOperation({ operationId: 'longLeaveGet', summary: 'Read a long leave' })
  @ApiSuccessResponse(LeaveDetailResponseDto, {
    message: 'LONG_LEAVE.RETRIEVED',
    description:
      'The long leave with the basis of the approved day of return in force, how it ended and who recorded it (an account, or the controlled procedure). The IT Admin reads a minimal projection without the basis.',
  })
  @ApiErrorResponses(...COMMON, NOT_FOUND, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The id is not valid (VALIDATION_ERROR).',
    examples: [VALIDATION_EXAMPLE],
  })
  async get(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: LeaveIdParamDto) {
    try {
      return await this.query.get(actor, params.id);
    } catch (error) {
      throw toLeaveApiException(error);
    }
  }

  @Get(':id/changes')
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'longLeaveChangeList', summary: 'List what happened to a long leave' })
  @ApiSuccessResponse(LeaveChangePageResponseDto, {
    message: 'LONG_LEAVE.CHANGES_LISTED',
    description:
      'A page of what happened to the leave, oldest first: the start, each new day of return with the old one and its basis, the return, and the end for a handover.',
  })
  @ApiErrorResponses(...COMMON, NOT_FOUND, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The id or a page parameter is not valid (VALIDATION_ERROR).',
    examples: [VALIDATION_EXAMPLE],
  })
  async listChanges(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: LeaveIdParamDto,
    @Query() query: ListLeaveChangesQueryDto,
  ) {
    try {
      return await this.query.listChanges(actor, params.id, query);
    } catch (error) {
      throw toLeaveApiException(error);
    }
  }

  @Post(':id/return-date-changes')
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'longLeaveChangeReturnDate', summary: 'Extend or change the day a person is due back' })
  @ApiSuccessResponse(LeaveDetailResponseDto, {
    message: 'LONG_LEAVE.RETURN_DATE_CHANGED',
    description:
      'The approved day of return and its basis are the new ones; the old ones stay in the log. A new authoritative basis is required, and the person stays on long leave. The reminder for a late return counts from the new day.',
  })
  @ApiErrorResponses(
    ...WRITE_COMMON,
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description: 'The leave has ended (LONG_LEAVE.NOT_ACTIVE).',
      examples: [...ENDED_EXAMPLES],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: `The body is invalid (VALIDATION_ERROR), the day is the same, not after the start (LONG_LEAVE.RETURN_DATE_INVALID) or before today (RETURN_DATE_IN_PAST), or ${GROUNDS_REFUSALS}: nothing is saved and the person stays on long leave.`,
      examples: [
        VALIDATION_EXAMPLE,
        EXAMPLES.RETURN_DATE_NOT_AFTER_START,
        EXAMPLES.RETURN_DATE_IN_PAST,
        ...GROUNDS_EXAMPLES,
      ],
    },
  )
  async changeReturnDate(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: LeaveIdParamDto,
    @Body() body: ChangeReturnDateBodyDto,
  ) {
    try {
      return await this.query.detailOf(await this.leaves.changeReturnDate(userActor(actor), params.id, body));
    } catch (error) {
      throw toLeaveApiException(error);
    }
  }

  @Post(':id/returns')
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'longLeaveConfirmReturn', summary: 'Record that a person is back' })
  @ApiSuccessResponse(LeaveDetailResponseDto, {
    message: 'LONG_LEAVE.RETURNED',
    description:
      'The person works again from the day, and is in the evaluation of the recommendations again. The basis (groundsNote) is required on any day, the approved one too: the interface fills it from the leave, the Super Admin may edit it, and what is sent is kept on the change RETURNED beside who and when.',
  })
  @ApiErrorResponses(
    ...WRITE_COMMON,
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description: 'The leave has ended (LONG_LEAVE.NOT_ACTIVE).',
      examples: [...ENDED_EXAMPLES],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: `The body is invalid (VALIDATION_ERROR), the day is before the leave began or in the future (LONG_LEAVE.RETURN_DATE_INVALID), or ${GROUNDS_REFUSALS}: nothing is saved and the person stays on long leave.`,
      examples: [VALIDATION_EXAMPLE, EXAMPLES.RETURN_DATE_IN_FUTURE, ...GROUNDS_EXAMPLES],
    },
  )
  async confirmReturn(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: LeaveIdParamDto,
    @Body() body: ConfirmReturnBodyDto,
  ) {
    try {
      return await this.query.detailOf(await this.leaves.confirmReturn(userActor(actor), params.id, body));
    } catch (error) {
      throw toLeaveApiException(error);
    }
  }
}
