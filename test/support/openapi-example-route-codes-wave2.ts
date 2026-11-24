import type { RouteErrorStatus } from './openapi-example-manifest';

/**
 * The error codes of the operations redesign wave 2 adds, a part of ROUTE_ERROR_CODES (reached through ROUTE_ERROR_CODES_LICENSING) kept in a
 * file of its own so the manifest stays under the size of a support file.
 */
export const ROUTE_ERROR_CODES_WAVE2: Readonly<Record<string, Partial<Record<RouteErrorStatus, readonly string[]>>>> = {
  // W2-21: the cap of activations of a license key only goes up.
  licenseKeyUpdate: {
    '404': ['LICENSE_KEY.NOT_FOUND'],
    '409': ['LICENSE_KEY.STALE'],
    '422': ['LICENSE_KEY.MAX_ACTIVATIONS_NOT_RAISED'],
  },
  // W2-27 H16: only an IT Admin answers for a subscription.
  subscriptionResponsibleItAdminChange: {
    '404': ['SUBSCRIPTION.NOT_FOUND'],
    '422': ['SUBSCRIPTION.RESPONSIBLE_NOT_IT_ADMIN'],
  },
};
