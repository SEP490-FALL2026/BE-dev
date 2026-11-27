import type { BusinessDate } from '../../../../core/business-date';
import type { MonthKpi4Result } from './kpi-missed-adjustment.policy';

export interface LineKpi4Breakdown {
  subscriptionLineId: string;
  planId: string;
  missedSeats: number;
  seatMonths: number;
  amountMinor: bigint;
  months: Array<MonthKpi4Result & { month: BusinessDate }>;
}

export interface SubscriptionKpi4Summary {
  subscriptionId: string;
  totalSeatMonths: number;
  totalAmountMinor: bigint;
  lines: LineKpi4Breakdown[];
}
