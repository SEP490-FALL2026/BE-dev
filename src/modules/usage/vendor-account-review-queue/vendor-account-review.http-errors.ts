import { HttpStatus } from '@nestjs/common';
import { MoneyOutOfRangeError, MoneyScaleExceededError } from '../../../core/money/money.errors';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toMoneyApiException } from '../../../infrastructure/http/errors/money-errors';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import {
  VendorAccountReviewRefusedError,
  type VendorAccountReviewRefusal,
} from '../vendor-account-review/vendor-account-review.errors';

const STATUS: Record<VendorAccountReviewRefusal, HttpStatus> = {
  NOT_FOUND: HttpStatus.NOT_FOUND,
  CASE_NOT_FOUND: HttpStatus.NOT_FOUND,
  ALREADY_DECIDED: HttpStatus.CONFLICT,
  CASE_ALREADY_CLOSED: HttpStatus.CONFLICT,
  NUMBER_TAKEN: HttpStatus.CONFLICT,
  FINANCE_ONLY: HttpStatus.FORBIDDEN,
  DOCUMENT_REQUIRED: HttpStatus.UNPROCESSABLE_ENTITY,
  DOCUMENT_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  RECORD_FIELDS_MISSING: HttpStatus.UNPROCESSABLE_ENTITY,
  RECORD_FIELDS_NOT_ALLOWED: HttpStatus.UNPROCESSABLE_ENTITY,
  AMOUNT_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  NO_VENDOR: HttpStatus.UNPROCESSABLE_ENTITY,
  COST_CENTER_NOT_FOUND: HttpStatus.UNPROCESSABLE_ENTITY,
};

const CODE: Record<VendorAccountReviewRefusal, string> = {
  NOT_FOUND: 'VENDOR_ACCOUNT_DISCREPANCY.NOT_FOUND',
  ALREADY_DECIDED: 'VENDOR_ACCOUNT_DISCREPANCY.ALREADY_DECIDED',
  CASE_NOT_FOUND: 'OUT_OF_PROCESS_CASE.NOT_FOUND',
  CASE_ALREADY_CLOSED: 'OUT_OF_PROCESS_CASE.ALREADY_CLOSED',
  NUMBER_TAKEN: 'OUT_OF_PROCESS_CASE.NUMBER_TAKEN',
  FINANCE_ONLY: 'OUT_OF_PROCESS_CASE.FINANCE_ONLY',
  DOCUMENT_REQUIRED: 'OUT_OF_PROCESS_CASE.DOCUMENT_REQUIRED',
  DOCUMENT_INVALID: 'OUT_OF_PROCESS_CASE.DOCUMENT_INVALID',
  RECORD_FIELDS_MISSING: 'OUT_OF_PROCESS_CASE.RECORD_FIELDS_MISSING',
  RECORD_FIELDS_NOT_ALLOWED: 'OUT_OF_PROCESS_CASE.RECORD_FIELDS_NOT_ALLOWED',
  AMOUNT_INVALID: 'OUT_OF_PROCESS_CASE.AMOUNT_INVALID',
  NO_VENDOR: 'OUT_OF_PROCESS_CASE.NO_VENDOR',
  COST_CENTER_NOT_FOUND: 'OUT_OF_PROCESS_CASE.COST_CENTER_NOT_FOUND',
};

/** Maps the refusals of the review of the accounts at the vendor and of the cases outside the process to their HTTP answers; money errors to the shared 422. */
export function toVendorAccountApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;
  if (error instanceof VendorAccountReviewRefusedError) {
    return new ApiException(STATUS[error.reason], {
      code: CODE[error.reason],
      message: error.message,
      ...(error.problem ? { details: { reason: error.problem } } : {}),
    });
  }

  return toMoneyApiException(error);
}

const example = (error: Error) => errorExampleOf(toVendorAccountApiException(error));

/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime (OPENAPI-EXAMPLE.1). */
export const VENDOR_ACCOUNT_ERROR_EXAMPLES = {
  NOT_FOUND: example(new VendorAccountReviewRefusedError('NOT_FOUND')),
  ALREADY_DECIDED: example(new VendorAccountReviewRefusedError('ALREADY_DECIDED')),
  CASE_NOT_FOUND: example(new VendorAccountReviewRefusedError('CASE_NOT_FOUND')),
  CASE_ALREADY_CLOSED: example(new VendorAccountReviewRefusedError('CASE_ALREADY_CLOSED')),
  NUMBER_TAKEN: example(new VendorAccountReviewRefusedError('NUMBER_TAKEN')),
  FINANCE_ONLY: example(new VendorAccountReviewRefusedError('FINANCE_ONLY')),
  DOCUMENT_REQUIRED: example(new VendorAccountReviewRefusedError('DOCUMENT_REQUIRED')),
  DOCUMENT_INVALID: example(new VendorAccountReviewRefusedError('DOCUMENT_INVALID', 'NOT_FOUND')),
  RECORD_FIELDS_MISSING: example(new VendorAccountReviewRefusedError('RECORD_FIELDS_MISSING')),
  RECORD_FIELDS_NOT_ALLOWED: example(new VendorAccountReviewRefusedError('RECORD_FIELDS_NOT_ALLOWED')),
  AMOUNT_INVALID: example(new VendorAccountReviewRefusedError('AMOUNT_INVALID')),
  NO_VENDOR: example(new VendorAccountReviewRefusedError('NO_VENDOR')),
  COST_CENTER_NOT_FOUND: example(new VendorAccountReviewRefusedError('COST_CENTER_NOT_FOUND')),
  MONEY_SCALE_EXCEEDED: example(new MoneyScaleExceededError(0)),
  MONEY_OUT_OF_RANGE: example(new MoneyOutOfRangeError()),
} as const;
