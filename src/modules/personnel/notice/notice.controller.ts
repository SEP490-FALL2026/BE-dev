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
  LinkNoticeBodyDto,
  ListNoticesQueryDto,
  NoticeDetailResponseDto,
  NoticeIdParamDto,
  NoticePageResponseDto,
  RecordNoticeBodyDto,
  RejectNoticeBodyDto,
  SendNoticeBodyDto,
} from './notice.dto';
import { toNoticeApiException } from './notice.http-errors';
import { NoticeHandlingService } from './notice-handling.service';
import { NoticeQueryService } from './notice-query.service';
import { NoticeService } from './notice.service';

const COMMON = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The notice does not exist, or is one that another head sent (PERSONNEL_NOTICE.NOT_FOUND).',
} as const;
const IT_ADMIN_ONLY = {
  status: HttpStatus.FORBIDDEN,
  description:
    'Only an IT Admin handles a notice: a department head, Finance, an approver and the Super Admin are refused.',
} as const;
const NOT_PENDING = {
  status: HttpStatus.CONFLICT,
  description: 'The notice has been recorded, rejected or withdrawn already (PERSONNEL_NOTICE.NOT_PENDING).',
} as const;

const GROUNDS_REFUSALS =
  'the basis of the event is empty or lacks a part (PERSONNEL_NOTICE.GROUNDS_REQUIRED, GROUNDS_INCOMPLETE) or is only the code of a notice (GROUNDS_IS_NOTICE)';

/**
 * The notices of the heads of department about a change coming for one of their people, and what the IT Admin does with them. A
 * notice is information: it changes nothing of the person. The IT Admin rejects it with a reason, or checks it against an authoritative
 * basis outside the notice and records the official event through the rules of that event, or ties it to an event that exists.
 */
@ApiTags('personnel-notices')
@Controller({ path: 'personnel-notices', version: '1' })
export class NoticesController {
  constructor(
    private readonly notices: NoticeService,
    private readonly handling: NoticeHandlingService,
    private readonly query: NoticeQueryService,
  ) {}

