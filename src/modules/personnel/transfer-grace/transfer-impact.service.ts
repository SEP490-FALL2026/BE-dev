import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { CatalogResponsibilityApi } from '../../catalog/public/catalog-responsibility.api';
import { LicensingApi } from '../../licensing/public/licensing.api';
import { OperatingParametersApi } from '../../operating-parameters/public/operating-parameters.api';
import { RequestsApi } from '../../requests/public/requests.api';
import {
  commitmentToRelease,
  rightToRevokeOf,
  vendorAdminRoleLabel,
} from '../departure-deadline/departure-impact.policy';
import { graceOf, graceStartsOn, graceWindowEnd, heldOnOrBefore } from './transfer-grace.policy';
import { rightsToTakeBack } from './transfer-sweep.policy';
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
    private readonly responsibilities: CatalogResponsibilityApi,
  ) {}

  async impactOf(tx: DbTx, input: TransferImpactInput): Promise<TransferImpact> {
    const seats = await this.licensing.listPersonalSeatsOf(input.employeeId, input.today, tx);
    // The picture of the rights the day the transfer takes effect would keep (the very call `TransferEffectsService` makes) and the rights the sweeper of
    // the grace then takes back from it (`rightsToTakeBack`, which tells an old right by `isOldRightOf`): one definition of the old rights for the grace and for this reading.
    const picture = heldOnOrBefore(seats, input.effectiveOn);
    const toTakeBack = rightsToTakeBack(seats, {
      effectiveOn: input.effectiveOn,
      pictureIds: picture.map((seat) => seat.assignmentId),
    });
    const gone = await this.requests.previewBeneficiaryGone(tx, {
      employeeId: input.employeeId,
      scope: { kind: 'PAID_OLD_DEPARTMENT', oldDepartmentId: input.fromDepartmentId },
    });
    const answersFor = (await this.responsibilities.countResponsibilitiesOf([input.employeeId], tx)).get(
      input.employeeId,
    );
    const ofItem = ({ requestId, type, state, line }: (typeof gone.wouldCancel)[number]) => ({
      requestId,
      type,
      state,
      line,
    });
    const grace = await this.graceDays(input.effectiveOn, input.today);

    return {
      rightsToRevoke: toTakeBack.map(rightToRevokeOf),
      openRequestsToCancel: gone.wouldCancel.map(ofItem),
      provisioningInFlight: gone.needsItCheck.map(ofItem),
      commitmentToRelease: commitmentToRelease(gone.heldToRelease),
      responsibilities: { subscriptions: answersFor?.subscriptions ?? 0, applications: answersFor?.applications ?? 0 },
      vendorAdminRoles: (await this.responsibilities.vendorAdminRolesOf(input.employeeId, tx)).map(
        vendorAdminRoleLabel,
      ),
      headSuccessorRequired: input.headSuccessorRequired,
      ...grace,
    };
  }

  /** The last day of the grace and the day of the reminder, from the two parameters and the days off of the calendar of the organization. */
  private async graceDays(
    effectiveOn: string,
    today: string,
  ): Promise<Pick<TransferImpact, 'graceEndsOn' | 'graceReminderOn'>> {
    const startsOn = graceStartsOn(effectiveOn, today);
    const grace = graceOf({
      effectiveOn,
      notedOn: today,
      workingDays: Number(await this.parameters.getValue('TRANSFER_GRACE_WORKING_DAYS')),
      reminderWorkingDays: Number(await this.parameters.getValue('TRANSFER_GRACE_REMINDER_WORKING_DAYS')),
      nonWorkingDates: await this.parameters.getNonWorkingDates(startsOn, graceWindowEnd(startsOn)),
    });

    return { graceEndsOn: grace.endsOn, graceReminderOn: grace.reminderOn };
  }
}
