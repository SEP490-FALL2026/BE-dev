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
  // W3-24: lots of licenses.
  licenseLotCreate: {
    '403': ['LICENSE_LOT.NOT_IN_CHARGE'],
    '404': ['WORKSPACE.NOT_FOUND'],
    '409': ['LICENSE_LOT.REQUEST_HAS_LOT'],
    '422': [
      'LICENSE_LOT.CONTRACT_VENDOR_MISMATCH',
      'LICENSE_LOT.PLAN_NOT_K4',
      'LICENSE_LOT.PRICE_NOT_VND',
      'LICENSE_LOT.PURPOSE_NOT_AVAILABLE',
      'LICENSE_LOT.REQUEST_REQUIRED',
      'LICENSE_LOT.VENDOR_ADMINS_REQUIRED',
      'LICENSE_LOT.WORKSPACE_REQUIRED',
      'LICENSE_LOT.WORKSPACE_VENDOR_MISMATCH',
    ],
  },
  licenseLotGet: { '404': ['LICENSE_LOT.NOT_FOUND'] },
  licenseLotUpdate: {
    '403': ['LICENSE_LOT.NOT_RESPONSIBLE'],
    '404': ['LICENSE_LOT.NOT_FOUND'],
    '409': ['LICENSE_LOT.PRICE_LOCKED', 'LICENSE_LOT.STALE'],
    '422': ['LICENSE_LOT.CONTRACT_REASON_REQUIRED', 'LICENSE_LOT.CONTRACT_VENDOR_MISMATCH'],
  },
  licenseLotKeyImport: {
    '403': ['LICENSE_LOT.NOT_RESPONSIBLE'],
    '404': ['LICENSE_LOT.NOT_FOUND'],
    '409': ['LICENSE_KEY.INITIALIZATION_CLOSED'],
    '422': [
      'LICENSE_KEY.APPLICATION_RETIRED',
      'LICENSE_KEY.INITIAL_ACTIVATIONS_EXCEED_MAX',
      'LICENSE_KEY.INITIAL_ACTIVATIONS_ON_ACCOUNT_PLAN',
      'LICENSE_KEY.PLAN_HAS_NO_KEYS',
      'LICENSE_LOT.KEYS_EXCEED_LICENSES',
    ],
  },
  licenseLotResponsibleItAdminChange: {
    '404': ['LICENSE_LOT.NOT_FOUND'],
    '422': ['LICENSE_LOT.RESPONSIBLE_NOT_IT_ADMIN'],
  },
};
