import type { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuditApi } from '../../audit/public/audit.api';
import type { FinanceApi } from '../../finance/public/finance.api';
import type { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import type { OrganizationApi } from '../../organization/public/organization.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { AlreadyInstalledError, InstallationInputError } from './installation.errors';
import { InstallationApi } from './installation.api';

/*
 * Characterization of the installation use case: the order of hash, lock, read and writes, the one
 * transaction, the audit records and the two refusals. The collaborators are in-memory stand-ins at the boundary.
 */

const INPUT = {
  timeZone: 'Asia/Ho_Chi_Minh',
  reportingCurrency: 'VND',
  organizationName: 'Cong ty Thu nghiem',
  departmentCode: 'IT',
  departmentName: 'Phong Cong nghe Thong tin',
  superAdmin: {
    employeeCode: 'SA001',
    fullName: 'Quan tri Gia lap',
    workEmail: 'sa@example.test',
    employmentType: 'STAFF',
    hireDate: '2026-01-05',
  },
  operatorReference: 'TICKET-1',
  environment: 'LOCAL_TEST',
};

function harness(options: { installed?: boolean } = {}) {
  const calls: string[] = [];
  const audits: { action: string; resourceType: string; after: unknown; [key: string]: unknown }[] = [];
  const TX = { name: 'the transaction' } as unknown as DbTx;
  const inTx = (tx: unknown) => (tx === TX ? 'tx' : 'NO-TX');
  let ids = 0;
  const id = (prefix: string) => `${prefix}-${(ids += 1)}`;

  const runner = {
    async run<T>(work: (tx: DbTx) => Promise<T>): Promise<T> {
      calls.push('BEGIN');
      try {
        const result = await work(TX);
        calls.push('COMMIT');
        return result;
      } catch (error) {
        calls.push('ROLLBACK');
        throw error;
      }
    },
  };
  const organization = {
    getOrganization: (tx: unknown) => {
      calls.push(`org.getOrganization(${inTx(tx)})`);
      return Promise.resolve(options.installed ? { id: 'org-existing' } : null);
    },
    createOrganization: (tx: unknown) => {
      calls.push(`org.createOrganization(${inTx(tx)})`);
      return Promise.resolve({ id: 'org-1' });
    },
    // The command writes no Cost Center any more: a call to this one would be a regression (`QĐ-87f`(1)).
    createUnitCostCenter: (tx: unknown) => {
      calls.push(`org.createUnitCostCenter(${inTx(tx)})`);
      return Promise.resolve({ id: 'cc-1' });
    },
    createDepartment: (tx: unknown) => {
      calls.push(`org.createDepartment(${inTx(tx)})`);
      return Promise.resolve({ id: 'dep-1' });
    },
    createEmployeeWithPlacement: (tx: unknown, input: { employeeCode: string; jobTitle: string | null }) => {
      calls.push(`org.createEmployeeWithPlacement(${inTx(tx)}, ${input.employeeCode}, ${String(input.jobTitle)})`);
      return Promise.resolve({ id: id('emp') });
    },
  };
  const identity = {
    prepareCredential: (password: string, email: string) => {
      calls.push(`identity.prepareCredential(${email})`);
      return Promise.resolve({ hash: `hash-of-${password.length}`, hashPolicyVersion: 2 });
    },
    createBootstrapSuperAdmin: (tx: unknown) => {
      calls.push(`identity.createBootstrapSuperAdmin(${inTx(tx)})`);
      return Promise.resolve({ appUserId: 'user-1' });
    },
  };
  const repo = {
    lockInstallation: (tx: unknown) => {
      calls.push(`repo.lockInstallation(${inTx(tx)})`);
      return Promise.resolve();
    },
  };
  const audit = {
    record: (tx: unknown, event: { action: string; resourceType: string; after: unknown }) => {
      calls.push(`audit.record(${inTx(tx)}, ${event.action})`);
      audits.push(event);
      return Promise.resolve();
    },
  };

  // Not recorded in `calls`: the currency table is read before anything else and changes nothing.
  const finance = { findCurrency: (code: string) => Promise.resolve(['USD', 'VND'].includes(code) ? { code } : null) };

  const service = new InstallationApi(
    runner as unknown as TransactionRunner,
    organization as unknown as OrganizationApi,
    organization as unknown as OrganizationReadApi,
    identity as unknown as IdentityAccessApi,
    audit as unknown as AuditApi,
    repo,
    finance as unknown as FinanceApi,
  );

  return { service, calls, audits };
}

describe('InstallationApi (QĐ-87f(1): organization, one department, the Super Admin)', () => {
  it('hashes before the transaction, locks before it reads, then writes and records everything in one transaction', async () => {
    const h = harness();

    const result = await h.service.install(INPUT, 'a-long-enough-password');

    expect(h.calls).toEqual([
      'identity.prepareCredential(sa@example.test)',
      'BEGIN',
      'repo.lockInstallation(tx)',
      'org.getOrganization(tx)',
      'org.createOrganization(tx)',
      'audit.record(tx, INSTALLATION.ORGANIZATION_CREATED)',
      'org.createDepartment(tx)',
      'audit.record(tx, INSTALLATION.DEPARTMENT_CREATED)',
      'org.createEmployeeWithPlacement(tx, SA001, null)',
      'audit.record(tx, INSTALLATION.EMPLOYEE_CREATED)',
      'identity.createBootstrapSuperAdmin(tx)',
      'audit.record(tx, INSTALLATION.SUPER_ADMIN_CREATED)',
      'audit.record(tx, ROLE.GRANTED)',
      'COMMIT',
    ]);
    expect(result).toEqual({
      organizationId: 'org-1',
      superAdminAppUserId: 'user-1',
      superAdminEmployeeId: 'emp-1',
      correlationId: expect.stringMatching(/^[0-9a-f-]{36}$/) as unknown,
    });
    expect(
      h.audits.map(({ action, resourceType, after, actorKind, operatorReference, organizationId }) => ({
        action,
        resourceType,
        after,
        actorKind,
        operatorReference,
        organizationId,
      })),
    ).toEqual([
      {
        action: 'INSTALLATION.ORGANIZATION_CREATED',
        resourceType: 'Organization',
        after: {
          timeZone: 'Asia/Ho_Chi_Minh',
          reportingCurrency: 'VND',
          environment: 'LOCAL_TEST',
          installationException: true,
        },
        actorKind: 'OPERATOR',
        operatorReference: 'TICKET-1',
        organizationId: 'org-1',
      },
      {
        action: 'INSTALLATION.DEPARTMENT_CREATED',
        resourceType: 'Department',
        after: { code: 'IT', installationException: true },
        actorKind: 'OPERATOR',
        operatorReference: 'TICKET-1',
        organizationId: 'org-1',
      },
      {
        action: 'INSTALLATION.EMPLOYEE_CREATED',
        resourceType: 'Employee',
        after: {
          employeeCode: 'SA001',
          employmentType: 'STAFF',
          hireDate: '2026-01-05',
          departmentCode: 'IT',
          installationException: true,
        },
        actorKind: 'OPERATOR',
        operatorReference: 'TICKET-1',
        organizationId: 'org-1',
      },
      {
        action: 'INSTALLATION.SUPER_ADMIN_CREATED',
        resourceType: 'AppUser',
        after: {
          employeeCode: 'SA001',
          activationState: 'ACTIVATED',
          emailVerificationSource: 'BOOTSTRAP_ASSERTED',
          installationException: true,
        },
        actorKind: 'OPERATOR',
        operatorReference: 'TICKET-1',
        organizationId: 'org-1',
      },
      {
        action: 'ROLE.GRANTED',
        resourceType: 'AppUser',
        after: { role: 'SUPER_ADMIN', installationException: true },
        actorKind: 'OPERATOR',
        operatorReference: 'TICKET-1',
        organizationId: 'org-1',
      },
    ]);
    const correlations = new Set(h.audits.map((event) => event.correlationId));
    expect([...correlations]).toEqual([result.correlationId]);
  });

  it('creates no Cost Center, no job title and no IT employee, and marks every event as the installation exception', async () => {
    const h = harness();

    await h.service.install(INPUT, 'a-long-enough-password');

    expect(h.calls.some((call) => call.includes('createUnitCostCenter'))).toBe(false);
    expect(h.calls.filter((call) => call.startsWith('org.createEmployeeWithPlacement'))).toEqual([
      'org.createEmployeeWithPlacement(tx, SA001, null)',
    ]);
    expect(h.audits.map((event) => (event.after as Record<string, unknown>).installationException)).toEqual(
      h.audits.map(() => true),
    );
    expect(h.audits.map((event) => event.action)).not.toContain('INSTALLATION.COST_CENTER_CREATED');
  });

  it('refuses the earlier input shape (a Cost Center, a job title) before hashing or locking anything', async () => {
    const h = harness();

    const error = await h.service
      .install({ ...INPUT, costCenterCode: 'CC-IT', jobTitleName: 'Chuyen vien' }, 'a-long-enough-password')
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(InstallationInputError);
    expect(h.calls).toEqual([]);
  });

  it('finds the organization under the lock and changes nothing when it is already installed', async () => {
    const h = harness({ installed: true });

    const error = await h.service.install(INPUT, 'a-long-enough-password').catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(AlreadyInstalledError);
    expect((error as Error).message).toBe('This installation already has an organization; nothing was changed.');
    expect(h.calls).toEqual([
      'identity.prepareCredential(sa@example.test)',
      'BEGIN',
      'repo.lockInstallation(tx)',
      'org.getOrganization(tx)',
      'ROLLBACK',
    ]);
  });

  it('refuses invalid input with every issue named, before hashing or locking anything', async () => {
    const h = harness();

    const error = await h.service
      .install({ ...INPUT, departmentCode: '', operatorReference: undefined }, 'x')
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(InstallationInputError);
    expect((error as InstallationInputError).issues).toEqual([
      'departmentCode: use letters, digits, ".", "_" or "-" (max 32)',
      'operatorReference: Invalid input: expected string, received undefined',
    ]);
    expect((error as Error).message).toBe(
      'The installation input is not valid:\n - departmentCode: use letters, digits, ".", "_" or "-" (max 32)\n - operatorReference: Invalid input: expected string, received undefined',
    );
    expect(h.calls).toEqual([]);
  });

  it('refuses a reporting currency outside the currency table, before hashing or locking anything (DB-02)', async () => {
    const h = harness();

    const error = await h.service
      .install({ ...INPUT, reportingCurrency: 'MYR' }, 'a-long-enough-password')
      .catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(InstallationInputError);
    expect((error as InstallationInputError).issues).toEqual([
      'reportingCurrency: MYR is not in the currency table of this installation',
    ]);
    expect(h.calls).toEqual([]);
  });

  it('signs in with the login email when one is given', async () => {
    const h = harness();

    await h.service.install({ ...INPUT, loginEmail: 'login@example.test' }, 'a-long-enough-password');

    expect(h.calls[0]).toBe('identity.prepareCredential(login@example.test)');
  });
});
