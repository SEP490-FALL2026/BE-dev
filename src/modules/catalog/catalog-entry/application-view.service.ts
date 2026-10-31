import { Injectable } from '@nestjs/common';
import { OrganizationApi } from '../../organization/public/organization.api';
import { SeatOccupancyHook } from '../public/catalog.extension-points';
import { ApplicationPlans } from './application-plans.types';
import { replacementRequired } from './application.policy';
import { recommendK2, type K2Recommendation } from './k2-recommendation.policy';
import type { ApplicationRecord, ApplicationView, BusinessOwnerView } from './application.types';

/**
 * How an application is shown once it is read or written (`US-04-01`, `US-04-02` AC-9): its Business Owner, with the flag
 * that a replacement is needed when they left (`INV-06`), and the plan changes worth recommending today. Read, never
 * decided: nothing here writes or blocks.
 */
@Injectable()
export class ApplicationViewService {
  constructor(
    private readonly organization: OrganizationApi,
    private readonly plans: ApplicationPlans,
    private readonly occupancy: SeatOccupancyHook,
  ) {}

  /** The records with their Business Owners, read in one call. Throws when an owner is not an employee. */
  async withOwners(records: ApplicationRecord[]): Promise<ApplicationView[]> {
    const employees = await this.organization.getEmployees([
      ...new Set(records.map((record) => record.businessOwnerEmployeeId)),
    ]);
    const byId = new Map<string, BusinessOwnerView>(
      employees.map((employee) => [
        employee.id,
        {
          employeeId: employee.id,
          employeeCode: employee.employeeCode,
          fullName: employee.fullName,
          status: employee.status,
        },
      ]),
    );

    return records.map((record) => {
      const businessOwner = byId.get(record.businessOwnerEmployeeId);
      if (!businessOwner) throw new Error('The Business Owner of an application is not an employee');

      return { ...record, businessOwner, businessOwnerReplacementRequired: replacementRequired(businessOwner.status) };
    });
  }

  /** The plan changes worth recommending to the owner today, read not decided: three people on K1 plans suggest K2. */
  async recommendationsOf(applicationId: string): Promise<K2Recommendation[]> {
    const k1Plans = (await this.plans.plansOfApplication(applicationId))
      .filter((plan) => plan.provisioningType === 'K1')
      .map((plan) => plan.id);
    if (k1Plans.length === 0) return [];
    const today = await this.organization.businessToday();
    const recommendation = recommendK2(await this.occupancy.get().openHolderCount(k1Plans, today));

    return recommendation ? [recommendation] : [];
  }
}
