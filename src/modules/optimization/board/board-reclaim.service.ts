import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { LicensingApi } from '../../licensing/public/licensing.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { GhostSeatRepo } from '../ghost-seat/ghost-seat.repo';
import { GhostSeatService } from '../ghost-seat/ghost-seat.service';
import { isReclaimable } from '../ghost-seat/ghost-seat-state.policy';
import { GhostSeatNotFoundError, GhostSeatNotReclaimableError } from './board.errors';
import { BoardQueryService } from './board-query.service';

/** The role the IT Admin decides a reclaim of a `G2` in, kept on the reason of the task (`US-10-05` AC-5). */
export const RECLAIM_DECIDED_ROLE = 'IT_ADMIN_G2';
/** What the reason of the task refers to: the recommendation, so the end of the seat can say it was accepted. */
export const RECLAIM_REFERENCE_KIND = 'GHOST_SEAT_RECOMMENDATION';

/**
 * The IT Admin opens the reclaim of a `G2` (`US-10-05` AC-5, AC-8; `QĐ-58b`: any IT Admin may, the audit says whether it was the one in
 * charge): the recommendation is locked `FOR UPDATE` first (`DA6-23`), then the revocation is opened through the one gate of licensing
 * (`SBF-18`, source `ABRUPT_DEPARTURE`, `Q-83` a `TẠM CHỌN`) with no timing and no notice (`US-10-07` AC-18: a person who left has no
 * grace), and the recommendation holds the task. Nothing is revoked here: the task is the IT Admin's work.
 * Throws GhostSeatNotFoundError, GhostSeatNotReclaimableError and, from the gate, RevocationRefusedError, AssignmentNotFoundError,
 * AssignmentNotOpenError and SeatTargetNotFoundError.
 */
@Injectable()
export class BoardReclaimService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly repo: GhostSeatRepo,
    private readonly ghostSeats: GhostSeatService,
    private readonly licensing: LicensingApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly queries: BoardQueryService,
  ) {}

  async reclaim(actor: AuthenticatedPrincipal, id: string) {
    const done = await this.runner.run(async (tx) => {
      const record = await this.repo.lock(tx, id);
      const organization = await this.organizationReads.getOrganization(tx);
      if (!record || record.organizationId !== organization?.id) throw new GhostSeatNotFoundError();
      if (!isReclaimable(record) || record.assignmentId === null) throw new GhostSeatNotReclaimableError();
      const opened = await this.licensing.openRevocation(tx, actor, {
        assignmentId: record.assignmentId,
        source: 'ABRUPT_DEPARTURE',
        decision: {
          decidedByEmployeeId: actor.employeeId,
          decidedRole: RECLAIM_DECIDED_ROLE,
          referenceKind: RECLAIM_REFERENCE_KIND,
          referenceId: record.id,
        },
      });
      const inCharge = record.departmentId
        ? await this.organizationReads.getItAdminInChargeOfDepartment(record.departmentId, tx)
        : null;
      await this.ghostSeats.markReclaimDecided(
        tx,
        record,
        opened.taskId,
        { kind: 'USER', principal: actor },
        inCharge === actor.employeeId,
      );

      return { id: record.id, taskId: opened.taskId };
    });
    const updated = await this.repo.find(done.id);
    if (!updated) throw new GhostSeatNotFoundError();

    return { recommendation: await this.queries.detailOf(updated), taskId: done.taskId };
  }
}
