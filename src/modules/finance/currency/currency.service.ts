import { Injectable } from '@nestjs/common';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { CurrencyRecord } from '../public/finance.types';
import { CurrencyRepo } from './currency.repo';

/** The currency table as the rest of the finance module reads it; the repo stays private to this capability. */
@Injectable()
export class CurrencyService {
  constructor(private readonly repo: CurrencyRepo) {}

  list(tx?: DbTx): Promise<CurrencyRecord[]> {
    return this.repo.list(tx);
  }

  find(code: string, tx?: DbTx): Promise<CurrencyRecord | null> {
    return this.repo.find(code, tx);
  }
}
