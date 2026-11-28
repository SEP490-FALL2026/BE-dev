/**
 * Success messages for operations added in W4 C-VIEW, plus 4 existing access-request messages moved from
 * `openapi-example-manifest.ts` so the root manifest stays at or under the 400-line support-file limit.
 */
export const SUCCESS_MESSAGES_W4_C_VIEW: Readonly<Record<string, string>> = {
  accessRequestGet: 'ACCESS_REQUEST.FETCHED',
  accessRequestInternalRegister: 'ACCESS_REQUEST.INTERNAL_SOFTWARE_REGISTERED',
  accessRequestLineCloseForDeparture: 'ACCESS_REQUEST.LINE_CANCELLED',
  accessRequestLineList: 'GROUP_REQUEST.LINES_LISTED',
  requestTicketGet: 'REQUEST_TICKET.FOUND',
};
