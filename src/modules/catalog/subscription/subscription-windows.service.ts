import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { OperatingParametersApi } from '../../operating-parameters/public/operating-parameters.api';
import {
  adjustmentPeriodInstantOf,
  type AdjustmentWindows,
  type PeriodStartInput,
} from './obligation/subscription-obligation.policy';

const MONTHLY_KEY = 'SUBSCRIPTION_ADJUSTMENT_DAYS_MONTHLY';
const ANNUAL_KEY = 'SUBSCRIPTION_ADJUSTMENT_DAYS_ANNUAL';
const RED_ALERT_KEY = 'SUBSCRIPTION_RED_ALERT_DAYS_ANNUAL';

/**
 * The most days before the deadline of a plan by the year that a point of adjustment can open: the upper bound of the parameter
 * `SUBSCRIPTION_ADJUSTMENT_DAYS_ANNUAL`, for a read that has to take every subscription whose window could include a day before it knows which.
 */
export const ANNUAL_WINDOW_DAYS_MAX = 180;

/**
 * The days that open the point of adjustment and the red alert of each subscription (`FR-1.4`, `FR-8.2`), as they stood when its period began
 * (`QĐ-106h`): a change of a parameter reaches the periods that begin after it and never moves one that runs. One read of each parameter for any
 * number of subscriptions. The one place the instant of a period is chosen for the badge, the filter by expiry, the alert dates and the sweep.
 */
@Injectable()
export class SubscriptionWindowsService {
  constructor(private readonly parameters: OperatingParametersApi) {}

  /** The windows of each of these subscriptions, by id, for the period each runs in on `today`. */
  async of(
    records: readonly (PeriodStartInput & { id: string })[],
    today: BusinessDate,
    tx?: DbTx,
  ): Promise<Map<string, AdjustmentWindows>> {
    if (records.length === 0) return new Map();
    const instants = records.map((record) => adjustmentPeriodInstantOf(record, today));
    // One after the other: a transaction runs one query at a time on its client.
    const monthly = await this.parameters.getValuesAt(MONTHLY_KEY, instants, tx);
    const annual = await this.parameters.getValuesAt(ANNUAL_KEY, instants, tx);
    const redAlert = await this.parameters.getValuesAt(RED_ALERT_KEY, instants, tx);

    return new Map(
      records.map((record, index) => [
        record.id,
        {
          monthlyDays: Number(monthly[index]),
          annualDays: Number(annual[index]),
          redAlertDaysAnnual: Number(redAlert[index]),
        },
      ]),
    );
  }
}
