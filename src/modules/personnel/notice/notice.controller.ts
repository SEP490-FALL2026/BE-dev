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
  LinkNoticeBodyDto,
  ListNoticesQueryDto,
  NoticeDetailResponseDto,
  NoticeIdParamDto,
  NoticePageResponseDto,
  RecordNoticeBodyDto,
  RejectNoticeBodyDto,
  SendNoticeBodyDto,
} from './notice.dto';
import { NOTICE_ERROR_EXAMPLES as EXAMPLES, toNoticeApiException } from './notice.http-errors';
import { NoticeHandlingService } from './notice-handling.service';
import { NoticeQueryService } from './notice-query.service';
import { NoticeService } from './notice.service';

const COMMON = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The notice does not exist, or is one that another head sent (PERSONNEL_NOTICE.NOT_FOUND).',
  examples: [EXAMPLES.NOT_FOUND],
} as const;
const SUPER_ADMIN_ONLY = {
  status: HttpStatus.FORBIDDEN,
  description:
    'Only the Super Admin handles a notice (AUTHORIZATION.FORBIDDEN): a department head, Finance, an approver and the IT Admin are refused. The Super Admin does not handle a notice about themselves in the application (PERSONNEL.SELF_CHANGE_FORBIDDEN): the controlled procedure records its event.',
  examples: [FORBIDDEN_EXAMPLE, PERSONNEL_ACCESS_ERROR_EXAMPLES.SELF_CHANGE_FORBIDDEN],
} as const;
const NOT_PENDING = {
  status: HttpStatus.CONFLICT,
  description: 'The notice has been recorded, rejected or withdrawn already (PERSONNEL_NOTICE.NOT_PENDING).',
  examples: [EXAMPLES.NOT_PENDING],
} as const;

const GROUNDS_REFUSALS =
  'the basis of the event is empty or lacks a part (PERSONNEL_NOTICE.GROUNDS_REQUIRED, GROUNDS_INCOMPLETE) or is only the code of a notice (GROUNDS_IS_NOTICE)';

