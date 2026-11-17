import { HttpStatus } from '@nestjs/common';
import { MoneyOutOfRangeError, MoneyScaleExceededError } from '../../../core/money/money.errors';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toMoneyApiException } from '../../../infrastructure/http/errors/money-errors';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import {
  InvoiceDiscrepancyRefusedError,
  type InvoiceDiscrepancyRefusal,
} from '../invoice-discrepancy/invoice-discrepancy.errors';

const STATUS: Record<InvoiceDiscrepancyRefusal, HttpStatus> = {
  NOT_FOUND: HttpStatus.NOT_FOUND,
  ALREADY_CLOSED: HttpStatus.CONFLICT,
  DIFFERENCE_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
};

/** Maps the refusals of the routes of the cases of invoices that differ to their HTTP answers and leaves the rest to the global filters. */
export function toInvoiceDiscrepancyApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;
  if (error instanceof InvoiceDiscrepancyRefusedError) {
    return new ApiException(STATUS[error.reason], {
      code: `INVOICE_DISCREPANCY.${error.reason}`,
      message: error.message,
    });
  }

  return toMoneyApiException(error);
}

const example = (error: Error) => errorExampleOf(toInvoiceDiscrepancyApiException(error));

/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime (OPENAPI-EXAMPLE.1). */
export const INVOICE_DISCREPANCY_ERROR_EXAMPLES = {
  NOT_FOUND: example(new InvoiceDiscrepancyRefusedError('NOT_FOUND')),
  ALREADY_CLOSED: example(new InvoiceDiscrepancyRefusedError('ALREADY_CLOSED')),
  DIFFERENCE_INVALID: example(new InvoiceDiscrepancyRefusedError('DIFFERENCE_INVALID')),
  MONEY_SCALE_EXCEEDED: example(new MoneyScaleExceededError(0, 'differenceAmount')),
  MONEY_OUT_OF_RANGE: example(new MoneyOutOfRangeError('differenceAmount')),
} as const;
