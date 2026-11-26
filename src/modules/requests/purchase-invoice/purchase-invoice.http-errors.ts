import { HttpStatus } from '@nestjs/common';
import {
  CurrencyNotSupportedError,
  MoneyOutOfRangeError,
  MoneyScaleExceededError,
} from '../../../core/money/money.errors';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toMoneyApiException } from '../../../infrastructure/http/errors/money-errors';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import { PurchaseInvoiceRefusedError, type PurchaseInvoiceRefusal } from './purchase-invoice.errors';

const STATUS: Record<PurchaseInvoiceRefusal, HttpStatus> = {
  LINK_NOT_FOUND: HttpStatus.NOT_FOUND,
  NOT_FOUND: HttpStatus.NOT_FOUND,
  REQUEST_NOT_PURCHASABLE: HttpStatus.CONFLICT,
  SEAT_PURCHASE_REQUIRED: HttpStatus.UNPROCESSABLE_ENTITY,
  SEAT_PURCHASE_INVOICED: HttpStatus.CONFLICT,
  LOT_ALREADY_INVOICED: HttpStatus.CONFLICT,
  LINE_ALREADY_INVOICED: HttpStatus.UNPROCESSABLE_ENTITY,
  INVALID_LINE_SELECTION: HttpStatus.UNPROCESSABLE_ENTITY,
  NO_VENDOR: HttpStatus.UNPROCESSABLE_ENTITY,
  NUMBER_TAKEN: HttpStatus.CONFLICT,
  DOCUMENT_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  NOT_RETURNED: HttpStatus.CONFLICT,
  ALREADY_RESUBMITTED: HttpStatus.CONFLICT,
  SAME_PERSON: HttpStatus.CONFLICT,
  NOT_SUBMITTED: HttpStatus.CONFLICT,
  NO_PLACE: HttpStatus.CONFLICT,
};

/**
 * Maps the refusals of the routes of purchase invoices to their HTTP answers, an amount or a currency that cannot be read to the shared 422 of
 * money, and leaves the rest to the global filters.
 */
export function toPurchaseInvoiceApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;
  if (error instanceof PurchaseInvoiceRefusedError) {
    const details = {
      ...(error.problem ? { reason: error.problem } : {}),
      ...(error.seatPurchaseIds ? { seatPurchaseIds: error.seatPurchaseIds } : {}),
      ...(error.lineIds ? { lineIds: error.lineIds } : {}),
    };

    return new ApiException(STATUS[error.reason], {
      code: `PURCHASE_INVOICE.${error.reason}`,
      message: error.message,
      ...(Object.keys(details).length > 0 ? { details } : {}),
    });
  }

  return toMoneyApiException(error);
}

const example = (error: Error) => errorExampleOf(toPurchaseInvoiceApiException(error));

/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime (OPENAPI-EXAMPLE.1). */
export const PURCHASE_INVOICE_ERROR_EXAMPLES = {
  LINK_NOT_FOUND: example(new PurchaseInvoiceRefusedError('LINK_NOT_FOUND')),
  NOT_FOUND: example(new PurchaseInvoiceRefusedError('NOT_FOUND')),
  REQUEST_NOT_PURCHASABLE: example(new PurchaseInvoiceRefusedError('REQUEST_NOT_PURCHASABLE', 'STATE')),
  SEAT_PURCHASE_REQUIRED: example(
    new PurchaseInvoiceRefusedError('SEAT_PURCHASE_REQUIRED', undefined, { seatPurchaseIds: ['<seat-purchase-id>'] }),
  ),
  SEAT_PURCHASE_INVOICED: example(new PurchaseInvoiceRefusedError('SEAT_PURCHASE_INVOICED')),
  LOT_ALREADY_INVOICED: example(new PurchaseInvoiceRefusedError('LOT_ALREADY_INVOICED')),
  LINE_ALREADY_INVOICED: example(
    new PurchaseInvoiceRefusedError('LINE_ALREADY_INVOICED', undefined, { lineIds: ['<subscription-line-id>'] }),
  ),
  INVALID_LINE_SELECTION: example(new PurchaseInvoiceRefusedError('INVALID_LINE_SELECTION')),
  NO_VENDOR: example(new PurchaseInvoiceRefusedError('NO_VENDOR')),
  NUMBER_TAKEN: example(new PurchaseInvoiceRefusedError('NUMBER_TAKEN')),
  DOCUMENT_INVALID: example(new PurchaseInvoiceRefusedError('DOCUMENT_INVALID', 'NOT_FOUND')),
  NOT_RETURNED: example(new PurchaseInvoiceRefusedError('NOT_RETURNED')),
  ALREADY_RESUBMITTED: example(new PurchaseInvoiceRefusedError('ALREADY_RESUBMITTED')),
  SAME_PERSON: example(new PurchaseInvoiceRefusedError('SAME_PERSON')),
  NOT_SUBMITTED: example(new PurchaseInvoiceRefusedError('NOT_SUBMITTED')),
  NO_PLACE: example(new PurchaseInvoiceRefusedError('NO_PLACE')),
  MONEY_SCALE_EXCEEDED: example(new MoneyScaleExceededError(0, 'netAmount')),
  MONEY_OUT_OF_RANGE: example(new MoneyOutOfRangeError('netAmount')),
  CURRENCY_NOT_SUPPORTED: example(new CurrencyNotSupportedError('ZZZ', 'unitPriceOriginal')),
} as const;
