import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import {
  VendorDomainInvalidError,
  VendorGroupNameTakenError,
  VendorGroupNotFoundError,
  VendorNameInvalidError,
  VendorPatternInvalidError,
  VendorProposalAlreadyResolvedError,
  VendorProposalNotFoundError,
  VendorProposalResolutionInvalidError,
  VendorServiceLineNameTakenError,
  VendorServiceLineNotFoundError,
  VendorTooManyValuesError,
  VendorUpdateEmptyError,
} from './vendor-dictionary.errors';

const refuse = (status: HttpStatus, code: string, message: string, details?: Record<string, unknown>): ApiException =>
  new ApiException(status, { code, message, ...(details ? { details } : {}) });

/**
 * Maps the errors of the vendor dictionary routes to their HTTP answers. A database that cannot answer is a 503;
 * anything else is returned unchanged for the global filter.
 */
export function toVendorDictionaryApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;

  if (error instanceof VendorGroupNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'VENDOR_DICTIONARY.GROUP_NOT_FOUND', error.message);
  }
  if (error instanceof VendorServiceLineNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'VENDOR_DICTIONARY.SERVICE_LINE_NOT_FOUND', error.message);
  }
  if (error instanceof VendorProposalNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'VENDOR_DICTIONARY.PROPOSAL_NOT_FOUND', error.message);
  }
  if (error instanceof VendorGroupNameTakenError) {
    return refuse(HttpStatus.CONFLICT, 'VENDOR_DICTIONARY.GROUP_NAME_TAKEN', error.message);
  }
  if (error instanceof VendorServiceLineNameTakenError) {
    return refuse(HttpStatus.CONFLICT, 'VENDOR_DICTIONARY.SERVICE_LINE_NAME_TAKEN', error.message);
  }
  if (error instanceof VendorProposalAlreadyResolvedError) {
    return refuse(HttpStatus.CONFLICT, 'VENDOR_DICTIONARY.PROPOSAL_ALREADY_RESOLVED', error.message);
  }
  if (error instanceof VendorNameInvalidError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'VENDOR_DICTIONARY.NAME_INVALID', error.message);
  }
  if (error instanceof VendorDomainInvalidError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'VENDOR_DICTIONARY.DOMAIN_INVALID', error.message, {
      value: error.value,
    });
  }
  if (error instanceof VendorPatternInvalidError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'VENDOR_DICTIONARY.PATTERN_INVALID', error.message);
  }
  if (error instanceof VendorTooManyValuesError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'VENDOR_DICTIONARY.TOO_MANY_VALUES', error.message, {
      limit: error.limit,
    });
  }
  if (error instanceof VendorUpdateEmptyError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'VENDOR_DICTIONARY.UPDATE_EMPTY', error.message);
  }
  if (error instanceof VendorProposalResolutionInvalidError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'VENDOR_DICTIONARY.PROPOSAL_RESOLUTION_INVALID', error.message);
  }

  return toUnavailableApiException(error) ?? error;
}
