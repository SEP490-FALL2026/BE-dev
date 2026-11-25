import type { RouteErrorStatus } from './openapi-example-manifest';

/**
 * The error codes of the operations redesign wave 3 adds in the tech lane, a part of ROUTE_ERROR_CODES (reached through ROUTE_ERROR_CODES_LICENSING)
 * kept in a file of its own so the manifest stays under the size of a support file.
 */
export const ROUTE_ERROR_CODES_WAVE3_TECH: Readonly<
  Record<string, Partial<Record<RouteErrorStatus, readonly string[]>>>
> = {
  // W3-10: workspaces.
  workspaceGet: { '404': ['WORKSPACE.NOT_FOUND'] },
  workspaceCreate: {
    '404': ['VENDOR.NOT_FOUND'],
    '409': ['WORKSPACE.NAME_TAKEN'],
    '422': ['WORKSPACE.TEXT_INVALID'],
  },
  workspaceUpdate: {
    '403': ['WORKSPACE.NOT_RESPONSIBLE'],
    '404': ['WORKSPACE.NOT_FOUND'],
    '409': ['WORKSPACE.NAME_TAKEN', 'WORKSPACE.STALE'],
    '422': ['WORKSPACE.ADMIN_NOT_IT_ADMIN', 'WORKSPACE.LIMIT_EXCEEDED', 'WORKSPACE.TEXT_INVALID'],
  },
  workspaceAdminsSet: {
    '403': ['WORKSPACE.NOT_RESPONSIBLE'],
    '404': ['WORKSPACE.NOT_FOUND'],
    '409': ['WORKSPACE.STALE'],
    '422': [
      'WORKSPACE.ADMINS_TOO_FEW',
      'WORKSPACE.ADMIN_NOT_IT_ADMIN',
      'WORKSPACE.LIMIT_EXCEEDED',
      'WORKSPACE.PRIMARY_OWNER_NOT_ADMIN',
    ],
  },
  workspaceResponsibleItAdminChange: {
    '404': ['WORKSPACE.NOT_FOUND'],
    '422': ['WORKSPACE.RESPONSIBLE_NOT_IT_ADMIN'],
  },
};
