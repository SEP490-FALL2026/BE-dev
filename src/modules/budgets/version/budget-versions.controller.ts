import { CHECKLIST_ERROR_EXAMPLES, toChecklistApiException } from '../../policies/public/policy-checklist.http-errors';
import { Body, Controller, Get, HttpStatus, Param, Post, Put, Query } from '@nestjs/common';
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
import { BudgetVersionHistoryPageResponseDto } from './budget-history.dto';
import {
  DecisionBodyDto,
  IdParamDto,
  PageQueryDto,
  VersionBodyDto,
  VersionListQueryDto,
  VersionPageResponseDto,
  VersionPatchDto,
  VersionResponseDto,
} from '../budget/budget.dto';
import {
  BUDGET_ERROR_EXAMPLES as EXAMPLES,
  VERSION_READERS_DESCRIPTION,
  toBudgetApiException,
} from '../budget/budget.http-errors';
import { VersionDecisionService } from './version-decision.service';
import { VersionHistoryViewService } from './version-history-view.service';
import { VersionBaselineCreationService } from './version-baseline-creation.service';
import { VersionCreationService } from './version-creation.service';
import { VersionService } from './version.service';
import { VersionViewService } from '../budget/version-view.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const FINANCE_ONLY_DESCRIPTION = 'Only Finance builds the versions of a budget.';
const FINANCE_ONLY = {
  status: HttpStatus.FORBIDDEN,
  description: FINANCE_ONLY_DESCRIPTION,
  examples: [FORBIDDEN_EXAMPLE],
} as const;
/** The reading routes have no role guard: the service lets Finance and the spending approver read. */
const READERS_ONLY = {
  status: HttpStatus.FORBIDDEN,
  description: VERSION_READERS_DESCRIPTION,
  examples: [EXAMPLES.NOT_A_READER],
} as const;
const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The version does not exist (BUDGET.VERSION_NOT_FOUND).',
  examples: [EXAMPLES.VERSION_NOT_FOUND],
} as const;
/** A route that names a version only, and no line of it. */
const VERSION_ONLY_NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The version does not exist (BUDGET.VERSION_NOT_FOUND).',
  examples: [EXAMPLES.VERSION_NOT_FOUND],
} as const;
const INVALID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: 'The request is invalid (VALIDATION_ERROR).',
  examples: [VALIDATION_EXAMPLE],
} as const;
const NOT_EDITABLE_DESCRIPTION =
  'The version is not a draft nor sent back to Finance, or is a draft left behind by a proposal that was withdrawn or given back, so it is not changed (BUDGET.VERSION_NOT_EDITABLE).';
const NOT_EDITABLE = {
  status: HttpStatus.CONFLICT,
  description: NOT_EDITABLE_DESCRIPTION,
  examples: [EXAMPLES.VERSION_NOT_EDITABLE],
} as const;
/** What the figures of a version refuse after the request validation: their currency and their range. */
const MONEY_EXAMPLES = [
  EXAMPLES.CURRENCY_NOT_REPORTING,
  EXAMPLES.CURRENCY_NOT_SUPPORTED,
  EXAMPLES.MONEY_SCALE_EXCEEDED,
  EXAMPLES.MONEY_OUT_OF_RANGE,
] as const;

/**
 * The versions of a budget as Finance builds them (`US-06-09`, `QĐ-111ac`): one figure for the year from the proposal that waits or
 * from the baseline, the files that explain it, and the sending to the spending approver. Only Finance does this: the head, the IT Admin, the Super Admin and
 * the spending approver cannot, and nobody here makes a version current.
 */
@ApiTags('budget-versions')
@Controller({ path: 'budget-versions', version: '1' })
export class BudgetVersionsController {
  constructor(
    private readonly versions: VersionService,
    private readonly creations: VersionCreationService,
    private readonly decisions: VersionDecisionService,
    private readonly views: VersionViewService,
    private readonly history: VersionHistoryViewService,
    private readonly baselineCreations: VersionBaselineCreationService,
  ) {}

