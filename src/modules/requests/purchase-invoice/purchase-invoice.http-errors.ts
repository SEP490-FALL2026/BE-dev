import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import { PurchaseInvoiceRefusedError, type PurchaseInvoiceRefusal } from './purchase-invoice.errors';

const STATUS: Record<PurchaseInvoiceRefusal, HttpStatus> = {
  LINK_NOT_FOUND: HttpStatus.NOT_FOUND,
  NOT_FOUND: HttpStatus.NOT_FOUND,
  REQUEST_NOT_PURCHASABLE: HttpStatus.CONFLICT,
  NO_VENDOR: HttpStatus.UNPROCESSABLE_ENTITY,
  NUMBER_TAKEN: HttpStatus.CONFLICT,
  DOCUMENT_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  NOT_RETURNED: HttpStatus.CONFLICT,
  ALREADY_RESUBMITTED: HttpStatus.CONFLICT,
  SAME_PERSON: HttpStatus.CONFLICT,
  NOT_SUBMITTED: HttpStatus.CONFLICT,
  NO_PLACE: HttpStatus.CONFLICT,
};

/** Maps the refusals of the routes of purchase invoices to their HTTP answers and leaves the rest to the global filters. */
export function toPurchaseInvoiceApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;
  if (error instanceof PurchaseInvoiceRefusedError) {
    return new ApiException(STATUS[error.reason], {
      code: `PURCHASE_INVOICE.${error.reason}`,
      message: error.message,
      ...(error.problem ? { details: { reason: error.problem } } : {}),
    });
  }

  return error;
}

const example = (error: Error) => errorExampleOf(toPurchaseInvoiceApiException(error));

/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime (OPENAPI-EXAMPLE.1). */
export const PURCHASE_INVOICE_ERROR_EXAMPLES = {
  LINK_NOT_FOUND: example(new PurchaseInvoiceRefusedError('LINK_NOT_FOUND')),
  NOT_FOUND: example(new PurchaseInvoiceRefusedError('NOT_FOUND')),
  REQUEST_NOT_PURCHASABLE: example(new PurchaseInvoiceRefusedError('REQUEST_NOT_PURCHASABLE', 'STATE')),
  NO_VENDOR: example(new PurchaseInvoiceRefusedError('NO_VENDOR')),
  NUMBER_TAKEN: example(new PurchaseInvoiceRefusedError('NUMBER_TAKEN')),
  DOCUMENT_INVALID: example(new PurchaseInvoiceRefusedError('DOCUMENT_INVALID', 'NOT_FOUND')),
  NOT_RETURNED: example(new PurchaseInvoiceRefusedError('NOT_RETURNED')),
  ALREADY_RESUBMITTED: example(new PurchaseInvoiceRefusedError('ALREADY_RESUBMITTED')),
  SAME_PERSON: example(new PurchaseInvoiceRefusedError('SAME_PERSON')),
  NOT_SUBMITTED: example(new PurchaseInvoiceRefusedError('NOT_SUBMITTED')),
  NO_PLACE: example(new PurchaseInvoiceRefusedError('NO_PLACE')),
} as const;
