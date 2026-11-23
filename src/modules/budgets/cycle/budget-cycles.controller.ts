import { Body, Controller, Delete, Get, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  ApiErrorResponses,
  FORBIDDEN_EXAMPLE,
  GUARDED_SERVICE_UNAVAILABLE_RESPONSE,
  UNAUTHENTICATED_RESPONSE,
  VALIDATION_EXAMPLE,
} from '../../../infrastructure/http/decorators/api-error-responses.decorator';
import { ApiSuccessResponse } from '../../../infrastructure/http/decorators/api-success-response.decorator';
import { RequireRoles, RequireRolesOrGrants } from '../../../infrastructure/security/decorators/access.decorators';
import { CurrentPrincipal } from '../../../infrastructure/security/models/current-principal';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { BUDGET_ERROR_EXAMPLES as EXAMPLES, toBudgetApiException } from '../budget/budget.http-errors';
import {
  BaselineQueryDto,
  BaselineResponseDto,
  PackageResponseDto,
  CreateCycleBodyDto,
  CycleDeletedResponseDto,
  CycleListResponseDto,
  CycleResponseDto,
  CycleYearParamDto,
  ListCyclesQueryDto,
  UpdateCycleBodyDto,
} from './cycle.dto';
import { BaselineService } from './baseline.service';
import { CycleService } from './cycle.service';
import { PackageService } from './package.service';

const AUTH_ERRORS = [UNAUTHENTICATED_RESPONSE, GUARDED_SERVICE_UNAVAILABLE_RESPONSE] as const;
const FINANCE_ONLY = {
  status: HttpStatus.FORBIDDEN,
  description: 'Only Finance writes the budget cycle.',
  examples: [FORBIDDEN_EXAMPLE],
} as const;
const READERS = {
  status: HttpStatus.FORBIDDEN,
  description: 'Only Finance and the spending approver read the budget cycle.',
  examples: [FORBIDDEN_EXAMPLE],
} as const;
const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  description: 'The budget cycle of the year does not exist (BUDGET.CYCLE_NOT_FOUND).',
  examples: [EXAMPLES.CYCLE_NOT_FOUND],
} as const;

/**
 * The budget cycle of a year (`QĐ-111z`, `QĐ-111aa`, `BR-MF4-01`, `US-06-15`): Finance makes it as a draft with the deadlines, the annual
 * ceiling and the reserve of the shared pool, opens it, and may move the submission deadline and change the two amounts while it is open;
 * from the day after the submission deadline it is locked for good. The spending approver and Finance read it. The cycle of a year that
 * has passed can only be read.
 */
@ApiTags('budget-cycles')
@Controller({ path: 'budget-cycles', version: '1' })
export class BudgetCyclesController {
  constructor(
    private readonly cycles: CycleService,
    private readonly baselines: BaselineService,
    private readonly packages: PackageService,
  ) {}

  @Post()
  @RequireRoles('FINANCE')
  @ApiOperation({ operationId: 'budgetCycleCreate', summary: 'Make the budget cycle of a year as a draft' })
  @ApiSuccessResponse(CycleResponseDto, {
    status: HttpStatus.CREATED,
    message: 'BUDGET_CYCLE.CREATED',
    description:
      'The cycle of the year is made as a draft with its deadlines, the annual ceiling of the software budget, the reserve of the shared pool and the priorities; nobody is told yet. Finance edits or deletes a draft freely and opens it with budgetCycleOpen. The current year and the years to come can be made, once each.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    FINANCE_ONLY,
    {
      status: HttpStatus.CONFLICT,
      description: 'The cycle of that year exists already (BUDGET.CYCLE_EXISTS).',
      examples: [EXAMPLES.CYCLE_EXISTS],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The body is invalid (VALIDATION_ERROR), the year has passed (BUDGET.CYCLE_YEAR_PAST), the decision deadline is before the submission deadline (BUDGET.CYCLE_DEADLINES_INVALID), the shared-pool reserve exceeds the annual ceiling (BUDGET_CYCLE.RESERVE_OVER_CEILING), or the amount is refused (MONEY_SCALE_EXCEEDED, MONEY_OUT_OF_RANGE).',
      examples: [
        VALIDATION_EXAMPLE,
        EXAMPLES.CYCLE_YEAR_PAST,
        EXAMPLES.CYCLE_DEADLINES_INVALID,
        EXAMPLES.CYCLE_RESERVE_OVER_CEILING,
        EXAMPLES.MONEY_SCALE_EXCEEDED,
        EXAMPLES.MONEY_OUT_OF_RANGE,
      ],
    },
  )
  async create(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: CreateCycleBodyDto) {
    try {
      return await this.cycles.create(actor, body);
    } catch (error) {
      throw toBudgetApiException(error);
    }
  }

  @Get()
  @RequireRoles('FINANCE', 'SPENDING_APPROVER')
  @ApiOperation({ operationId: 'budgetCycleList', summary: 'List the budget cycles' })
  @ApiSuccessResponse(CycleListResponseDto, {
    message: 'BUDGET_CYCLE.LISTED',
    description:
      'A page of the budget cycles of the organization, the latest year first, each with its deadlines, its two amounts, what is available to the departments and its status (DRAFT, OPEN or LOCKED).',
  })
  @ApiErrorResponses(...AUTH_ERRORS, READERS, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The query is invalid (VALIDATION_ERROR).',
    examples: [VALIDATION_EXAMPLE],
  })
  async list(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Query() query: ListCyclesQueryDto) {
    try {
      return await this.cycles.list(actor, query);
    } catch (error) {
      throw toBudgetApiException(error);
    }
  }