  @Post()
  @RequireRoles('FINANCE')
  @ApiOperation({
    operationId: 'budgetVersionCreate',
    summary: 'Build the first version of a budget',
  })
  @ApiSuccessResponse(VersionResponseDto, {
    status: HttpStatus.CREATED,
    message: 'BUDGET_VERSION.CREATED',
    description:
      'A draft with one figure for the year and no line: the base Finance gives, or what the Cost Center carries into the year when it gives none (carriedOverNextYear), and the reserve as a share (reservePercent, the default share when nothing is given) or as an amount with its reason; the proposal itself is not changed. Saving a draft is never refused for its figures. A proposal whose latest version was refused is made again the same way: the new draft points at the refused one (rejectedPredecessorId). With source BASELINE (costCenterId and year, no proposal) the draft is built after the deadline for a department that has no proposal (a head that sent none, or a department made after the deadline), the same way; origin is BASELINE_NO_PROPOSAL and noProposalSubmitted is true.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    FINANCE_ONLY,
    {
      status: HttpStatus.NOT_FOUND,
      description:
        'The proposal does not exist (BUDGET.PROPOSAL_NOT_FOUND), or the Cost Center of a version built from the baseline does not (BUDGET.COST_CENTER_NOT_FOUND).',
      examples: [EXAMPLES.PROPOSAL_NOT_FOUND, EXAMPLES.COST_CENTER_NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The proposal is neither waiting nor reviewed with its latest version refused and nobody following it (BUDGET.PROPOSAL_NOT_SUBMITTED), the Cost Center is no longer in use (FINANCE.SETUP_INCOMPLETE), has a current budget (BUDGET.CURRENT_EXISTS) or a version in progress (BUDGET.VERSION_IN_FLIGHT), or a version built from the baseline is not allowed: the cycle was never published, the department is not in the cycle of the year (DEPARTMENT_NOT_IN_CYCLE), the deadline has not passed, or a proposal waits (BUDGET.BASELINE_VERSION_NOT_ALLOWED, details.reason).',
      examples: [
        EXAMPLES.FINANCE_SETUP_INCOMPLETE,
        EXAMPLES.PROPOSAL_NOT_SUBMITTED,
        EXAMPLES.CURRENT_EXISTS,
        EXAMPLES.VERSION_IN_FLIGHT,
        EXAMPLES.BASELINE_VERSION_NOT_ALLOWED,
      ],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The body is invalid (VALIDATION_ERROR: the reserve given both as an amount and as a share) or the year has ended (BUDGET.YEAR_ENDED).',
      examples: [VALIDATION_EXAMPLE, EXAMPLES.YEAR_ENDED, ...MONEY_EXAMPLES],
    },
  )
  async create(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: VersionBodyDto) {
    try {
      if (body.source === 'BASELINE') {
        return { version: await this.baselineCreations.create(actor, body) };
      }

      return { version: await this.creations.createFromProposal(actor, body) };
    } catch (error) {
      throw toBudgetApiException(error);
    }
  }

  @Get()
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'budgetVersionList', summary: 'List the versions of the budgets' })
  @ApiSuccessResponse(VersionPageResponseDto, {
    message: 'BUDGET_VERSION.LISTED',
    description: 'Newest year first, then by Cost Center and number.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, READERS_ONLY, INVALID)
  async list(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Query() query: VersionListQueryDto) {
    try {
      return await this.views.list(actor, query);
    } catch (error) {
      throw toBudgetApiException(error);
    }
  }

  @Get(':id/history')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'budgetVersionHistoryList', summary: 'List the edits of a version' })
  @ApiSuccessResponse(BudgetVersionHistoryPageResponseDto, {
    message: 'BUDGET_VERSION.HISTORY_LISTED',
    description:
      'The edits of the figures, of a line and of the lines added or imported, newest first, each with the fields it changed before and after, and who and when. Finance reads it, and so does the person who decides the version.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only Finance and the person who decides the version read its history.',
      examples: [EXAMPLES.NOT_A_HISTORY_READER],
    },
    VERSION_ONLY_NOT_FOUND,
    INVALID,
  )
  async historyOf(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: IdParamDto,
    @Query() query: PageQueryDto,
  ) {
    try {
      return await this.history.list(actor, params.id, query);
    } catch (error) {
      throw toBudgetApiException(error);
    }
  }

