import { Injectable, Logger } from '@nestjs/common';
import { businessDateAt } from '../../../core/business-date';
import { fiscalYearOf } from '../../../core/fiscal-year';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { YearStartCommitmentsBatchService, type YearStartPassContext } from './year-start-commitments-batch.service';
import { YearStartCommitmentsRepo } from './year-start-commitments.repo';

export type YearStartRunResult =
  /** The installation has no organization yet. */
  | { status: 'NO_ORGANIZATION' }
  /** The year was done already: nothing is read or written. */
  | { status: 'ALREADY_DONE'; year: number }
  /** The organization is new: it has never had a pass and no request of an earlier year, so the year is marked done with nothing made. */
  | { status: 'BASELINE'; year: number }
  /** Another instance is in a step of the pass of the year: this one leaves it to it. */
  | { status: 'BUSY'; year: number }
  /** This pass completed the year: what the whole year made and left out with an event (with the passes before it that failed half way). */
  | { status: 'COMPLETED'; year: number; created: number; skipped: number; reported: boolean };

type Opened = 'ALREADY_DONE' | 'BASELINE' | 'BUSY' | 'BEGUN';
type Step =
  { status: 'MORE' } | { status: 'ALREADY_DONE' | 'BUSY' } | { status: 'COMPLETED'; created: number; skipped: number };

/**
 * The pass of 01/01 (`FR-5.8`(6), `FR-5.8a`, `BR-MF1-09e`, `QĐ-109a`): in the first pass of a year — the sweeper runs every hour, so the first after
 * midnight of the organization — every paid request whose right goes on into the year, or that was approved as spend and not yet granted, gets one
 * commitment for the year, with no approval and no check of the budget. The year is the calendar year of the organization's own day; the price is
 * the one of 01/01 and the seats those that run on 01/01 whenever the pass runs, so a pass that runs late changes nothing but the rate it may convert at.
 *
 * The mark `year_start_commitment_runs` makes it idempotent: a year whose mark is complete is not read again, and a pass that failed half way
 * leaves it open with the last request it went through, and the next goes on after it — no request is judged twice and a commitment is never
 * made twice (one request holds one for a year, the unique key and the check under the row lock). Every step (the opening, each batch) is a
 * transaction of its own that first tries the advisory lock of the organization and the year: an instance that finds it taken leaves the pass
 * to the one that holds it. The order of the locks inside a batch is written in `YearStartCommitmentsBatchService`.
 */
@Injectable()
export class YearStartCommitmentsService {
  private readonly logger = new Logger(YearStartCommitmentsService.name);

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
    const today = await this.organization.businessToday(now);
    const pass: YearStartPassContext = { organizationId: organization.id, year: fiscalYearOf(today), now, today };
    const opened = await this.runner.run((tx) => this.open(tx, pass, organization.timeZone));
    if (opened !== 'BEGUN') return { status: opened, year: pass.year };

    let step: Step;
    do {
      step = await this.runner.run((tx) => this.step(tx, pass));
    } while (step.status === 'MORE');

    return step.status === 'COMPLETED'
      ? { status: 'COMPLETED', year: pass.year, created: step.created, skipped: step.skipped, reported: true }
      : { status: step.status, year: pass.year };
  }

  /** Whether there is a pass to make: the year is done, the organization is new (marked, nothing made), another instance has it, or it begins. */
  private async open(tx: DbTx, pass: YearStartPassContext, timeZone: string): Promise<Opened> {
    if (!(await this.repo.tryLockPass(tx, pass.organizationId, pass.year))) return 'BUSY';
    const run = await this.repo.findRun(tx, pass.organizationId, pass.year);
    if (run?.completed) return 'ALREADY_DONE';
    if (run === null && (await this.isNew(tx, pass, timeZone))) {
      await this.repo.markBaseline(tx, pass.organizationId, pass.year, pass.now);

      return 'BASELINE';
    }

    return (await this.repo.begin(tx, pass.organizationId, pass.year, pass.now)) ? 'BEGUN' : 'ALREADY_DONE';
  }

  /**
   * An organization is new for the year when it has no mark of an earlier year and no request made before the year began: its first pass has
   * nothing to carry into the year, so it only marks it. One made in December whose first pass is after midnight of 01/01 is not new: the
   * requests it approved in December get the commitments of the year. A gap in the marks (a year no pass was made for) is logged.
   */
  private async isNew(tx: DbTx, pass: YearStartPassContext, timeZone: string): Promise<boolean> {
    const earlier = await this.repo.earlierRunYears(tx, pass.organizationId, pass.year);
    if (earlier.length > 0) {
      if (earlier[0] !== pass.year - 1) {
        this.logger.warn(
          `No pass of 01/01 was made for ${pass.year - 1} (the last was for ${earlier[0]}); the pass of ${pass.year} runs now`,
        );
      }

      return false;
    }
    const first = await this.repo.firstRequestAt(tx, pass.organizationId);

    return first === null || fiscalYearOf(businessDateAt(first, timeZone)) >= pass.year;
  }

  /**
   * One batch under the lock of the pass, after the last request the mark names; the last step completes the mark and tells the Audit Trail
   * once (`US-06-18` AC-7), with the passes counted and what the whole year made and left out.
   */
  private async step(tx: DbTx, pass: YearStartPassContext): Promise<Step> {
    if (!(await this.repo.tryLockPass(tx, pass.organizationId, pass.year))) return { status: 'BUSY' };
    const run = await this.repo.findRun(tx, pass.organizationId, pass.year);
    if (run === null || run.completed) return { status: 'ALREADY_DONE' };

    const batch = await this.batches.commitBatch(tx, pass, run.resumeAfterId);
    if (batch.lastId !== null) {
      await this.repo.advance(tx, {
        organizationId: pass.organizationId,
        year: pass.year,
        lastId: batch.lastId,
        created: batch.created,
        skipped: batch.skipped,
      });

      return { status: 'MORE' };
    }
    const done = await this.repo.complete(tx, pass);
    if (done === null) return { status: 'ALREADY_DONE' };
    await this.audit.record(tx, {
      organizationId: pass.organizationId,
      actorKind: 'SYSTEM',
      action: 'BUDGET_COMMITMENT.YEAR_START_RUN',
      resourceType: 'ORGANIZATION',
      resourceId: pass.organizationId,
      before: null,
      after: { year: pass.year, runCount: done.runCount, created: done.created, skipped: done.skipped },
      correlationId: `year-start-commitments:${pass.organizationId}:${pass.year}`,
    });

    return { status: 'COMPLETED', created: done.created, skipped: done.skipped };
  }
}
