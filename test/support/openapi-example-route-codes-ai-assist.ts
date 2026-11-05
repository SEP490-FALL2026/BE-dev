import type { RouteErrorStatus } from './openapi-example-manifest';

/** Part of ROUTE_ERROR_CODES (AI summary of the approval queue, `US-15-05`), traced on BE `6e7bb09` plus the working tree (04/11/2026): see openapi-example-manifest.ts. */
export const ROUTE_ERROR_CODES_AI_ASSIST: Readonly<
  Record<string, Partial<Record<RouteErrorStatus, readonly string[]>>>
> = {
  aiAccessRequestSummaryCreate: {
    '403': ['AI.DISABLED', 'AI.NO_ASSIGNED_STEPS'],
    '409': ['AI.SOURCE_STALE'],
    '503': ['AI.PROVIDER_UNAVAILABLE'],
  },
  aiAccessRequestSummaryGet: {
    '404': ['AI.NOT_FOUND'],
  },
  aiAccessRequestSummarySource: {
    '403': ['AI.DISABLED'],
  },
  aiInvocationContentGet: {
    '404': ['AI.NOT_FOUND'],
  },
};
