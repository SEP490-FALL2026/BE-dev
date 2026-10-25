import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { CatalogService } from '../../catalog/catalog.service';
import { OrganizationService } from '../../organization/organization.service';
import type { PersonalSeat, TerminatingAccess } from '../licensing.types';
import { RevocationReadRepo } from './revocation-read.repo';

/**
 * What the lists that come after a revocation read through the facade (`g6-offboarding-record`, `g6-transfer-tool-review`): the
 * personal seats of a person, with how each is taken away and the revocation that is under way, and the K1 seats whose access
 * runs on to the end of a paid period. Each is a fixed number of statements, however many seats it covers.
 */
@Injectable()
export class RevocationReadService {
  constructor(
    private readonly reads: RevocationReadRepo,
    private readonly catalog: CatalogService,
    private readonly organization: OrganizationService,
  ) {}

  async personalSeatsOf(employeeId: string, onDate: BusinessDate, tx?: DbTx): Promise<PersonalSeat[]> {
    const rows = await this.reads.personalSeatsOf(employeeId, onDate, tx);
    const plans = new Map(
      (await this.catalog.getPlanRevocationInfo([...new Set(rows.map((row) => row.planId))], tx)).map((plan) => [
        plan.planId,
        plan,
      ]),
    );

    return rows.flatMap((row) => {
      const plan = plans.get(row.planId);

      return plan
        ? [
            {
              assignmentId: row.assignmentId,
              employeeId: row.employeeId,
              planId: row.planId,
              planName: plan.planName,
              applicationId: plan.applicationId,
              applicationName: plan.applicationName,
              provisioningType: plan.provisioningType,
              revocationNote: plan.revocationNote,
              dataLossOnRemoval: plan.dataLossOnRemoval,
              subscriptionId: row.subscriptionId,
              grantReason: row.grantReason,
              effectiveFrom: row.effectiveFrom,
              validUntil: row.validUntil,
              revocation: row.revocation,
            },
          ]
        : [];
    });
  }

  /** How many personal seats each person holds on `onDate` or will, one statement for any number of people (none: absent). */
  countPersonalSeats(employeeIds: readonly string[], onDate: BusinessDate, tx?: DbTx): Promise<Map<string, number>> {
    return this.reads.countPersonalSeats(employeeIds, onDate, tx);
  }

  async terminatingAccess(employeeIds: readonly string[], tx?: DbTx): Promise<TerminatingAccess[]> {
    return this.reads.terminatingOf(employeeIds, await this.organization.businessToday(new Date(), tx), tx);
  }
}
