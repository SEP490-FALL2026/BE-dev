import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import type { AuditValue } from '../../audit/audit.types';
import { personnelAuditEvent, personnelSystemAuditEvent } from '../mappers/personnel-audit-event';
import type { OffboardingRecord } from './offboarding.types';

type Snapshot = { [key: string]: AuditValue } | null;

/**
 * The audit events of the record of a departure, written in the transaction of the command. Every change by a person names the case
 * and what it moved; a command an IT Admin did for themselves says so in a second event the Super Admin is told by (`US-03-04`
 * AC-29); what the system does for the person (the reminder to lock the account) is written as the system.
 */
@Injectable()
export class OffboardingAuditService {
  constructor(private readonly audit: AuditService) {}

  async changed(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    record: Pick<OffboardingRecord, 'id' | 'organizationId'>,
    action: string,
    before: Snapshot,
    after: Snapshot,
    selfExecuted: boolean,
  ): Promise<void> {
    await this.audit.record(
      tx,
      personnelAuditEvent(actor, record.organizationId, action, 'OffboardingCase', record.id, before, {
        ...(after ?? {}),
        selfExecuted,
      }),
    );
    if (selfExecuted) {
      await this.audit.record(
        tx,
        personnelAuditEvent(
          actor,
          record.organizationId,
          'PERSONNEL.SELF_EXECUTED',
          'OffboardingCase',
          record.id,
          null,
          {
            event: action,
          },
        ),
      );
    }
  }

  /** The person was told a departure was recorded about them (the call point of the notification channel of `g4-notification-delivery`). */
  async employeeInformed(tx: DbTx, actor: AuthenticatedPrincipal, record: OffboardingRecord): Promise<void> {
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
