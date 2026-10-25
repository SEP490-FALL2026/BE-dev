import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { IdentityAccessService } from '../../identity-access/identity-access.service';
import { OrganizationHistoryService } from '../../organization/organization-history.service';
import { PersonnelFileHooks } from '../personnel-file-hooks';
import { OffboardingAuditService } from './offboarding-audit.service';
import { OffboardingRefusedError } from './offboarding.errors';
import { OffboardingFrame } from './offboarding-frame.service';
import { accountLockRefusal, markLeftRefusal } from './offboarding.policy';
import { OffboardingRepo } from './offboarding.repo';
import type { AccountLockInput, MarkLeftInput, OffboardingRecord } from './offboarding.types';

/**
 * The person becomes `LEFT` and the lock of their company account is written (`US-03-04` AC-3, AC-9, AC-10, AC-18, `QĐ-77i`). The
 * handover under way turns into the departure at any time, also after the last working day (a day past it never takes the rights
 * away by itself); from the next action the sign-in and the guard refuse the person because the employee has the status
 * `TERMINATED`. Nothing here takes a seat away: the rights are listed, and the IT Admin revokes them, after the lock of the account.
 */
@Injectable()
export class OffboardingLeftService {
  constructor(
    private readonly frame: OffboardingFrame,
    private readonly repo: OffboardingRepo,
    private readonly history: OrganizationHistoryService,
    private readonly identity: IdentityAccessService,
    private readonly audit: OffboardingAuditService,
    private readonly hooks: PersonnelFileHooks,
  ) {}

  /** Turns a handover under way into the departure. Throws OffboardingRefusedError. */
  markLeft(actor: AuthenticatedPrincipal, id: string, input: MarkLeftInput): Promise<OffboardingRecord> {
    return this.frame.run(actor, id, {}, async (tx, { held, today, recordedOn }) => {
      const refusal = markLeftRefusal({ state: held.state, today, departedOn: input.departedOn, recordedOn });
      if (refusal) throw new OffboardingRefusedError(refusal.code, refusal.details);
      const leftOn = input.departedOn ?? today;
      const left = await this.repo.markLeft(tx, held.id, { appUserId: actor.appUserId, leftOn });
      await this.leaveInTx(tx, actor, left, leftOn, 'HANDING_OVER');
      if (input.accountLock) await this.writeAccountLock(tx, actor, left, input.accountLock, false);

      return (await this.repo.find(held.id, tx)) ?? left;
    });
  }

  /** The employee, the account and the listeners, in the transaction that wrote the case as `LEFT`. */
  async leaveInTx(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    record: OffboardingRecord,
    leftOn: BusinessDate,
    from: 'HANDING_OVER' | 'RECORDING',
  ): Promise<void> {
    await this.history.markEmployeeLeft(tx, record.employeeId, leftOn);
    await this.identity.markEmployeeLeft(tx, record.employeeId, leftOn);
    await this.repo.insertChange(tx, {
      caseId: record.id,
      kind: 'MARKED_LEFT',
      detail: { leftOn, abrupt: record.abrupt, from },
      changedByAppUserId: actor.appUserId,
      selfExecuted: record.selfExecuted,
    });
    // The alert of the highest level for the IT Admin and the reminder for the Super Admin to lock the account (`AC-3`, `QĐ-77c`).
    await this.audit.changed(
      tx,
      actor,
      record,
      'OFFBOARDING_CASE.LEFT',
      { state: from === 'HANDING_OVER' ? 'HANDING_OVER' : null },
      { state: 'LEFT', leftOn, abrupt: record.abrupt, lastWorkingDay: record.lastWorkingDay, alert: 'VERY_HIGH' },
      false,
    );
    await this.audit.accountLockReminder(tx, record);
    await this.hooks.onLeft(tx, {
      fileKind: 'OFFBOARDING',
      fileId: record.id,
      employeeId: record.employeeId,
      dueOn: record.departureEffectiveOn,
    });
  }

  /** Writes who locked the company account, when and what was done, once (`QĐ-77i`). Throws OffboardingRefusedError. */
  recordAccountLock(actor: AuthenticatedPrincipal, id: string, input: AccountLockInput): Promise<OffboardingRecord> {
    return this.frame.run(actor, id, {}, async (tx, { held }) => {
      const refusal = accountLockRefusal({ state: held.state, locked: held.accountLockAt !== null });
      if (refusal) throw new OffboardingRefusedError(refusal.code, refusal.details);
      await this.writeAccountLock(tx, actor, held, input, false);

      return (await this.repo.find(held.id, tx)) ?? held;
    });
  }

  /** The write the lock of the account has wherever it is asked for: with the departure, with the revocations, or alone. */
  async writeAccountLock(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    record: OffboardingRecord,
    input: AccountLockInput,
    selfExecuted: boolean,
  ): Promise<void> {
    const note = input.note.trim();
    if (!(await this.repo.recordAccountLock(tx, record.id, { appUserId: actor.appUserId, note })))
      throw new OffboardingRefusedError('ALREADY_RECORDED');
    await this.repo.insertChange(tx, {
      caseId: record.id,
      kind: 'ACCOUNT_LOCK_RECORDED',
      detail: { urgent: record.abrupt },
      changedByAppUserId: actor.appUserId,
      selfExecuted,
    });
    await this.audit.changed(
      tx,
      actor,
      record,
      'OFFBOARDING_CASE.ACCOUNT_LOCK_RECORDED',
      null,
      { employeeId: record.employeeId, urgent: record.abrupt },
      selfExecuted,
    );
  }
}
