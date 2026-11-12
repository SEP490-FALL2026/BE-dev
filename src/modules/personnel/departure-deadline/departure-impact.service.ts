import { Injectable } from '@nestjs/common';
import { addDays } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { LicensingApi } from '../../licensing/public/licensing.api';
import { OperatingParametersApi } from '../../operating-parameters/public/operating-parameters.api';
import { RequestsApi } from '../../requests/public/requests.api';
import { commitmentToRelease, impactWindowEnd, revocationDueOn, rightToRevokeOf } from './departure-impact.policy';
import type { DepartureImpact, DepartureImpactInput } from './departure-impact.types';

/**
 * What a departure does to a person, read and never written (`P23`, `MIN-7`, `QĐ-110c`, `QĐ-110d`): the seats the IT Admin takes away, the
 * open requests the system closes the day the access is blocked and those it leaves to the IT Admin because a grant is being carried
 * out, what the closed ones hold of the budget and give back, and the day the IT Admin has until. The record of the departure (`P1`) and the
 * preview before it share this one reading, so what the Super Admin is shown is what the system then does. It judges nothing and refuses
 * nothing: the caller has already judged whether the person may leave, and says whether a head needs a successor. Everything is read in the
 * transaction of the caller and no lock is taken.
 *
 * Not yet counted, for lack of a source: the subscriptions and applications an IT Admin who leaves is responsible for
 * (`responsibilities`, null until the hand-over of an IT Admin, X-IT) and the vendor admin roles they hold (`vendorAdminRoles`, empty).
 */
@Injectable()
export class DepartureImpactService {
  constructor(
    private readonly licensing: LicensingApi,
    private readonly requests: RequestsApi,
    private readonly parameters: OperatingParametersApi,
  ) {}

  async impactOf(tx: DbTx, input: DepartureImpactInput): Promise<DepartureImpact> {
    const seats = await this.licensing.listPersonalSeatsOf(input.employeeId, input.today, tx);
    const gone = await this.requests.previewBeneficiaryGone(tx, {
      employeeId: input.employeeId,
      scope: { kind: 'ALL_OPEN' },
    });
    const ofItem = ({ requestId, type, state, line }: (typeof gone.wouldCancel)[number]) => ({
      requestId,
      type,
      state,
      line,
    });

    return {
      rightsToRevoke: seats.map(rightToRevokeOf),
      openRequestsToCancel: gone.wouldCancel.map(ofItem),
      provisioningInFlight: gone.needsItCheck.map(ofItem),
      commitmentToRelease: commitmentToRelease(gone.heldToRelease),
      responsibilities: { subscriptions: null, applications: null },
      vendorAdminRoles: [],
      headSuccessorRequired: input.headSuccessorRequired,
      revocationDueOn: await this.dueOn(input),
    };
  }

  /** The `DEPARTURE_REVOCATION_WORKING_DAYS`th working day from the day after the last one, over the days off of the calendar. */
  private async dueOn(input: DepartureImpactInput) {
    const days = Number(await this.parameters.getValue('DEPARTURE_REVOCATION_WORKING_DAYS'));
    const nonWorking = await this.parameters.getNonWorkingDates(
      addDays(input.lastWorkingDay, 1),
      impactWindowEnd(input.lastWorkingDay),
    );

    return revocationDueOn(input.lastWorkingDay, days, nonWorking);
  }
}
