import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { LicensingApi } from '../../licensing/public/licensing.api';
import { OperatingParametersApi } from '../../operating-parameters/public/operating-parameters.api';
import { RequestsApi } from '../../requests/public/requests.api';
import { commitmentToRelease, rightToRevokeOf } from '../departure-deadline/departure-impact.policy';
import { graceEndsOn, graceReminderOn, graceWindowEnd } from './transfer-grace.policy';
import type { TransferImpact, TransferImpactInput } from './transfer-impact.types';

/**
 * What a transfer does to a person, read and never written (`P23`, `MIN-7`, `QĐ-110n`, `QĐ-110o`, `QĐ-110p`): the personal rights the
 * system takes back when the grace ends, the paid requests of the old department it closes the day the transfer takes effect and those it
 * leaves to the IT Admin because a grant is being carried out, what the closed ones hold of the budget and give back, and the days the
 * grace ends and the person is told. The record of the transfer (`P6`) and the preview before it share this one reading, so what the Super
 * Admin is shown is what the system then does. It judges nothing and refuses nothing: the caller has already judged whether the person may
 * move, and says whether a head needs a successor. Everything is read in the transaction of the caller and no lock is taken.
 *
 * Not yet counted, for lack of a source: see {@link TransferImpact}.
 */
@Injectable()
export class TransferImpactService {
  constructor(
    private readonly licensing: LicensingApi,
    private readonly requests: RequestsApi,
    private readonly parameters: OperatingParametersApi,
  ) {}

  async impactOf(tx: DbTx, input: TransferImpactInput): Promise<TransferImpact> {
    const seats = await this.licensing.listPersonalSeatsOf(input.employeeId, input.today, tx);
    const gone = await this.requests.previewBeneficiaryGone(tx, {
      employeeId: input.employeeId,
      scope: { kind: 'PAID_OLD_DEPARTMENT', oldDepartmentId: input.fromDepartmentId },
    });
    const ofItem = ({ requestId, type, state, line }: (typeof gone.wouldCancel)[number]) => ({
      requestId,
      type,
      state,
      line,
    });
    const grace = await this.graceOf(input.effectiveOn);

    return {
      rightsToRevoke: seats.map(rightToRevokeOf),
      openRequestsToCancel: gone.wouldCancel.map(ofItem),
      provisioningInFlight: gone.needsItCheck.map(ofItem),
      commitmentToRelease: commitmentToRelease(gone.heldToRelease),
      responsibilities: { subscriptions: null, applications: null },
      vendorAdminRoles: [],
      headSuccessorRequired: input.headSuccessorRequired,
      ...grace,
    };
  }

  /** The last day of the grace and the day of the reminder, from the two parameters and the days off of the calendar of the organization. */
  private async graceOf(effectiveOn: string): Promise<Pick<TransferImpact, 'graceEndsOn' | 'graceReminderOn'>> {
    const days = Number(await this.parameters.getValue('TRANSFER_GRACE_WORKING_DAYS'));
    const reminderDays = Number(await this.parameters.getValue('TRANSFER_GRACE_REMINDER_WORKING_DAYS'));
    const nonWorking = await this.parameters.getNonWorkingDates(effectiveOn, graceWindowEnd(effectiveOn));
    const endsOn = graceEndsOn(effectiveOn, days, nonWorking);

    return { graceEndsOn: endsOn, graceReminderOn: graceReminderOn(effectiveOn, endsOn, reminderDays, nonWorking) };
  }
}
