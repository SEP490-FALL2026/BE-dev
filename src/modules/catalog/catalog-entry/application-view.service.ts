import { Injectable } from '@nestjs/common';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { SeatOccupancyHook } from '../public/catalog.extension-points';
import { ApplicationPlans } from './application-plans.types';
import { needsResponsible } from './application.policy';
import { recommendK2, type K2Recommendation } from './k2-recommendation.policy';
import type { ApplicationRecord, ApplicationView, ResponsibleItAdminView } from './application.types';

/**
 * How an application is shown once it is read or written (`US-04-01`, `US-04-02` AC-9): the IT Admin who answers for it, with the flag
 * that it needs one when nobody is named or the one named is no longer a usable IT Admin (`QĐ-111g`, `US-04-06`), and the plan changes
 * worth recommending today. Read, never decided: nothing here writes or blocks.
 */
@Injectable()
export class ApplicationViewService {
  constructor(
    private readonly organizationReads: OrganizationReadApi,
    private readonly identity: IdentityAccessApi,
    private readonly plans: ApplicationPlans,
    private readonly occupancy: SeatOccupancyHook,
  ) {}

  /** The records with the IT Admin responsible for each, read in one call for the whole set. Throws when the one named is not an employee. */
  async withResponsible(records: ApplicationRecord[]): Promise<ApplicationView[]> {
    const named = await responsibleOf(
      this.organizationReads,
      this.identity,
      records.map((record) => record.responsibleItAdminEmployeeId),
    );

    return records.map((record) => ({ ...record, ...named(record.responsibleItAdminEmployeeId) }));
  }

  /** The plan changes worth recommending to the owner today, read not decided: three people on K1 plans suggest K2. */
  async recommendationsOf(applicationId: string): Promise<K2Recommendation[]> {
    const k1Plans = (await this.plans.plansOfApplication(applicationId))
      .filter((plan) => plan.provisioningType === 'K1')
      .map((plan) => plan.id);
    if (k1Plans.length === 0) return [];
    const today = await this.organizationReads.businessToday();
    const recommendation = recommendK2(await this.occupancy.get().openHolderCount(k1Plans, today));

    return recommendation ? [recommendation] : [];
  }
}

/**
 * Who answers for each of these applications, and whether it needs one: the names in one read and the usable IT Admins among them in one
 * read, whatever the number of applications. Returns the lookup by the id of the responsible employee (null for none).
 */
export async function responsibleOf(
  organizationReads: OrganizationReadApi,
  identity: IdentityAccessApi,
  ids: readonly (string | null)[],
): Promise<(id: string | null) => { responsibleItAdmin: ResponsibleItAdminView | null; needsResponsible: boolean }> {
  const wanted = [...new Set(ids.flatMap((id) => (id === null ? [] : [id])))];
  const [employees, usable] = await Promise.all([
    wanted.length === 0 ? Promise.resolve([]) : organizationReads.getEmployees(wanted),
    identity.findUsableItAdminEmployeeIds(wanted),
  ]);
  const byId = new Map<string, ResponsibleItAdminView>(
    employees.map((employee) => [
      employee.id,
      { employeeId: employee.id, employeeCode: employee.employeeCode, fullName: employee.fullName },
    ]),
  );

  return (id) => {
    if (id === null) return { responsibleItAdmin: null, needsResponsible: needsResponsible(null, usable) };
    const responsibleItAdmin = byId.get(id);
    if (!responsibleItAdmin) throw new Error('The IT Admin responsible for an application is not an employee');

    return { responsibleItAdmin, needsResponsible: needsResponsible(id, usable) };
  };
}
