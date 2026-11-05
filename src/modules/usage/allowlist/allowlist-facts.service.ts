import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { allowedToolsOn, type AiToolKey } from './allowlist.policy';
import { AllowlistRepo } from './allowlist.repo';

/** What a decision on a batch needs of the allowlist: which tools were reportable on each of the days it names. */
@Injectable()
export class AllowlistFactsService {
  constructor(private readonly repo: AllowlistRepo) {}

  /** For each day the tools that could be reported on it and the application each stands for; the versions are read once. */
  async allowedOn(
    organizationId: string,
    dates: readonly BusinessDate[],
    timeZone: string,
    tx?: DbTx,
  ): Promise<Map<BusinessDate, Map<AiToolKey, string>>> {
    const versions = await this.repo.versions(organizationId, tx);

    return new Map(dates.map((date) => [date, allowedToolsOn(versions, date, timeZone)] as const));
  }
}
