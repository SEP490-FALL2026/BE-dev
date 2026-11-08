import { Controller, Get, HttpStatus, Query } from '@nestjs/common';
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
import {
  BudgetSummaryQueryDto,
  BudgetSummaryResponseDto,
  BudgetTablePageResponseDto,
  BudgetsQueryDto,
  MineLinePageResponseDto,
  MineLinesQueryDto,
  MineQueryDto,
  MineResponseDto,
  MineVersionPageResponseDto,
  MineVersionsQueryDto,
} from '../budget/budget.dto';
import { BudgetViewService } from './budget-view.service';
import { BUDGET_ERROR_EXAMPLES as EXAMPLES, toBudgetApiException } from '../budget/budget.http-errors';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const INVALID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description: 'The query is invalid (VALIDATION_ERROR).',
  examples: [VALIDATION_EXAMPLE],
} as const;
/** The three reads of the caller's own budget also ask which Cost Center when they answer for two that year. */
const MINE_INVALID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  description:
    'The query is invalid (VALIDATION_ERROR), or the caller answers for more than one Cost Center that year and names none (BUDGET.COST_CENTER_REQUIRED).',
  examples: [VALIDATION_EXAMPLE, EXAMPLES.COST_CENTER_REQUIRED],
} as const;
const HEADS_ONLY = {
  status: HttpStatus.FORBIDDEN,
  description: 'The caller heads no department (BUDGET.NOT_YOUR_COST_CENTER).',
  examples: [FORBIDDEN_EXAMPLE, EXAMPLES.NOT_YOUR_COST_CENTER],
} as const;

/**
 * Reading the budgets (`US-06-09` AC-5, `US-06-10` AC-7). A head of department reads the budget of their own department:
 * the proposal, the total and the lines of the current version, never what is left, the checks of requests, other
 * departments or the company. Finance reads the table of all the current versions.
 */
@ApiTags('budgets')
@Controller({ path: 'budgets', version: '1' })
export class BudgetsController {
  constructor(private readonly budgets: BudgetViewService) {}

  @Get('mine')
  @RequireRoles('MANAGER')
  @ApiOperation({ operationId: 'budgetMine', summary: 'Get the budget of my department' })
  @ApiSuccessResponse(MineResponseDto, {
    message: 'BUDGET.FETCHED',
    description:
      'The Cost Center of the department the caller heads, the year, whether it has a current budget (ACTIVE) or not (NO_ACTIVE_BUDGET), the total, and the proposal behind it. No part of this says what is left.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, HEADS_ONLY, MINE_INVALID)
  async mine(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Query() query: MineQueryDto) {
    try {
      return { budget: await this.budgets.mine(actor, query.year, query.costCenterId) };
    } catch (error) {
      throw toBudgetApiException(error);
    }
  }

  @Get('mine/lines')
  @RequireRoles('MANAGER')
  @ApiOperation({ operationId: 'budgetMineLineList', summary: 'List the lines of the budget of my department' })
  @ApiSuccessResponse(MineLinePageResponseDto, {
    message: 'BUDGET.LINES_LISTED',
    description:
      'The lines of the current version: what is planned to be bought, its amount, its window, and whether the window has gone by. Without the comments Finance made.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, HEADS_ONLY, MINE_INVALID)
  async mineLines(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Query() query: MineLinesQueryDto) {
    try {
      return await this.budgets.mineLines(actor, query.year, query);
    } catch (error) {
      throw toBudgetApiException(error);
    }
  }

  @Get('mine/versions')
  @RequireRoles('MANAGER')
  @ApiOperation({ operationId: 'budgetMineVersionList', summary: 'List sent versions for the cost center' })
  @ApiSuccessResponse(MineVersionPageResponseDto, {
    message: 'BUDGET.VERSIONS_LISTED',
    description: 'The sent versions of the Cost Center the caller heads today, newest first, without amounts.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, HEADS_ONLY, MINE_INVALID)
  async mineVersions(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Query() query: MineVersionsQueryDto) {
    try {
      return await this.budgets.mineVersions(actor, query);
    } catch (error) {
      throw toBudgetApiException(error);
    }
  }

  @Get('summary')
  @RequireRoles('FINANCE')
  @ApiOperation({ operationId: 'budgetSummary', summary: 'Get the company-wide budget figures of a year' })
  @ApiSuccessResponse(BudgetSummaryResponseDto, {
    message: 'BUDGET.SUMMARY_FETCHED',
    description:
      'The base, reserve, total, held, spent and remaining of all the current budgets of the year, added up for each currency (keyed by currency code), with the number of Cost Centers and how many are over budget, and when the last invoice was recorded. Only Finance reads it.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only Finance reads the budgets of the company.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    INVALID,
  )
  async summary(@Query() query: BudgetSummaryQueryDto) {
    try {
      return await this.budgets.summary(query.year);
    } catch (error) {
      throw toBudgetApiException(error);
    }
  }

  @Get()
  @RequireRoles('FINANCE')
  @ApiOperation({ operationId: 'budgetTable', summary: 'List the current budgets of all Cost Centers' })
  @ApiSuccessResponse(BudgetTablePageResponseDto, {
    message: 'BUDGET.LISTED',
    description:
      'One row for each Cost Center and year that has a current version. Only Finance reads the company-wide table.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description: 'Only Finance reads the budgets of the company.',
      examples: [FORBIDDEN_EXAMPLE],
    },
    INVALID,
  )
  async table(@Query() query: BudgetsQueryDto) {
    try {
      return await this.budgets.table(query);
    } catch (error) {
      throw toBudgetApiException(error);
    }
  }
}
