import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
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
import { MAX_VALUES } from './vendor-dictionary.validation';

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

const example = (error: Error) => errorExampleOf(toVendorDictionaryApiException(error));

/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime (OPENAPI-EXAMPLE.1). */
export const VENDOR_DICTIONARY_ERROR_EXAMPLES = {
  GROUP_NOT_FOUND: example(new VendorGroupNotFoundError()),
  SERVICE_LINE_NOT_FOUND: example(new VendorServiceLineNotFoundError()),
  PROPOSAL_NOT_FOUND: example(new VendorProposalNotFoundError()),
  GROUP_NAME_TAKEN: example(new VendorGroupNameTakenError()),
  SERVICE_LINE_NAME_TAKEN: example(new VendorServiceLineNameTakenError()),
  PROPOSAL_ALREADY_RESOLVED: example(new VendorProposalAlreadyResolvedError()),
  NAME_INVALID: example(new VendorNameInvalidError()),
  DOMAIN_INVALID: example(new VendorDomainInvalidError('not a host')),
  PATTERN_INVALID: example(new VendorPatternInvalidError()),
  TOO_MANY_VALUES: example(new VendorTooManyValuesError(MAX_VALUES)),
  UPDATE_EMPTY: example(new VendorUpdateEmptyError()),
  PROPOSAL_RESOLUTION_INVALID: example(new VendorProposalResolutionInvalidError()),
} as const;
