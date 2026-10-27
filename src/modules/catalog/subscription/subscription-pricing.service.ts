import { Injectable } from '@nestjs/common';
import type { Money } from '../../../core/money/money';
import { MoneyOutOfRangeError } from '../../../core/money/money.errors';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { FinanceService } from '../../finance/finance.service';
import { OrganizationService } from '../../organization/organization.service';
import { toSnapshot } from './subscription.state';
import type { PriceSnapshotRecord, UnitPriceRecord } from './subscription.types';

/**
 * The unit price of a subscription as it is read, recorded and frozen: parsed in the minor units of its currency, recorded
 * on the day it is entered and converted by the finance facade at the rate of that day (`ADR-0007`, `QĐ-42b`). Pure
 * coordination: it stores nothing, and the subscription service keeps the transaction.
 */
@Injectable()
export class SubscriptionPricingService {
  constructor(
    private readonly finance: FinanceService,
    private readonly organization: OrganizationService,
  ) {}

  /** Reads the unit price in the minor units of its currency; a negative price is out of range. */
  async read(unitPrice: { amount: string; currency: string }): Promise<Money> {
    const money = await this.finance.parseMoney(unitPrice);
    if (money.amountMinor < 0n) throw new MoneyOutOfRangeError();

    return money;
  }

  /**
   * The unit price recorded today and converted at the rate of today, frozen. No rate for today leaves the price with no
   * snapshot (a draft), never a converted value from another day (`QĐ-42b`).
   */
  async priceToday(
    tx: DbTx,
    money: Money | null,
  ): Promise<{ unitPrice: UnitPriceRecord | null; priceSnapshot: PriceSnapshotRecord | null }> {
    if (money === null) return { unitPrice: null, priceSnapshot: null };
    const recordedOn = await this.organization.businessToday(undefined, tx);
    const result = await this.finance.snapshotMoney(tx, money, recordedOn);

    return {
      unitPrice: { amountMinor: money.amountMinor, currency: money.currency, recordedOn },
      priceSnapshot: result.status === 'CONVERTED' ? toSnapshot(result.snapshot) : null,
    };
  }

  /** The conversion of a price recorded earlier, at the rate now entered for the day it was recorded on. */
  async snapshotOfRecorded(tx: DbTx, unitPrice: UnitPriceRecord): Promise<PriceSnapshotRecord | null> {
    const result = await this.finance.snapshotMoney(
      tx,
      { amountMinor: unitPrice.amountMinor, currency: unitPrice.currency },
      unitPrice.recordedOn,
    );

    return result.status === 'CONVERTED' ? toSnapshot(result.snapshot) : null;
  }
}
