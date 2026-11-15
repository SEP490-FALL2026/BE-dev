import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import { toBudgetApiException } from '../budget/budget.http-errors';
import {
  BudgetAdjustmentBelowForecastError,
  BudgetAdjustmentDecidedError,
  BudgetAdjustmentNoBudgetError,
  BudgetAdjustmentNotFoundError,
  BudgetAdjustmentOverBaseError,
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
  if (error instanceof BudgetAdjustmentNoBudgetError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'BUDGET_ADJUSTMENT.NO_BUDGET', error.message, {
      costCenterId: error.costCenterId,
    });
  }
  if (error instanceof BudgetAdjustmentDecidedError) {
    return refuse(HttpStatus.CONFLICT, 'BUDGET_ADJUSTMENT.ALREADY_DECIDED', error.message);
  }
  if (error instanceof BudgetAdjustmentVersionInFlightError) {
    return refuse(HttpStatus.CONFLICT, 'BUDGET_ADJUSTMENT.VERSION_IN_FLIGHT', error.message, {
      costCenterId: error.costCenterId,
    });
  }

  return toBudgetApiException(error);
}

const example = (error: Error) => errorExampleOf(toBudgetAdjustmentApiException(error));
const COST_CENTER = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';

/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime (OPENAPI-EXAMPLE.1). */
export const BUDGET_ADJUSTMENT_ERROR_EXAMPLES = {
  NOT_FOUND: example(new BudgetAdjustmentNotFoundError()),
  INVALID_SHAPE: example(new BudgetAdjustmentShapeError('TO_REQUIRED')),
  OVER_UNALLOCATED: example(new BudgetAdjustmentOverUnallocatedError(29_000_000n, 30_000_000n)),
  BELOW_FORECAST_FLOOR: example(new BudgetAdjustmentBelowForecastError(COST_CENTER, 110_000_000n, 108_000_000n)),
  OVER_BASE: example(new BudgetAdjustmentOverBaseError(COST_CENTER, 180_000_000n)),
  NO_BUDGET: example(new BudgetAdjustmentNoBudgetError(COST_CENTER)),
  ALREADY_DECIDED: example(new BudgetAdjustmentDecidedError()),
  VERSION_IN_FLIGHT: example(new BudgetAdjustmentVersionInFlightError(COST_CENTER)),
} as const;
