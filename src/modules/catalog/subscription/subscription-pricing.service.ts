import { Injectable } from '@nestjs/common';
import type { Money } from '../../../core/money/money';
import { MoneyOutOfRangeError } from '../../../core/money/money.errors';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { FinanceApi } from '../../finance/public/finance.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { assertPriceInDong, uniformSnapshotOf } from './price/subscription-price.policy';
import type { OriginalPriceRecord, PriceSnapshotRecord, UnitPriceRecord } from './subscription.types';

/**
 * The unit price of a subscription as it is read, recorded and frozen: parsed in dong (the only currency a price is entered in), recorded
 * on the day it is entered and given the snapshot of the same currency (`QĐ-111an`, `ADR-0007`). The price a vendor quoted in another
 * currency is read apart, in its own currency, and only kept. Pure coordination: it stores nothing, converts nothing and reads no exchange
 * rate, and the subscription service keeps the transaction.
 */
@Injectable()
export class SubscriptionPricingService {
  constructor(
    private readonly finance: FinanceApi,
    private readonly organizationReads: OrganizationReadApi,
  ) {}

  /** Reads the unit price in dong; another currency is refused before the amount is read, and a negative price is out of range. */
  async read(unitPrice: { amount: string; currency: string }): Promise<Money> {
    assertPriceInDong(unitPrice.currency);
    const money = await this.finance.parseMoney(unitPrice, 'unitPrice');
    if (money.amountMinor < 0n) throw new MoneyOutOfRangeError('unitPrice');

    return money;
  }

  /** Reads the price the vendor quoted, in the minor units of its own currency; a negative price is out of range. */
  async readOriginal(originalPrice: { amount: string; currency: string }): Promise<OriginalPriceRecord> {
    const money = await this.finance.parseMoney(originalPrice, 'originalPrice');
    if (money.amountMinor < 0n) throw new MoneyOutOfRangeError('originalPrice');

    return { amountMinor: money.amountMinor, currency: money.currency };
  }

  /** The unit price recorded today with the snapshot of the same currency, frozen: no exchange rate is read, so no price is ever left unpriced for want of one. */
  async priceToday(
    tx: DbTx,
    money: Money | null,
  ): Promise<{ unitPrice: UnitPriceRecord | null; priceSnapshot: PriceSnapshotRecord | null }> {
    if (money === null) return { unitPrice: null, priceSnapshot: null };
    const recordedOn = await this.organizationReads.businessToday(undefined, tx);

    return {
      unitPrice: { amountMinor: money.amountMinor, currency: money.currency, recordedOn },
      priceSnapshot: uniformSnapshotOf(money, recordedOn),
    };
  }
}
