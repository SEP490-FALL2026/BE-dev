import { Test } from '@nestjs/testing';
import { HR_BASIS } from '../../../../test/support/hr-basis';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { EmployeeNotFoundError } from '../organization.errors';
import { OrganizationService } from '../organization.service';
import type { EmployeeRecord } from '../organization.types';
import {
  EmployeeForbiddenError,
  EmployeeRowInvalidError,
  EmployeeSelfChangeForbiddenError,
  EmployeeUpdateEmptyError,
} from './employee.errors';
import { EmployeeMaintenanceService } from './employee-maintenance.service';

/**
 * What correcting the official fields of a record does around the facade (`US-02-02` AC-19, `QĐ-87a`, `QĐ-87c`, F11, F13, F17): who
 * is refused before anything is read, what is written, audited and told in one transaction, and the cases that write nothing.
 */
describe('EmployeeMaintenanceService', () => {
  const tx = { name: 'tx' };
  const superAdmin: AuthenticatedPrincipal = {
    subject: 'app-user-sa',
    appUserId: 'app-user-sa',
    sessionId: 'session-1',
    employeeId: 'emp-sa',
    directRoles: ['SUPER_ADMIN'],
    derivedRoles: [],
    roles: ['SUPER_ADMIN'],
  };
  const itAdmin: AuthenticatedPrincipal = { ...superAdmin, directRoles: ['IT_ADMIN'], roles: ['IT_ADMIN'] };
  const person: EmployeeRecord = {
    id: 'emp-1',
    organizationId: 'org-1',
    employeeCode: 'E-1',
    fullName: 'An Nguyen',
    workEmail: null,
    employmentType: 'STAFF',
    status: 'ACTIVE',
    workState: 'WORKING',
    hireDate: '2026-01-05',
    jobTitle: 'Developer',
  };

  let calls: string[];
  const organization = {
    getOrganization: jest.fn(),
    businessToday: jest.fn(),
    lockEmployeeForUpdate: jest.fn(),
    getEmployee: jest.fn(),
    isWorkEmailTaken: jest.fn(),
    updateEmployeeOfficialFields: jest.fn(),
    getProfileNotices: jest.fn(),
  };
  const audit = { record: jest.fn() };
  const notifications = { notifyInApp: jest.fn() };
  const runner = {
    run: jest.fn(async (work: (transaction: unknown) => Promise<unknown>) => {
      calls.push('begin');
      const result = await work(tx);
      calls.push('commit');

      return result;
    }),
  };

  async function service(): Promise<EmployeeMaintenanceService> {
    const moduleRef = await Test.createTestingModule({
      providers: [
        EmployeeMaintenanceService,
        { provide: OrganizationService, useValue: organization },
        { provide: AuditService, useValue: audit },
        { provide: NotificationsService, useValue: notifications },
        { provide: TransactionRunner, useValue: runner },
      ],
    }).compile();

    return moduleRef.get(EmployeeMaintenanceService);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    calls = [];
    organization.getOrganization.mockResolvedValue({ id: 'org-1' });
    organization.businessToday.mockResolvedValue('2026-10-28');
    organization.lockEmployeeForUpdate.mockImplementation(() => {
      calls.push('lock employee');

      return Promise.resolve();
    });
    organization.getEmployee.mockResolvedValue(person);
    organization.isWorkEmailTaken.mockResolvedValue(false);
    organization.updateEmployeeOfficialFields.mockImplementation(() => {
      calls.push('write');

      return Promise.resolve();
    });
    organization.getProfileNotices.mockResolvedValue([
      { recipientEmployeeId: 'emp-1', code: 'EMPLOYEE_PROFILE_UPDATED' },
      { recipientEmployeeId: 'head', code: 'EMPLOYEE_PROFILE_UPDATED' },
    ]);
    audit.record.mockImplementation(() => {
      calls.push('audit');

      return Promise.resolve();
    });
    notifications.notifyInApp.mockImplementation(() => {
      calls.push('notice');

      return Promise.resolve();
    });
  });

  it('refuses a caller who is not the Super Admin before reading or writing anything (F13)', async () => {
    await expect((await service()).update(itAdmin, 'emp-1', { fullName: 'Other', hrBasis: HR_BASIS })).rejects.toThrow(
      EmployeeForbiddenError,
    );

    expect(organization.getOrganization).not.toHaveBeenCalled();
    expect(runner.run).not.toHaveBeenCalled();
  });

  it('refuses the Super Admin their own record with the self-change refusal, and writes, audits and tells nobody (F11)', async () => {
    await expect(
      (await service()).update(superAdmin, 'emp-sa', { jobTitle: 'Chief', hrBasis: HR_BASIS }),
    ).rejects.toThrow(EmployeeSelfChangeForbiddenError);

    expect(runner.run).not.toHaveBeenCalled();
    expect(organization.updateEmployeeOfficialFields).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
    expect(notifications.notifyInApp).not.toHaveBeenCalled();
  });

  it('judges the role before whose record it is: an IT Admin on their own record is refused as forbidden, not as a self change', async () => {
    const onOwnRecord = { ...itAdmin, employeeId: 'emp-1' };

    await expect((await service()).update(onOwnRecord, 'emp-1', { jobTitle: 'x', hrBasis: HR_BASIS })).rejects.toThrow(
      EmployeeForbiddenError,
    );
  });

  it('refuses a body that names no official field', async () => {
    await expect((await service()).update(superAdmin, 'emp-1', { hrBasis: HR_BASIS })).rejects.toThrow(
      EmployeeUpdateEmptyError,
    );
    expect(runner.run).not.toHaveBeenCalled();
  });

  it('writes the job title in its display form, audits it with the HR basis and tells the person and the head after it, in one transaction', async () => {
    const view = await (
      await service()
    ).update(superAdmin, 'emp-1', { jobTitle: '  Senior   Designer\t', hrBasis: HR_BASIS });

    expect(calls).toEqual(['begin', 'lock employee', 'write', 'audit', 'notice', 'notice', 'commit']);
    expect(organization.updateEmployeeOfficialFields).toHaveBeenCalledWith(tx, 'emp-1', {
      jobTitle: 'Senior Designer',
    });
    expect(audit.record).toHaveBeenCalledWith(tx, {
      organizationId: 'org-1',
      actorKind: 'USER',
      actorAppUserId: 'app-user-sa',
      actorRoles: ['SUPER_ADMIN'],
      action: 'EMPLOYEE.OFFICIAL_FIELDS_CHANGED',
      resourceType: 'Employee',
      resourceId: 'emp-1',
      before: { employeeCode: 'E-1', jobTitle: 'Developer' },
      after: { jobTitle: 'Senior Designer', hrBasis: HR_BASIS },
      correlationId: 'session-1',
    });
    expect(organization.getProfileNotices).toHaveBeenCalledWith(tx, {
      kind: 'UPDATED',
      organizationId: 'org-1',
      employeeId: 'emp-1',
      onDate: '2026-10-28',
    });
    expect(view).toMatchObject({ id: 'emp-1', jobTitle: 'Senior Designer', fullName: 'An Nguyen' });
  });

  it('clears the title when it is sent blank or null', async () => {
    for (const jobTitle of ['   ', null]) {
      calls = [];
      organization.updateEmployeeOfficialFields.mockClear();

      const view = await (await service()).update(superAdmin, 'emp-1', { jobTitle, hrBasis: HR_BASIS });

      expect(organization.updateEmployeeOfficialFields).toHaveBeenCalledWith(tx, 'emp-1', { jobTitle: null });
      expect(view.jobTitle).toBeNull();
    }
  });

  it('refuses a title that is too long as a bad row, and writes, audits and tells nobody', async () => {
    const refused = (await service()).update(superAdmin, 'emp-1', { jobTitle: 'x'.repeat(256), hrBasis: HR_BASIS });

    await expect(refused).rejects.toBeInstanceOf(EmployeeRowInvalidError);
    await expect(refused).rejects.toMatchObject({ reasons: [{ field: 'jobTitle', code: 'JOB_TITLE_TOO_LONG' }] });
    expect(calls).toEqual(['begin', 'lock employee']);
    expect(audit.record).not.toHaveBeenCalled();
    expect(notifications.notifyInApp).not.toHaveBeenCalled();
  });

  it('writes, audits and tells nobody when nothing it was given differs from the record', async () => {
    const view = await (
      await service()
    ).update(superAdmin, 'emp-1', { fullName: 'An Nguyen', jobTitle: 'Developer', hrBasis: HR_BASIS });

    expect(calls).toEqual(['begin', 'lock employee', 'commit']);
    expect(view).toMatchObject({ fullName: 'An Nguyen', jobTitle: 'Developer' });
    expect(organization.getProfileNotices).not.toHaveBeenCalled();
  });

  it('answers a record that does not exist with the not-found refusal', async () => {
    organization.getEmployee.mockResolvedValue(null);

    await expect(
      (await service()).update(superAdmin, 'emp-x', { fullName: 'Other', hrBasis: HR_BASIS }),
    ).rejects.toThrow(EmployeeNotFoundError);
    expect(audit.record).not.toHaveBeenCalled();
  });
});
