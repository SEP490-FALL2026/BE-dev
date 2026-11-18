import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { StopRequestRepo, type StopRequestRecord } from './stop-request.repo';
import { StopRequestNotifier, type StopRequestNoticeContext } from './stop-request-notifier.service';

/** How many requests one pass looks at; the next pass takes the rest. */
const BATCH = 200;

/**
 * What the hourly pass does about requests to stop collection (`US-09-04` AC-5): it tells, once for each request, that an open one
 * passed its deadline. It handles nothing and changes no request but the mark; collection goes on until an IT Admin completes it. The
 * mark and the notices are written together, so a request is told once however many instances run the pass.
 */
@Injectable()
export class StopRequestSweepService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly organizationReads: OrganizationReadApi,
    private readonly requests: StopRequestRepo,
    private readonly notifier: StopRequestNotifier,
  ) {}

  /** Runs the pass as of `now`; returns how many requests were told about. */
  async run(now: Date = new Date()): Promise<{ told: number }> {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) return { told: 0 };
    const context = { organizationId: organization.id, timeZone: organization.timeZone };
    let told = 0;
    for (const request of await this.requests.listOverdueUnnoticed(now, BATCH)) {
      if (await this.tell(context, request, now)) told += 1;
    }

    return { told };
  }

  private tell(context: StopRequestNoticeContext, request: StopRequestRecord, now: Date): Promise<boolean> {
    return this.runner.run(async (tx) => {
      if (!(await this.requests.markOverdueNoticed(tx, request.id, now))) return false;
      await this.notifier.overdue(tx, context, request);

      return true;
    });
  }
}
