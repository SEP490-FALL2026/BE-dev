import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import {
  YEAR_START_BATCH_SIZE,
  YearStartCommitmentsBatchService,
  type YearStartPassContext,
} from './year-start-commitments-batch.service';
import { YearStartCommitmentsRepo } from './year-start-commitments.repo';
import { carriedOverByCostCenter } from './year-start-commitments.policy';

/**
 * What the Cost Centers carry into the year that begins (`QĐ-111ac`, `QĐ-111k`): what the pass of 01/01 of that year would commit in each of
 * them, worked out now. It is a dry run of the one rule of the pass (`YearStartCommitmentsBatchService.judgeBatch`: the seats that still stand
 * after 31/12, what the approval kept of the year or twelve months of the monthly price of 01/01, the department that bears the cost, the
 * requests that hold a commitment for the year already left out), so the budget of the year after is made on the number the year will really
 * start with and the two never disagree.
 *
 * It only reads. No request is locked (a request being decided at the same moment is read as it stands, and nobody waits for the budgets),
 * nothing is committed and the Audit Trail is not written: the requests the pass would leave out, and why, are the business of the pass.
 * Every amount is in dong, like every commitment of the pass (`QĐ-111an`).
 */
@Injectable()
export class YearStartCarriedOverService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly repo: YearStartCommitmentsRepo,
    private readonly batches: YearStartCommitmentsBatchService,
    private readonly organization: OrganizationReadApi,
  ) {}

  /** Each Cost Center that carries something into `year`, with the amount; one that carries nothing is not in the answer. Reads in `tx`, or in a transaction of its own. */
  async carriedOverOf(costCenterIds: readonly string[], year: number, tx?: DbTx): Promise<Map<string, bigint>> {
    if (costCenterIds.length === 0) return new Map();

    return tx === undefined
      ? this.runner.run((own) => this.read(own, costCenterIds, year))
      : this.read(tx, costCenterIds, year);
  }

  private async read(tx: DbTx, costCenterIds: readonly string[], year: number): Promise<Map<string, bigint>> {
    const organization = await this.organization.getOrganization(tx);
    if (organization === null) return new Map();
    const now = new Date();
    const pass: YearStartPassContext = {
      organizationId: organization.id,
      year,
      now,
      today: await this.organization.businessToday(now, tx),
    };
    const commitments: { costCenterId: string; amountMinor: bigint }[] = [];
    let afterId: string | null = null;
    for (;;) {
      const rows = await this.repo.readBatch(tx, pass.organizationId, afterId, YEAR_START_BATCH_SIZE);
      if (rows.length === 0) break;
      afterId = rows[rows.length - 1].id;
      commitments.push(...((await this.batches.judgeBatch(tx, pass, rows))?.items ?? []));
    }

    return carriedOverByCostCenter(commitments, costCenterIds);
  }
}
