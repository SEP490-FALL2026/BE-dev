import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { LicensingGhostSeatApi } from '../../licensing/public/licensing-ghost-seat.api';
import type { RuleSeat } from '../../licensing/public/licensing-ghost-seat.types';
import { LicensingApi } from '../../licensing/public/licensing.api';
import { OperatingParametersApi } from '../../operating-parameters/public/operating-parameters.api';
import type { GhostSeatRecord } from '../ghost-seat/ghost-seat.types';
import { GhostSeatDecisionRefusedError, isSeatNotRevocable } from './decision.errors';
import { graceNotBefore } from './decision.policy';

/** The role the head decides a reclaim in, kept on the reason of the task: the handover step is the head's (`QĐ-64a`). */
export const DECISION_ROLE = 'DEPARTMENT_HEAD';
/** What the reason of the task refers to: the recommendation, so the end of the seat can say it was accepted. */
export const DECISION_REFERENCE_KIND = 'GHOST_SEAT_RECOMMENDATION';
/** The parameter that says how many calendar days the holder is told before the revocation can be taken. */
export const GRACE_DAYS_PARAMETER = 'GHOST_SEAT_REVOCATION_GRACE_DAYS';

/**
 * The reclaim of the seat a head decided on: the one way to take it is the gate of licensing (`SBF-18`, source `GHOST_SEAT`), asked with
 * the grace of the head's decision (`notBefore`) and, the first time, the notice to the holder. The caller has locked the recommendation
 * already (`DA6-23`: the recommendations first, then licensing). Throws GhostSeatDecisionRefusedError when the gate refuses the seat.
 */
@Injectable()
export class DecisionReclaimService {
  constructor(
    private readonly licensing: LicensingApi,
    private readonly seats: LicensingGhostSeatApi,
    private readonly parameters: OperatingParametersApi,
  ) {}

  /** The open seat of each recommendation's chain today, by recommendation id; a chain with no open seat is absent. */
  async openSeatsOf(
    tx: DbTx,
    today: BusinessDate,
    records: readonly GhostSeatRecord[],
  ): Promise<Map<string, RuleSeat>> {
    const employeeIds = [...new Set(records.flatMap((record) => record.employeeId ?? []))];
    const seats = await this.seats.listSeatsForRules({ asOf: today, employeeIds }, tx);
    const byChain = new Map(seats.map((seat) => [seat.chainRootId, seat] as const));

    return new Map(
      records.flatMap((record) => {
        const seat = record.seatChainId ? byChain.get(record.seatChainId) : undefined;

        return seat ? [[record.id, seat] as const] : [];
      }),
    );
  }

  /** The grace in calendar days (`QĐ-94j`). */
  async graceDays(): Promise<number> {
    return Number(await this.parameters.getValue(GRACE_DAYS_PARAMETER));
  }

  /** Opens the revocation of the seat with the decision of the head; returns the task and the first day it can be taken. */
  async open(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    record: GhostSeatRecord,
    seat: RuleSeat,
    input: { reason: string; today: BusinessDate; graceDays: number },
  ): Promise<{ taskId: string; notBefore: BusinessDate }> {
    const notBefore = graceNotBefore({
      decidedOn: input.today,
      graceDays: input.graceDays,
      previous: record.revocationNotBefore,
    });
    try {
      const opened = await this.licensing.openRevocation(tx, actor, {
        assignmentId: seat.assignmentId,
        source: 'GHOST_SEAT',
        decision: {
          decidedByEmployeeId: actor.employeeId,
          decidedRole: DECISION_ROLE,
          referenceKind: DECISION_REFERENCE_KIND,
          referenceId: record.id,
          note: input.reason,
        },
        timing: { notBefore },
        ...(record.returnCount === 0 ? { notice: { holder: true as const } } : {}),
      });

      return { taskId: opened.taskId, notBefore };
    } catch (error) {
      if (isSeatNotRevocable(error)) {
        throw new GhostSeatDecisionRefusedError([{ recommendationId: record.id, code: 'SEAT_NOT_REVOCABLE' }]);
      }
      throw error;
    }
  }
}
