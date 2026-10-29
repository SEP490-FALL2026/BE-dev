import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { AuditApi } from '../../audit/public/audit.api';
import type { AuditValue } from '../../audit/public/audit.types';
import { personnelAuditEvent, personnelSystemAuditEvent } from '../mappers/personnel-audit-event.mapper';
import type { PersonnelActor } from '../public/personnel.types';
import type { OffboardingRecord } from './offboarding.types';

type Snapshot = { [key: string]: AuditValue } | null;

/**
 * The audit events of the record of a departure, written in the transaction of the command. Every change names the case and what it
 * moved, and who did it: a person signed in, or the controlled procedure with its ticket (spec L.2); what the system does for the
 * person (the reminder to lock the account) is written as the system.
 */
@Injectable()
export class OffboardingAuditService {
  constructor(private readonly audit: AuditApi) {}

  async changed(
    tx: DbTx,
    actor: PersonnelActor,
    record: Pick<OffboardingRecord, 'id' | 'organizationId'>,
    action: string,
    before: Snapshot,
    after: Snapshot,
  ): Promise<void> {
    await this.audit.record(
      tx,
      personnelAuditEvent(actor, record.organizationId, action, 'OffboardingCase', record.id, before, after),
    );
  }

  /** The person was told a departure was recorded about them (the call point of the notification channel of `g4-notification-delivery`). */
  async employeeInformed(tx: DbTx, actor: PersonnelActor, record: OffboardingRecord): Promise<void> {
    await this.audit.record(
      tx,
      personnelAuditEvent(
        actor,
        record.organizationId,
        'PERSONNEL.EMPLOYEE_INFORMED',
        'OffboardingCase',
        record.id,
        null,
        {
          employeeId: record.employeeId,
          event: 'OFFBOARDING_RECORDED',
        },
      ),
    );
  }

  /** The Super Admin is reminded to lock the company account of a person who has left (`US-03-04` AC-3, `QĐ-77c`). */
  async accountLockReminder(tx: DbTx, record: OffboardingRecord): Promise<void> {
    await this.audit.record(
      tx,
      personnelSystemAuditEvent(
        record.organizationId,
        'OFFBOARDING_CASE.ACCOUNT_LOCK_REMINDER',
        'OffboardingCase',
        record.id,
        record.id,
        null,
        { employeeId: record.employeeId, audience: 'SUPER_ADMIN', abrupt: record.abrupt },
      ),
    );
  }
}
