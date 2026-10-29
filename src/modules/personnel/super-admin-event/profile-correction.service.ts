import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { AuditApi } from '../../audit/public/audit.api';
import { NotificationsApi } from '../../notifications/public/notifications.api';
import { OrganizationApi } from '../../organization/public/organization.api';
import { personnelAuditEvent } from '../mappers/personnel-audit-event.mapper';
import type { PersonnelActor } from '../public/personnel.types';
import { planProfileCorrection } from './profile-correction.policy';
import { SuperAdminEventRefusedError } from '../public/super-admin-event.errors';
import type { EventBasis, ProfileCorrection } from '../public/super-admin-event.types';

/**
 * The tenth mode of `pnpm ops:record-super-admin-event` (spec L.2, `QĐ-87c`): the correction of the official fields of the record of
 * the Super Admin, which the application refuses to make for a Super Admin about themselves (`EMPLOYEE.SELF_CHANGE_FORBIDDEN`). It
 * makes the same correction as the application makes of anyone else's record, through the facade of the organization, in the
 * transaction of the command (the employee row is already held `FOR UPDATE` by the caller): the official fields that differ, the
 * Audit Trail event `EMPLOYEE.OFFICIAL_FIELDS_CHANGED` with actor `OPERATOR` (the ticket as its reference and correlation, and what the
 * command added, on `after`, since the record of an employee has no column for the ticket), and the notice `EMPLOYEE_PROFILE_UPDATED`
 * to the people the organization says are concerned (`F17`). A correction that changes nothing is refused, so no ticket is spent on it.
 * Throws SuperAdminEventRefusedError; the errors of the organization are named by `refusalOf`.
 */
@Injectable()
export class ProfileCorrectionService {
  constructor(
    private readonly organization: OrganizationApi,
    private readonly audit: AuditApi,
    private readonly notifications: NotificationsApi,
  ) {}

  async correct(
    tx: DbTx,
    actor: PersonnelActor,
    organizationId: string,
    employeeId: string,
    input: ProfileCorrection,
    basis: EventBasis,
  ): Promise<void> {
    const current = await this.organization.getEmployee(employeeId, tx);
    if (!current) throw new SuperAdminEventRefusedError('SUBJECT_NOT_FOUND');
    const today = await this.organization.businessToday(new Date(), tx);

    const plan = planProfileCorrection(current, input, today);
    const reasons = [...plan.reasons];
    if (
      plan.workEmailToCheck !== null &&
      (await this.organization.isWorkEmailTaken(tx, organizationId, plan.workEmailToCheck))
    ) {
      reasons.unshift('WORK_EMAIL_TAKEN');
    }
    if (reasons.length > 0) throw new SuperAdminEventRefusedError(`PROFILE.${reasons[0]}`);
    if (Object.keys(plan.changes).length === 0) throw new SuperAdminEventRefusedError('PROFILE.NO_CHANGE');

    await this.organization.updateEmployeeOfficialFields(tx, employeeId, plan.changes);
    await this.audit.record(
      tx,
      personnelAuditEvent(
        actor,
        organizationId,
        'EMPLOYEE.OFFICIAL_FIELDS_CHANGED',
        'Employee',
        employeeId,
        { employeeCode: current.employeeCode, ...plan.before },
        { ...(plan.changes as Record<string, string | null>), hrBasis: { ...basis } },
      ),
    );
    const notices = await this.organization.getProfileNotices(tx, {
      kind: 'UPDATED',
      organizationId,
      employeeId,
      onDate: today,
    });
    for (const notice of notices) await this.notifications.notifyInApp(tx, notice);
  }
}
