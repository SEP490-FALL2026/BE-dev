import type { RouteErrorStatus } from './openapi-example-manifest';

/** Route-specific error codes for W4 C-WITHDRAW (`POST /request-tickets/{id}/withdrawal`). */
export const ROUTE_ERROR_CODES_W4_C_WITHDRAW: Readonly<
  Record<string, Partial<Record<RouteErrorStatus, readonly string[]>>>
> = {
  requestTicketWithdraw: {
    '403': ['REQUEST_TICKET.NOT_REQUESTER'],
    '404': ['REQUEST_TICKET.NOT_FOUND'],
  },
};
