import type { RouteErrorStatus } from './openapi-example-manifest';

/**
 * Part of ROUTE_ERROR_CODES (optimization), traced on BE `qd103-ghost-seat-g1-g2` (09/11/2026): each code is raised by the use case of the route
 * (`board-query.service.ts`, `board-reclaim.service.ts`, `board-kpi.service.ts`, `decision.service.ts`, `decision-return.service.ts`) and mapped in
 * `board.http-errors.ts` and `decision.http-errors.ts`.
 */
export const ROUTE_ERROR_CODES_OPTIMIZATION: Readonly<
  Record<string, Partial<Record<RouteErrorStatus, readonly string[]>>>
> = {
  ghostSeatRecommendationGet: { '403': ['GHOST_SEAT.NOT_DECIDER'], '404': ['GHOST_SEAT.NOT_FOUND'] },
  ghostSeatDecisionCreate: {
    '404': ['GHOST_SEAT.NOT_FOUND'],
    '409': ['GHOST_SEAT.PAUSED'],
    '422': ['GHOST_SEAT.EXEMPTION_TOO_LONG'],
  },
  ghostSeatRecommendationReturn: {
    '404': ['GHOST_SEAT.NOT_FOUND'],
    '409': ['GHOST_SEAT.NOT_RETURNABLE', 'GHOST_SEAT.ALREADY_RETURNED', 'GHOST_SEAT.TASK_IN_PROGRESS'],
  },
  ghostSeatRecommendationReclaim: {
    '404': ['GHOST_SEAT.NOT_FOUND'],
    '409': ['GHOST_SEAT.NOT_RECLAIMABLE', 'GHOST_SEAT.SEAT_NOT_REVOCABLE'],
  },
  ghostSeatRuleSkipList: { '404': ['GHOST_SEAT.NOT_FOUND'] },
  ghostSeatKpi5Get: { '422': ['GHOST_SEAT.PERIOD_INVALID'] },
  ghostSeatThresholdSet: {
    '404': ['GHOST_SEAT.APPLICATION_NOT_FOUND'],
    '422': ['GHOST_SEAT.THRESHOLD_ORDER', 'GHOST_SEAT.APPLICATION_INTERNAL'],
  },
  ghostSeatThresholdDelete: { '404': ['GHOST_SEAT.APPLICATION_NOT_FOUND'] },
  // `board-rule-run.service.ts`: another run of the same rules holds the advisory lock (FIX-MF5RUN).
  ghostSeatRuleRunCreate: { '409': ['GHOST_SEAT.RULE_RUN_BUSY'] },
};
