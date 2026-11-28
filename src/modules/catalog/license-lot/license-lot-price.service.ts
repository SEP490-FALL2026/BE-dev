import { Injectable } from '@nestjs/common';
import type { Money } from '../../../core/money/money';
import { MoneyOutOfRangeError } from '../../../core/money/money.errors';
import { FinanceApi } from '../../finance/public/finance.api';
import { LicenseLotPriceNotVndError } from './license-lot.errors';

/** The currency a price is entered in: dong. */
const PRICE_CURRENCY = 'VND';

/**
 * Reads the prices of a lot: the price of one license is entered in dong and is not negative; the price the vendor quoted in another currency is only kept, in the
 * minor units of its own currency. The reading of an amount (its scale, its range, its currency) is the finance facade's.
 */
@Injectable()
export class LicenseLotPriceService {
  constructor(private readonly finance: FinanceApi) {}

  /** Throws LicenseLotPriceNotVndError, MoneyScaleExceededError, MoneyOutOfRangeError and CurrencyNotSupportedError. */
  async readUnitPrice(unitPrice: { amount: string; currency: string }, path = 'unitPrice'): Promise<Money> {
    if (unitPrice.currency !== PRICE_CURRENCY) throw new LicenseLotPriceNotVndError(unitPrice.currency);
    const money = await this.finance.parseMoney(unitPrice, path);
    if (money.amountMinor < 0n) throw new MoneyOutOfRangeError(path);

    return money;
  }

  /** The price the vendor quoted, in the minor units of its own currency; not negative. */
  async readOriginal(
    originalPrice: { amount: string; currency: string },
    path = 'originalUnitPrice',
  ): Promise<{ amountMinor: bigint; currency: string }> {
    const money = await this.finance.parseMoney(originalPrice, path);
    if (money.amountMinor < 0n) throw new MoneyOutOfRangeError(path);

    return { amountMinor: money.amountMinor, currency: money.currency };
  }
}
