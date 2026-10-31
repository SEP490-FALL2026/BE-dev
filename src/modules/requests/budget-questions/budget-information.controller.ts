import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  FORBIDDEN_EXAMPLE,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
  VALIDATION_EXAMPLE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { AuthenticatedOnly, RequireRoles } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import {
  AnswerBodyDto,
  AskBodyDto,
  InformationIdParamDto,
  InformationListResponseDto,
  InformationQueryDto,
  RequestInformationQueryDto,
  InformationResponseDto,
} from '../budget-information/budget-information.dto';
import { BudgetInformationService } from '../budget-information/budget-information.service';
import { BudgetInformationViewService } from '../budget-information/budget-information-view.service';
import { IdParamDto } from '../spend/spend-submission.dto';
import { SPEND_ERROR_EXAMPLES, toSpendApiException } from '../spend/spend.http-errors';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const INVALID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: 'The request is invalid (VALIDATION_ERROR).',
  examples: [VALIDATION_EXAMPLE],
} as const;

/**
 * What the spending approver asks Finance and what Finance answers (`US-06-02`, `US-06-03`). Only the web asks; the question
 * and its answer decide nothing, stop nothing and change no snapshot.
 */
@ApiTags('budget-information')
@Controller({ version: '1' })
export class BudgetInformationController {
  constructor(
    private readonly information: BudgetInformationService,
    private readonly views: BudgetInformationViewService,
  ) {}

  @Post('access-requests/:id/budget-information-requests')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'budgetInformationAsk', summary: 'Ask Finance for information on the budget' })
  @ApiSuccessResponse(InformationResponseDto, {
    status: HttpStatus.CREATED,
    message: 'BUDGET_INFORMATION.ASKED',
    description:
      'The person the spend step is given to asks Finance a question while the step is pending. Finance receives it; the step stays with the caller, its SLA keeps counting and the decision is not held back. One question is open for a step at a time.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description:
        'The caller does not hold the spend step (BUDGET_INFORMATION.NOT_THE_ASSIGNEE) or asked for or is given the access (BUDGET_INFORMATION.OWN_REQUEST).',
      examples: [SPEND_ERROR_EXAMPLES.INFORMATION_NOT_THE_ASSIGNEE, SPEND_ERROR_EXAMPLES.INFORMATION_OWN_REQUEST],
    },
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The request does not exist (ACCESS_REQUEST.NOT_FOUND).',
      examples: [SPEND_ERROR_EXAMPLES.REQUEST_NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The request has no spend step open (BUDGET_INFORMATION.NO_SPEND_STEP), the step is not pending (BUDGET_INFORMATION.STEP_NOT_PENDING) or a question is still open (BUDGET_INFORMATION.ALREADY_OPEN).',
      examples: [SPEND_ERROR_EXAMPLES.INFORMATION_NO_SPEND_STEP, SPEND_ERROR_EXAMPLES.INFORMATION_ALREADY_OPEN],
    },
    INVALID,
  )
  async ask(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: IdParamDto, @Body() body: AskBodyDto) {
    try {
      return { budgetInformation: await this.information.ask(actor, params.id, body.question) };
    } catch (error) {
      throw toSpendApiException(error);
    }
  }

  @Get('access-requests/:id/budget-information-requests')
  @AuthenticatedOnly()
  @ApiOperation({
    operationId: 'budgetInformationOfRequest',
    summary: 'List the questions put to Finance on a request',
  })
  @ApiSuccessResponse(InformationListResponseDto, {
    message: 'BUDGET_INFORMATION.LISTED',
    description:
      'What the spending approver asked Finance about the request and what Finance answered, the oldest first. Read by Finance and by the person the spend step is given to; the others are answered as if there were none.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The caller has no part in the questions of the request (BUDGET_INFORMATION.NOT_FOUND).',
      examples: [SPEND_ERROR_EXAMPLES.INFORMATION_NOT_FOUND],
    },
    INVALID,
  )
  async ofRequest(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: IdParamDto,
    @Query() query: RequestInformationQueryDto,
  ) {
    try {
      return await this.views.pageOfRequest(actor, params.id, query);
    } catch (error) {
      throw toSpendApiException(error);
    }
  }

  @Get('budget-information-requests')
  @RequireRoles('FINANCE')
  @ApiOperation({ operationId: 'budgetInformationList', summary: 'List the questions put to Finance' })
  @ApiSuccessResponse(InformationListResponseDto, {
    message: 'BUDGET_INFORMATION.LISTED',
    description:
      'The questions of the spending approvers, the oldest first, each with its request, who asked and when, and its answer. Narrowed by state; open ones are what Finance has to answer.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    { status: HttpStatus.FORBIDDEN, description: 'Only Finance reads the questions.', examples: [FORBIDDEN_EXAMPLE] },
    INVALID,
  )
  async list(@Query() query: InformationQueryDto) {
    try {
      return await this.views.page(query);
    } catch (error) {
      throw toSpendApiException(error);
    }
  }

  @Post('budget-information-requests/:id/answer')
  @RequireRoles('FINANCE')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ operationId: 'budgetInformationAnswer', summary: 'Answer a question on the budget' })
  @ApiSuccessResponse(InformationResponseDto, {
    message: 'BUDGET_INFORMATION.ANSWERED',
    description:
      'Finance answers with within the limit, over the limit or no budget yet, with a note. The answer is kept beside the snapshot of the request and changes neither it nor the step; it is kept even after the approver decided. Finance cannot answer a request it takes part in, or one it decides as the spending approver.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description:
        'The caller is not Finance, takes part in the request (BUDGET_INFORMATION.OWN_REQUEST) or decides it as the spending approver (BUDGET_INFORMATION.SOD_APPROVER).',
      examples: [
        FORBIDDEN_EXAMPLE,
        SPEND_ERROR_EXAMPLES.INFORMATION_OWN_REQUEST,
        SPEND_ERROR_EXAMPLES.INFORMATION_SOD_APPROVER,
      ],
    },
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The question does not exist (BUDGET_INFORMATION.NOT_FOUND).',
      examples: [SPEND_ERROR_EXAMPLES.INFORMATION_NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description: 'The question is answered or closed, not open (BUDGET_INFORMATION.NOT_OPEN).',
      examples: [SPEND_ERROR_EXAMPLES.INFORMATION_NOT_OPEN],
    },
    INVALID,
  )
  async answer(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: InformationIdParamDto,
    @Body() body: AnswerBodyDto,
  ) {
    try {
      return { budgetInformation: await this.information.answer(actor, params.id, body) };
    } catch (error) {
      throw toSpendApiException(error);
    }
  }
}
