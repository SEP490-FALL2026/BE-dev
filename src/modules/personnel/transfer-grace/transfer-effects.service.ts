import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { LicensingApi } from '../../licensing/public/licensing.api';
import type { SystemActor } from '../../licensing/public/licensing.types';
import { RequestsApi } from '../../requests/public/requests.api';
import { heldOnOrBefore } from './transfer-grace.policy';
import type { GraceTransferFacts } from './transfer-grace.types';
import { snapshotRightOf, type TransferSnapshotBefore } from './transfer-snapshot.json';

/**
 * What the system does to the money and the requests of a person the day their transfer takes effect (`QĐ-110o`, `QĐ-111bg`, SPEC MF3-B.4), in
 * the transaction of the transfer: the paid requests sent from the old department that are still open are closed by the system (the ones whose
 * grant is being carried out are left to the IT Admin, who is told), and the money held for each right of the old department goes back to its
 * budget once. Nothing is revoked here and no new commitment is made: the rights stay for the grace, and the new department pays the seat by the
 * month (`SM-1`). Returns the picture of the rights before, for the snapshot.
 */
@Injectable()
export class TransferEffectsService {
  constructor(
    private readonly licensing: LicensingApi,
    private readonly requests: RequestsApi,
  ) {}

  async apply(tx: DbTx, transfer: GraceTransferFacts, today: BusinessDate, now: Date): Promise<TransferSnapshotBefore> {
    const seats = heldOnOrBefore(
      await this.licensing.listPersonalSeatsOf(transfer.employeeId, today, tx),
      transfer.effectiveOn,
    );
    const system: SystemActor = { kind: 'SYSTEM', correlationId: `transfer-effective:${transfer.id}` };
    const gone = await this.requests.cancelForBeneficiaryGone(tx, system, {
      employeeId: transfer.employeeId,
      scope: { kind: 'PAID_OLD_DEPARTMENT', oldDepartmentId: transfer.fromDepartmentId },
      now,
    });
    const released = await this.requests.releaseForTransfer(tx, {
      transferId: transfer.id,
      effectiveOn: transfer.effectiveOn,
      rights: seats.map((seat) => ({ assignmentId: seat.assignmentId, provisioningType: seat.provisioningType })),
      now,
    });

    return {
      takenOn: today,
      rights: seats.map(snapshotRightOf),
      commitmentsReleased: released.released.map((item) => ({
        currency: item.currency,
        amountMinor: item.amountMinor.toString(),
      })),
      requestsCancelled: gone.cancelled.length,
      requestsToCheck: gone.needsItCheck.length,
    };
  }
}
