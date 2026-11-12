import { Injectable, Logger } from '@nestjs/common';
import { businessDateAt, type BusinessDate } from '../../../core/business-date';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { describeForOperator, traceForOperator } from '../../../infrastructure/observability/operator-error';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { PersonnelNotifier } from '../event-notice/personnel-notifier.service';
import { personnelSystemAuditEvent } from '../personnel-audit-event.mapper';
import { accountLockOverdueOwed } from './block-moment.policy';
import { BlockMomentRepo, type DepartureRef } from './block-moment.repo';

/** How many departures are read in one statement. */
const PAGE = 200;

/** What one pass did: the departures told, and those it could not (each is tried again at the next pass). */
export interface LockOverduePass {
  told: number;
  failed: number;
}

/**
 * Tells the IT Admin and the Super Admin that the lock of the company account of a departure blocked now was not written by the end of the
 * day it was blocked (`QĐ-94m`(12), R-1, SPEC MF2-E). The account is blocked at once by the guard, so this is the reminder that item (1a) of
 * `BM-08` (reset the password of the mailbox, sign out every session) is still not recorded. The notice is written once for the case (key
 * `ACCOUNT_LOCK_OVERDUE:<case>`) with an audit event of the system in the same transaction, so a pass run again or on another instance
 * writes nothing new. It only tells.
 */
@Injectable()
export class AccountLockOverdueService {
  private readonly logger = new Logger(AccountLockOverdueService.name);

  constructor(
    private readonly runner: TransactionRunner,
    private readonly cases: BlockMomentRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
    private readonly notifier: PersonnelNotifier,
  ) {}

  async notice(now: Date = new Date()): Promise<LockOverduePass> {
    const today = await this.organizationReads.businessToday(now);
    const pass: LockOverduePass = { told: 0, failed: 0 };
    let afterId: string | null = null;
    for (;;) {
      const page: DepartureRef[] = await this.cases.pageLockMissing({ afterId, take: PAGE });
      for (const ref of page) {
        try {
          if (await this.tellOne(ref.id, today)) pass.told += 1;
        } catch (error) {
          pass.failed += 1;
          this.logger.error(
            `Lock overdue of departure ${ref.id} failed: ${describeForOperator(error)}`,
            traceForOperator(error),
          );
        }
      }
      if (page.length < PAGE) break;
      afterId = page[page.length - 1].id;
    }

    return pass;
  }

  private tellOne(id: string, today: BusinessDate): Promise<boolean> {
    return this.runner.run(async (tx) => {
      const held = await this.cases.lockOpen(tx, id);
      if (!held) return false;
      const zone = (await this.organizationReads.getOrganization(tx))?.timeZone ?? 'UTC';
      const recordedOn = businessDateAt(held.recordedAt, zone);
      const owed = accountLockOverdueOwed({ ...held, closed: false, recordedOn }, today);
      if (!owed) return false;

      const written = await this.notifier.accountLockOverdue(tx, {
        organizationId: held.organizationId,
        employeeId: held.employeeId,
        departmentId: held.departmentId,
        caseId: held.id,
        blockedOn: recordedOn,
      });
      if (written) {
        await this.audit.record(
          tx,
          personnelSystemAuditEvent(
            held.organizationId,
            'OFFBOARDING_CASE.ACCOUNT_LOCK_OVERDUE',
            'OffboardingCase',
            held.id,
            `account-lock-overdue:${held.id}`,
            null,
            { employeeId: held.employeeId, blockedOn: recordedOn, day: today },
          ),
        );
      }

      return written;
    });
  }
}