  @Post()
  @RequireRoles('MANAGER')
  @ApiOperation({ operationId: 'personnelNoticeSend', summary: 'Send a notice of a change coming for a person' })
  @ApiSuccessResponse(NoticeDetailResponseDto, {
    status: HttpStatus.CREATED,
    message: 'PERSONNEL_NOTICE.SENT',
    description:
      'A notice with a code of the form BM09-year-number waits for the IT Admin in charge of the department, who has the working days of the operating parameter to handle it. The notice has no effect: the person, their place, their requests and their sign-in are not changed. A notice of a sudden departure is also told to the IT Admin and the Super Admin as a priority, and changes nothing either.',
  })
  @ApiErrorResponses(
    ...COMMON,
    {
      status: HttpStatus.FORBIDDEN,
      description:
        'The caller does not head a department, or does not head the department of the person (a notice of a transfer to their own department: the one it names) (PERSONNEL_NOTICE.NOT_DEPARTMENT_HEAD, KIND_NOT_ALLOWED). Nothing is saved.',
    },
    { status: HttpStatus.NOT_FOUND, description: 'The employee does not exist (PERSONNEL_NOTICE.EMPLOYEE_NOT_FOUND).' },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The employee has left (PERSONNEL_NOTICE.EMPLOYEE_LEFT), or a notice of the same kind about them already waits, named in details.pendingCode (DUPLICATE_PENDING).',
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The body is invalid or names a field the form does not have, such as a reason for leaving (VALIDATION_ERROR), the head names the person themselves (PERSONNEL_NOTICE.SELF_NOTICE), or the department of a transfer is missing, is not usable, or is named for a kind that takes none (TARGET_DEPARTMENT_REQUIRED, TARGET_DEPARTMENT_INVALID): nothing is saved.',
    },
  )
  async send(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: SendNoticeBodyDto) {
    try {
      return await this.query.detailOf(actor, await this.notices.send(actor, body));
    } catch (error) {
      throw toNoticeApiException(error);
    }
  }

  @Get()
  @RequireRoles('IT_ADMIN', 'MANAGER')
  @ApiOperation({ operationId: 'personnelNoticeList', summary: 'List notices of changes coming for people' })
  @ApiSuccessResponse(NoticePageResponseDto, {
    message: 'PERSONNEL_NOTICE.LISTED',
    description:
      'A page of notices, the earliest day to handle first. An IT Admin reads the queue of every notice, optionally of one state, kind or person, those past their day, or those about a sudden departure. A department head reads only the notices they sent. Each row says whether the notice is late.',
  })
  @ApiErrorResponses(
    ...COMMON,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'The caller is neither an IT Admin nor the head of a department.',
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'A filter or a page parameter is invalid (VALIDATION_ERROR).',
    },
  )
  async list(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Query() query: ListNoticesQueryDto) {
    try {
      return await this.query.list(actor, query);
    } catch (error) {
      throw toNoticeApiException(error);
    }
  }

  @Get(':id')
  @RequireRoles('IT_ADMIN', 'MANAGER')
  @ApiOperation({ operationId: 'personnelNoticeGet', summary: 'Read a notice in full' })
  @ApiSuccessResponse(NoticeDetailResponseDto, {
    message: 'PERSONNEL_NOTICE.RETRIEVED',
    description:
      'The notice with its note, the department it names, how it ended (the reason of a rejection, or the event it led to) and, for an IT Admin only, how it was verified.',
  })
  @ApiErrorResponses(
    ...COMMON,
    { status: HttpStatus.FORBIDDEN, description: 'The caller is neither an IT Admin nor the head of a department.' },
    NOT_FOUND,
    { status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'The id is not valid (VALIDATION_ERROR).' },
  )
  async get(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: NoticeIdParamDto) {
    try {
      return await this.query.get(actor, params.id);
    } catch (error) {
      throw toNoticeApiException(error);
    }
  }

  @Post(':id/withdrawal')
  @RequireRoles('MANAGER')
  @ApiOperation({ operationId: 'personnelNoticeWithdraw', summary: 'Withdraw a notice that waits' })
  @ApiSuccessResponse(NoticeDetailResponseDto, {
    message: 'PERSONNEL_NOTICE.WITHDRAWN',
    description: 'The notice is withdrawn and leaves the queue of the IT Admin. Only the head who sent it can do this.',
  })
  @ApiErrorResponses(
    ...COMMON,
    { status: HttpStatus.FORBIDDEN, description: 'The caller does not head a department.' },
    NOT_FOUND,
    NOT_PENDING,
    { status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'The id is not valid (VALIDATION_ERROR).' },
  )
  async withdraw(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: NoticeIdParamDto) {
    try {
      return await this.query.detailOf(actor, await this.notices.withdraw(actor, params.id));
    } catch (error) {
      throw toNoticeApiException(error);
    }
  }

  @Post(':id/rejection')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'personnelNoticeReject', summary: 'Reject a notice with a reason' })
  @ApiSuccessResponse(NoticeDetailResponseDto, {
    message: 'PERSONNEL_NOTICE.REJECTED',
    description:
      'The notice is rejected and no event is made. The head who sent it is told the reason. A notice the head withdrew cannot be rejected.',
  })
  @ApiErrorResponses(...COMMON, IT_ADMIN_ONLY, NOT_FOUND, NOT_PENDING, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description:
      'The reason is missing or empty, or the body is invalid (VALIDATION_ERROR, PERSONNEL_NOTICE.REASON_REQUIRED): nothing is saved.',
  })
  async reject(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: NoticeIdParamDto,
    @Body() body: RejectNoticeBodyDto,
  ) {
    try {
      return await this.query.detailOf(actor, await this.handling.reject(actor, params.id, body.reason));
    } catch (error) {
      throw toNoticeApiException(error);
    }
  }

  @Post(':id/recording')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'personnelNoticeRecord', summary: 'Verify a notice and record the event it announces' })
  @ApiSuccessResponse(NoticeDetailResponseDto, {
    status: HttpStatus.CREATED,
    message: 'PERSONNEL_NOTICE.RECORDED',
    description:
      'The IT Admin states how the notice was checked and gives the authoritative basis outside the notice; the transfer, the long leave or the departure it announces is recorded by its own rules in the same transaction, tied to the notice, and the person is told. The day of the event follows the basis and need not be the day the notice proposed.',
  })
  @ApiErrorResponses(
    ...COMMON,
    IT_ADMIN_ONLY,
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'The notice is not waiting (PERSONNEL_NOTICE.NOT_PENDING), the person already has such an event: reject the notice or link it to that event (DUPLICATE_EVENT), or the event refuses with its own code, such as a person who has left or an IT Admin who records an event about themselves while another can. Nothing is saved and the notice keeps waiting.',
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: `The body is invalid (VALIDATION_ERROR), how the notice was checked is missing (PERSONNEL_NOTICE.VERIFICATION_REQUIRED), ${GROUNDS_REFUSALS}, the event lacks a field its kind needs or carries one it does not take (EVENT_INVALID), or the event refuses with its own code, such as a day before today: nothing is saved and the notice keeps waiting.`,
    },
  )
  async record(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: NoticeIdParamDto,
    @Body() body: RecordNoticeBodyDto,
  ) {
    try {
      return await this.query.detailOf(actor, await this.handling.record(actor, params.id, body));
    } catch (error) {
      throw toNoticeApiException(error);
    }
  }

  @Post(':id/linking')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'personnelNoticeLinkEvent', summary: 'Tie a notice to an event that already exists' })
  @ApiSuccessResponse(NoticeDetailResponseDto, {
    message: 'PERSONNEL_NOTICE.LINKED',
    description:
      'The notice is recorded against the event of the same person and kind that is in force, with how it was checked. No second event is made; a change of the last working day still goes through the departure.',
  })
  @ApiErrorResponses(
    ...COMMON,
    IT_ADMIN_ONLY,
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'The notice is not waiting (PERSONNEL_NOTICE.NOT_PENDING), or the event is not one of this person and of the kind of the notice that is in force (NO_MATCHING_EVENT).',
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The body is invalid (VALIDATION_ERROR) or how the notice was checked is missing (PERSONNEL_NOTICE.VERIFICATION_REQUIRED): nothing is saved.',
    },
  )
  async link(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: NoticeIdParamDto,
    @Body() body: LinkNoticeBodyDto,
  ) {
    try {
      return await this.query.detailOf(actor, await this.handling.link(actor, params.id, body));
    } catch (error) {
      throw toNoticeApiException(error);
    }
  }
}