/**
 * The notices of the heads of department about a change coming for one of their people, and what the Super Admin does with them. A
 * notice is information: it changes nothing of the person. The Super Admin rejects it with a reason, or checks it against an
 * authoritative basis outside the notice and records the official event through the rules of that event, or ties it to an event that
 * exists. The IT Admin reads the minimal projection of the notices of the departments in their charge. The role is judged again by
 * the service, so these guards are only the outer layer.
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
      'A notice with a code of the form BM09-year-number waits for the Super Admin, who is told in the inbox and has the working days of the operating parameter to handle it. The notice has no effect: the person, their place, their requests and their sign-in are not changed. A notice of a sudden departure is also marked as a priority, and changes nothing either.',
  })
  @ApiErrorResponses(
    ...COMMON,
    {
      status: HttpStatus.FORBIDDEN,
      description:
        'The caller does not head a department, or does not head the department of the person (a notice of a transfer to their own department: the one it names) (PERSONNEL_NOTICE.NOT_DEPARTMENT_HEAD, KIND_NOT_ALLOWED). Nothing is saved.',
      examples: [FORBIDDEN_EXAMPLE, EXAMPLES.NOT_DEPARTMENT_HEAD, EXAMPLES.KIND_NOT_ALLOWED],
    },
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The employee does not exist (PERSONNEL_NOTICE.EMPLOYEE_NOT_FOUND).',
      examples: [EXAMPLES.EMPLOYEE_NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The employee has left (PERSONNEL_NOTICE.EMPLOYEE_LEFT), or a notice of the same kind about them already waits, named in details.pendingCode (DUPLICATE_PENDING).',
      examples: [EXAMPLES.EMPLOYEE_LEFT, EXAMPLES.DUPLICATE_PENDING],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The body is invalid or names a field the form does not have, such as a reason for leaving (VALIDATION_ERROR), the head names the person themselves (PERSONNEL_NOTICE.SELF_NOTICE), or the department of a transfer is missing, is not usable, or is named for a kind that takes none (TARGET_DEPARTMENT_REQUIRED, TARGET_DEPARTMENT_INVALID): nothing is saved.',
      examples: [
        VALIDATION_EXAMPLE,
        EXAMPLES.SELF_NOTICE,
        EXAMPLES.TARGET_DEPARTMENT_REQUIRED,
        EXAMPLES.TARGET_DEPARTMENT_INVALID,
      ],
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
  @RequireRoles('SUPER_ADMIN', 'IT_ADMIN', 'MANAGER')
  @ApiOperation({ operationId: 'personnelNoticeList', summary: 'List notices of changes coming for people' })
  @ApiSuccessResponse(NoticePageResponseDto, {
    message: 'PERSONNEL_NOTICE.LISTED',
    description:
      'A page of notices, the earliest day to handle first. The Super Admin reads the queue of every notice, optionally of one state, kind or person, those past their day, or those about a sudden departure. An IT Admin reads only the notices about people of the departments they are in charge of, and a department head only the notices they sent. Each row says whether the notice is late.',
  })
  @ApiErrorResponses(
    ...COMMON,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'The caller is neither the Super Admin, an IT Admin nor the head of a department.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'A filter or a page parameter is invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
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
  @RequireRoles('SUPER_ADMIN', 'IT_ADMIN', 'MANAGER')
  @ApiOperation({ operationId: 'personnelNoticeGet', summary: 'Read a notice in full' })
  @ApiSuccessResponse(NoticeDetailResponseDto, {
    message: 'PERSONNEL_NOTICE.RETRIEVED',
    description:
      'The notice with its note, the department it names, how it ended (the reason of a rejection, or the event it led to) and, for the Super Admin only, how it was verified.',
  })
  @ApiErrorResponses(
    ...COMMON,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'The caller is neither the Super Admin, an IT Admin nor the head of a department.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    NOT_FOUND,
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The id is not valid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
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
    description:
      'The notice is withdrawn and leaves the queue of the Super Admin. Only the head who sent it can do this.',
  })
  @ApiErrorResponses(
    ...COMMON,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'The caller does not head a department.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    NOT_FOUND,
    NOT_PENDING,
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The id is not valid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async withdraw(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: NoticeIdParamDto) {
    try {
      return await this.query.detailOf(actor, await this.notices.withdraw(actor, params.id));
    } catch (error) {
      throw toNoticeApiException(error);
    }
  }

  @Post(':id/rejection')
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'personnelNoticeReject', summary: 'Reject a notice with a reason' })
  @ApiSuccessResponse(NoticeDetailResponseDto, {
    message: 'PERSONNEL_NOTICE.REJECTED',
    description:
      'The notice is rejected and no event is made. The head who sent it is told the reason. A notice the head withdrew cannot be rejected.',
  })
  @ApiErrorResponses(...COMMON, SUPER_ADMIN_ONLY, NOT_FOUND, NOT_PENDING, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description:
      'The reason is missing or empty, or the body is invalid (VALIDATION_ERROR, PERSONNEL_NOTICE.REASON_REQUIRED): nothing is saved.',
    examples: [VALIDATION_EXAMPLE, EXAMPLES.REASON_REQUIRED],
  })
  async reject(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: NoticeIdParamDto,
    @Body() body: RejectNoticeBodyDto,
  ) {
    try {
      return await this.query.detailOf(actor, await this.handling.reject(userActor(actor), params.id, body.reason));
    } catch (error) {
      throw toNoticeApiException(error);
    }
  }

  @Post(':id/recording')
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'personnelNoticeRecord', summary: 'Verify a notice and record the event it announces' })
  @ApiSuccessResponse(NoticeDetailResponseDto, {
    status: HttpStatus.CREATED,
    message: 'PERSONNEL_NOTICE.RECORDED',
    description:
      'The Super Admin states how the notice was checked and gives the authoritative basis outside the notice; the transfer, the long leave or the departure it announces is recorded by its own rules in the same transaction, tied to the notice, and the person is told. The day of the event follows the basis and need not be the day the notice proposed.',
  })
  @ApiErrorResponses(
    ...COMMON,
    SUPER_ADMIN_ONLY,
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'The notice is not waiting (PERSONNEL_NOTICE.NOT_PENDING), the person already has such an event: reject the notice or link it to that event (DUPLICATE_EVENT), or the event refuses with its own code, such as a person who has left, or a race on the person (CONCURRENT_CHANGE). Nothing is saved and the notice keeps waiting.',
      examples: [EXAMPLES.NOT_PENDING, EXAMPLES.DUPLICATE_EVENT],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: `The body is invalid (VALIDATION_ERROR), how the notice was checked is missing (PERSONNEL_NOTICE.VERIFICATION_REQUIRED), ${GROUNDS_REFUSALS}, the event lacks a field its kind needs or carries one it does not take (EVENT_INVALID), or the event refuses with its own code, such as a day before today: nothing is saved and the notice keeps waiting.`,
      examples: [
        VALIDATION_EXAMPLE,
        EXAMPLES.VERIFICATION_REQUIRED,
        EXAMPLES.GROUNDS_REQUIRED,
        EXAMPLES.GROUNDS_INCOMPLETE,
        EXAMPLES.GROUNDS_IS_NOTICE,
        EXAMPLES.EVENT_INVALID,
      ],
    },
  )
  async record(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: NoticeIdParamDto,
    @Body() body: RecordNoticeBodyDto,
  ) {
    try {
      return await this.query.detailOf(actor, await this.handling.record(userActor(actor), params.id, body));
    } catch (error) {
      throw toNoticeApiException(error);
    }
  }

  @Post(':id/linking')
  @RequireRoles('SUPER_ADMIN')
  @ApiOperation({ operationId: 'personnelNoticeLinkEvent', summary: 'Tie a notice to an event that already exists' })
  @ApiSuccessResponse(NoticeDetailResponseDto, {
    message: 'PERSONNEL_NOTICE.LINKED',
    description:
      'The notice is recorded against the event of the same person and kind that is in force, with how it was checked. No second event is made; a change of the last working day still goes through the departure.',
  })
  @ApiErrorResponses(
    ...COMMON,
    SUPER_ADMIN_ONLY,
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'The notice is not waiting (PERSONNEL_NOTICE.NOT_PENDING), or the event is not one of this person and of the kind of the notice that is in force (NO_MATCHING_EVENT).',
      examples: [EXAMPLES.NOT_PENDING, EXAMPLES.NO_MATCHING_EVENT],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The body is invalid (VALIDATION_ERROR) or how the notice was checked is missing (PERSONNEL_NOTICE.VERIFICATION_REQUIRED): nothing is saved.',
      examples: [VALIDATION_EXAMPLE, EXAMPLES.VERIFICATION_REQUIRED],
    },
  )
  async link(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: NoticeIdParamDto,
    @Body() body: LinkNoticeBodyDto,
  ) {
    try {
      return await this.query.detailOf(actor, await this.handling.link(userActor(actor), params.id, body));
    } catch (error) {
      throw toNoticeApiException(error);
    }
  }
}
