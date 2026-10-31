import type { RouteErrorStatus } from './openapi-example-manifest';

/** Part of ROUTE_ERROR_CODES (operating parameters), traced on BE `ea73c2f` (25/10/2026): see openapi-example-manifest.ts. */
export const ROUTE_ERROR_CODES_OPERATING_PARAMETERS: Readonly<
  Record<string, Partial<Record<RouteErrorStatus, readonly string[]>>>
> = {
  nonWorkingDateAdd: {
    '409': ['NON_WORKING_DATE.TAKEN'],
    '422': ['NON_WORKING_DATE.IN_PAST', 'NON_WORKING_DATE.REASON_INVALID'],
  },
  nonWorkingDateRemove: {
    '404': ['NON_WORKING_DATE.NOT_FOUND'],
    '422': ['NON_WORKING_DATE.IN_PAST'],
  },
  nonWorkingDateRename: {
    '404': ['NON_WORKING_DATE.NOT_FOUND'],
    '422': ['NON_WORKING_DATE.IN_PAST', 'NON_WORKING_DATE.REASON_INVALID'],
  },
  operatingParameterHistory: {
    '404': ['PARAMETER.NOT_FOUND'],
  },
  operatingParameterSet: {
    '404': ['PARAMETER.NOT_FOUND'],
    '422': ['PARAMETER.VALUE_INVALID'],
  },
  reportingCurrencySet: {
    '409': ['REPORTING_CURRENCY.LOCKED'],
    '422': ['CURRENCY_NOT_SUPPORTED'],
  },
};
