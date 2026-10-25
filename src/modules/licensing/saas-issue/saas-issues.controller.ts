import { Body, Controller, Get, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { AuthenticatedOnly, RequireRoles } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import {
  ListSaasIssuesQueryDto,
  SaasIssueDuplicateBodyDto,
  SaasIssueEntryPageResponseDto,
  SaasIssueIdParamDto,
  SaasIssueMessageBodyDto,
  SaasIssueOptionsResponseDto,
  SaasIssuePageQueryDto,
  SaasIssuePageResponseDto,
  SaasIssueReopenBodyDto,
  SaasIssueResponseDto,
  SaasIssueTransitionBodyDto,
  SubmitSaasIssueBodyDto,
} from './saas-issue.dto';
import { toSaasIssueApiException } from './saas-issue.http-errors';
import { SaasIssueService } from './saas-issue.service';
import { SaasIssueHandlingService } from './saas-issue-handling.service';
import { SaasIssueViewService } from './saas-issue-view.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description:
    'The report does not exist, or it is not the caller’s own and the caller is not an IT Admin (SAAS_ISSUE.NOT_FOUND): the two are not told apart.',
} as const;
const WEB_ONLY = ' This operation is for the web client only; there is no separate operation for mobile.';

/**
 * The reports of an error in a SaaS right (`BM-11`): any signed-in person reports on a right that is granted to them and follows the
 * report; an IT Admin takes it up, answers, records the vendor ticket by hand and resolves it. Not a ticket system: nothing is sent to
 * a vendor, and the report changes no assignment, grant task or request.
 */
@ApiTags('saas-issues')
@Controller({ path: 'saas-issues', version: '1' })
export class SaasIssuesController {
  constructor(
    private readonly issues: SaasIssueService,
    private readonly handling: SaasIssueHandlingService,
    private readonly views: SaasIssueViewService,
  ) {}

