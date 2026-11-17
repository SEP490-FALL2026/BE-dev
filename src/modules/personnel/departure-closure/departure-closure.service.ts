import { Injectable, Logger } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import { describeForOperator, traceForOperator } from '../../../infrastructure/observability/operator-error';
import { LicensingApi } from '../../licensing/public/licensing.api';
import { OrganizationApi } from '../../organization/public/organization.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { OffboardingAuditService } from '../offboarding/offboarding-audit.service';
import { OffboardingRepo } from '../offboarding/offboarding.repo';
import type { OffboardingRecord } from '../offboarding/offboarding.types';
import { closureDue } from './departure-closure.policy';
import { DepartureClosureRepo } from './departure-closure.repo';

/** How many departures are read in one statement. */
const PAGE = 200;

/** What one pass did: the departures it closed, and those it could not (each is tried again at the next pass). */
export interface ClosurePass {
  closed: number;
  failed: number;
}

/**
 * The system closes a departure (`QĐ-110e`, `B-1`, SPEC MF2-G): the person has left, every personal seat they hold has a completed task of
 * revocation (a task that failed keeps the case open and the IT Admin opens a new one) and the lock of the company account (1a) and of the
 * mailbox for good (1b) are written. The responsibilities that are not handed over never keep it (`QĐ-110j`). There is no route and no button:
 * the closing is written with no account (`closed_by_app_user_id` is null), as the line `CLOSED_BY_SYSTEM` of the log of the case and the audit
 * event `OFFBOARDING_CASE.CLOSED` with the actor `SYSTEM`.
 *
 * It is asked at the moment a fact that closes the case is written: the last revocation of the person is completed (the listener), (1b) is written
 * by the IT Admin (the route); and once an hour for the rest (the person marked as left after everything else was done, a seat that ended with
 * its day, a case another command held when the listener asked) by `DepartureClosureSweeper` (D-67).
 */
@Injectable()
export class DepartureClosureService {
  private readonly logger = new Logger(DepartureClosureService.name);

  constructor(
    private readonly runner: TransactionRunner,
    private readonly organization: OrganizationApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly licensing: LicensingApi,
    private readonly cases: OffboardingRepo,
    private readonly closure: DepartureClosureRepo,
    private readonly audit: OffboardingAuditService,
  ) {}

  /**
   * Closes the case in the transaction of the caller, which holds the case, when nothing keeps it open; false when something does or it was closed
   * meanwhile. The cheap facts are asked before the seats are counted.
   */
  async closeIfDue(tx: DbTx, held: OffboardingRecord, now: Date = new Date()): Promise<boolean> {
    if (held.state !== 'LEFT' || held.closedAt !== null || held.mailboxLockAt === null || held.accountLockAt === null)
      return false;
    const today = await this.organizationReads.businessToday(now, tx);
    const counted = await this.licensing.countPersonalSeatsWithoutCompletedTaskOf([held.employeeId], today, tx);
    const due = closureDue({
      state: held.state,
      closed: false,
      lockRecorded: true,
      mailboxLocked: true,
      openRights: counted.get(held.employeeId) ?? 0,
    });
    if (!due || !(await this.closure.closeBySystem(tx, held.id, now))) return false;
    await this.cases.insertChange(tx, {
      caseId: held.id,
      kind: 'CLOSED_BY_SYSTEM',
      detail: { by: 'SYSTEM' },
      changedByAppUserId: null,
      changedByTicketId: null,
    });
    await this.audit.systemChanged(tx, held, 'OFFBOARDING_CASE.CLOSED', null, {
      employeeId: held.employeeId,
      by: 'SYSTEM',
    });

    return true;
  }

  /**
   * One pass over the departures that have left and have (1b) written: each has a transaction of its own that locks the employee, then the case
   * `FOR UPDATE` (the lock protocol of the commands on a case), reads it again and closes it if nothing keeps it open, so two instances or a
   * command at the same time never both act. One that fails is logged and tried again next time without stopping the others.
   */
  async sweep(now: Date = new Date()): Promise<ClosurePass> {
    const pass: ClosurePass = { closed: 0, failed: 0 };
    let afterId: string | null = null;
    for (;;) {
      const page: { id: string; employeeId: string }[] = await this.closure.pageClosable({ afterId, take: PAGE });
      for (const ref of page) {
        try {
          if (await this.closeOne(ref, now)) pass.closed += 1;
        } catch (error) {
          pass.failed += 1;
          this.logger.error(
            `Closing departure ${ref.id} failed: ${describeForOperator(error)}`,
            traceForOperator(error),
          );
        }
      }
      if (page.length < PAGE) break;
      afterId = page[page.length - 1].id;
    }

    return pass;
  }

  private closeOne(ref: { id: string; employeeId: string }, now: Date): Promise<boolean> {
    return this.runner.run(async (tx) => {
      await this.organization.lockEmployeeForUpdate(tx, ref.employeeId);
      const held = await this.closure.lockOpen(tx, ref.id);

      return held ? this.closeIfDue(tx, held, now) : false;
    });
  }
}
