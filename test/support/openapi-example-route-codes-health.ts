import type { RouteErrorStatus } from './openapi-example-manifest';

/** Part of ROUTE_ERROR_CODES (health), traced on BE `ea73c2f` (25/10/2026): see openapi-example-manifest.ts. */
export const ROUTE_ERROR_CODES_HEALTH: Readonly<Record<string, Partial<Record<RouteErrorStatus, readonly string[]>>>> =
  {
    healthGetLiveness: {
      '500': ['INTERNAL_SERVER_ERROR'],
    },
    healthGetReadiness: {
      '500': ['INTERNAL_SERVER_ERROR'],
      '503': ['SERVICE_UNAVAILABLE'],
    },
  };
