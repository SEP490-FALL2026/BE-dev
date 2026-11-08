import { Body, Controller, Get, HttpStatus, Param, Patch, Post, Put, Query } from '@nestjs/common';
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
import { BUDGET_ERROR_EXAMPLES as EXAMPLES, toBudgetApiException } from '../budget/budget.http-errors';
import {
  CycleListResponseDto,
  CycleResponseDto,
  CycleYearParamDto,
  ListCyclesQueryDto,
  OpenCycleBodyDto,
  SetCeilingsBodyDto,
  UpdateCycleBodyDto,
} from './cycle.dto';
import { CycleService } from './cycle.service';

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
 * The budget cycle of a year (`QĐ-103i`, `BR-MF4-01`, `BR-MF4-02`, `US-06-15`): Finance opens it with the deadlines and the annual
 * ceiling, divides the ceiling among the departments and the shared-pool reserve, and publishes it. The spending approver and Finance
 * read it. The cycle of a year that has passed can only be read.
 */
@ApiTags('budget-cycles')
@Controller({ path: 'budget-cycles', version: '1' })
export class BudgetCyclesController {
  constructor(private readonly cycles: CycleService) {}

  @Post()
  @RequireRoles('FINANCE')
  @ApiOperation({ operationId: 'budgetCycleOpen', summary: 'Open the budget cycle of a year' })
  @ApiSuccessResponse(CycleResponseDto, {
    status: HttpStatus.CREATED,
    message: 'BUDGET_CYCLE.OPENED',
    description:
      'The cycle of the year is opened with its deadlines, the annual ceiling of the software budget and the priorities; the heads of the departments hear it. The current year and the years to come can be opened, once each.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    FINANCE_ONLY,
    {
      status: HttpStatus.CONFLICT,
      description: 'The cycle of that year is already open (BUDGET.CYCLE_EXISTS).',
      examples: [EXAMPLES.CYCLE_EXISTS],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The body is invalid (VALIDATION_ERROR), the year has passed (BUDGET.CYCLE_YEAR_PAST), the decision deadline is before the submission deadline (BUDGET.CYCLE_DEADLINES_INVALID), or the amount is refused (MONEY_SCALE_EXCEEDED, MONEY_OUT_OF_RANGE).',
      examples: [
        VALIDATION_EXAMPLE,
        EXAMPLES.CYCLE_YEAR_PAST,
        EXAMPLES.CYCLE_DEADLINES_INVALID,
        EXAMPLES.MONEY_SCALE_EXCEEDED,
        EXAMPLES.MONEY_OUT_OF_RANGE,
      ],
    },
  )
  async open(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Body() body: OpenCycleBodyDto) {
    try {
      return await this.cycles.open(actor, body);
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
      'A page of the budget cycles of the organization, the latest year first, each with its figures and what is left to allocate; the division of a cycle is read with budgetCycleGet.',
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
      'The cycle of the year: deadlines, annual ceiling, shared-pool reserve, ceilings of the departments and its status.',
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
    summary: 'Change the deadlines, priorities or annual ceiling of a cycle',
  })
  @ApiSuccessResponse(CycleResponseDto, {
    message: 'BUDGET_CYCLE.UPDATED',
    description:
      'The cycle after the change. A new annual ceiling needs the reason and takes the publication back: the division is checked again when Finance publishes. The change is recorded in the Audit Trail with the figures before and after.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, FINANCE_ONLY, NOT_FOUND, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description:
      'The body is invalid (VALIDATION_ERROR), the year has passed (BUDGET.CYCLE_YEAR_PAST), the deadlines are out of order (BUDGET.CYCLE_DEADLINES_INVALID), a new annual ceiling has no reason (BUDGET.CYCLE_REASON_REQUIRED), or the amount is refused.',
    examples: [
      VALIDATION_EXAMPLE,
      EXAMPLES.CYCLE_YEAR_PAST,
      EXAMPLES.CYCLE_DEADLINES_INVALID,
      EXAMPLES.CYCLE_REASON_REQUIRED,
      EXAMPLES.MONEY_SCALE_EXCEEDED,
      EXAMPLES.MONEY_OUT_OF_RANGE,
    ],
  })
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

  @Put(':year/department-ceilings')
  @RequireRoles('FINANCE')
  @ApiOperation({
    operationId: 'budgetDepartmentCeilingsSet',
    summary: 'Divide the annual ceiling among the departments',
  })
  @ApiSuccessResponse(CycleResponseDto, {
    message: 'BUDGET_CYCLE.CEILINGS_SET',
    description:
      'Replaces the ceilings of the departments (three parts each) and the shared-pool reserve. A change of a number (a part of a ceiling, the reserve, a department added or left out) or a ceiling with no explanation unpublishes the cycle, which must be published again; a change of an explanation alone does not. The figures before and after are recorded in the Audit Trail.',
  })
  @ApiErrorResponses(...AUTH_ERRORS, FINANCE_ONLY, NOT_FOUND, {
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description:
      'The body is invalid (VALIDATION_ERROR), the year has passed (BUDGET.CYCLE_YEAR_PAST), a ceiling is for a department that is not among the departments of the year (BUDGET.CEILING_DEPARTMENT_INVALID, details.departmentIds), or an amount is refused.',
    examples: [
      VALIDATION_EXAMPLE,
      EXAMPLES.CYCLE_YEAR_PAST,
      EXAMPLES.CEILING_DEPARTMENT_INVALID,
      EXAMPLES.MONEY_SCALE_EXCEEDED,
      EXAMPLES.MONEY_OUT_OF_RANGE,
    ],
  })
  async setCeilings(
    @CurrentPrincipal() actor: AuthenticatedPrincipal,
    @Param() params: CycleYearParamDto,
    @Body() body: SetCeilingsBodyDto,
  ) {
    try {
      return await this.cycles.setCeilings(actor, params.year, body);
    } catch (error) {
      throw toBudgetApiException(error);
    }
  }

  @Post(':year/publish')
  @RequireRoles('FINANCE')
  @ApiOperation({ operationId: 'budgetCyclePublish', summary: 'Publish the division of a budget cycle' })
  @ApiSuccessResponse(CycleResponseDto, {
    status: HttpStatus.CREATED,
    message: 'BUDGET_CYCLE.PUBLISHED',
    description:
      'The division is published when every department of the year has a ceiling with its explanation, the shared-pool reserve is entered and the ceilings with the reserve are within the annual ceiling. The heads whose ceiling changed hear it. A refused publication is recorded in the Audit Trail.',
  })
  @ApiErrorResponses(
    ...AUTH_ERRORS,
    FINANCE_ONLY,
    NOT_FOUND,
    {
      status: HttpStatus.CONFLICT,
      description:
        'The ceilings and the reserve are more than the annual ceiling (BUDGET.CEILINGS_OVER_ANNUAL, details.gapMinor).',
      examples: [EXAMPLES.CEILINGS_OVER_ANNUAL],
    },
    {
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      description:
        'The year is not a year (VALIDATION_ERROR), it has passed (BUDGET.CYCLE_YEAR_PAST), or the division is not complete (BUDGET.CEILINGS_INCOMPLETE, details.missingDepartmentIds, details.staleDepartmentIds, details.explanationMissingDepartmentIds, details.reserveMissing).',
      examples: [VALIDATION_EXAMPLE, EXAMPLES.CYCLE_YEAR_PAST, EXAMPLES.CEILINGS_INCOMPLETE],
    },
  )
  async publish(@CurrentPrincipal() actor: AuthenticatedPrincipal, @Param() params: CycleYearParamDto) {
    try {
      return await this.cycles.publish(actor, params.year);
    } catch (error) {
      throw toBudgetApiException(error);
    }
  }
}
