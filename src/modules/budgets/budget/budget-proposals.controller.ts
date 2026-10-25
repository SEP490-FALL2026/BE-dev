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
  IdParamDto,
  PageQueryDto,
  ProposalBodyDto,
  ProposalLinePageResponseDto,
  ProposalListQueryDto,
  ProposalPageResponseDto,
  ProposalResponseDto,
  ResubmissionBodyDto,
  ReturnBodyDto,
} from './budget.dto';
import { toBudgetApiException } from './budget.http-errors';
import { ProposalService } from './proposal.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The proposal does not exist, or the caller has no part in it (BUDGET.PROPOSAL_NOT_FOUND).',
} as const;
const INVALID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: 'The request is invalid (VALIDATION_ERROR).',
} as const;
const HEAD_ONLY = {
  status: HttpStatus.FORBIDDEN,
  description: 'Only the head of the department proposes for its Cost Center (BUDGET.NOT_YOUR_COST_CENTER).',
} as const;

/**
 * The budget proposals of the heads of department (`US-06-10`): sent for the Cost Center of the department and a fiscal
 * year, withdrawn while Finance has not sent a version made from them, given back by Finance with a reason, and sent again
 * as a new proposal. A proposal sent is never edited in place. Finance reads them all; a head reads their own.
 */
@ApiTags('budget-proposals')
@Controller({ path: 'budget-proposals', version: '1' })
export class BudgetProposalsController {
  constructor(private readonly proposals: ProposalService) {}

  @Post()
  @RequireRoles('MANAGER')
  @ApiOperation({ operationId: 'budgetProposalSubmit', summary: 'Send a budget proposal' })
  @ApiSuccessResponse(ProposalResponseDto, {
    status: HttpStatus.CREATED,
    message: 'BUDGET_PROPOSAL.SUBMITTED',
    description:
      'The proposal of the department for a Cost Center and a year that is running or to come, with its lines and their total. Finance sees it in their queue.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    HEAD_ONLY,
    { status: HttpStatus.NOT_FOUND, description: 'The Cost Center does not exist (BUDGET.COST_CENTER_NOT_FOUND).' },
    {
      status: HttpStatus.CONFLICT,
      description:
        'A proposal for the Cost Center and the year already waits or is being reviewed (BUDGET.PROPOSAL_ALREADY_OPEN).',
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The form is invalid (VALIDATION_ERROR), a line lacks its window, service period or repeat cycle, with the line and the fields in details.lines (BUDGET.PROPOSAL_INCOMPLETE), a window runs backwards (BUDGET.WINDOW_BACKWARDS), the year has ended (BUDGET.YEAR_ENDED) or an amount is not in the reporting currency (BUDGET.CURRENCY_NOT_REPORTING).',
    },
  )
  async submit(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: ProposalBodyDto) {
    try {
      return { proposal: await this.proposals.submit(actor, body) };
    } catch (error) {
      throw toBudgetApiException(error);
    }
  }

  @Get()
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'budgetProposalList', summary: 'List budget proposals' })
  @ApiSuccessResponse(ProposalPageResponseDto, {
    message: 'BUDGET_PROPOSAL.LISTED',
    description:
      'Newest first. Finance and the spending approver read every proposal, a head of department those of the Cost Center of their department, and anybody else none; a proposal sent again points at the one it corrects, so the history of what was sent stays readable.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    { status: HttpStatus.FORBIDDEN, description: 'Only Finance and the heads of department read proposals.' },
    INVALID,
  )
  async list(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Query() query: ProposalListQueryDto) {
    try {
      return await this.proposals.list(actor, query);
    } catch (error) {
      throw toBudgetApiException(error);
    }
  }

  @Get(':id')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'budgetProposalGet', summary: 'Get a budget proposal' })
  @ApiSuccessResponse(ProposalResponseDto, {
    message: 'BUDGET_PROPOSAL.FETCHED',
    description: 'The proposal without its lines, which are a paged list of their own.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, NOT_FOUND, INVALID)
  async get(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: IdParamDto) {
    try {
      return { proposal: await this.proposals.get(actor, params.id) };
    } catch (error) {
      throw toBudgetApiException(error);
    }
  }

  @Get(':id/lines')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'budgetProposalLineList', summary: 'List the lines of a budget proposal' })
  @ApiSuccessResponse(ProposalLinePageResponseDto, {
    message: 'BUDGET_PROPOSAL.LINES_LISTED',
    description: 'The lines as they were sent, in order. They are never changed: Finance adjusts a copy in a version.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, NOT_FOUND, INVALID)
  async lines(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: IdParamDto,
    @Query() query: PageQueryDto,
  ) {
    try {
      return await this.proposals.lines(actor, params.id, query);
    } catch (error) {
      throw toBudgetApiException(error);
    }
  }

  @Post(':id/withdrawal')
  @RequireRoles('MANAGER')
  @ApiOperation({ operationId: 'budgetProposalWithdraw', summary: 'Take a budget proposal back' })
  @ApiSuccessResponse(ProposalResponseDto, {
    message: 'BUDGET_PROPOSAL.WITHDRAWN',
    description:
      'Allowed while Finance has not sent a version made from the proposal; Finance then has nothing to do for it.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    HEAD_ONLY,
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description: 'The proposal is no longer waiting for Finance (BUDGET.PROPOSAL_CANNOT_WITHDRAW).',
    },
    INVALID,
  )
  async withdraw(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: IdParamDto) {
    try {
      return { proposal: await this.proposals.withdraw(actor, params.id) };
    } catch (error) {
      throw toBudgetApiException(error);
    }
  }

  @Post(':id/return')
  @RequireRoles('FINANCE')
  @ApiOperation({ operationId: 'budgetProposalReturn', summary: 'Give a budget proposal back to the head' })
  @ApiSuccessResponse(ProposalResponseDto, {
    message: 'BUDGET_PROPOSAL.RETURNED',
    description:
      'Finance gives the proposal back with the reason that must go with it; the head corrects it and sends it again.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    { status: HttpStatus.FORBIDDEN, description: 'Only Finance gives a proposal back.' },
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description: 'The proposal is not waiting for Finance (BUDGET.PROPOSAL_CANNOT_RETURN).',
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The reason is missing (VALIDATION_ERROR): nothing is saved.',
    },
  )
  async giveBack(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: IdParamDto,
    @Body() body: ReturnBodyDto,
  ) {
    try {
      return { proposal: await this.proposals.giveBack(actor, params.id, body.reason) };
    } catch (error) {
      throw toBudgetApiException(error);
    }
  }

  @Post(':id/resubmission')
  @RequireRoles('MANAGER')
  @ApiOperation({
    operationId: 'budgetProposalResubmit',
    summary: 'Send a budget proposal again after it was given back',
  })
  @ApiSuccessResponse(ProposalResponseDto, {
    status: HttpStatus.CREATED,
    message: 'BUDGET_PROPOSAL.RESUBMITTED',
    description: 'A new proposal with the corrected lines, pointing at the one given back, which stays as it was.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    HEAD_ONLY,
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'The proposal was not given back (BUDGET.PROPOSAL_CANNOT_RESUBMIT), or another waits (BUDGET.PROPOSAL_ALREADY_OPEN).',
    },
    INVALID,
  )
  async resubmit(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: IdParamDto,
    @Body() body: ResubmissionBodyDto,
  ) {
    try {
      return { proposal: await this.proposals.resubmit(actor, params.id, body.lines) };
    } catch (error) {
      throw toBudgetApiException(error);
    }
  }
}
