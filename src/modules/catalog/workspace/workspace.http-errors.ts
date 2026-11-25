import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { toUnavailableApiException } from '../../../infrastructure/http/errors/service-unavailable';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import { VendorNotFoundError } from '../vendor/vendor.errors';
import {
  WorkspaceAdminNotItAdminError,
  WorkspaceAdminsTooFewError,
  WorkspaceLimitExceededError,
  WorkspaceNameTakenError,
  WorkspaceNotFoundError,
  WorkspaceNotResponsibleError,
  WorkspacePrimaryOwnerNotAdminError,
  WorkspaceResponsibleNotItAdminError,
  WorkspaceStaleError,
  WorkspaceTextInvalidError,
} from './workspace.errors';

const refuse = (status: HttpStatus, code: string, message: string, details?: Record<string, unknown>): ApiException =>
  new ApiException(status, { code, message, ...(details ? { details } : {}) });

/** Maps the errors of the workspace routes to their HTTP answers; a database that cannot answer is a 503. */
export function toWorkspaceApiException(error: unknown): unknown {
  if (error instanceof ApiException) return error;
  if (error instanceof WorkspaceNotFoundError)
    return refuse(HttpStatus.NOT_FOUND, 'WORKSPACE.NOT_FOUND', error.message);
  if (error instanceof VendorNotFoundError) return refuse(HttpStatus.NOT_FOUND, 'VENDOR.NOT_FOUND', error.message);
  if (error instanceof WorkspaceNameTakenError)
    return refuse(HttpStatus.CONFLICT, 'WORKSPACE.NAME_TAKEN', error.message);
  if (error instanceof WorkspaceNotResponsibleError) {
    return refuse(HttpStatus.FORBIDDEN, 'WORKSPACE.NOT_RESPONSIBLE', error.message);
  }
  if (error instanceof WorkspaceStaleError) {
    return refuse(HttpStatus.CONFLICT, 'WORKSPACE.STALE', error.message, {
      currentUpdatedAt: error.currentUpdatedAt.toISOString(),
    });
  }
  if (error instanceof WorkspaceAdminNotItAdminError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'WORKSPACE.ADMIN_NOT_IT_ADMIN', error.message, {
      employeeId: error.employeeId,
    });
  }
  if (error instanceof WorkspacePrimaryOwnerNotAdminError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'WORKSPACE.PRIMARY_OWNER_NOT_ADMIN', error.message);
  }
  if (error instanceof WorkspaceAdminsTooFewError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'WORKSPACE.ADMINS_TOO_FEW', error.message, {
      given: error.given,
      minimum: error.minimum,
    });
  }
  if (error instanceof WorkspaceLimitExceededError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'WORKSPACE.LIMIT_EXCEEDED', error.message, { role: error.role });
  }
  if (error instanceof WorkspaceResponsibleNotItAdminError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'WORKSPACE.RESPONSIBLE_NOT_IT_ADMIN', error.message);
  }
  if (error instanceof WorkspaceTextInvalidError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'WORKSPACE.TEXT_INVALID', error.message);
  }

  return toUnavailableApiException(error) ?? error;
}

const example = (error: Error) => errorExampleOf(toWorkspaceApiException(error));

/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime. */
export const WORKSPACE_ERROR_EXAMPLES = {
  NOT_FOUND: example(new WorkspaceNotFoundError()),
  VENDOR_NOT_FOUND: example(new VendorNotFoundError()),
  NAME_TAKEN: example(new WorkspaceNameTakenError()),
  NOT_RESPONSIBLE: example(new WorkspaceNotResponsibleError()),
  // The same stand-in date as `SUBSCRIPTION.STALE`: an example never carries a real timestamp.
  STALE: example(new WorkspaceStaleError(new Date('2026-01-01T00:00:00.000Z'))),
  ADMIN_NOT_IT_ADMIN: example(new WorkspaceAdminNotItAdminError('00000000-0000-4000-8000-000000000001')),
  PRIMARY_OWNER_NOT_ADMIN: example(new WorkspacePrimaryOwnerNotAdminError()),
  ADMINS_TOO_FEW: example(new WorkspaceAdminsTooFewError(1, 2)),
  LIMIT_EXCEEDED: example(new WorkspaceLimitExceededError('OWNER')),
  RESPONSIBLE_NOT_IT_ADMIN: example(new WorkspaceResponsibleNotItAdminError()),
  TEXT_INVALID: example(new WorkspaceTextInvalidError()),
} as const;
