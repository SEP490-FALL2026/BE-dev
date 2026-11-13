import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { CatalogResponsibilityApi } from '../../catalog/public/catalog-responsibility.api';
import { LicensingApi } from '../../licensing/public/licensing.api';
import { RequestsApi } from '../../requests/public/requests.api';
import { DepartureDeadlineService } from './departure-deadline.service';
import { commitmentToRelease, rightToRevokeOf, vendorAdminRoleLabel } from './departure-impact.policy';
import type { DepartureImpact, DepartureImpactInput } from './departure-impact.types';

/**
 * What a departure does to a person, read and never written (`P23`, `MIN-7`, `QĐ-110c`, `QĐ-110d`): the seats the IT Admin takes away, the
 * open requests the system closes the day the access is blocked and those it leaves to the IT Admin because a grant is being carried
 * out, what the closed ones hold of the budget and give back, and the day the IT Admin has until. The record of the departure (`P1`) and the
 * preview before it share this one reading, so what the Super Admin is shown is what the system then does. It judges nothing and refuses
 * nothing: the caller has already judged whether the person may leave, and says whether a head needs a successor. Everything is read in the
 * transaction of the caller and no lock is taken.
 *
 * `responsibilities` is what an IT Admin who leaves answers for in the catalog (subscriptions and applications, `R-8`); `vendorAdminRoles` lists the
 * plans they administer at the vendor (`QĐ-110k`), as `<application> / <plan> (OWNER|ADMIN)`.
 */
@Injectable()
export class DepartureImpactService {
  constructor(
    private readonly licensing: LicensingApi,
    private readonly requests: RequestsApi,
    private readonly deadlines: DepartureDeadlineService,
    private readonly responsibilities: CatalogResponsibilityApi,
  ) {}

  async impactOf(tx: DbTx, input: DepartureImpactInput): Promise<DepartureImpact> {
    const seats = await this.licensing.listPersonalSeatsOf(input.employeeId, input.today, tx);
    const gone = await this.requests.previewBeneficiaryGone(tx, {
      employeeId: input.employeeId,
      scope: { kind: 'ALL_OPEN' },
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

    return {
      rightsToRevoke: seats.map(rightToRevokeOf),
      openRequestsToCancel: gone.wouldCancel.map(ofItem),
      provisioningInFlight: gone.needsItCheck.map(ofItem),
      commitmentToRelease: commitmentToRelease(gone.heldToRelease),
      responsibilities: { subscriptions: answersFor?.subscriptions ?? 0, applications: answersFor?.applications ?? 0 },
      vendorAdminRoles: (await this.responsibilities.vendorAdminRolesOf(input.employeeId, tx)).map(
        vendorAdminRoleLabel,
      ),
      headSuccessorRequired: input.headSuccessorRequired,
      revocationDueOn: await this.deadlines.revocationDueOn(input.lastWorkingDay),
    };
  }
}
