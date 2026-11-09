import type { RouteErrorStatus } from './openapi-example-manifest';

/**
 * Part of ROUTE_ERROR_CODES (optimization), traced on BE `qd103-ghost-seat-g1-g2` (09/11/2026): each code is raised by the use case of the route
 * (`board-query.service.ts`, `board-reclaim.service.ts`, `board-kpi.service.ts`) and mapped in `board.http-errors.ts`.
 */
export const ROUTE_ERROR_CODES_OPTIMIZATION: Readonly<
  Record<string, Partial<Record<RouteErrorStatus, readonly string[]>>>
> = {
  ghostSeatRecommendationGet: { '404': ['GHOST_SEAT.NOT_FOUND'] },
  ghostSeatRecommendationReclaim: {
    '404': ['GHOST_SEAT.NOT_FOUND'],
    '409': ['GHOST_SEAT.NOT_RECLAIMABLE', 'GHOST_SEAT.SEAT_NOT_REVOCABLE'],
  },
  ghostSeatRuleSkipList: { '404': ['GHOST_SEAT.NOT_FOUND'] },
  ghostSeatKpi5Get: { '422': ['GHOST_SEAT.PERIOD_INVALID'] },
};
