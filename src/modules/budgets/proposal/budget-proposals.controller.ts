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
import {
  AuthenticatedOnly,
  RequireRoles,
  RequireRolesOrGrants,
} from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import {
  IdParamDto,
  PageQueryDto,
  BudgetProposalBodyDto,
  ProposalLinePageResponseDto,
  ProposalListQueryDto,
  ProposalPageResponseDto,
  ProposalResponseDto,
  ResubmissionBodyDto,
  BudgetProposalReturnBodyDto,
} from '../budget/budget.dto';
import { BUDGET_ERROR_EXAMPLES as EXAMPLES, toBudgetApiException } from '../budget/budget.http-errors';
import {
  BUDGET_ATTACHMENT_ERROR_EXAMPLES as ATTACHMENT_EXAMPLES,
  toBudgetAttachmentApiException,
} from '../attachment/budget-attachment.http-errors';
import { ProposalService } from './proposal.service';
import { ProposalViewService } from './proposal-view.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The proposal does not exist, or the caller has no part in it (BUDGET.PROPOSAL_NOT_FOUND).',
  examples: [EXAMPLES.PROPOSAL_NOT_FOUND],
} as const;
const INVALID_DESCRIPTION = 'The request is invalid (VALIDATION_ERROR).';
const INVALID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: INVALID_DESCRIPTION,
  examples: [VALIDATION_EXAMPLE],
} as const;
const HEAD_ONLY_DESCRIPTION =
  'Only the head of the department proposes for its Cost Center (BUDGET.NOT_YOUR_COST_CENTER).';
const HEAD_ONLY = {
  status: HttpStatus.FORBIDDEN,
  description: HEAD_ONLY_DESCRIPTION,
  examples: [FORBIDDEN_EXAMPLE, EXAMPLES.NOT_YOUR_COST_CENTER],
} as const;
/** The role guard alone: on a proposal already sent, a caller who is not its head finds nothing (404). */
const HEAD_ROLE_ONLY = {
  status: HttpStatus.FORBIDDEN,
  description: HEAD_ONLY_DESCRIPTION,
  examples: [FORBIDDEN_EXAMPLE],
} as const;
/** What a change of a proposal of a year that has ended answers, whether or not the closure of the year has run (`QĐ-91c`). */
const YEAR_ENDED = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: 'The fiscal year of the proposal has ended (BUDGET.YEAR_ENDED): nothing is saved.',
  examples: [VALIDATION_EXAMPLE, EXAMPLES.YEAR_ENDED],
} as const;
/** What sending the lines refuses after the request validation: a first proposal and one sent again alike. */
const SEND_EXAMPLES = [
  EXAMPLES.PRIORITY_RANK_INVALID,
  EXAMPLES.ZBB_REQUIRED,
  EXAMPLES.OVER_CEILING_NOTE_REQUIRED,
  EXAMPLES.PLAN_NOT_FOUND,
  EXAMPLES.YEAR_ENDED,
  EXAMPLES.CURRENCY_NOT_REPORTING,
  EXAMPLES.CURRENCY_NOT_SUPPORTED,
  EXAMPLES.MONEY_SCALE_EXCEEDED,
  EXAMPLES.MONEY_OUT_OF_RANGE,
  ATTACHMENT_EXAMPLES.NOT_ATTACHABLE,
] as const;

/**
 * The budget proposals of the heads of department (`US-06-10`): sent for the Cost Center of the department and a fiscal
 * year, withdrawn while Finance has not sent a version made from them, given back by Finance with a reason, and sent again
 * as a new proposal. A proposal sent is never edited in place. A proposal whose version the spending approver refused stays
 * reviewed: Finance makes another version from it, or the head sends a new proposal that follows it (`successorOfProposalId`, set by the
 * system). Finance reads them all; a head reads their own.
 */
@ApiTags('budget-proposals')
@Controller({ path: 'budget-proposals', version: '1' })
export class BudgetProposalsController {
  constructor(
    private readonly proposals: ProposalService,
    private readonly views: ProposalViewService,
  ) {}

