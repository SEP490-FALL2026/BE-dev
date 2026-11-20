import { Test } from '@nestjs/testing';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { NotificationsApi } from '../../notifications/public/notifications.api';
import { EmployeeNotFoundError } from '../public/organization.errors';
import { OrganizationContextService } from '../organization-context.service';
import { EmployeeRecordService } from './employee-record.service';
import type { EmployeeRecord } from '../public/organization.types';
import {
  EmployeeForbiddenError,
  EmployeeRowInvalidError,
  EmployeeSelfChangeForbiddenError,
  EmployeeUpdateEmptyError,
} from './employee.errors';
import { EmployeeAccountsHook } from '../public/organization.extension-points';
import { EmployeeMaintenanceService } from './employee-maintenance.service';

/**
 * What correcting the official fields of a record does around the facade (`US-02-02` AC-19, `QĐ-87a`, `QĐ-87c`): who
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
  const followWorkEmail = jest.fn();
  let employeeAccounts: EmployeeAccountsHook;
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
        {
          provide: OrganizationContextService,
          useValue: { businessToday: organization.businessToday, findOrganization: organization.getOrganization },
        },
        {
          provide: EmployeeRecordService,
          useValue: {
            lock: (tx: unknown, id: string) => organization.lockEmployeeForUpdate(tx, id) as Promise<void>,
            find: organization.getEmployee,
            isWorkEmailTaken: organization.isWorkEmailTaken,
            updateOfficialFields: organization.updateEmployeeOfficialFields,
            profileNotices: organization.getProfileNotices,
          },
        },
        { provide: AuditApi, useValue: audit },
        { provide: NotificationsApi, useValue: notifications },
        { provide: EmployeeAccountsHook, useValue: employeeAccounts },
        { provide: TransactionRunner, useValue: runner },
      ],
    }).compile();

    return moduleRef.get(EmployeeMaintenanceService);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    calls = [];
    followWorkEmail.mockResolvedValue('NO_ACCOUNT');
    employeeAccounts = new EmployeeAccountsHook();
    employeeAccounts.bind({ followWorkEmail } as never);
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
    await expect((await service()).update(itAdmin, 'emp-1', { fullName: 'Other' })).rejects.toThrow(
      EmployeeForbiddenError,
    );

    expect(organization.getOrganization).not.toHaveBeenCalled();
    expect(runner.run).not.toHaveBeenCalled();
  });

  it('refuses the Super Admin their own record with the self-change refusal, and writes, audits and tells nobody (F11)', async () => {
    await expect((await service()).update(superAdmin, 'emp-sa', { jobTitle: 'Chief' })).rejects.toThrow(
      EmployeeSelfChangeForbiddenError,
    );

    expect(runner.run).not.toHaveBeenCalled();
    expect(organization.updateEmployeeOfficialFields).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
    expect(notifications.notifyInApp).not.toHaveBeenCalled();
  });

  it('judges the role before whose record it is: an IT Admin on their own record is refused as forbidden, not as a self change', async () => {
    const onOwnRecord = { ...itAdmin, employeeId: 'emp-1' };

    await expect((await service()).update(onOwnRecord, 'emp-1', { jobTitle: 'x' })).rejects.toThrow(
      EmployeeForbiddenError,
    );
  });

  it('refuses a body that names no official field', async () => {
    await expect((await service()).update(superAdmin, 'emp-1', {})).rejects.toThrow(EmployeeUpdateEmptyError);
    expect(runner.run).not.toHaveBeenCalled();
  });

  it('writes the job title in its display form, audits it with no HR basis and tells the person and the head after it, in one transaction', async () => {
    const view = await (await service()).update(superAdmin, 'emp-1', { jobTitle: '  Senior   Designer\t' });

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
      after: { jobTitle: 'Senior Designer' },
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

  it('moves the login email of the account with a new work email, after the write and before the audit, in the same transaction', async () => {
    followWorkEmail.mockImplementation(() => {
      calls.push('follow');

      return Promise.resolve('FOLLOWED');
    });

    await (await service()).update(superAdmin, 'emp-1', { workEmail: ' New.Mail@Corp.test ' });

    expect(calls).toEqual(['begin', 'lock employee', 'write', 'follow', 'audit', 'notice', 'notice', 'commit']);
    expect(followWorkEmail).toHaveBeenCalledWith(tx, {
      actor: superAdmin,
      organizationId: 'org-1',
      employeeId: 'emp-1',
      workEmail: 'New.Mail@Corp.test',
    });
  });

  it('refuses the whole correction when another account already logs in with the new email, and audits nothing', async () => {
    followWorkEmail.mockResolvedValue('TAKEN');

    await expect((await service()).update(superAdmin, 'emp-1', { workEmail: 'taken@corp.test' })).rejects.toMatchObject(
      {
        reasons: [{ field: 'workEmail', code: 'WORK_EMAIL_TAKEN' }],
      },
    );

    expect(audit.record).not.toHaveBeenCalled();
    expect(calls).not.toContain('commit');
  });

  it('does not touch the account when the work email is not changed', async () => {
    organization.getEmployee.mockResolvedValue({ ...person, workEmail: 'old@corp.test' });
    await (await service()).update(superAdmin, 'emp-1', { jobTitle: 'Lead' });

    expect(followWorkEmail).not.toHaveBeenCalled();
  });

  it('clears the work email of a person who has no account', async () => {
    organization.getEmployee.mockResolvedValue({ ...person, workEmail: 'old@corp.test' });

    await (await service()).update(superAdmin, 'emp-1', { workEmail: null });

    expect(followWorkEmail).toHaveBeenCalledWith(tx, expect.objectContaining({ employeeId: 'emp-1', workEmail: null }));
    expect(organization.updateEmployeeOfficialFields).toHaveBeenCalledWith(tx, 'emp-1', { workEmail: null });
  });

  it('refuses clearing the work email of a person who has an account, and writes, audits and tells nobody', async () => {
    organization.getEmployee.mockResolvedValue({ ...person, workEmail: 'old@corp.test' });
    followWorkEmail.mockResolvedValue('ACCOUNT_NEEDS_EMAIL');

    await expect((await service()).update(superAdmin, 'emp-1', { workEmail: null })).rejects.toMatchObject({
      reasons: [{ field: 'workEmail', code: 'WORK_EMAIL_REQUIRED_FOR_ACCOUNT' }],
    });

    expect(organization.updateEmployeeOfficialFields).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
    expect(notifications.notifyInApp).not.toHaveBeenCalled();
    expect(calls).not.toContain('commit');
  });

  it('clears the title when it is sent blank or null', async () => {
    for (const jobTitle of ['   ', null]) {
      calls = [];
      organization.updateEmployeeOfficialFields.mockClear();

      const view = await (await service()).update(superAdmin, 'emp-1', { jobTitle });

      expect(organization.updateEmployeeOfficialFields).toHaveBeenCalledWith(tx, 'emp-1', { jobTitle: null });
      expect(view.jobTitle).toBeNull();
    }
  });

  it('refuses a title that is too long as a bad row, and writes, audits and tells nobody', async () => {
    const refused = (await service()).update(superAdmin, 'emp-1', { jobTitle: 'x'.repeat(256) });

    await expect(refused).rejects.toBeInstanceOf(EmployeeRowInvalidError);
    await expect(refused).rejects.toMatchObject({ reasons: [{ field: 'jobTitle', code: 'JOB_TITLE_TOO_LONG' }] });
    expect(calls).toEqual(['begin', 'lock employee']);
    expect(audit.record).not.toHaveBeenCalled();
    expect(notifications.notifyInApp).not.toHaveBeenCalled();
  });

  it('writes, audits and tells nobody when nothing it was given differs from the record', async () => {
    const view = await (await service()).update(superAdmin, 'emp-1', { fullName: 'An Nguyen', jobTitle: 'Developer' });

    expect(calls).toEqual(['begin', 'lock employee', 'commit']);
    expect(view).toMatchObject({ fullName: 'An Nguyen', jobTitle: 'Developer' });
    expect(organization.getProfileNotices).not.toHaveBeenCalled();
  });

  it('answers a record that does not exist with the not-found refusal', async () => {
    organization.getEmployee.mockResolvedValue(null);

    await expect((await service()).update(superAdmin, 'emp-x', { fullName: 'Other' })).rejects.toThrow(
      EmployeeNotFoundError,
    );
    expect(audit.record).not.toHaveBeenCalled();
  });
});
