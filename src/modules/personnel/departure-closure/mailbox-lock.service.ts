import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { LicensingApi } from '../../licensing/public/licensing.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { OffboardingAuditService } from '../offboarding/offboarding-audit.service';
import { OffboardingFrame } from '../offboarding/offboarding-frame.service';
import { OffboardingRefusedError } from '../offboarding/offboarding.errors';
import { isBlocked, ownBlock } from '../offboarding/offboarding.policy';
import { OffboardingRepo } from '../offboarding/offboarding.repo';
import type { OffboardingRecord } from '../offboarding/offboarding.types';
import { userActor } from '../public/personnel.types';
import { mailboxLockRefusal, systemMailboxLockDue } from './departure-closure.policy';
import { DepartureClosureRepo } from './departure-closure.repo';
import { DepartureClosureService } from './departure-closure.service';

/** Who wrote item (1b): an IT Admin with their words, or the system when the last K1 revocation of the person ticked the lock of the mailbox. */
export type MailboxLockWriter =
  { kind: 'IT_ADMIN'; principal: AuthenticatedPrincipal; note: string | null } | { kind: 'SYSTEM' };

/**
 * Item (1b) of `BM-08`, the lock of the mailbox for good (`QĐ-110e`, `B-1`, SPEC P28). The IT Admin writes it after (1a) and, when the person
 * holds a K1 seat, only once every revocation of a K1 seat is completed; the system writes it by itself when the last K1 revocation is
 * completed with the lock ticked (`MailboxLockRevocationListener`). It is written once: asking again answers as it was. It is one of the
 * things the system waits for before it closes the case, which it does in the same transaction when (1b) was the last (`DepartureClosureService`).
 */
@Injectable()
export class MailboxLockService {
  constructor(
    private readonly frame: OffboardingFrame,
    private readonly cases: OffboardingRepo,
    private readonly closure: DepartureClosureRepo,
    private readonly identity: IdentityAccessApi,
    private readonly licensing: LicensingApi,
    private readonly audit: OffboardingAuditService,
    private readonly closing: DepartureClosureService,
    private readonly organizationReads: OrganizationReadApi,
  ) {}

  /** The IT Admin writes (1b). Throws OffboardingRefusedError and PersonnelAccessRefusedError. */
  record(actor: AuthenticatedPrincipal, id: string, input: { note?: string | undefined }): Promise<OffboardingRecord> {
    return this.frame.runTechnical(actor, id, {}, async (tx, { held, today }) => {
      // Written already (by an IT Admin or by the last K1 revocation): the answer is the case as it is, whatever it has become since.
      if (held.mailboxLockAt !== null) return held;
      const block = ownBlock(await this.identity.findDepartureBlock(held.employeeId, tx), held.id);
      const blocked = isBlocked(held, block, today);
      const accountLocked = held.accountLockAt !== null;
      const closed = held.closedAt !== null;
      const k1RightsOpen =
        blocked && accountLocked && !closed
          ? await this.licensing.countPersonalSeatsOfKindWithoutCompletedTask(held.employeeId, 'K1', today, tx)
          : 0;
      const refusal = mailboxLockRefusal({ closed, blocked, accountLocked, k1RightsOpen });
      if (refusal) throw new OffboardingRefusedError(refusal.code, refusal.details);
      const written = await this.write(tx, held, { kind: 'IT_ADMIN', principal: actor, note: input.note ?? null });
      if (!written) throw new OffboardingRefusedError('CONCURRENT_CHANGE');
      await this.closing.closeIfDue(tx, written);

      return (await this.cases.find(held.id, tx)) ?? written;
    });
  }

  /**
   * The system writes (1b) for a case the caller holds, when a K1 revocation of the person ticked the lock of the mailbox (`ticked`: the
   * revocation that just completed, or the checklist it kept) and the case is due for it (`systemMailboxLockDue`): (1a) is written, (1b) is not,
   * and the person holds no K1 seat without a completed revocation. Returns the case as it is then. The seats are counted only when the cheap
   * facts say it could be written.
   */
  async writeForSystemIfDue(
    tx: DbTx,
    held: OffboardingRecord,
    ticked: boolean,
    now: Date = new Date(),
  ): Promise<OffboardingRecord> {
    const accountLocked = held.accountLockAt !== null;
    const mailboxLocked = held.mailboxLockAt !== null;
    const k1RightsOpen =
      ticked && accountLocked && !mailboxLocked
        ? await this.licensing.countPersonalSeatsOfKindWithoutCompletedTask(
            held.employeeId,
            'K1',
            await this.organizationReads.businessToday(now, tx),
            tx,
          )
        : 0;
    if (!systemMailboxLockDue({ ticked, accountLocked, mailboxLocked, k1RightsOpen })) return held;

    return (await this.write(tx, held, { kind: 'SYSTEM' }, now)) ?? held;
  }

  /**
   * Writes (1b) in the transaction of the caller, which holds the case (the frame, or the listener of the last K1 revocation), and returns the case
   * as it is then; null when it could not be written (written meanwhile, or the case does not take it). The log of the case and the Audit Trail
   * say who.
   */
  async write(
    tx: DbTx,
    held: OffboardingRecord,
    by: MailboxLockWriter,
    at: Date = new Date(),
  ): Promise<OffboardingRecord | null> {
    const note = by.kind === 'IT_ADMIN' ? by.note : null;
    const appUserId = by.kind === 'IT_ADMIN' ? by.principal.appUserId : null;
    if (!(await this.closure.recordMailboxLock(tx, held.id, { appUserId, note, at }))) return null;
    await this.cases.insertChange(tx, {
      caseId: held.id,
      kind: 'MAILBOX_LOCKED',
      detail: { by: by.kind },
      changedByAppUserId: appUserId,
      changedByTicketId: null,
    });
    const after = { employeeId: held.employeeId, by: by.kind };
    if (by.kind === 'IT_ADMIN')
      await this.audit.changed(
        tx,
        userActor(by.principal),
        held,
        'OFFBOARDING_CASE.MAILBOX_LOCK_RECORDED',
        null,
        after,
      );
    else await this.audit.systemChanged(tx, held, 'OFFBOARDING_CASE.MAILBOX_LOCK_RECORDED', null, after);

    return (await this.cases.find(held.id, tx)) ?? held;
  }
}