  @Get(':year')
  @RequireRoles('FINANCE', 'SPENDING_APPROVER')
  @ApiOperation({ operationId: 'budgetCycleGet', summary: 'Get the budget cycle of a year' })
  @ApiSuccessResponse(CycleResponseDto, {
    message: 'BUDGET_CYCLE.FETCHED',
    description:
      'The cycle of the year: deadlines, annual ceiling, shared-pool reserve, what is available to the departments and its status (DRAFT, OPEN or LOCKED).',
  })
  @ApiErrorResponses(...AUTH_ERRORS, READERS, NOT_FOUND, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The year is not a year (VALIDATION_ERROR).',
    examples: [VALIDATION_EXAMPLE],
  })
  async get(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: CycleYearParamDto) {
    try {
      return await this.cycles.get(actor, params.year);
    } catch (error) {
      throw toBudgetApiException(error);
    }
  }

  @Patch(':year')
  @RequireRoles('FINANCE')
  @ApiOperation({
    operationId: 'budgetCycleUpdate',
    summary: 'Change a budget cycle',
  })
  @ApiSuccessResponse(CycleResponseDto, {
    message: 'BUDGET_CYCLE.UPDATED',
    description:
      'The cycle after the change. A draft takes any change. An open cycle moves the submission deadline (to today or later; the heads are told) and changes the annual ceiling or the reserve, each with a reason; the decision deadline and the priorities move freely. From the day after the submission deadline the cycle is locked and takes no change. The figures before and after, and the reason, are recorded in the Audit Trail.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    FINANCE_ONLY,
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'The submission deadline has passed: the cycle is locked and never opens again (BUDGET_CYCLE.LOCKED).',
      examples: [EXAMPLES.CYCLE_LOCKED],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The body is invalid (VALIDATION_ERROR), the year has passed (BUDGET.CYCLE_YEAR_PAST), the deadlines are out of order (BUDGET.CYCLE_DEADLINES_INVALID), the shared-pool reserve exceeds the annual ceiling (BUDGET_CYCLE.RESERVE_OVER_CEILING), an open cycle is moved to a submission deadline before today (BUDGET_CYCLE.DEADLINE_PASSED), an open cycle is changed without the reason (BUDGET.CYCLE_REASON_REQUIRED), or the amount is refused.',
      examples: [
        VALIDATION_EXAMPLE,
        EXAMPLES.CYCLE_YEAR_PAST,
        EXAMPLES.CYCLE_DEADLINES_INVALID,
        EXAMPLES.CYCLE_RESERVE_OVER_CEILING,
        EXAMPLES.CYCLE_DEADLINE_PASSED,
        EXAMPLES.CYCLE_REASON_REQUIRED,
        EXAMPLES.MONEY_SCALE_EXCEEDED,
        EXAMPLES.MONEY_OUT_OF_RANGE,
      ],
    },
  )
  async update(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: CycleYearParamDto,
    @Body() body: UpdateCycleBodyDto,
  ) {
    try {
      return await this.cycles.update(actor, params.year, body);
    } catch (error) {
      throw toBudgetApiException(error);
    }
  }

  @Delete(':year')
  @RequireRoles('FINANCE')
  @ApiOperation({ operationId: 'budgetCycleDelete', summary: 'Delete a draft budget cycle' })
  @ApiSuccessResponse(CycleDeletedResponseDto, {
    message: 'BUDGET_CYCLE.DELETED',
    description:
      'The draft cycle of the year is deleted, and the year can be made again. The deletion is recorded in the Audit Trail.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    FINANCE_ONLY,
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description: 'The cycle was opened: only a draft is deleted (BUDGET_CYCLE.NOT_DRAFT).',
      examples: [EXAMPLES.CYCLE_NOT_DRAFT],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The year is not a year (VALIDATION_ERROR) or it has passed (BUDGET.CYCLE_YEAR_PAST).',
      examples: [VALIDATION_EXAMPLE, EXAMPLES.CYCLE_YEAR_PAST],
    },
  )
  async remove(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: CycleYearParamDto) {
    try {
      return await this.cycles.remove(actor, params.year);
    } catch (error) {
      throw toBudgetApiException(error);
    }
  }

  @Post(':year/opening')
  @RequireRoles('FINANCE')
  @ApiOperation({ operationId: 'budgetCycleOpen', summary: 'Open a draft budget cycle' })
  @ApiSuccessResponse(CycleResponseDto, {
    status: HttpStatus.CREATED,
    message: 'BUDGET_CYCLE.OPENED',
    description:
      'The draft becomes open: the head of each department of the year is told the submission deadline and which form to fill in (the file of the form BM-10 comes from the import templates), with the baseline of the department one call away. From then on the heads submit; the cycle is locked the day after the submission deadline.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    FINANCE_ONLY,
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'The cycle is open already (BUDGET_CYCLE.ALREADY_OPEN) or locked, which is never undone (BUDGET_CYCLE.LOCKED).',
      examples: [EXAMPLES.CYCLE_ALREADY_OPEN, EXAMPLES.CYCLE_LOCKED],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The year is not a year (VALIDATION_ERROR), it has passed (BUDGET.CYCLE_YEAR_PAST), or the submission deadline of the draft is before today and is edited first (BUDGET_CYCLE.DEADLINE_PASSED).',
      examples: [VALIDATION_EXAMPLE, EXAMPLES.CYCLE_YEAR_PAST, EXAMPLES.CYCLE_DEADLINE_PASSED],
    },
  )
  async open(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: CycleYearParamDto) {
    try {
      return await this.cycles.open(actor, params.year);
    } catch (error) {
      throw toBudgetApiException(error);
    }
  }

  @Get(':year/baseline')
  @RequireRolesOrGrants(['FINANCE', 'SPENDING_APPROVER', 'MANAGER'], ['MANAGER'])
  @ApiOperation({ operationId: 'budgetCycleBaseline', summary: 'Read the baseline of a budget cycle' })
  @ApiSuccessResponse(BaselineResponseDto, {
    message: 'BUDGET_CYCLE.BASELINE_FETCHED',
    description:
      'What runs today, department by department: the active subscriptions each owns, the seats held and idle, the price of a seat by the month (an annual price divided by 12), the months of the year it runs and what the year is estimated to cost, the spend of the year so far, and whether a Renew line is suggested. Finance and the spending approver read every department; the head of a department reads their own by naming it (departmentId). KPI-3 is null until usage is collected.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    {
      status: HttpStatus.FORBIDDEN,
      description:
        'The caller is not Finance, the spending approver or a head, or a head asks for a department that is not theirs (BUDGET.NOT_YOUR_COST_CENTER).',
      examples: [FORBIDDEN_EXAMPLE, EXAMPLES.NOT_YOUR_COST_CENTER],
    },
    NOT_FOUND,
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description: 'The year or the query is invalid (VALIDATION_ERROR).',
      examples: [VALIDATION_EXAMPLE],
    },
  )
  async baseline(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: CycleYearParamDto,
    @Query() query: BaselineQueryDto,
  ) {
    try {
      return await this.baselines.read(actor, params.year, query.departmentId);
    } catch (error) {
      throw toBudgetApiException(error);
    }
  }

  @Get(':year/package')
  @RequireRoles('FINANCE', 'SPENDING_APPROVER')
  @ApiOperation({ operationId: 'budgetCyclePackage', summary: 'Read the package of a budget cycle' })
  @ApiSuccessResponse(PackageResponseDto, {
    message: 'BUDGET_CYCLE.PACKAGE_FETCHED',
    description:
      'The year against its annual ceiling: the annual ceiling, the shared-pool reserve, what is available (the ceiling less the reserve), the proposals added up and whether they are over it, the versions counted at the annual check added up with the adjustments approved for them, what is not allocated (what a supplement or a reduction of the annual ceiling may take) and by how much they are over, and for each department its open proposal and the version counted for it (with its origin).',
  })
  @ApiErrorResponses(...AUTH_ERRORS, READERS, NOT_FOUND, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'The year is invalid (VALIDATION_ERROR).',
    examples: [VALIDATION_EXAMPLE],
  })
  async package(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: CycleYearParamDto) {
    try {
      return await this.packages.read(actor, params.year);
    } catch (error) {
      throw toBudgetApiException(error);
    }
  }
}
