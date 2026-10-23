import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
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
