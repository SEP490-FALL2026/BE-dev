import type { RouteErrorStatus } from './openapi-example-manifest';

/** Part of ROUTE_ERROR_CODES (finance), traced on BE `ea73c2f` (25/10/2026): see openapi-example-manifest.ts. */
export const ROUTE_ERROR_CODES_FINANCE: Readonly<Record<string, Partial<Record<RouteErrorStatus, readonly string[]>>>> =
  {
    exchangeRateRecord: {
      '409': ['EXCHANGE_RATE.ALREADY_RECORDED'],
      '422': [
        'CURRENCY_NOT_SUPPORTED',
        'EXCHANGE_RATE.DATE_IN_FUTURE',
        'EXCHANGE_RATE.DATE_TOO_OLD',
        'EXCHANGE_RATE.SAME_AS_REPORTING_CURRENCY',
        'RATE_OUT_OF_RANGE',
        'RATE_SCALE_EXCEEDED',
      ],
    },
  };
