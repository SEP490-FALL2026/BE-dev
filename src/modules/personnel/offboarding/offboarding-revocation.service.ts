import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { LicensingService } from '../../licensing/licensing.service';
import { RevocationRefusedError, AssignmentNotOpenError } from '../../licensing/licensing.errors';
import { OffboardingAuditService } from './offboarding-audit.service';
import { OffboardingBlockerRegistry } from './offboarding-blocker.registry';
import { OffboardingFrame } from './offboarding-frame.service';
import { OffboardingLeftService } from './offboarding-left.service';
import { OffboardingRefusedError } from './offboarding.errors';
import { closeRefusal, isRevocableType, revocationSelection, type RightFacts } from './offboarding.policy';
import { OffboardingRepo } from './offboarding.repo';
import type { OffboardingRecord, OpenRevocationsInput } from './offboarding.types';

export interface RevocationsOpened {
  record: OffboardingRecord;
  /** Tasks made, and seats that already had one and were given the reason of the departure besides. */
  created: number;
  reasonAdded: number;
}

/**
 * The IT Admin takes the rights of a person who has left away, all at once from the list of the rights the case keeps, and closes the
 * case (`US-03-04` AC-4, AC-5, AC-16, AC-20, `QĐ-62i`, `QĐ-77i`). Nothing is taken away by itself: a task is made for a seat only when
 * the IT Admin asks for it, with how many they mean (so a count that does not match the list is refused), one reason for all, and
 * after the lock of the company account is written or together with it. Every task goes through the one gate of `licensing`, in one
 * transaction with the case. The case closes only when no personal right is left, the account is locked, and what the flows that come
 * after register is empty.
 */
@Injectable()
export class OffboardingRevocationService {
  constructor(
    private readonly frame: OffboardingFrame,
    private readonly repo: OffboardingRepo,
    private readonly licensing: LicensingService,
    private readonly left: OffboardingLeftService,
    private readonly registry: OffboardingBlockerRegistry,
    private readonly audit: OffboardingAuditService,
  ) {}

  /** Opens the revocations the IT Admin chose. Throws OffboardingRefusedError. */
  openRevocations(actor: AuthenticatedPrincipal, id: string, input: OpenRevocationsInput): Promise<RevocationsOpened> {
    return this.frame.run(actor, id, {}, async (tx, { held, today, selfMode }) => {
      const seats = held.state === 'LEFT' ? await this.licensing.listPersonalSeatsOf(held.employeeId, today, tx) : [];
      const rights: RightFacts[] = seats.map((seat) => ({
        assignmentId: seat.assignmentId,
        hasTask: seat.revocation !== null,
        revocable: isRevocableType(seat.provisioningType),
        provisioningType: seat.provisioningType,
      }));
      const { refusal, selected } = revocationSelection({
        state: held.state,
        closed: held.closedAt !== null,
        reason: input.reason,
        count: input.count,
        named: input.assignmentIds,
        rights,
        lockRecorded: held.accountLockAt !== null,
        lockGiven: input.accountLock !== undefined,
        selfMode,
      });
      if (refusal) throw new OffboardingRefusedError(refusal.code, refusal.details);

      const selfExecuted = selfMode === 'ALLOW_SELF_EXECUTED';
      // The lock of the company account goes first, or with the revocations, in the same transaction (`QĐ-77i`).
      if (input.accountLock) await this.left.writeAccountLock(tx, actor, held, input.accountLock, selfExecuted);
      const reason = input.reason.trim();
      let created = 0;
      let reasonAdded = 0;
      for (const assignmentId of selected) {
        const opened = await this.openOne(tx, actor, held, assignmentId, reason);
        if (opened.created) created += 1;
        else if (opened.reasonAdded) reasonAdded += 1;
      }
      await this.repo.insertChange(tx, {
        caseId: held.id,
        kind: 'REVOCATIONS_OPENED',
        reason,
        detail: { assignmentIds: selected, count: selected.length, created, reasonAdded, source: this.sourceOf(held) },
        changedByAppUserId: actor.appUserId,
        selfExecuted,
      });
      await this.audit.changed(
        tx,
        actor,
        held,
        'OFFBOARDING_CASE.REVOCATIONS_OPENED',
        null,
        { count: selected.length, created, reasonAdded, reason, source: this.sourceOf(held) },
        selfExecuted,
      );

      return { record: (await this.repo.find(held.id, tx)) ?? held, created, reasonAdded };
    });
  }

  /** Closes the case when nothing keeps it open (`US-03-04` AC-20). Throws OffboardingRefusedError with the blockers. */
  close(actor: AuthenticatedPrincipal, id: string): Promise<OffboardingRecord> {
    return this.frame.run(actor, id, {}, async (tx, { held, today }) => {
      const seats = held.state === 'LEFT' ? await this.licensing.listPersonalSeatsOf(held.employeeId, today, tx) : [];
      const terminating = new Set(
        held.state === 'LEFT'
          ? (await this.licensing.listTerminatingAccess([held.employeeId], tx)).map((access) => access.assignmentId)
          : [],
      );
      const refusal = closeRefusal({
        state: held.state,
        closed: held.closedAt !== null,
        lockRecorded: held.accountLockAt !== null,
        openRights: seats.filter((seat) => !terminating.has(seat.assignmentId)).length,
        accessRunsOn: seats.filter((seat) => terminating.has(seat.assignmentId)).length,
        registered: await this.registry.blockersOf(held.employeeId, tx),
      });
      if (refusal) throw new OffboardingRefusedError(refusal.code, refusal.details);
      if (!(await this.repo.close(tx, held.id, actor.appUserId)))
        throw new OffboardingRefusedError('CONCURRENT_CHANGE');
      await this.repo.insertChange(tx, {
        caseId: held.id,
        kind: 'CLOSED',
        changedByAppUserId: actor.appUserId,
        selfExecuted: false,
      });
      await this.audit.changed(
        tx,
        actor,
        held,
        'OFFBOARDING_CASE.CLOSED',
        null,
        { employeeId: held.employeeId },
        false,
      );

      return (await this.repo.find(held.id, tx)) ?? held;
    });
  }

  private sourceOf(held: OffboardingRecord): 'DEPARTURE' | 'ABRUPT_DEPARTURE' {
    return held.abrupt ? 'ABRUPT_DEPARTURE' : 'DEPARTURE';
  }

  private async openOne(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    held: OffboardingRecord,
    assignmentId: string,
    reason: string,
  ) {
    try {
      return await this.licensing.openRevocation(tx, actor, {
        assignmentId,
        source: this.sourceOf(held),
        // The decision is the one of the process of leaving, not of a person: the rights are taken away because the person has left.
        decision: {
          decidedRole: 'OFFBOARDING_PROCESS',
          referenceKind: 'OFFBOARDING_CASE',
          referenceId: held.id,
          note: reason,
        },
        context: { departmentId: held.departmentId },
      });
    } catch (error) {
      if (error instanceof RevocationRefusedError)
        throw new OffboardingRefusedError('REVOCATION_NOT_SUPPORTED', {
          assignmentId,
          problem: error.problem,
          ...(error.provisioningType ? { provisioningType: error.provisioningType } : {}),
        });
      if (error instanceof AssignmentNotOpenError)
        throw new OffboardingRefusedError('ASSIGNMENT_NOT_AVAILABLE', { assignmentId });
      throw error;
    }
  }
}
