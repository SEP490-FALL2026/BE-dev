import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { SystemActor } from '../../licensing/public/licensing.types';
import { OpenRequestService } from '../access-request/open-request/open-request.service';
import { BeneficiaryGoneCancellation } from '../cancellation/beneficiary-gone-cancellation.service';
import { SeatReleaseService } from '../grant/seat-release.service';
import type {
  BeneficiaryGoneInput,
  BeneficiaryGonePreview,
  BeneficiaryGoneResult,
  OpenRequestOfBeneficiary,
  TransferReleaseInput,
  TransferReleaseResult,
} from './requests.types';

/**
 * The facade of the requests context that other contexts call. It answers what the personnel context shows beside the record of a
 * departure: the requests of the person that are still open (`US-03-04` AC-24). Nothing it reads is changed by reading it; the acts on
 * a request that follow a departure are the IT Admin's route to close it and the closing by the system of the person who is gone.
 */
@Injectable()
export class RequestsApi {
  constructor(
    private readonly open: OpenRequestService,
    private readonly gone: BeneficiaryGoneCancellation,
    private readonly seats: SeatReleaseService,
  ) {}

  /**
   * The system closes the open requests of a person who is gone, in the caller's transaction (`QĐ-110d`, `QĐ-110o`): `ALL_OPEN` the day
   * access is blocked (MF-2), `PAID_OLD_DEPARTMENT` the day a transfer takes effect (MF-3). A request with no grant task begun ends as
   * cancelled, what was held for it going back to the budget, and the requester and Finance are told; one whose grant is being carried out
   * is left as it is and returned in `needsItCheck`, the IT Admin in charge being told in the inbox. Run again, it closes nothing twice.
   */
  async cancelForBeneficiaryGone(
    tx: DbTx,
    actor: SystemActor,
    input: BeneficiaryGoneInput,
  ): Promise<BeneficiaryGoneResult> {
    return this.gone.run(tx, actor, input, await this.open.idsOf(tx, input.employeeId));
  }

  /**
   * Gives back to the budget of the old department the rest of the money held for each old right of a person whose transfer takes effect
   * (`QĐ-111bg`), in the caller's transaction: the share of `revocationShare` with the day the transfer takes effect as the end, on the
   * commitments of the request that made the right and of the requests that go on using it, at the price a month kept on each. Once for
   * each right: it names `transfer:<transferId>:assignment:<assignmentId>`, so run again it gives nothing back again, and the revocation
   * that follows the grace (source `TRANSFER`) gives nothing back either. No new commitment is made for the new department. Never throws
   * for a right with no request, no commitment, a closed year or a price that is not by the month.
   */
  releaseForTransfer(tx: DbTx, input: TransferReleaseInput): Promise<TransferReleaseResult> {
    return this.seats.afterTransferEffective(tx, input, input.now ?? new Date());
  }

  /**
   * What `cancelForBeneficiaryGone` would do for the same input, read and never written, in the caller's transaction: the requests it
   * would end, those it would leave to the IT Admin, and what the ones that end hold of the budget. Locks nothing and tells nobody.
   */
  async previewBeneficiaryGone(tx: DbTx, input: BeneficiaryGoneInput): Promise<BeneficiaryGonePreview> {
    return this.gone.preview(tx, input, await this.open.idsOf(tx, input.employeeId));
  }

  /**
   * The requests the person is the beneficiary of that are not over (a request of their own that has not ended, or the person's share of
   * a request for a group that has not ended), oldest first, with how many there are in all. The requests that wait for the IT Admin to
   * close the task of a withdrawal are not among them. The cost of a page is the same whatever its size. `filter.departmentId` keeps
   * only the requests that were sent from that department: a person who changed department keeps the open requests of the old one
   * out of the answer of the new head.
   */
  listOpenOfBeneficiary(
    employeeId: string,
    page: { skip: number; take: number },
    tx?: DbTx,
    filter: { departmentId?: string } = {},
  ): Promise<{ items: OpenRequestOfBeneficiary[]; total: number }> {
    return this.open.pageOf(employeeId, page, tx, filter);
  }
}
