import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import {
  ContractNameRequiredError,
  ContractNotFoundError,
  DocumentAccessForbiddenError,
  DocumentAlreadyAttachedError,
  DocumentFileInvalidError,
  DocumentNotAwaitingUploadError,
  DocumentNotFoundError,
  DocumentNotReadyToAttachError,
  DocumentPurposeForbiddenError,
  DocumentPurposeNotAvailableError,
  DocumentTooLargeError,
  DocumentTypeNotAllowedError,
  DocumentUploadExpiredError,
  DocumentUploadMismatchError,
  DocumentUploadPendingError,
} from './contract.errors';

const refuse = (status: HttpStatus, code: string, message: string, details?: Record<string, unknown>): ApiException =>
  new ApiException(status, { code, message, ...(details ? { details } : {}) });

const UNPROCESSABLE = HttpStatus.UNPROCESSABLE_ENTITY;
const CONFLICT = HttpStatus.CONFLICT;
const FORBIDDEN = HttpStatus.FORBIDDEN;

/** Maps the errors of the contract and document routes to their HTTP answers; a storage that cannot answer is a 503. */
export function toContractApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;

  if (error instanceof ContractNotFoundError) return refuse(HttpStatus.NOT_FOUND, 'CONTRACT.NOT_FOUND', error.message);
  if (error instanceof ContractNameRequiredError) return refuse(UNPROCESSABLE, 'CONTRACT.NAME_REQUIRED', error.message);
  if (error instanceof DocumentNotFoundError) return refuse(HttpStatus.NOT_FOUND, 'DOCUMENT.NOT_FOUND', error.message);
  if (error instanceof DocumentAccessForbiddenError) return refuse(FORBIDDEN, 'AUTHORIZATION.FORBIDDEN', error.message);
  if (error instanceof DocumentPurposeForbiddenError) {
    return refuse(FORBIDDEN, 'DOCUMENT.PURPOSE_FORBIDDEN', error.message);
  }
  if (error instanceof DocumentPurposeNotAvailableError) {
    return refuse(CONFLICT, 'DOCUMENT.PURPOSE_NOT_AVAILABLE', error.message, { purpose: error.purpose });
  }
  if (error instanceof DocumentTypeNotAllowedError)
    return refuse(UNPROCESSABLE, 'DOCUMENT.TYPE_NOT_ALLOWED', error.message);
  if (error instanceof DocumentTooLargeError) {
    return refuse(UNPROCESSABLE, 'DOCUMENT.TOO_LARGE', error.message, { maxBytes: error.maxBytes });
  }
  if (error instanceof DocumentFileInvalidError) {
    return refuse(UNPROCESSABLE, 'DOCUMENT.FILE_INVALID', error.message, { problem: error.problem });
  }
  if (error instanceof DocumentUploadMismatchError)
    return refuse(UNPROCESSABLE, 'DOCUMENT.UPLOAD_MISMATCH', error.message);
  if (error instanceof DocumentNotAwaitingUploadError)
    return refuse(CONFLICT, 'DOCUMENT.NOT_AWAITING_UPLOAD', error.message);
  if (error instanceof DocumentUploadPendingError) return refuse(CONFLICT, 'DOCUMENT.UPLOAD_PENDING', error.message);
  if (error instanceof DocumentUploadExpiredError) return refuse(CONFLICT, 'DOCUMENT.UPLOAD_EXPIRED', error.message);
  if (error instanceof DocumentAlreadyAttachedError)
    return refuse(CONFLICT, 'DOCUMENT.ALREADY_ATTACHED', error.message);
  if (error instanceof DocumentNotReadyToAttachError)
    return refuse(CONFLICT, 'DOCUMENT.NOT_READY_TO_ATTACH', error.message);

  return toUnavailableApiException(error) ?? error;
}

const example = (error: Error) => errorExampleOf(toContractApiException(error));

/** The default of the operating parameter DOCUMENT_MAX_SIZE_MB (10 MB), the largest file the example refuses. */
const EXAMPLE_MAX_BYTES = 10 * 1024 * 1024;

/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime. */
export const CONTRACT_ERROR_EXAMPLES = {
  CONTRACT_NOT_FOUND: example(new ContractNotFoundError()),
  NAME_REQUIRED: example(new ContractNameRequiredError()),
  DOCUMENT_NOT_FOUND: example(new DocumentNotFoundError()),
  PURPOSE_FORBIDDEN: example(new DocumentPurposeForbiddenError()),
  PURPOSE_NOT_AVAILABLE: example(new DocumentPurposeNotAvailableError('TAX_PAYMENT_PROOF')),
  TYPE_NOT_ALLOWED: example(new DocumentTypeNotAllowedError()),
  TOO_LARGE: example(new DocumentTooLargeError(EXAMPLE_MAX_BYTES)),
  FILE_INVALID: example(new DocumentFileInvalidError('NAME')),
  UPLOAD_MISMATCH: example(new DocumentUploadMismatchError()),
  NOT_AWAITING_UPLOAD: example(new DocumentNotAwaitingUploadError()),
  UPLOAD_PENDING: example(new DocumentUploadPendingError()),
  UPLOAD_EXPIRED: example(new DocumentUploadExpiredError()),
  ALREADY_ATTACHED: example(new DocumentAlreadyAttachedError()),
  NOT_READY_TO_ATTACH: example(new DocumentNotReadyToAttachError()),
} as const;
