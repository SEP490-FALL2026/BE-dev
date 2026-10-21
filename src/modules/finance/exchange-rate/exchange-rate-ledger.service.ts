import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { ScaledRate } from '../../../core/money/rate';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { ExchangeRateListFilter, ExchangeRateRecord } from '../finance.types';
import { ExchangeRateRepo } from './exchange-rate.repo';

/** The recorded rates as the finance facade reads and writes them; the repo stays private to this capability. */
@Injectable()
export class ExchangeRateLedgerService {
  constructor(private readonly repo: ExchangeRateRepo) {}

  insert(
    tx: DbTx,
    input: { organizationId: string; currency: string; rateDate: BusinessDate; rate: ScaledRate },
  ): Promise<ExchangeRateRecord> {
    return this.repo.insert(tx, input);
  }

  find(
    organizationId: string,
    currency: string,
    rateDate: BusinessDate,
    tx?: DbTx,
  ): Promise<ExchangeRateRecord | null> {
    return this.repo.find(organizationId, currency, rateDate, tx);
  }

  list(
    organizationId: string,
    filter: ExchangeRateListFilter,
  ): Promise<{ items: ExchangeRateRecord[]; total: number }> {
    return this.repo.list(organizationId, filter);
  }
}
