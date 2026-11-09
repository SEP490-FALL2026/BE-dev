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
import { LineImportService } from './line-import.service';
import { VersionLineService } from './version-line.service';
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
/** Every route of this controller that names an id reaches only the version: none of them reads a line by position. */
const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The version or the line does not exist (BUDGET.VERSION_NOT_FOUND, BUDGET.LINE_NOT_FOUND).',
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
 * The versions of a budget as Finance builds them (`US-06-09`): a first version from the proposal that waits, lines adjusted
 * with a comment and a reason, a forecast by quarter that never limits a payment, a file of lines, and the sending to the
 * spending approver. Only Finance does this: the head, the IT Admin, the Super Admin and
 * the spending approver cannot, and nobody here makes a version current.
 */
@ApiTags('budget-versions')
@Controller({ path: 'budget-versions', version: '1' })
export class BudgetVersionsController {
  constructor(
    private readonly versions: VersionService,
    private readonly creations: VersionCreationService,
    private readonly lineOps: VersionLineService,
    private readonly decisions: VersionDecisionService,
    private readonly views: VersionViewService,
    private readonly history: VersionHistoryViewService,
    private readonly imports: LineImportService,
  ) {}

  @Post()
  @RequireRoles('FINANCE')
  @ApiOperation({ operationId: 'budgetVersionCreate', summary: 'Build the first version of a budget from a proposal' })
  @ApiSuccessResponse(VersionResponseDto, {
    status: HttpStatus.CREATED,
    message: 'BUDGET_VERSION.CREATED',
    description:
      'A draft with the base and the reserve (the default share of the base unless Finance gives another with its reason), and the lines of the proposal copied to be reviewed; the proposal itself is not changed. A proposal whose latest version was refused is made again the same way: the new draft points at the refused one (rejectedPredecessorId).',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    FINANCE_ONLY,
    {
      status: HttpStatus.NOT_FOUND,
      description: 'The proposal does not exist (BUDGET.PROPOSAL_NOT_FOUND).',
      examples: [EXAMPLES.PROPOSAL_NOT_FOUND],
    },
    {
      status: HttpStatus.CONFLICT,
      description:
        'The proposal is neither waiting nor reviewed with its latest version refused and nobody following it (BUDGET.PROPOSAL_NOT_SUBMITTED), the Cost Center is no longer in use (FINANCE.SETUP_INCOMPLETE), has a current budget (BUDGET.CURRENT_EXISTS) or a version in progress (BUDGET.VERSION_IN_FLIGHT).',
      // CURRENT_EXISTS is not shown: a current budget keeps the proposal behind it REVIEWED, so none can wait beside it.
      examples: [EXAMPLES.FINANCE_SETUP_INCOMPLETE, EXAMPLES.PROPOSAL_NOT_SUBMITTED, EXAMPLES.VERSION_IN_FLIGHT],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The body is invalid (VALIDATION_ERROR), the year has ended (BUDGET.YEAR_ENDED) or the quarters do not add up to the total (BUDGET.QUARTERS_MISMATCH).',
      examples: [VALIDATION_EXAMPLE, EXAMPLES.YEAR_ENDED, EXAMPLES.QUARTERS_MISMATCH, ...MONEY_EXAMPLES],
    },
  )
  async create(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: VersionBodyDto) {
    try {
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
    description: 'The version without its lines, which are a paged list of their own.',
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
      'The base, the reserve with its reason, and the forecast by quarter; the total is the base and the reserve. A reserve that is still the default share of the base follows the base. The quarters add up to the total or nothing is saved.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, FINANCE_ONLY, NOT_FOUND, NOT_EDITABLE, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description:
      'The body is invalid (VALIDATION_ERROR), the year has ended (BUDGET.YEAR_ENDED) or the quarters do not add up (BUDGET.QUARTERS_MISMATCH).',
    examples: [VALIDATION_EXAMPLE, EXAMPLES.YEAR_ENDED, EXAMPLES.QUARTERS_MISMATCH, ...MONEY_EXAMPLES],
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
      'The version waits for the spending approver. A reserve that is not the default share of the base is sent with its reason.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    FINANCE_ONLY,
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description: NOT_EDITABLE_DESCRIPTION,
      // The proposal behind a first version was taken back or given back while it was being built.
      examples: [EXAMPLES.VERSION_NOT_EDITABLE, EXAMPLES.PROPOSAL_NOT_SUBMITTED],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'A reserve that is not the default share of the base has no reason (BUDGET.RESERVE_REASON_REQUIRED) or the year has ended (BUDGET.YEAR_ENDED).',
      examples: [VALIDATION_EXAMPLE, EXAMPLES.RESERVE_REASON_REQUIRED, EXAMPLES.YEAR_ENDED],
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
      'The spending approver approves a version that was sent (it becomes the current budget of its Cost Center and year, replaces the one that was current, and takes the commitments that waited for a budget), refuses it with a reason, or sends it back to Finance with a reason. The decision is written as a record that is never changed. No figure is changed here.',
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
      description: 'The version was not sent, or was already decided (BUDGET.VERSION_NOT_SENT).',
      examples: [EXAMPLES.VERSION_NOT_SENT],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The decision is invalid (VALIDATION_ERROR): a refusal or a request to look again without its reason, an approval with one; or the fiscal year of the version has ended (BUDGET.YEAR_ENDED).',
      examples: [VALIDATION_EXAMPLE, EXAMPLES.YEAR_ENDED],
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
      throw toBudgetApiException(error);
    }
  }
}
