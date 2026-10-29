import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { OrganizationHistoryApi } from '../../organization/public/organization-history.api';
import { PersonnelFileHooks } from '../event-notice/personnel-file-hooks.service';
import { actorColumns, userActor, type PersonnelActor } from '../public/personnel.types';
import { TransferGuardService } from '../transfer/transfer-guard.service';
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
    private readonly history: OrganizationHistoryApi,
    private readonly identity: IdentityAccessApi,
    private readonly audit: OffboardingAuditService,
    private readonly hooks: PersonnelFileHooks,
    private readonly guard: TransferGuardService,
  ) {}

  /**
   * Turns a handover under way into the departure: an event of the person, which only the Super Admin records and never about
   * themselves (F40, F19). Throws OffboardingRefusedError and PersonnelAccessRefusedError.
   */
  markLeft(actor: PersonnelActor, id: string, input: MarkLeftInput, outer?: DbTx): Promise<OffboardingRecord> {
    return this.frame.runEvent(actor, id, { outer }, async (tx, { held, today, recordedOn }) => {
      const refusal = markLeftRefusal({ state: held.state, today, departedOn: input.departedOn, recordedOn });
      if (refusal) throw new OffboardingRefusedError(refusal.code, refusal.details);
      const leftOn = input.departedOn ?? today;
      const account = await this.guard.standIn(tx, actor);
      const left = await this.repo.markLeft(tx, held.id, { appUserId: account.appUserId, leftOn });
      await this.leaveInTx(tx, actor, left, leftOn, 'HANDING_OVER');
      if (input.accountLock) await this.writeAccountLock(tx, account, left, input.accountLock);

      return (await this.repo.find(held.id, tx)) ?? left;
    });
  }

  /** The employee, the account and the listeners, in the transaction that wrote the case as `LEFT`. */
  async leaveInTx(
    tx: DbTx,
    actor: PersonnelActor,
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
      changedByAppUserId: actorColumns(actor).appUserId,
      changedByTicketId: actorColumns(actor).ticketId,
    });
    // The alert of the highest level for the IT Admin and the reminder for the Super Admin to lock the account (`AC-3`, `QĐ-77c`).
    await this.audit.changed(
      tx,
      actor,
      record,
      'OFFBOARDING_CASE.LEFT',
      { state: from === 'HANDING_OVER' ? 'HANDING_OVER' : null },
      { state: 'LEFT', leftOn, abrupt: record.abrupt, lastWorkingDay: record.lastWorkingDay, alert: 'VERY_HIGH' },
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
    return this.frame.runTechnical(actor, id, {}, async (tx, { held }) => {
      const refusal = accountLockRefusal({ state: held.state, locked: held.accountLockAt !== null });
      if (refusal) throw new OffboardingRefusedError(refusal.code, refusal.details);
      await this.writeAccountLock(tx, actor, held, input);

      return (await this.repo.find(held.id, tx)) ?? held;
    });
  }

  /** The write the lock of the account has wherever it is asked for: with the departure, with the revocations, or alone. */
  async writeAccountLock(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    record: OffboardingRecord,
    input: AccountLockInput,
  ): Promise<void> {
    const note = input.note.trim();
    if (!(await this.repo.recordAccountLock(tx, record.id, { appUserId: actor.appUserId, note })))
      throw new OffboardingRefusedError('ALREADY_RECORDED');
    await this.repo.insertChange(tx, {
      caseId: record.id,
      kind: 'ACCOUNT_LOCK_RECORDED',
      detail: { urgent: record.abrupt },
      changedByAppUserId: actor.appUserId,
      changedByTicketId: null,
    });
    await this.audit.changed(tx, userActor(actor), record, 'OFFBOARDING_CASE.ACCOUNT_LOCK_RECORDED', null, {
      employeeId: record.employeeId,
      urgent: record.abrupt,
    });
  }
}
