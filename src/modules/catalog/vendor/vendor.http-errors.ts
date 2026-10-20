import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toMoneyApiException } from '../../../infrastructure/http/errors/money-errors';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import {
  TaxProfileRateInvalidError,
  TaxProfileTaxTypeDuplicateError,
  TaxProfileTaxTypeInvalidError,
  TaxProfileTooManyLinesError,
  TaxProfileVendorNotFoundError,
} from '../../finance/finance.errors';
import { VendorNotFoundError } from './vendor.errors';

const refuse = (status: HttpStatus, code: string, message: string, details?: Record<string, unknown>): ApiException =>
  new ApiException(status, { code, message, ...(details ? { details } : {}) });

/** Maps the errors of the vendor routes to their HTTP answers; money errors come from the shared mapper. */
export function toVendorApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;
  if (error instanceof VendorNotFoundError || error instanceof TaxProfileVendorNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'VENDOR.NOT_FOUND', error.message);
  }
  if (error instanceof TaxProfileTaxTypeInvalidError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'VENDOR_TAX_PROFILE.TAX_TYPE_INVALID', error.message);
  }
  if (error instanceof TaxProfileTaxTypeDuplicateError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'VENDOR_TAX_PROFILE.TAX_TYPE_DUPLICATE', error.message);
  }
  if (error instanceof TaxProfileRateInvalidError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'VENDOR_TAX_PROFILE.RATE_INVALID', error.message, {
      taxType: error.taxType,
    });
  }
  if (error instanceof TaxProfileTooManyLinesError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'VENDOR_TAX_PROFILE.TOO_MANY_LINES', error.message);
  }

  const money = toMoneyApiException(error);
  if (money !== error) return money;

  return toUnavailableApiException(error) ?? error;
}
