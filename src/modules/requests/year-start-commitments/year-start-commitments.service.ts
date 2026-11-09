import { Injectable } from '@nestjs/common';
import { fiscalYearOf } from '../../../core/fiscal-year';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import {
  YearStartCommitmentsBatchService,
  type YearStartBatchResult,
  type YearStartPassContext,
} from './year-start-commitments-batch.service';
import { YearStartCommitmentsRepo } from './year-start-commitments.repo';

export type YearStartRunResult =
  /** The installation has no organization yet. */
  | { status: 'NO_ORGANIZATION' }
  /** The year was done already: nothing is read or written. */
  | { status: 'ALREADY_DONE'; year: number }
  /** The organization has never had a pass: the year is marked done with nothing made, so nothing is made backwards. */
  | { status: 'BASELINE'; year: number }
  /** The pass was made: how many commitments it made and how many requests it left out with an event. `reported` is false when another pass completed the year first. */
  | { status: 'COMPLETED'; year: number; created: number; skipped: number; reported: boolean };

/**
 * The pass of 01/01 (`FR-5.8`(6), `FR-5.8a`, `BR-MF1-09e`, `QĐ-109a`): in the first pass of a year — the sweeper runs every hour, so the first after
 * midnight of the organization — every paid request whose right goes on into the year, or that was approved as spend and not yet granted, gets one
 * commitment for the year, with no approval and no check of the budget. The year is the calendar year of the organization's own day; the cost is
 * that of 01/01 whenever the pass runs, so a pass that runs late changes nothing.
 *
 * The mark `year_start_commitment_runs` makes it idempotent: a year whose mark is complete is not read again, and a pass that failed half way
 * leaves it open for the next, which goes on — a commitment is never made twice (one request holds one for a year, the unique key and the check
 * under the row lock). Two instances running at once are safe for the same reason: they take the rows of the requests in the same order and the
 * second finds what the first made. The batches are in separate transactions, so a long pass never holds the year of a Cost Center for long. The
 * order of the locks inside a batch is written in `YearStartCommitmentsBatchService`.
 */
@Injectable()
export class YearStartCommitmentsService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly repo: YearStartCommitmentsRepo,
    private readonly batches: YearStartCommitmentsBatchService,
    private readonly organization: OrganizationReadApi,
    private readonly audit: AuditApi,
  ) {}

  /** Makes the pass of the year `now` is in, if it was not made. `now` is a parameter for tests. */
  async run(now: Date = new Date()): Promise<YearStartRunResult> {
    const organization = await this.organization.getOrganization();
    if (!organization) return { status: 'NO_ORGANIZATION' };
    const year = fiscalYearOf(await this.organization.businessToday(now));
    const opened = await this.runner.run((tx) => this.open(tx, organization.id, year, now));
    if (opened !== 'BEGUN') return { status: opened === 'DONE' ? 'ALREADY_DONE' : 'BASELINE', year };

    const pass = { organizationId: organization.id, year, now };
    const { created, skipped } = await this.commitAllBatches(pass);
    const reported = await this.runner.run((tx) => this.complete(tx, { ...pass, created, skipped }));

    return { status: 'COMPLETED', year, created, skipped, reported };
  }

  /** Goes through the requests batch by batch, each in a transaction of its own, until there are no more. */
  private async commitAllBatches(pass: YearStartPassContext): Promise<{ created: number; skipped: number }> {
    let created = 0;
    let skipped = 0;
    let afterId: string | null = null;
    do {
      const batch: YearStartBatchResult = await this.runner.run((tx) => this.batches.commitBatch(tx, pass, afterId));
      created += batch.created;
      skipped += batch.skipped;
      afterId = batch.lastId;
    } while (afterId !== null);

    return { created, skipped };
  }

  /** Whether there is a pass to make: the year is done, it is the first the organization has had (marked, nothing made), or the pass begins. */
  private async open(
    tx: DbTx,
    organizationId: string,
    year: number,
    now: Date,
  ): Promise<'DONE' | 'BASELINE' | 'BEGUN'> {
    const run = await this.repo.findRun(tx, organizationId, year);
    if (run?.completed) return 'DONE';
    if (run === null && !(await this.repo.hasEarlierRun(tx, organizationId, year))) {
      await this.repo.markBaseline(tx, organizationId, year, now);

      return 'BASELINE';
    }

    return (await this.repo.begin(tx, organizationId, year, now)) ? 'BEGUN' : 'DONE';
  }

  /** Completes the mark and tells the Audit Trail once, by the pass that completed it (`US-06-18` AC-7: each pass that completes a year is told). */
  private async complete(
    tx: DbTx,
    input: { organizationId: string; year: number; now: Date; created: number; skipped: number },
  ): Promise<boolean> {
    const done = await this.repo.complete(tx, input);
    if (done === null) return false;
    await this.audit.record(tx, {
      organizationId: input.organizationId,
      actorKind: 'SYSTEM',
      action: 'BUDGET_COMMITMENT.YEAR_START_RUN',
      resourceType: 'ORGANIZATION',
      resourceId: input.organizationId,
      before: null,
      after: { year: input.year, runCount: done.runCount, created: input.created, skipped: input.skipped },
      correlationId: `year-start-commitments:${input.organizationId}:${input.year}`,
    });

    return true;
  }
}
