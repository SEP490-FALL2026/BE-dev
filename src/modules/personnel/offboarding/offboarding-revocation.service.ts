import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { LicensingApi } from '../../licensing/public/licensing.api';
import { userActor } from '../public/personnel.types';
import { RevocationRefusedError, AssignmentNotOpenError } from '../../licensing/public/licensing.errors';
import { OffboardingAuditService } from './offboarding-audit.service';
import { OffboardingFrame } from './offboarding-frame.service';
import { OffboardingLeftService } from './offboarding-left.service';
import { OffboardingRefusedError } from './offboarding.errors';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import {
  departureRevocationSource,
  isBlocked,
  ownBlock,
  revocationSelection,
  type RightFacts,
} from './offboarding.policy';
import { isRevocableType } from '../departure-deadline/departure-impact.policy';
import { OffboardingRepo } from './offboarding.repo';
import type { OffboardingRecord, OpenRevocationsInput } from './offboarding.types';

export interface RevocationsOpened {
  record: OffboardingRecord;
  /** Tasks made, and seats that already had one and were given the reason of the departure besides. */
  created: number;
  reasonAdded: number;
}

/** The standard reason of the revocations a departure opens (`QĐ-77j`): the IT Admin may add a note, never a count. */
export const DEPARTURE_REVOCATION = 'DEPARTURE_REVOCATION';

/**
 * The IT Admin takes the rights of a person who has left away, all at once from the list of the rights the case keeps (`US-03-04` AC-4,
 * AC-5, AC-16, `QĐ-62i`, `QĐ-77i`). Nothing is taken away by itself: a task is made for a seat only when the IT Admin asks for it, with the
 * standard reason of a departure and the note they add (the server counts the rights), and after the lock of the company account is written or
 * together with it. Every task goes through the one gate of `licensing`, in one transaction with the case. Closing the case is not here: the
 * system closes it when every revocation is completed and the lock of the mailbox for good is written (`departure-closure/`, `QĐ-110e`).
 */
@Injectable()
export class OffboardingRevocationService {
  constructor(
    private readonly frame: OffboardingFrame,
    private readonly repo: OffboardingRepo,
    private readonly licensing: LicensingApi,
    private readonly left: OffboardingLeftService,
    private readonly audit: OffboardingAuditService,
    private readonly identity: IdentityAccessApi,
  ) {}

  /** Opens the revocations the IT Admin chose. Throws OffboardingRefusedError. */
  openRevocations(actor: AuthenticatedPrincipal, id: string, input: OpenRevocationsInput): Promise<RevocationsOpened> {
    return this.frame.runTechnical(actor, id, {}, async (tx, { held, today }) => {
      const blocked = isBlocked(
        held,
        ownBlock(await this.identity.findDepartureBlock(held.employeeId, tx), held.id),
        today,
      );
      const seats = blocked ? await this.licensing.listPersonalSeatsOf(held.employeeId, today, tx) : [];
      const rights: RightFacts[] = seats.map((seat) => ({
        assignmentId: seat.assignmentId,
        hasTask: seat.revocation !== null,
        revocable: isRevocableType(seat.provisioningType),
        provisioningType: seat.provisioningType,
      }));
      const { refusal, selected } = revocationSelection({
        blocked,
        closed: held.closedAt !== null,
        named: input.assignmentIds,
        rights,
        lockRecorded: held.accountLockAt !== null,
        lockGiven: input.accountLock !== undefined,
      });
      if (refusal) throw new OffboardingRefusedError(refusal.code, refusal.details);

      // The lock of the company account goes first, or with the revocations, in the same transaction (`QĐ-77i`).
      if (input.accountLock) await this.left.writeAccountLock(tx, actor, held, input.accountLock);
      const note = input.note?.trim();
      const reason = note ? `${DEPARTURE_REVOCATION}: ${note}` : DEPARTURE_REVOCATION;
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
        changedByTicketId: null,
      });
      await this.audit.changed(tx, userActor(actor), held, 'OFFBOARDING_CASE.REVOCATIONS_OPENED', null, {
        count: selected.length,
        created,
        reasonAdded,
        reason,
        source: this.sourceOf(held),
      });

      return { record: (await this.repo.find(held.id, tx)) ?? held, created, reasonAdded };
    });
  }

  private sourceOf(held: OffboardingRecord): 'DEPARTURE' | 'ABRUPT_DEPARTURE' {
    return departureRevocationSource(held.accessBlockMode);
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
        context: { ...(held.departmentId ? { departmentId: held.departmentId } : {}) },
        // The task is due the day the case is (`QĐ-110c`, `M-09`): one deadline for every right of the person. A case closed before the rule has none.
        ...(held.revocationDueOn ? { timing: { dueOn: held.revocationDueOn } } : {}),
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
