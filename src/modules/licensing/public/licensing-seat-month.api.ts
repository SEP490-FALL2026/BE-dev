import { Injectable } from '@nestjs/common';
import { monthBoundsOf, type BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { AssignmentSeatMonthRepo } from '../assignment/assignment-seat-month.repo';
import type { SeatOfMonth } from './licensing-seat-month.types';

/**
 * The licensing facade for the cost of a month of the seats of the shared pool (`SM-1`, `QĐ-103k`): which seats of a `K2` plan were in force on
 * some day of the month. The price of a month belongs to the subscription (catalog) and the department of the holder on each day to the
 * organization; the budgets context puts the three together.
 */
@Injectable()
export class LicensingSeatMonthApi {
  constructor(
    private readonly seats: AssignmentSeatMonthRepo,
    private readonly catalog: CatalogApi,
  ) {}

  /**
   * The seats of the plans of the shared pool of seats (`K2`) on a subscription that are in force on at least one day of the month of `month`
   * (any day of it), by subscription then seat. Two reads for the plans and the seats, whatever their number.
   */
  async getSeatsOfMonth(month: BusinessDate, tx?: DbTx): Promise<SeatOfMonth[]> {
    const { start, nextStart } = monthBoundsOf(month);
    const planIds = await this.seats.planIdsTouching(start, nextStart, tx);
    const pools = (await this.catalog.findPlanSeatTargets(planIds, tx))
      .filter((target) => target.provisioningType === 'K2')
      .map((target) => target.planId);

    return this.seats.seatsOfPlans([...new Set(pools)], start, nextStart, tx);
  }
}
