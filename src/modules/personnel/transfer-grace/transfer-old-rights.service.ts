import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { LicensingApi } from '../../licensing/public/licensing.api';
import { heldOnOrBefore } from './transfer-grace.policy';
import { OLD_RIGHTS_MAX, type OldRightWire } from './transfer-grace.dto';
import { snapshotRightOf, type SnapshotRight, type TransferSnapshotBefore } from './transfer-snapshot.json';

/** What the old rights of one transfer are read from. */
export interface OldRightsInput {
  employeeId: string;
  /** The day the transfer takes effect (or took effect). */
  effectiveOn: BusinessDate;
  /** A closed transfer has no right left to look for: each right of its picture has ended. */
  closed: boolean;
  /** The picture of the rights the day it took effect; null for a transfer that took effect before the grace existed. */
  snapshot: TransferSnapshotBefore | null;
  today: BusinessDate;
}

/**
 * The old rights of a transfer as P7 and P8 show them (`QĐ-110p`): the rights of the picture taken the day the transfer took effect, each with
 * where it stands today (still held, being taken away by a task, or no longer held). A transfer that took effect before the grace existed has no
 * picture: its old rights are the ones the person holds now that began on or before that day. Read only, a fixed number of statements however
 * many rights there are.
 */
@Injectable()
export class TransferOldRightsService {
  constructor(private readonly licensing: LicensingApi) {}

  async of(input: OldRightsInput, tx?: DbTx): Promise<OldRightWire[]> {
    const seats = input.closed ? [] : await this.licensing.listPersonalSeatsOf(input.employeeId, input.today, tx);
    const base: SnapshotRight[] =
      input.snapshot?.rights ?? (input.closed ? [] : heldOnOrBefore(seats, input.effectiveOn).map(snapshotRightOf));
    const held = new Map(seats.map((seat) => [seat.assignmentId, seat]));
    // A right the person asked for again in the grace and was given on the same subscription was ended by that grant (R-49): it is not taken back.
    const regranted = await this.licensing.listRegrantedAssignments(
      base.map((right) => right.assignmentId),
      tx,
    );

    return base.slice(0, OLD_RIGHTS_MAX).map((right) => {
      const seat = held.get(right.assignmentId);

      return {
        assignmentId: right.assignmentId,
        application: { id: right.applicationId, name: right.applicationName },
        plan: { id: right.planId, name: right.planName },
        provisioningType: right.provisioningType,
        state: seat === undefined ? 'ENDED' : seat.revocation === null ? 'HELD' : 'REVOKING',
        revocation: seat?.revocation ? { taskId: seat.revocation.taskId, status: seat.revocation.status } : null,
        regranted: regranted.has(right.assignmentId),
      };
    });
  }
}