  @Get(':id')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'budgetVersionGet', summary: 'Get a version of a budget' })
  @ApiSuccessResponse(VersionResponseDto, {
    message: 'BUDGET_VERSION.FETCHED',
    description:
      'One figure for the year: the base, the reserve and their total, what the Cost Center carries into the year (carriedOverNextYear) with the red flag when the base and the reserve together are below it (belowCarriedOver, never a refusal) and the amount that is missing (carriedOverShortfall), and whether Finance built it from the baseline because the department had no proposal (noProposalSubmitted).',
  })
  @ApiErrorResponses(...AUTH_ERRORS, READERS_ONLY, NOT_FOUND, INVALID)
  async get(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: IdParamDto) {
    try {
      return { version: await this.views.get(actor, params.id) };
    } catch (error) {
      throw toBudgetApiException(error);
    }
  }

  @Put(':id')
  @RequireRoles('FINANCE')
  @ApiOperation({ operationId: 'budgetVersionUpdate', summary: 'Change the figures of a version being built' })
  @ApiSuccessResponse(VersionResponseDto, {
    message: 'BUDGET_VERSION.UPDATED',
    description:
      'The base, and the reserve as a share (reservePercent) or as an amount with its reason, not both; the total is the base and the reserve, one amount for the whole year. A reserve that is still its share of the base follows the base. A draft is saved whatever its figures: the ceiling is checked when it is sent.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, FINANCE_ONLY, NOT_FOUND, NOT_EDITABLE, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description:
      'The body is invalid (VALIDATION_ERROR), the year has ended (BUDGET.YEAR_ENDED) or the base is changed with no reason (BUDGET.BASE_REASON_REQUIRED, `baseReason`).',
    examples: [VALIDATION_EXAMPLE, EXAMPLES.YEAR_ENDED, EXAMPLES.BASE_REASON_REQUIRED, ...MONEY_EXAMPLES],
  })
  async update(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: IdParamDto,
    @Body() body: VersionPatchDto,
  ) {
    try {
      return { version: await this.versions.update(actor, params.id, body) };
    } catch (error) {
      throw toBudgetApiException(error);
    }
  }

  @Post(':id/submission')
  @RequireRoles('FINANCE')
  @ApiOperation({ operationId: 'budgetVersionSend', summary: 'Send a version to the spending approver' })
  @ApiSuccessResponse(VersionResponseDto, {
    message: 'BUDGET_VERSION.SENT',
    description:
      'The version waits for the spending approver. It is sent with one file at least that explains it, and a reserve that is not its share of the base with its reason. The versions of the year (this one in the place of the one of its own Cost Center) must add up to no more than the annual ceiling less the shared-pool reserve of the budget cycle (BUDGET_VERSION.OVER_CEILING, details.overBy).',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    FINANCE_ONLY,
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description: NOT_EDITABLE_DESCRIPTION,
      // The proposal behind a first version was taken back or given back while it was being built.
      examples: [
        EXAMPLES.VERSION_NOT_EDITABLE,
        EXAMPLES.PROPOSAL_NOT_SUBMITTED,
        EXAMPLES.CYCLE_NOT_OPEN,
        EXAMPLES.OVER_ANNUAL_CEILING,
        EXAMPLES.CYCLE_CURRENCY_MISMATCH,
      ],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The version has no file that explains it (BUDGET_VERSION.ATTACHMENT_REQUIRED), a reserve that is not the default share of the organization has no reason (BUDGET.RESERVE_REASON_REQUIRED) or the year has ended (BUDGET.YEAR_ENDED).',
      examples: [
        VALIDATION_EXAMPLE,
        EXAMPLES.ATTACHMENT_REQUIRED,
        EXAMPLES.RESERVE_REASON_REQUIRED,
        EXAMPLES.YEAR_ENDED,
      ],
    },
  )
  async send(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: IdParamDto) {
    try {
      return { version: await this.versions.send(actor, params.id) };
    } catch (error) {
      throw toBudgetApiException(error);
    }
  }

  @Post(':id/decision')
  @AuthenticatedOnly()
  @ApiOperation({ operationId: 'budgetVersionDecide', summary: 'Decide a version of a budget' })
  @ApiSuccessResponse(VersionResponseDto, {
    message: 'BUDGET_VERSION.DECIDED',
    description:
      'The spending approver approves a version that was sent (it becomes the current budget of its Cost Center and year, which has no other current version, and takes the commitments that waited for a budget), or returns it to Finance with the reason that must go with it (RETURN: the version is CHANGES_REQUESTED, Finance changes it and sends it again). There is no refusal. The decision is written as a record that is never changed. No figure is changed here.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description:
        'The caller is not the spending approver (BUDGET.NOT_SPENDING_APPROVER), is the spending approver who sent the proposal behind the version, which nobody then decides (BUDGET.CONFLICT_OF_INTEREST), or built or sent the version (BUDGET.OWN_VERSION).',
      examples: [EXAMPLES.NOT_SPENDING_APPROVER, EXAMPLES.CONFLICT_OF_INTEREST, EXAMPLES.OWN_VERSION],
    },
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'The version was not sent, or was already decided (BUDGET.VERSION_NOT_SENT); an approval checks the annual ceiling again and the versions of the year no longer add up to no more than the ceiling less the shared-pool reserve (BUDGET_VERSION.OVER_CEILING, details.overBy: the version is returned instead) or the cycle is in another currency (BUDGET.CYCLE_CURRENCY_MISMATCH); or the policy has a newer version in force than the checklist answered (POLICY.VERSION_CHANGED), or has no version in force at the step (POLICY.NOT_IN_FORCE).',
      examples: [
        EXAMPLES.VERSION_NOT_SENT,
        EXAMPLES.OVER_ANNUAL_CEILING,
        EXAMPLES.CYCLE_CURRENCY_MISMATCH,
        CHECKLIST_ERROR_EXAMPLES.VERSION_CHANGED,
        CHECKLIST_ERROR_EXAMPLES.NOT_IN_FORCE,
      ],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The decision is invalid (VALIDATION_ERROR): REJECT or REQUEST_CHANGES, which are no longer decisions, a RETURN with no reason and no answer No to take it from, an approval with a reason; the checklist is not answered in full (POLICY.CHECKLIST_INCOMPLETE) or an answer is No and the decision approves (POLICY.CHECKLIST_HAS_NO); or the fiscal year of the version has ended (BUDGET.YEAR_ENDED).',
      examples: [
        VALIDATION_EXAMPLE,
        EXAMPLES.YEAR_ENDED,
        CHECKLIST_ERROR_EXAMPLES.INCOMPLETE,
        CHECKLIST_ERROR_EXAMPLES.HAS_NO,
      ],
    },
  )
  async decide(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: IdParamDto,
    @Body() body: DecisionBodyDto,
  ) {
    try {
      return { version: await this.decisions.decide(actor, params.id, body) };
    } catch (error) {
      throw toChecklistApiException(error) ?? toBudgetApiException(error);
    }
  }
}
