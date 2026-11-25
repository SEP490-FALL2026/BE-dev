import { ApiException } from '../../../infrastructure/http/errors/api.exception';
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
import { WORKSPACE_ERROR_EXAMPLES, toWorkspaceApiException } from './workspace.http-errors';

const answer = (error: Error) => {
  const mapped = toWorkspaceApiException(error) as ApiException;
  const body = mapped.getResponse() as { code: string; details?: Record<string, unknown> };

  return { status: mapped.getStatus(), code: body.code, details: body.details };
};

describe('the answers of the workspace routes', () => {
  it.each([
    [new WorkspaceNotFoundError(), 404, 'WORKSPACE.NOT_FOUND', undefined],
    [new VendorNotFoundError(), 404, 'VENDOR.NOT_FOUND', undefined],
    [new WorkspaceNameTakenError(), 409, 'WORKSPACE.NAME_TAKEN', undefined],
    [new WorkspaceNotResponsibleError(), 403, 'WORKSPACE.NOT_RESPONSIBLE', undefined],
    [
      new WorkspaceStaleError(new Date('2026-01-01T00:00:00.000Z')),
      409,
      'WORKSPACE.STALE',
      { currentUpdatedAt: '2026-01-01T00:00:00.000Z' },
    ],
    [new WorkspaceAdminNotItAdminError('e-1'), 422, 'WORKSPACE.ADMIN_NOT_IT_ADMIN', { employeeId: 'e-1' }],
    [new WorkspacePrimaryOwnerNotAdminError(), 422, 'WORKSPACE.PRIMARY_OWNER_NOT_ADMIN', undefined],
    [new WorkspaceAdminsTooFewError(1, 2), 422, 'WORKSPACE.ADMINS_TOO_FEW', { given: 1, minimum: 2 }],
    [new WorkspaceLimitExceededError('ADMIN'), 422, 'WORKSPACE.LIMIT_EXCEEDED', { role: 'ADMIN' }],
    [new WorkspaceResponsibleNotItAdminError(), 422, 'WORKSPACE.RESPONSIBLE_NOT_IT_ADMIN', undefined],
    [new WorkspaceTextInvalidError(), 422, 'WORKSPACE.TEXT_INVALID', undefined],
  ])('maps %p to %p %p', (error, status, code, details) => {
    expect(answer(error)).toEqual({ status, code, details });
  });

  it('shows an example for each of its answers, under the code the SPEC names', () => {
    expect(Object.keys(WORKSPACE_ERROR_EXAMPLES).sort()).toEqual(
      [
        'ADMINS_TOO_FEW',
        'ADMIN_NOT_IT_ADMIN',
        'LIMIT_EXCEEDED',
        'NAME_TAKEN',
        'NOT_FOUND',
        'NOT_RESPONSIBLE',
        'PRIMARY_OWNER_NOT_ADMIN',
        'RESPONSIBLE_NOT_IT_ADMIN',
        'STALE',
        'TEXT_INVALID',
        'VENDOR_NOT_FOUND',
      ].sort(),
    );
  });
});
