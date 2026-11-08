import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { HeldSoftware, PersonalSeat, RevocationSource, TerminatingAccess } from '../public/licensing.types';
import { RevocationReadRepo } from './revocation-read.repo';

/**
 * What the lists that come after a revocation read through the facade (`g6-offboarding-record`, `g6-transfer-tool-review`): the
 * personal seats of a person, with how each is taken away and the revocation that is under way, and the K1 seats whose access
 * runs on to the end of a paid period. Each is a fixed number of statements, however many seats it covers.
 */
@Injectable()
export class RevocationViewService {
  constructor(
    private readonly reads: RevocationReadRepo,
    private readonly catalog: CatalogApi,
    private readonly organizationReads: OrganizationReadApi,
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

  /**
   * The software a person holds on `onDate`, one page and how many there are in all: the plan and its application by name, and the
   * days the seat begins and ends. Three statements however many seats (the page, the count, the names of the page).
   */
  async heldSoftwareOf(
    employeeId: string,
    onDate: BusinessDate,
    page: { skip: number; take: number },
    tx?: DbTx,
  ): Promise<{ items: HeldSoftware[]; total: number }> {
    const { items, total } = await this.reads.heldPage(employeeId, onDate, page, tx);
    const planIds = [...new Set(items.map((row) => row.planId))];
    const plans = new Map(
      (planIds.length > 0 ? await this.catalog.getPlanSummaries(planIds) : []).map((plan) => [plan.planId, plan]),
    );

    return {
      items: items.flatMap((row) => {
        const plan = plans.get(row.planId);

        return plan
          ? [
              {
                assignmentId: row.assignmentId,
                applicationName: plan.applicationName,
                planName: plan.planName,
                grantedOn: row.effectiveFrom,
                endsOn: row.validUntil,
              },
            ]
          : [];
      }),
      total,
    };
  }

  /** How many personal seats each person holds on `onDate` or will, one statement for any number of people (none: absent). */
  countPersonalSeats(employeeIds: readonly string[], onDate: BusinessDate, tx?: DbTx): Promise<Map<string, number>> {
    return this.reads.countPersonalSeats(employeeIds, onDate, tx);
  }

  /** Which of these seats a revocation asked for with this reference is under way for (one statement). */
  openedByReference(
    sources: readonly RevocationSource[],
    referenceId: string,
    assignmentIds: readonly string[],
    tx?: DbTx,
  ): Promise<Set<string>> {
    return this.reads.openedByReference(sources, referenceId, assignmentIds, tx);
  }

  async terminatingAccess(employeeIds: readonly string[], tx?: DbTx): Promise<TerminatingAccess[]> {
    return this.reads.terminatingOf(employeeIds, await this.organizationReads.businessToday(new Date(), tx), tx);
  }
}
