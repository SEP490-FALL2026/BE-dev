import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import { BudgetCycleNotOpenError } from '../budget/budget.errors';
import { BUDGET_ERROR_EXAMPLES, toBudgetApiException } from '../budget/budget.http-errors';
import {
  BudgetAdjustmentBelowForecastError,
  BudgetAdjustmentBudgetInPreparationError,
  BudgetAdjustmentCycleNotLockedError,
  BudgetAdjustmentDecidedError,
  BudgetAdjustmentNoBudgetError,
  BudgetAdjustmentNotFoundError,
  BudgetAdjustmentOverBaseError,
  BudgetAdjustmentOverRemainingError,
  BudgetAdjustmentOverUnallocatedError,
  BudgetAdjustmentShapeError,
  BudgetAdjustmentVersionInFlightError,
} from './budget-adjustment.errors';

const refuse = (
  status: HttpStatus,
  code: string,
  message: string,
  details?: Readonly<Record<string, unknown>>,
): ApiException => new ApiException(status, { code, message, ...(details ? { details } : {}) });

/** Maps the errors of the adjustment routes to their HTTP answers; the others are the budgets' own. */
export function toBudgetAdjustmentApiException(error: unknown): unknown {
  if (error instanceof BudgetAdjustmentNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'BUDGET_ADJUSTMENT.NOT_FOUND', error.message);
  }
  if (error instanceof BudgetAdjustmentShapeError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'BUDGET_ADJUSTMENT.INVALID_SHAPE', error.message, {
      refusal: error.refusal,
    });
  }
  if (error instanceof BudgetAdjustmentOverUnallocatedError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'BUDGET_ADJUSTMENT.OVER_UNALLOCATED', error.message, {
      availableMinor: error.availableMinor.toString(),
      requestedMinor: error.requestedMinor.toString(),
    });
  }
  if (error instanceof BudgetAdjustmentBelowForecastError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'BUDGET_ADJUSTMENT.BELOW_FORECAST_FLOOR', error.message, {
      costCenterId: error.costCenterId,
      floorMinor: error.floorMinor.toString(),
      afterMinor: error.afterMinor.toString(),
    });
  }
  if (error instanceof BudgetAdjustmentOverBaseError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'BUDGET_ADJUSTMENT.OVER_BASE', error.message, {
      costCenterId: error.costCenterId,
      baseMinor: error.baseMinor.toString(),
    });
  }
  if (error instanceof BudgetAdjustmentOverRemainingError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'BUDGET_ADJUSTMENT.OVER_REMAINING', error.message, {
      costCenterId: error.costCenterId,
      remainingMinor: error.remainingMinor.toString(),
      usedMinor: error.usedMinor.toString(),
    });
  }
  if (error instanceof BudgetAdjustmentNoBudgetError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'BUDGET_ADJUSTMENT.NO_BUDGET', error.message, {
      costCenterId: error.costCenterId,
    });
  }
  if (error instanceof BudgetAdjustmentDecidedError) {
    return refuse(HttpStatus.CONFLICT, 'BUDGET_ADJUSTMENT.ALREADY_DECIDED', error.message);
  }
  if (error instanceof BudgetAdjustmentCycleNotLockedError) {
    return refuse(HttpStatus.CONFLICT, 'BUDGET_ADJUSTMENT.CYCLE_NOT_LOCKED', error.message, {
      year: error.year,
      submissionDeadline: error.submissionDeadline,
    });
  }
  if (error instanceof BudgetAdjustmentBudgetInPreparationError) {
    return refuse(HttpStatus.CONFLICT, 'BUDGET_ADJUSTMENT.BUDGET_IN_PREPARATION', error.message, {
      costCenterId: error.costCenterId,
    });
  }
  if (error instanceof BudgetAdjustmentVersionInFlightError) {
    return refuse(HttpStatus.CONFLICT, 'BUDGET_ADJUSTMENT.VERSION_IN_FLIGHT', error.message, {
      costCenterId: error.costCenterId,
    });
  }

  return toBudgetApiException(error);
}

const example = (error: Error) => errorExampleOf(toBudgetAdjustmentApiException(error));
const COST_CENTER = 'cost-center-1';

/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime (OPENAPI-EXAMPLE.1). */
export const BUDGET_ADJUSTMENT_ERROR_EXAMPLES = {
  CYCLE_NOT_OPEN: example(new BudgetCycleNotOpenError(2026)),
  NOT_FOUND: example(new BudgetAdjustmentNotFoundError()),
  INVALID_SHAPE: example(new BudgetAdjustmentShapeError('TO_REQUIRED')),
  OVER_UNALLOCATED: example(new BudgetAdjustmentOverUnallocatedError(29_000_000n, 30_000_000n)),
  BELOW_FORECAST_FLOOR: example(new BudgetAdjustmentBelowForecastError(COST_CENTER, 110_000_000n, 108_000_000n)),
  OVER_BASE: example(new BudgetAdjustmentOverBaseError(COST_CENTER, 180_000_000n)),
  OVER_REMAINING: example(new BudgetAdjustmentOverRemainingError(COST_CENTER, 88_000_000n, 110_000_000n)),
  NO_BUDGET: example(new BudgetAdjustmentNoBudgetError(COST_CENTER)),
  ALREADY_DECIDED: example(new BudgetAdjustmentDecidedError()),
  VERSION_IN_FLIGHT: example(new BudgetAdjustmentVersionInFlightError(COST_CENTER)),
  FINANCE_SETUP_INCOMPLETE: BUDGET_ERROR_EXAMPLES.FINANCE_SETUP_INCOMPLETE,
  CYCLE_NOT_LOCKED: example(new BudgetAdjustmentCycleNotLockedError(2026, '2026-11-30')),
  BUDGET_IN_PREPARATION: example(new BudgetAdjustmentBudgetInPreparationError(COST_CENTER)),
} as const;
