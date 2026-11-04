import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import { toBudgetApiException } from '../budget/budget.http-errors';
import {
  BudgetAttachmentAlreadyRemovedError,
  BudgetAttachmentFileInvalidError,
  BudgetAttachmentForbiddenRoleError,
  BudgetAttachmentLimitReachedError,
  BudgetAttachmentNotAReaderError,
  BudgetAttachmentNotAttachableError,
  BudgetAttachmentNotAwaitingUploadError,
  BudgetAttachmentNotDiscardableError,
  BudgetAttachmentNotFoundError,
  BudgetAttachmentTooLargeError,
  BudgetAttachmentTypeNotAllowedError,
  BudgetAttachmentUploadExpiredError,
  BudgetAttachmentUploadMismatchError,
  BudgetAttachmentUploadPendingError,
} from './budget-attachment.errors';
import { ALLOWED_EXTENSIONS } from './budget-attachment.policy';

const refuse = (
  status: HttpStatus,
  code: string,
  message: string,
  details?: Readonly<Record<string, unknown>>,
): ApiException => new ApiException(status, { code, message, ...(details ? { details } : {}) });

export function toBudgetAttachmentApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;

  if (error instanceof BudgetAttachmentNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'BUDGET_ATTACHMENT.NOT_FOUND', error.message);
  }
  if (error instanceof BudgetAttachmentNotAReaderError || error instanceof BudgetAttachmentForbiddenRoleError) {
    return refuse(HttpStatus.FORBIDDEN, 'AUTHORIZATION.FORBIDDEN', error.message);
  }
  if (error instanceof BudgetAttachmentFileInvalidError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'BUDGET_ATTACHMENT.FILE_INVALID', error.message, {
      problem: error.problem,
    });
  }
  if (error instanceof BudgetAttachmentTypeNotAllowedError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'BUDGET_ATTACHMENT.TYPE_NOT_ALLOWED', error.message, {
      allowed: error.allowed,
    });
  }
  if (error instanceof BudgetAttachmentTooLargeError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'BUDGET_ATTACHMENT.TOO_LARGE', error.message, {
      maxBytes: error.maxBytes,
    });
  }
  if (error instanceof BudgetAttachmentUploadMismatchError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'BUDGET_ATTACHMENT.UPLOAD_MISMATCH', error.message);
  }
  if (error instanceof BudgetAttachmentNotAttachableError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'BUDGET_ATTACHMENT.NOT_ATTACHABLE', error.message, {
      attachmentIds: error.attachmentIds,
    });
  }
  if (error instanceof BudgetAttachmentLimitReachedError) {
    return refuse(HttpStatus.CONFLICT, 'BUDGET_ATTACHMENT.LIMIT_REACHED', error.message, {
      limit: error.limit,
    });
  }
  if (error instanceof BudgetAttachmentNotAwaitingUploadError) {
    return refuse(HttpStatus.CONFLICT, 'BUDGET_ATTACHMENT.NOT_AWAITING_UPLOAD', error.message);
  }
  if (error instanceof BudgetAttachmentUploadPendingError) {
    return refuse(HttpStatus.CONFLICT, 'BUDGET_ATTACHMENT.UPLOAD_PENDING', error.message);
  }
  if (error instanceof BudgetAttachmentUploadExpiredError) {
    return refuse(HttpStatus.CONFLICT, 'BUDGET_ATTACHMENT.UPLOAD_EXPIRED', error.message);
  }
  if (error instanceof BudgetAttachmentAlreadyRemovedError) {
    return refuse(HttpStatus.CONFLICT, 'BUDGET_ATTACHMENT.ALREADY_REMOVED', error.message);
  }
  if (error instanceof BudgetAttachmentNotDiscardableError) {
    return refuse(HttpStatus.CONFLICT, 'BUDGET_ATTACHMENT.NOT_DISCARDABLE', error.message, {
      status: error.status,
    });
  }

  const budgetApi = toBudgetApiException(error);
  if (budgetApi !== error) return budgetApi;

  return toUnavailableApiException(error) ?? error;
}

const example = (error: Error) => errorExampleOf(toBudgetAttachmentApiException(error));

export const BUDGET_ATTACHMENT_ERROR_EXAMPLES = {
  NOT_FOUND: example(new BudgetAttachmentNotFoundError()),
  NOT_A_READER: example(new BudgetAttachmentNotAReaderError()),
  FILE_INVALID_NAME: example(new BudgetAttachmentFileInvalidError('NAME')),
  FILE_INVALID_EMPTY: example(new BudgetAttachmentFileInvalidError('EMPTY')),
  TYPE_NOT_ALLOWED: example(new BudgetAttachmentTypeNotAllowedError(ALLOWED_EXTENSIONS)),
  TOO_LARGE: example(new BudgetAttachmentTooLargeError(10 * 1024 * 1024)),
  UPLOAD_MISMATCH: example(new BudgetAttachmentUploadMismatchError()),
  NOT_ATTACHABLE: example(new BudgetAttachmentNotAttachableError(['<attachment-id>'])),
  LIMIT_REACHED: example(new BudgetAttachmentLimitReachedError(20)),
  NOT_AWAITING_UPLOAD: example(new BudgetAttachmentNotAwaitingUploadError()),
  UPLOAD_PENDING: example(new BudgetAttachmentUploadPendingError()),
  UPLOAD_EXPIRED: example(new BudgetAttachmentUploadExpiredError()),
  ALREADY_REMOVED: example(new BudgetAttachmentAlreadyRemovedError()),
  NOT_DISCARDABLE: example(new BudgetAttachmentNotDiscardableError('ATTACHED')),
} as const;
