import { Injectable, Logger } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { describeForOperator, traceForOperator } from '../../../infrastructure/observability/operator-error';
import { LicensingApi } from '../../licensing/public/licensing.api';
import { OrganizationApi } from '../../organization/public/organization.api';
import { DepartureClosureRepo } from './departure-closure.repo';
import { DepartureClosureService } from './departure-closure.service';
import { MailboxLockService } from './mailbox-lock.service';

/** How many departures are read in one statement. */
const PAGE = 200;

/** What one pass did: the locks of the mailbox it wrote, and the departures it could not settle (each is tried again at the next pass). */
export interface SettlementPass {
  written: number;
  failed: number;
}

/**
 * Writes the lock of the mailbox (1b) that the listener of the last K1 revocation could not write (`QĐ-110e`, `B-1`, SPEC P28, D-72). The
 * listener never waits for a case another command holds (`FOR UPDATE SKIP LOCKED`, D-66), so a revocation completed in that moment ticked the
 * lock and the system did not write it; nothing else would, and the case would stay open for good. This is the hourly pass that does: for the
 * departures that have (1a) and not (1b), it asks `licensing` which of the people have a completed K1 revocation that ticked the lock of the
 * mailbox (the checklist the revocation kept), and for each one writes (1b) by the system under the same rule as the listener (the person holds no
 * K1 seat without a completed revocation, `MailboxLockService.writeForSystemIfDue`), then closes the case if that was the last thing it waited for.
 * Each case has a transaction of its own that locks the employee, then the case `FOR UPDATE` (the lock protocol of the commands on a case): one
 * that fails is logged and tried again next time without stopping the others.
 */
@Injectable()
export class MailboxLockSettlement {
  private readonly logger = new Logger(MailboxLockSettlement.name);

  constructor(
    private readonly runner: TransactionRunner,
    private readonly organization: OrganizationApi,
    private readonly licensing: LicensingApi,
    private readonly cases: DepartureClosureRepo,
    private readonly locks: MailboxLockService,
    private readonly closing: DepartureClosureService,
  ) {}

  async settle(now: Date = new Date()): Promise<SettlementPass> {
    const pass: SettlementPass = { written: 0, failed: 0 };
    let afterId: string | null = null;
    for (;;) {
      const page: { id: string; employeeId: string }[] = await this.cases.pageAwaitingMailboxLock({
        afterId,
        take: PAGE,
      });
      const ticked = await this.licensing.listPeopleWithMailboxLockTicked(page.map((ref) => ref.employeeId));
      for (const ref of page.filter((candidate) => ticked.has(candidate.employeeId))) {
        try {
          if (await this.settleOne(ref, now)) pass.written += 1;
        } catch (error) {
          pass.failed += 1;
          this.logger.error(
            `Settling the lock of the mailbox of departure ${ref.id} failed: ${describeForOperator(error)}`,
            traceForOperator(error),
          );
        }
      }
      if (page.length < PAGE) break;
      afterId = page[page.length - 1].id;
    }

    return pass;
  }

  private settleOne(ref: { id: string; employeeId: string }, now: Date): Promise<boolean> {
    return this.runner.run(async (tx) => {
      await this.organization.lockEmployeeForUpdate(tx, ref.employeeId);
      const held = await this.cases.lockOpen(tx, ref.id);
      if (!held) return false;
      const written = await this.locks.writeForSystemIfDue(tx, held, true, now);
      if (written.mailboxLockAt === held.mailboxLockAt) return false;
      await this.closing.closeIfDue(tx, written, now);

      return true;
    });
  }
}
