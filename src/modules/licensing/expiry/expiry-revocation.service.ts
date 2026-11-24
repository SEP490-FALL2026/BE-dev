import { Injectable, Logger } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { describeForOperator, traceForOperator } from '../../../infrastructure/observability/operator-error';
import { EmployeeNotStartedError } from '../../organization/public/organization.errors';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { AssignmentNotOpenError, RevocationRefusedError } from '../public/licensing.errors';
import { RenewalHoldHook } from '../public/licensing.extension-points';
import type { SystemActor } from '../public/licensing.types';
import { RevocationService } from '../provisioning/revocation.service';
import { systemRevocationOwed } from './expiry.policy';
import { ExpiryRevocationRepo } from './expiry-revocation.repo';

/** How many rights one read takes; a pass reads them all, page after page. */
const PAGE = 200;

/**
 * The start of the day after the end of a right: the system opens its revocation (`QĐ-111l`, `US-03-05` AC-2, AC-14). Once an hour every open
 * personal right whose end day has passed is asked of the one gate that opens a revocation (source `TIME_LIMITED_EXPIRY`, the system as the actor,
 * so the task is marked as made by the system), in the queue of the IT Admin in charge of the holder's department today. The right stays in force
 * until the IT Admin completes the task (`SoD-6`); no handover is confirmed (`QĐ-110g`). A right whose renewal waits for its decision, or for
 * the IT Admin to extend it, is left alone, as `QĐ-108*` keeps it (R-13); when the renewal is refused or withdrawn the next pass opens the task.
 * The system asks once for a right: the IT Admin who closed the task as failed starts it again from the queue, the pass does not. Each right has
 * a transaction of its own, so a right that fails is logged and tried again at the next pass without stopping the others, and two instances never
 * make two tasks (the gate locks the seat and adds no second task or reason).
 */
@Injectable()
export class ExpiryRevocationService {
  private readonly logger = new Logger(ExpiryRevocationService.name);
  /** The rights of a holder who has not started yet that this process already warned about: the same answer every hour is warned of once. */
  private readonly warnedNotStarted = new Set<string>();

  constructor(
    private readonly repo: ExpiryRevocationRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly renewals: RenewalHoldHook,
    private readonly revocations: RevocationService,
    private readonly runner: TransactionRunner,
  ) {}

  /** Opens the revocations that are due and returns how many tasks were new in this pass. */
  async openDue(now: Date = new Date()): Promise<number> {
    const today = await this.organizationReads.businessToday(now);
    const system: SystemActor = { kind: 'SYSTEM', correlationId: `assignment-expiry:${today}` };
    let opened = 0;
    let afterId: string | null = null;
    for (;;) {
      const page = await this.repo.rightsToAsk(today, afterId, PAGE);
      const waiting = await this.renewals.get().pendingRenewalsOf(page.map((right) => right.assignmentId));
      for (const right of page) {
        // The read left out every right the system asked for already, so none of them has a revocation of the expiry to be told apart here.
        const renewal = waiting.get(right.assignmentId) ?? null;
        if (!systemRevocationOwed({ expectedEndDate: right.expectedEndDate, today, renewal, revocationEver: false })) {
          continue;
        }
        opened += await this.ask(right.assignmentId, system, now);
      }
      if (page.length < PAGE) break;
      afterId = page[page.length - 1].assignmentId;
    }

    return opened;
  }

  /** The revocation of one right, in a transaction of its own: 1 when the task is new, 0 when there was nothing to add or the right could not be asked. */
  private async ask(assignmentId: string, system: SystemActor, now: Date): Promise<number> {
    try {
      const opened = await this.runner.run((tx) =>
        this.revocations.open(tx, system, {
          assignmentId,
          source: 'TIME_LIMITED_EXPIRY',
          // The end date the right was given decides, not a person (`FR-2.8`): the same decision as when the IT Admin starts it from the queue.
          decision: {
            decidedByEmployeeId: null,
            decidedRole: 'END_DATE',
            referenceKind: 'ASSIGNMENT_END_DATE',
            referenceId: assignmentId,
          },
          now,
        }),
      );

      return opened.created || opened.reasonAdded ? 1 : 0;
    } catch (error) {
      // The right ended between the reading and the asking (a return, a revocation completed): nothing is left to ask.
      if (error instanceof AssignmentNotOpenError) return 0;
      // The gate refuses a right it cannot take away (K3 is specified and not built): there is no revocation to open, and the same answer every
      // hour is no fault to log. The right stays in the queue of the IT Admin, who sees what its plan allows.
      if (error instanceof RevocationRefusedError) return 0;
      // The holder has only a placement that starts later: no technical work is made for them yet (`B-3`), so the right is skipped and tried again
      // at the next pass (once the placement starts it opens); the warning is written once, not every hour.
      if (error instanceof EmployeeNotStartedError) {
        if (!this.warnedNotStarted.has(assignmentId)) {
          this.warnedNotStarted.add(assignmentId);
          this.logger.warn(
            `The revocation of the right ${assignmentId} that ended is skipped: its holder has not started working in a department yet (${describeForOperator(error)})`,
          );
        }

        return 0;
      }
      this.logger.error(
        `Opening the revocation of the right ${assignmentId} that ended failed: ${describeForOperator(error)}`,
        traceForOperator(error),
      );

      return 0;
    }
  }
}
