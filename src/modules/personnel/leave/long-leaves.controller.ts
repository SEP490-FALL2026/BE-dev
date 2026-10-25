import { Body, Controller, Get, HttpStatus, Param, Post, Query } from '@nestjs/common';
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
import { toLeaveApiException } from './leave.http-errors';
import { LeaveQueryService } from './leave-query.service';
import { LeaveService } from './leave.service';

const FORBIDDEN = {
  status: HttpStatus.FORBIDDEN,
  description: 'Only an IT Admin starts, moves, ends or reads long leaves.',
} as const;
const COMMON = [UNAUTHENTICATED_RESPONSE, FORBIDDEN, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The long leave does not exist (LONG_LEAVE.NOT_FOUND).',
} as const;

const GROUNDS_REFUSALS =
  'the basis is empty or lacks a part (LONG_LEAVE.GROUNDS_REQUIRED, GROUNDS_INCOMPLETE) or is the code of a notice and not a document (GROUNDS_IS_NOTICE)';

/**
 * Long leaves of employees with the day they are due back and the basis of that day. IT Admin only: Finance, a department head and
 * an employee are refused, and the Super Admin does no business work. A leave never ends by itself; a late return is only listed.
 */
@ApiTags('long-leaves')
@Controller({ path: 'long-leaves', version: '1' })
@RequireRoles('IT_ADMIN')
export class LongLeavesController {
  constructor(
    private readonly leaves: LeaveService,
    private readonly query: LeaveQueryService,
  ) {}

