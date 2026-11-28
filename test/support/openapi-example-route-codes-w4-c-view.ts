import type { RouteErrorStatus } from './openapi-example-manifest';

/** Error codes for the ticket detail route added in W4 C-VIEW. */
export const ROUTE_ERROR_CODES_W4_C_VIEW: Readonly<
  Record<string, Partial<Record<RouteErrorStatus, readonly string[]>>>
> = {
  requestTicketGet: {
    '404': ['REQUEST_TICKET.NOT_FOUND'],
  },
};
