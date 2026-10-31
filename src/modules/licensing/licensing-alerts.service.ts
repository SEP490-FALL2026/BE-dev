import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../core/business-date';
import type { DbTx } from '../../infrastructure/database/transaction-runner';
import { IdentityAccessApi } from '../identity-access/public/identity-access.api';
import { NotificationsApi } from '../notifications/public/notifications.api';
import { OrganizationApi } from '../organization/public/organization.api';
import { recipientsOf, usableOrNull, type LicensingAlert } from './licensing-alerts.policy';

/**
 * Puts the alerts of the rights into the inbox (`FR-5.14`, item `a03-license-inbox-alerts`), always in the transaction of the
 * fact behind them, through the one inbox of the notifications module: no mail, no push, no second store. Who is told is read at
 * the moment of telling (`US-12-15`: the person who holds the role then); an IT Admin is told only while they can act as one, and a
 * role nobody holds is nobody's — nobody is told in its place.
 */
@Injectable()
export class LicensingAlerts {
  constructor(
    private readonly notifications: NotificationsApi,
    private readonly organization: OrganizationApi,
    private readonly identity: IdentityAccessApi,
  ) {}

  /** The IT Admins among these people who can act as one today, in one read. */
  usableItAdmins(employeeIds: readonly (string | null)[]): Promise<ReadonlySet<string>> {
    const named = recipientsOf(employeeIds);

    return named.length === 0 ? Promise.resolve(new Set<string>()) : this.identity.findUsableItAdminEmployeeIds(named);
  }

  /** The IT Admin in charge of the department while they can act as one; null for no department or nobody usable. */
  async itAdminOfDepartment(departmentId: string | null, tx?: DbTx): Promise<string | null> {
    if (departmentId === null) return null;
    const named = await this.organization.getItAdminInChargeOfDepartment(departmentId, tx);

    return usableOrNull(named, await this.usableItAdmins([named]));
  }

  /**
   * The usable IT Admin in charge of the department the person is placed in on the first of these days that finds a placement (a
   * person who left may have none today, but had one when the work began); null when none is found or nobody usable is in charge.
   */
  async itAdminOfPerson(employeeId: string, onDates: readonly BusinessDate[], tx?: DbTx): Promise<string | null> {
    for (const onDate of onDates) {
      const placement = await this.organization.getEmployeePlacement(employeeId, onDate, tx);
      if (placement) return this.itAdminOfDepartment(placement.departmentId, tx);
    }

    return null;
  }

  /** Tells each person once in the caller's transaction; returns how many notices were new. */
  async tell(
    tx: DbTx,
    organizationId: string,
    people: readonly (string | null | undefined)[],
    alert: LicensingAlert,
  ): Promise<number> {
    let written = 0;
    for (const recipientEmployeeId of recipientsOf(people)) {
      if (await this.notifications.notifyInApp(tx, { organizationId, recipientEmployeeId, ...alert })) written += 1;
    }

    return written;
  }
}
