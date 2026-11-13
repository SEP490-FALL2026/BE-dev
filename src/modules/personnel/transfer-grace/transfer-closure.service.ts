import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { AuditApi } from '../../audit/public/audit.api';
import { LicensingApi } from '../../licensing/public/licensing.api';
import type { PersonalSeat } from '../../licensing/public/licensing.types';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { personnelSystemAuditEvent } from '../personnel-audit-event.mapper';
import { TransferGraceRepo } from './transfer-grace.repo';
import { heldOnOrBefore } from './transfer-grace.policy';
import type { HeldTransfer } from './transfer-grace.types';
import { snapshotRightOf, type SnapshotRight, type TransferSnapshotAfter } from './transfer-snapshot.json';
import { closureDue, rightOutcome, rightsToTakeBack, supersedable, sweptOf } from './transfer-sweep.policy';

/** How the transfer is closed: the departure that took the rights over, or none. */
interface Finish {
  seats: readonly PersonalSeat[];
  today: BusinessDate;
  now: Date;
  supersededByCaseId: string | null;
}

/**
 * The system closes the transfer of a person who moved (`QĐ-110r`, SPEC MF3-C.2), with no account (`closed_by_system`) and the picture of what became
 * of each right (`snapshot_after`):
 *
 * - **Every right taken back.** The grace is over and no right of the old department is left to take back (`closeIfDue`): every task of revocation
 *   completed, or the person held nothing, or the rights ended another way. A transfer whose person held nothing is closed too — it is asked at each
 *   pass of the sweep after the revocation is opened — or the person could never be moved again (`409 TRANSFER_SETTLING`), the transfer from before the
 *   grace (m-17) included. It is asked as well the moment a task of revocation of the person is completed (`TransferClosureListener`).
 * - **A departure in the grace.** A departure recorded while the grace lasts takes the old rights over: MF-2 revokes them by its own deadline, so the
 *   transfer is closed as superseded by that case (`supersede`, `superseded_by_case_id`) and the sweep never opens a revocation for it.
 *
 * Done in the transaction of the caller, which holds the employee and the transfer. Closing twice is a no-op.
 */
@Injectable()
export class TransferClosureService {
  constructor(
    private readonly licensing: LicensingApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly graces: TransferGraceRepo,
    private readonly audit: AuditApi,
  ) {}

  /** Closes the held transfer when nothing is left to take back; false when something is, or the grace is not over. */
  async closeIfDue(tx: DbTx, held: HeldTransfer, now: Date = new Date()): Promise<boolean> {
    const today = await this.organizationReads.businessToday(now, tx);
    const seats = await this.licensing.listPersonalSeatsOf(held.employeeId, today, tx);
    if (!closureDue(sweptOf(held), rightsToTakeBack(seats, held.effectiveOn).length, today)) return false;

    return this.finish(tx, held, { seats, today, now, supersededByCaseId: null });
  }

  /**
   * A departure was recorded for the person: the transfer in its grace is closed as superseded by that case. False when the person has no transfer
   * in its grace (none, or the grace is over and the revocation is open, which the departure adds its reason to). The caller holds the employee.
   */
  async supersede(tx: DbTx, input: { employeeId: string; caseId: string; now?: Date }): Promise<boolean> {
    const now = input.now ?? new Date();
    const held = await this.graces.lockUnclosedOf(tx, input.employeeId);
    const today = await this.organizationReads.businessToday(now, tx);
    if (!held || !supersedable(sweptOf(held), today)) return false;
    const seats = await this.licensing.listPersonalSeatsOf(held.employeeId, today, tx);

    return this.finish(tx, held, { seats, today, now, supersededByCaseId: input.caseId });
  }

  private async finish(tx: DbTx, held: HeldTransfer, how: Finish): Promise<boolean> {
    const rights: SnapshotRight[] =
      held.snapshotBefore?.rights ?? heldOnOrBefore(how.seats, held.effectiveOn).map(snapshotRightOf);
    const after = await this.outcomesOf(tx, held, rights, how);
    if (!(await this.graces.close(tx, held.id, { at: how.now, after, supersededByCaseId: how.supersededByCaseId })))
      return false;
    const superseded = how.supersededByCaseId !== null;
    await this.audit.record(
      tx,
      personnelSystemAuditEvent(
        held.organizationId,
        superseded ? 'DEPARTMENT_TRANSFER.SUPERSEDED' : 'DEPARTMENT_TRANSFER.CLOSED',
        'DepartmentTransfer',
        held.id,
        superseded ? `offboarding:${how.supersededByCaseId}` : `transfer-grace:${held.id}`,
        { closed: false },
        {
          employeeId: held.employeeId,
          closedBySystem: true,
          rights: after.rights.length,
          ...(superseded ? { supersededByCaseId: how.supersededByCaseId } : {}),
          ...countsOf(after),
        },
      ),
    );

    return true;
  }

  private async outcomesOf(
    tx: DbTx,
    held: HeldTransfer,
    rights: readonly SnapshotRight[],
    how: Finish,
  ): Promise<TransferSnapshotAfter> {
    const ids = rights.map((right) => right.assignmentId);
    const open = new Set(how.seats.filter((seat) => seat.validUntil === null).map((seat) => seat.assignmentId));
    const revoked = await this.licensing.listRevocationsOpenedFor(
      { sources: ['TRANSFER'], referenceId: held.id },
      ids,
      tx,
    );
    // The rights asked for again on the same subscription and granted in the grace are added by R-49 (MF3-C.4): none are known before it.
    const regranted: ReadonlySet<string> = new Set<string>();

    return {
      takenOn: how.today,
      rights: rights.map((right) => ({
        assignmentId: right.assignmentId,
        outcome: rightOutcome({
          // A right still open when a departure takes the transfer over is the departure's to take back; at a closing none is left.
          held: how.supersededByCaseId !== null && open.has(right.assignmentId),
          revoked: revoked.has(right.assignmentId),
          regranted: regranted.has(right.assignmentId),
        }),
      })),
    };
  }
}

/** How many rights ended in each way, for the Audit Trail. */
function countsOf(after: TransferSnapshotAfter): Record<string, number> {
  const counts = { revoked: 0, ended: 0, regranted: 0, takenOver: 0 };
  for (const right of after.rights) {
    if (right.outcome === 'REVOKED') counts.revoked += 1;
    else if (right.outcome === 'REGRANTED') counts.regranted += 1;
    else if (right.outcome === 'TAKEN_OVER') counts.takenOver += 1;
    else counts.ended += 1;
  }

  return counts;
}