  @Post()
  @ApiOperation({ operationId: 'longLeaveStart', summary: 'Record the start of a long leave' })
  @ApiSuccessResponse(LeaveDetailResponseDto, {
    status: HttpStatus.CREATED,
    message: 'LONG_LEAVE.STARTED',
    description:
      'The employee is on long leave from the day, due back on the approved day, which rests on the basis given. The reason for the leave is not asked for and not kept. No verification record is made for a document recorded directly.',
  })
  @ApiErrorResponses(
    ...COMMON,
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The employee does not exist (LONG_LEAVE.EMPLOYEE_NOT_FOUND).',
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The employee is on long leave already (LONG_LEAVE.ALREADY_ON_LEAVE), is handing over or has left (EMPLOYEE_NOT_WORKING), or an IT Admin records it for themselves while another can (SELF_EVENT_NEEDS_ANOTHER_IT_ADMIN).',
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: `The body is invalid or names a field the route does not know (VALIDATION_ERROR), the start is in the future or before the employee joined (LONG_LEAVE.START_DATE_INVALID), the day of return is not after the start (RETURN_DATE_INVALID), or ${GROUNDS_REFUSALS}: nothing is saved.`,
    },
  )
  async start(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: StartLeaveBodyDto) {
    try {
      return await this.query.detailOf(await this.leaves.start(actor, body));
    } catch (error) {
      throw toLeaveApiException(error);
    }
  }

  @Get()
  @ApiOperation({ operationId: 'longLeaveList', summary: 'List long leaves' })
  @ApiSuccessResponse(LeavePageResponseDto, {
    message: 'LONG_LEAVE.LISTED',
    description:
      'A page of long leaves, the nearest approved day of return first, optionally of one employee or one state. Each row says whether the person is overdue: the approved day has passed and they are not back. With overdueReturn=true this is the list of people to be reminded about.',
  })
  @ApiErrorResponses(...COMMON, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'A filter is invalid (VALIDATION_ERROR).',
  })
  async list(@Query() query: ListLeavesQueryDto) {
    try {
      return await this.query.list(query);
    } catch (error) {
      throw toLeaveApiException(error);
    }
  }

  @Get(':id')
  @ApiOperation({ operationId: 'longLeaveGet', summary: 'Read a long leave in full' })
  @ApiSuccessResponse(LeaveDetailResponseDto, {
    message: 'LONG_LEAVE.RETRIEVED',
    description: 'The long leave with the basis of the approved day of return in force and how it ended.',
  })
  @ApiErrorResponses(...COMMON, NOT_FOUND, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The id is not valid (VALIDATION_ERROR).',
  })
  async get(@Param() params: LeaveIdParamDto) {
    try {
      return await this.query.get(params.id);
    } catch (error) {
      throw toLeaveApiException(error);
    }
  }

  @Get(':id/changes')
  @ApiOperation({ operationId: 'longLeaveChangeList', summary: 'List what happened to a long leave' })
  @ApiSuccessResponse(LeaveChangePageResponseDto, {
    message: 'LONG_LEAVE.CHANGES_LISTED',
    description:
      'A page of what happened to the leave, oldest first: the start, each new day of return with the old one and its basis, the return, and the end for a handover.',
  })
  @ApiErrorResponses(...COMMON, NOT_FOUND, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The id or a page parameter is not valid (VALIDATION_ERROR).',
  })
  async listChanges(@Param() params: LeaveIdParamDto, @Query() query: ListLeaveChangesQueryDto) {
    try {
      return await this.query.listChanges(params.id, query);
    } catch (error) {
      throw toLeaveApiException(error);
    }
  }

  @Post(':id/return-date-changes')
  @ApiOperation({ operationId: 'longLeaveChangeReturnDate', summary: 'Extend or change the day a person is due back' })
  @ApiSuccessResponse(LeaveDetailResponseDto, {
    message: 'LONG_LEAVE.RETURN_DATE_CHANGED',
    description:
      'The approved day of return and its basis are the new ones; the old ones stay in the log. A new authoritative basis is required, and the person stays on long leave. The reminder for a late return counts from the new day.',
  })
  @ApiErrorResponses(
    ...COMMON,
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'The leave has ended (LONG_LEAVE.NOT_ACTIVE), or an IT Admin changes it for themselves while another can (SELF_EVENT_NEEDS_ANOTHER_IT_ADMIN).',
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: `The body is invalid (VALIDATION_ERROR), the day is the same, not after the start (LONG_LEAVE.RETURN_DATE_INVALID) or before today (RETURN_DATE_IN_PAST), or ${GROUNDS_REFUSALS}: nothing is saved and the person stays on long leave.`,
    },
  )
  async changeReturnDate(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: LeaveIdParamDto,
    @Body() body: ChangeReturnDateBodyDto,
  ) {
    try {
      return await this.query.detailOf(await this.leaves.changeReturnDate(actor, params.id, body));
    } catch (error) {
      throw toLeaveApiException(error);
    }
  }

  @Post(':id/returns')
  @ApiOperation({ operationId: 'longLeaveConfirmReturn', summary: 'Record that a person is back' })
  @ApiSuccessResponse(LeaveDetailResponseDto, {
    message: 'LONG_LEAVE.RETURNED',
    description:
      'The person works again from the day, and is in the evaluation of the recommendations again. On the approved day of return no new document is needed: the IT Admin confirms and the Audit Trail keeps who and when. On any other day, earlier or later, a new authoritative basis is required.',
  })
  @ApiErrorResponses(
    ...COMMON,
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'The leave has ended (LONG_LEAVE.NOT_ACTIVE), or an IT Admin records it for themselves while another can (SELF_EVENT_NEEDS_ANOTHER_IT_ADMIN).',
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: `The body is invalid (VALIDATION_ERROR), the day is before the leave began or in the future (LONG_LEAVE.RETURN_DATE_INVALID), or, on a day other than the approved one, ${GROUNDS_REFUSALS}: nothing is saved and the person stays on long leave.`,
    },
  )
  async confirmReturn(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: LeaveIdParamDto,
    @Body() body: ConfirmReturnBodyDto,
  ) {
    try {
      return await this.query.detailOf(await this.leaves.confirmReturn(actor, params.id, body));
    } catch (error) {
      throw toLeaveApiException(error);
    }
  }
}
