import type { RouteErrorStatus } from './openapi-example-manifest';

/**
 * Part of ROUTE_ERROR_CODES (optimization), traced on BE `qd103-ghost-seat-g1-g2` (09/11/2026): each code is raised by the use case of the route
 * (`board-query.service.ts`, `board-reclaim.service.ts`, `board-kpi.service.ts`, `decision.service.ts`, `decision-return.service.ts`, `escalation.service.ts`) and mapped in
 * `board.http-errors.ts`, `decision.http-errors.ts` and `escalation.http-errors.ts`.
 */
export const ROUTE_ERROR_CODES_OPTIMIZATION: Readonly<
  Record<string, Partial<Record<RouteErrorStatus, readonly string[]>>>
> = {
  ghostSeatRecommendationGet: { '403': ['GHOST_SEAT.NOT_DECIDER'], '404': ['GHOST_SEAT.NOT_FOUND'] },
  ghostSeatDecisionCreate: {
    '403': ['GHOST_SEAT.NOT_DECIDER'],
    '404': ['GHOST_SEAT.NOT_FOUND'],
    '409': [
      'GHOST_SEAT.NOT_DECIDABLE',
      'GHOST_SEAT.PAUSED',
      'GHOST_SEAT.SEAT_NOT_REVOCABLE',
      'POLICY.NOT_IN_FORCE',
      'POLICY.VERSION_CHANGED',
    ],
    '422': [
      'GHOST_SEAT.EXEMPTION_REQUIRED',
      'GHOST_SEAT.EXEMPTION_TOO_LONG',
      'POLICY.CHECKLIST_HAS_NO',
      'POLICY.CHECKLIST_INCOMPLETE',
    ],
  },
  ghostSeatEscalationCreate: {
    '409': ['GHOST_SEAT.ESCALATION_KEY_REUSED', 'POLICY.NOT_IN_FORCE', 'POLICY.VERSION_CHANGED'],
    '422': ['POLICY.CHECKLIST_HAS_NO', 'POLICY.CHECKLIST_INCOMPLETE'],
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