  @Get('options')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'saasIssueFormOptions', summary: 'Read the form to report an error in a SaaS right' })
  @ApiSuccessResponse(SaasIssueOptionsResponseDto, {
    message: 'SAAS_ISSUE.OPTIONS_READ',
    description: `The warning not to write a password, a token or a secret key in the description, the kinds of error and of impact, and a page of the rights granted to the caller that can be reported, each with the grant that is not finished for it, if any. A software that is not granted to the caller is not listed, so no report can be made for it.${WEB_ONLY}`,
  })
  @ApiErrorResponses(...AUTH_ERRORS, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'A page parameter is invalid (VALIDATION_ERROR).',
  })
  async options(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Query() query: SaasIssuePageQueryDto) {
    try {
      return await this.views.options(actor, query);
    } catch (error) {
      throw toSaasIssueApiException(error);
    }
  }

  @Post()
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'saasIssueSubmit', summary: 'Report an error in a SaaS right granted to the caller' })
  @ApiSuccessResponse(SaasIssueResponseDto, {
    status: HttpStatus.CREATED,
    message: 'SAAS_ISSUE.SUBMITTED',
    description: `The report is made as new and given to one IT Admin: the one in charge of the department of the reporter when they can act, otherwise the first IT Admin who can. The day it should be taken up by is fixed now from the operating parameter. No file is attached. Nothing about the right, its grant or any request changes, and nothing is sent to the vendor.${WEB_ONLY}`,
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description:
        'The assignment is not a personal right granted to the caller, or does not exist (SAAS_ISSUE.ASSIGNMENT_NOT_YOURS): the two are not told apart. Nothing is written.',
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The right has ended or never took a seat (SAAS_ISSUE.ASSIGNMENT_NOT_OPEN), or no IT Admin can take the report (SAAS_ISSUE.NO_IT_ADMIN).',
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The request is invalid (VALIDATION_ERROR), or the moment of the error is in the future (SAAS_ISSUE.OCCURRED_IN_FUTURE).',
    },
  )
  async submit(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: SubmitSaasIssueBodyDto) {
    try {
      const issue = await this.issues.submit(actor, { ...body, occurredAt: new Date(body.occurredAt) });

      return (await this.views.wireOf([issue]))[0];
    } catch (error) {
      throw toSaasIssueApiException(error);
    }
  }

  @Get()
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'saasIssueList', summary: 'List the reports of errors in SaaS rights' })
  @ApiSuccessResponse(SaasIssuePageResponseDto, {
    message: 'SAAS_ISSUE.LISTED',
    description: `A page of reports, the newest first. A person sees the reports they sent. An IT Admin sees by default those given to them, and with scope all every report; the state, the overdue flag and the reporter narrow it. A report is overdue when it is still new after the day it should have been taken up by.${WEB_ONLY}`,
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'A person who is not an IT Admin asked for the reports of others (SAAS_ISSUE.SCOPE_FORBIDDEN).',
    },
    { status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'A filter is invalid (VALIDATION_ERROR).' },
  )
  async list(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Query() query: ListSaasIssuesQueryDto) {
    try {
      return await this.views.list(actor, query);
    } catch (error) {
      throw toSaasIssueApiException(error);
    }
  }

  @Get(':id')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'saasIssueGet', summary: 'Read a report of an error in a SaaS right' })
  @ApiSuccessResponse(SaasIssueResponseDto, {
    message: 'SAAS_ISSUE.READ',
    description: `The report with what was written, the state, the result, the vendor ticket typed by hand, the pointers to other work, and for a duplicate the report it repeats and why. Only the reporter and an IT Admin read it; the head of a department does not.${WEB_ONLY}`,
  })
  @ApiErrorResponses(...AUTH_ERRORS, NOT_FOUND, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The id is invalid (VALIDATION_ERROR).',
  })
  async get(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: SaasIssueIdParamDto) {
    try {
      return await this.views.get(actor, params.id);
    } catch (error) {
      throw toSaasIssueApiException(error);
    }
  }

  @Get(':id/entries')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'saasIssueEntryList', summary: 'List the exchange on a report' })
  @ApiSuccessResponse(SaasIssueEntryPageResponseDto, {
    message: 'SAAS_ISSUE.ENTRIES_LISTED',
    description: `A page of what the reporter and the IT Admin said and of each change of state, the oldest first. A question to the reporter is read here.${WEB_ONLY}`,
  })
  @ApiErrorResponses(...AUTH_ERRORS, NOT_FOUND, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The id or a page parameter is invalid (VALIDATION_ERROR).',
  })
  async entries(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: SaasIssueIdParamDto,
    @Query() query: SaasIssuePageQueryDto,
  ) {
    try {
      return await this.views.entries(actor, params.id, query);
    } catch (error) {
      throw toSaasIssueApiException(error);
    }
  }

  @Post(':id/messages')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'saasIssueAddMessage', summary: 'Add to the exchange on a report' })
  @ApiSuccessResponse(SaasIssueResponseDto, {
    status: HttpStatus.CREATED,
    message: 'SAAS_ISSUE.MESSAGE_ADDED',
    description: `The reporter or an IT Admin says more. When the reporter answers a question the report waits on, it goes back to being handled and the IT Admin it was given to is told. Nothing is added to a report that is closed or a duplicate.${WEB_ONLY}`,
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description: 'The report is closed or a duplicate (SAAS_ISSUE.CLOSED).',
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The request is invalid (VALIDATION_ERROR) or has no text (SAAS_ISSUE.MESSAGE_REQUIRED).',
    },
  )
  async addMessage(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: SaasIssueIdParamDto,
    @Body() body: SaasIssueMessageBodyDto,
  ) {
    try {
      const issue = await this.issues.addMessage(actor, params.id, body.body);

      return (await this.views.wireOf([issue]))[0];
    } catch (error) {
      throw toSaasIssueApiException(error);
    }
  }

  @Post(':id/reopening')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'saasIssueReopen', summary: 'Reopen a resolved report' })
  @ApiSuccessResponse(SaasIssueResponseDto, {
    message: 'SAAS_ISSUE.REOPENED',
    description: `The reporter reopens a resolved report with the reason, no later than the last day fixed when it was resolved. It goes back to being handled by the IT Admin it was given to. After that day it is closed and only a new report can be sent.${WEB_ONLY}`,
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'The report is not resolved (SAAS_ISSUE.NOT_RESOLVED), or the time to reopen it has ended (SAAS_ISSUE.REOPEN_WINDOW_ENDED).',
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The request is invalid (VALIDATION_ERROR) or has no reason (SAAS_ISSUE.REASON_REQUIRED).',
    },
  )
  async reopen(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: SaasIssueIdParamDto,
    @Body() body: SaasIssueReopenBodyDto,
  ) {
    try {
      const issue = await this.issues.reopen(actor, params.id, body.reason);

      return (await this.views.wireOf([issue]))[0];
    } catch (error) {
      throw toSaasIssueApiException(error);
    }
  }

  @Post(':id/transitions')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'saasIssueTransition', summary: 'Move a report to its next state' })
  @ApiSuccessResponse(SaasIssueResponseDto, {
    message: 'SAAS_ISSUE.TRANSITIONED',
    description: `An IT Admin takes the report up, waits for the reporter (a question is required) or for the vendor (the ticket code typed by hand is kept as written and nothing is sent), or resolves it (the result is required and the last day to reopen is fixed). Any IT Admin may do it; when it is not the one the report was given to, the record names both. Pointers to a grant task, a discrepancy, a return or a request are only kept: none is opened.${WEB_ONLY}`,
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    { status: HttpStatus.FORBIDDEN, description: 'Only an IT Admin handles a report.' },
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description: 'The report cannot move from its state to the one asked for (SAAS_ISSUE.INVALID_TRANSITION).',
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The request is invalid (VALIDATION_ERROR), the result is missing (SAAS_ISSUE.RESOLUTION_REQUIRED), the question is missing (SAAS_ISSUE.MESSAGE_REQUIRED) or a grant task named does not exist (SAAS_ISSUE.LINKED_WORK_INVALID). Nothing is written.',
    },
  )
  async transition(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: SaasIssueIdParamDto,
    @Body() body: SaasIssueTransitionBodyDto,
  ) {
    try {
      const issue = await this.handling.transition(actor, params.id, {
        to: body.to,
        message: body.message ?? null,
        resolution: body.resolution ?? null,
        vendorTicketRef: body.vendorTicketRef ?? null,
        linkedWork: body.linkedWork ?? null,
      });

      return (await this.views.wireOf([issue]))[0];
    } catch (error) {
      throw toSaasIssueApiException(error);
    }
  }

  @Post(':id/duplicate')
  @RequireRoles('IT_ADMIN')
  @ApiOperation({ operationId: 'saasIssueMarkDuplicate', summary: 'Mark a report as a duplicate of another' })
  @ApiSuccessResponse(SaasIssueResponseDto, {
    message: 'SAAS_ISSUE.DUPLICATED',
    description: `An IT Admin marks a report that is still open as a duplicate of another report, with the reason. The reporter sees the state, the link and the reason. A duplicate is final.${WEB_ONLY}`,
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    { status: HttpStatus.FORBIDDEN, description: 'Only an IT Admin marks a duplicate.' },
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description: 'The report cannot be marked a duplicate from its state (SAAS_ISSUE.INVALID_TRANSITION).',
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The request is invalid or lacks the other report (VALIDATION_ERROR), has no reason (SAAS_ISSUE.REASON_REQUIRED), or the other report is the same one, a duplicate itself or does not exist (SAAS_ISSUE.DUPLICATE_TARGET_INVALID). Nothing is written.',
    },
  )
  async markDuplicate(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: SaasIssueIdParamDto,
    @Body() body: SaasIssueDuplicateBodyDto,
  ) {
    try {
      const issue = await this.handling.markDuplicate(actor, params.id, body);

      return (await this.views.wireOf([issue]))[0];
    } catch (error) {
      throw toSaasIssueApiException(error);
    }
  }
}
