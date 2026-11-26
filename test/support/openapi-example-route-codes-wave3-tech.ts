import type { RouteErrorStatus } from './openapi-example-manifest';

/**
 * The error codes of the operations redesign wave 3 adds in the tech lane, a part of ROUTE_ERROR_CODES (reached through ROUTE_ERROR_CODES_LICENSING)
 * kept in a file of its own so the manifest stays under the size of a support file.
 */
export const SUCCESS_MESSAGES_WAVE3_TECH: Readonly<Record<string, string>> = {
  subscriptionLineAdd: 'SUBSCRIPTION_LINE.ADDED',
  subscriptionLineSeatChangeList: 'SUBSCRIPTION_LINE_SEAT_CHANGE.LISTED',
  subscriptionLineSeatCorrection: 'SEAT_CORRECTION.RECORDED',
  subscriptionLineSeatPurchase: 'SEAT_PURCHASE.RECORDED',
  subscriptionLineSeatReduction: 'SEAT_REDUCTION.RECORDED',
  subscriptionLineUpdate: 'SUBSCRIPTION_LINE.UPDATED',
};

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
  // W3-15: subscription lines.
  subscriptionLineAdd: {
    '403': ['SUBSCRIPTION_LINE.NOT_RESPONSIBLE'],
    '404': ['SUBSCRIPTION.NOT_FOUND'],
    '409': ['SUBSCRIPTION.DUPLICATE_PLAN', 'SUBSCRIPTION.LINES_LIMIT', 'SUBSCRIPTION.STALE'],
    '422': [
      'APPLICATION.RETIRED',
      'MONEY_OUT_OF_RANGE',
      'MONEY_SCALE_EXCEEDED',
      'PLAN.NOT_FOUND',
      'SUBSCRIPTION.STILL_DRAFT',
      'SUBSCRIPTION_LINE.NOT_TERM',
      'SUBSCRIPTION_LINE.PLAN_NOT_K2',
      'SUBSCRIPTION_LINE.PRICE_NOT_VND',
      'SUBSCRIPTION_LINE.QUANTITY_VIA_PURCHASE',
      'WORKSPACE_VENDOR_MISMATCH',
    ],
  },
  subscriptionLineUpdate: {
    '403': ['SUBSCRIPTION_LINE.NOT_RESPONSIBLE'],
    '404': ['SUBSCRIPTION_LINE.NOT_FOUND'],
    '409': ['SUBSCRIPTION_LINE.CLOSED', 'SUBSCRIPTION_LINE.STALE'],
    '422': [
      'MONEY_OUT_OF_RANGE',
      'MONEY_SCALE_EXCEEDED',
      'SUBSCRIPTION_LINE.PRICE_NOT_VND',
      'SUBSCRIPTION_LINE.UPDATE_EMPTY',
    ],
  },
  subscriptionLineSeatChangeList: {
    '404': ['SUBSCRIPTION_LINE.NOT_FOUND'],
  },
  // W3-18 & W3-19: batch seat purchases, tier-step, and line-switch on a subscription line.
  subscriptionLineSeatPurchase: {
    '403': ['SEAT_PURCHASE.NOT_IN_CHARGE'],
    '404': ['SUBSCRIPTION_LINE.NOT_FOUND'],
    '409': [
      'EMPLOYEE.NOT_STARTED',
      'SEAT_LEDGER.BELOW_OCCUPANCY',
      'SEAT_PURCHASE.LINE_NOT_PURCHASABLE',
      'SEAT_PURCHASE.STOCK_AVAILABLE',
    ],
    '422': [
      'SEAT_LEDGER.EFFECTIVE_IN_CLOSED_MONTH',
      'SEAT_PURCHASE.ITEM_NOT_PENDING',
      'SEAT_PURCHASE.TIER_STEP_ONE_ITEM',
    ],
  },
  // W3-19: vendor seat corrections and mid-term reductions on a subscription line.
  subscriptionLineSeatCorrection: {
    '403': ['SUBSCRIPTION_LINE.NOT_RESPONSIBLE'],
    '404': ['SUBSCRIPTION_LINE.NOT_FOUND'],
    '409': ['SEAT_LEDGER.BELOW_OCCUPANCY', 'SUBSCRIPTION_LINE.CLOSED', 'SUBSCRIPTION_LINE.STALE'],
    '422': ['SEAT_LEDGER.EFFECTIVE_IN_CLOSED_MONTH'],
  },
  subscriptionLineSeatReduction: {
    '403': ['SUBSCRIPTION_LINE.NOT_RESPONSIBLE'],
    '404': ['SUBSCRIPTION_LINE.NOT_FOUND'],
    '409': [
      'SEAT_LEDGER.BELOW_OCCUPANCY',
      'SEAT_LEDGER.MID_TERM_REDUCTION_NOT_ALLOWED',
      'SEAT_LEDGER.REDUCTION_EXCEEDS_PURCHASE',
      'SUBSCRIPTION_LINE.CLOSED',
      'SUBSCRIPTION_LINE.STALE',
    ],
    '422': ['SEAT_LEDGER.EFFECTIVE_IN_CLOSED_MONTH'],
  },
};
