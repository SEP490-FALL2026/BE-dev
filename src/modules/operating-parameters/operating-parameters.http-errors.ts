import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../infrastructure/http/errors/api.exception';
import { toMoneyApiException } from '../../infrastructure/http/errors/money-errors';
import { toUnavailableApiException } from '../../infrastructure/http/errors/service-unavailable';
import { errorExampleOf } from '../../infrastructure/http/openapi-error-examples';
import { CurrencyNotSupportedError } from '../../core/money/money.errors';
import {
  NonWorkingDateInPastError,
  NonWorkingDateNotFoundError,
  NonWorkingDateReasonInvalidError,
  NonWorkingDateTakenError,
  ParameterNotFoundError,
  ReportingCurrencyLockedError,
  ParameterValueInvalidError,
} from './operating-parameters.errors';

function refuse(status: HttpStatus, code: string, message: string, details?: Record<string, unknown>): ApiException {
  return new ApiException(status, { code, message, ...(details ? { details } : {}) });
}

/** The one place the errors of the parameter routes become HTTP answers; anything else reaches the global filter. */
export function toOperatingParametersApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;
  if (error instanceof ParameterNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'PARAMETER.NOT_FOUND', error.message);
  }
  if (error instanceof ParameterValueInvalidError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'PARAMETER.VALUE_INVALID', error.message, {
      key: error.key,
      problem: error.problem,
    });
  }
  if (error instanceof NonWorkingDateInPastError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'NON_WORKING_DATE.IN_PAST', error.message, { date: error.date });
  }
  if (error instanceof NonWorkingDateReasonInvalidError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'NON_WORKING_DATE.REASON_INVALID', error.message);
  }
  if (error instanceof NonWorkingDateTakenError) {
    return refuse(HttpStatus.CONFLICT, 'NON_WORKING_DATE.TAKEN', error.message, { date: error.date });
  }
  if (error instanceof NonWorkingDateNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'NON_WORKING_DATE.NOT_FOUND', error.message, { date: error.date });
  }

  if (error instanceof ReportingCurrencyLockedError) {
    return refuse(HttpStatus.CONFLICT, 'REPORTING_CURRENCY.LOCKED', error.message, { reason: error.reason });
  }

  const money = toMoneyApiException(error);
  if (money !== error) return money;

  return toUnavailableApiException(error) ?? error;
}

const example = (error: Error) => errorExampleOf(toOperatingParametersApiException(error));

/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime (OPENAPI-EXAMPLE.1). */
export const OPERATING_PARAMETERS_ERROR_EXAMPLES = {
  PARAMETER_NOT_FOUND: example(new ParameterNotFoundError('<parameter-key>')),
  PARAMETER_VALUE_INVALID: example(new ParameterValueInvalidError('<parameter-key>', 'OUT_OF_RANGE')),
  NON_WORKING_DATE_IN_PAST: example(new NonWorkingDateInPastError('2026-01-01')),
  NON_WORKING_DATE_REASON_INVALID: example(new NonWorkingDateReasonInvalidError()),
  NON_WORKING_DATE_TAKEN: example(new NonWorkingDateTakenError('2026-01-01')),
  NON_WORKING_DATE_NOT_FOUND: example(new NonWorkingDateNotFoundError('2026-01-01')),
  REPORTING_CURRENCY_LOCKED: example(new ReportingCurrencyLockedError('EXCHANGE_RATE')),
  CURRENCY_NOT_SUPPORTED: example(new CurrencyNotSupportedError('XYZ')),
} as const;