  @Post()
  @RequireRolesOrGrants(['MANAGER'], ['MANAGER'])
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
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The Cost Center does not exist (BUDGET.COST_CENTER_NOT_FOUND).',
      examples: [EXAMPLES.COST_CENTER_NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The department has no Cost Center in use yet (FINANCE.SETUP_INCOMPLETE), a proposal for the Cost Center and the year already waits or is being reviewed and no refused version leaves room for a successor (BUDGET.PROPOSAL_ALREADY_OPEN), or Finance has not published the budget cycle of the year yet (BUDGET.CYCLE_NOT_PUBLISHED).',
      examples: [EXAMPLES.FINANCE_SETUP_INCOMPLETE, EXAMPLES.PROPOSAL_ALREADY_OPEN, EXAMPLES.CYCLE_NOT_PUBLISHED],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The form is invalid (VALIDATION_ERROR), two lines share a priority rank (BUDGET.PRIORITY_RANK_INVALID, details.positions), a line lacks its zero-based-budget explanation (BUDGET.ZBB_REQUIRED, details.positions), a line that carries the proposal over the published ceiling of the department has no note (BUDGET.OVER_CEILING_NOTE_REQUIRED, details.positions), a line names a plan that does not exist (BUDGET.PLAN_NOT_FOUND), the year has ended (BUDGET.YEAR_ENDED) an amount is not in the reporting currency (BUDGET.CURRENCY_NOT_REPORTING), or the head answers for more than one Cost Center that year and names none (BUDGET.COST_CENTER_REQUIRED).',
      examples: [VALIDATION_EXAMPLE, ...SEND_EXAMPLES, EXAMPLES.COST_CENTER_REQUIRED],
    },
  )
  async submit(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: BudgetProposalBodyDto) {
    try {
      return { proposal: await this.proposals.submit(actor, body) };
    } catch (error) {
      throw toBudgetAttachmentApiException(error);
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
  // No 403: the list never refuses, a caller who may read no proposal gets an empty page (Owner, 26/10/2026).
  @ApiErrorResponses(...AUTH_ERRORS, INVALID)
  async list(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Query() query: ProposalListQueryDto) {
    try {
      return await this.views.list(actor, query);
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
      return { proposal: await this.views.get(actor, params.id) };
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
      return await this.views.lines(actor, params.id, query);
    } catch (error) {
      throw toBudgetApiException(error);
    }
  }

  @Post(':id/withdrawal')
  @RequireRolesOrGrants(['MANAGER'], ['MANAGER'])
  @ApiOperation({ operationId: 'budgetProposalWithdraw', summary: 'Take a budget proposal back' })
  @ApiSuccessResponse(ProposalResponseDto, {
    message: 'BUDGET_PROPOSAL.WITHDRAWN',
    description:
      'Allowed while Finance has not sent a version made from the proposal; Finance then has nothing to do for it.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    HEAD_ROLE_ONLY,
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description: 'The proposal is no longer waiting for Finance (BUDGET.PROPOSAL_CANNOT_WITHDRAW).',
      examples: [EXAMPLES.PROPOSAL_CANNOT_WITHDRAW],
    },
    YEAR_ENDED,
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
    { status: HttpStatus.FORBIDDEN, description: 'Only Finance gives a proposal back.', examples: [FORBIDDEN_EXAMPLE] },
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description: 'The proposal is not waiting for Finance (BUDGET.PROPOSAL_CANNOT_RETURN).',
      examples: [EXAMPLES.PROPOSAL_CANNOT_RETURN],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The reason is missing (VALIDATION_ERROR) or the fiscal year of the proposal has ended (BUDGET.YEAR_ENDED): nothing is saved.',
      examples: [VALIDATION_EXAMPLE, EXAMPLES.YEAR_ENDED],
    },
  )
  async giveBack(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: IdParamDto,
    @Body() body: BudgetProposalReturnBodyDto,
  ) {
    try {
      return { proposal: await this.proposals.giveBack(actor, params.id, body.reason) };
    } catch (error) {
      throw toBudgetApiException(error);
    }
  }

  @Post(':id/resubmission')
  @RequireRolesOrGrants(['MANAGER'], ['MANAGER'])
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
    HEAD_ROLE_ONLY,
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'The proposal was not given back (BUDGET.PROPOSAL_CANNOT_RESUBMIT), another waits (BUDGET.PROPOSAL_ALREADY_OPEN), the Cost Center of the department was retired and has none in use yet, though the head still owns the proposal given back (FINANCE.SETUP_INCOMPLETE), or the budget cycle of the year was never published (BUDGET.CYCLE_NOT_PUBLISHED).',
      examples: [
        EXAMPLES.PROPOSAL_CANNOT_RESUBMIT,
        EXAMPLES.PROPOSAL_ALREADY_OPEN,
        EXAMPLES.FINANCE_SETUP_INCOMPLETE,
        EXAMPLES.CYCLE_NOT_PUBLISHED,
      ],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: INVALID_DESCRIPTION,
      examples: [VALIDATION_EXAMPLE, ...SEND_EXAMPLES],
    },
  )
  async resubmit(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: IdParamDto,
    @Body() body: ResubmissionBodyDto,
  ) {
    try {
      return { proposal: await this.proposals.resubmit(actor, params.id, body.lines, body.attachmentIds) };
    } catch (error) {
      throw toBudgetAttachmentApiException(error);
    }
  }
}
