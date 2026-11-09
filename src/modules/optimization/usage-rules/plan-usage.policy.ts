import { addDays, type BusinessDate } from '../../../core/business-date';
import type { PlanUsageRate } from '../../catalog/public/catalog.types';
import type { SeatStatus } from '../ghost-seat/ghost-seat-seat-state.repo';

/** The days `KPI-3` looks back over: a seat counts as used when it showed activity in the 30 days that end on the day of the pass (`QĐ-109d`). */
export const KPI3_WINDOW_DAYS = 30;

/** The states that judged the use of a seat; the others (no data, an identity not tied, too little evidence, excluded) say nothing of it. */
const JUDGED: ReadonlySet<SeatStatus> = new Set<SeatStatus>(['ACTIVE', 'INACTIVE']);

/**
 * What one weekly pass found of each plan priced per seat (`KPI-3`, `QĐ-109d`): of the seats of the plan whose use the pass could judge, how
 * many showed activity in the last 30 days. A plan none of whose seats could be judged is left out: it has no figure, never zero. The seats
 * are the ones the pass judged (per seat, no `K4`/`K5`), each chain once; a state of a chain the pass did not judge is ignored.
 */
export function planUsageRatesOf(
  seats: readonly { chainRootId: string; planId: string }[],
  states: readonly { seatChainId: string; status: SeatStatus; lastActiveDate: BusinessDate | null }[],
  today: BusinessDate,
): PlanUsageRate[] {
  const planOfChain = new Map(seats.map((seat) => [seat.chainRootId, seat.planId]));
  const since = addDays(today, -(KPI3_WINDOW_DAYS - 1));
  const byPlan = new Map<string, PlanUsageRate>();
  for (const state of states) {
    const planId = planOfChain.get(state.seatChainId);
    if (planId === undefined || !JUDGED.has(state.status)) continue;
    const rate = byPlan.get(planId) ?? { planId, activeSeats: 0, assessedSeats: 0 };
    rate.assessedSeats += 1;
    if (state.lastActiveDate !== null && state.lastActiveDate >= since && state.lastActiveDate <= today) {
      rate.activeSeats += 1;
    }
    byPlan.set(planId, rate);
  }

  return [...byPlan.values()].sort((a, b) => (a.planId < b.planId ? -1 : a.planId > b.planId ? 1 : 0));
}
