import { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { AuditService } from '../../audit/audit.service';
import { IdentityAccessInspectionService } from '../../identity-access/identity-access-inspection.service';
import { OrganizationService } from '../../organization/organization.service';
import { BOOTSTRAP_ACTIONS } from './inspection-facts';
import { InstallationInspectionService } from './inspection.service';

/**
 * P23-RV-02: every database read of `ops:inspect` runs in the one command transaction. Each fake records the client it
 * was given and whether the transaction callback was still running when it was called.
 */
describe('InstallationInspectionService', () => {
  const TX = { name: 'the inspection transaction' } as unknown as DbTx;
  const reads: { read: string; client: unknown; inside: boolean }[] = [];
  let inside = false;
  const record = (read: string, client: unknown) => reads.push({ read, client, inside });

  function build() {
    reads.length = 0;
    const runner = {
      run: jest.fn(async (work: (tx: DbTx) => Promise<unknown>) => {
        inside = true;
        try {
          return await work(TX);
        } finally {
          inside = false;
        }
      }),
    };
    const migrations = {
      committedMigrations: jest.fn(() => ['20261001_a']),
      appliedMigrations: jest.fn((client: DbTx) => {
        record('appliedMigrations', client);
        return Promise.resolve([{ name: '20261001_a', finished: true, rolledBack: false }]);
      }),
    };
    const organization = {
      getOrganization: jest.fn((client?: DbTx) => {
        record('getOrganization', client);
        return Promise.resolve({ id: 'org-1', name: 'x', timeZone: 'Asia/Ho_Chi_Minh', reportingCurrency: 'VND' });
      }),
      getOnboardingFacts: jest.fn((client?: DbTx) => {
        record('getOnboardingFacts', client);
        return Promise.resolve({
          activeDepartments: 2,
          activeEmployees: 3,
          freeCostCenters: 0,
          departmentsWithoutHead: [{ code: 'P-ENG', name: 'Engineering' }],
          departmentsByItAdmin: [
            { code: 'P-ENG', name: 'Engineering', itAdminEmployeeId: 'e-1', itAdminStatus: 'ACTIVE' as const },
            { code: 'P-OPS', name: 'Ops', itAdminEmployeeId: null, itAdminStatus: null },
          ],
        });
      }),
    };
    const audit = {
      countByAction: jest.fn((client: DbTx) => {
        record('countByAction', client);
        return Promise.resolve(new Map(BOOTSTRAP_ACTIONS.map(({ action, expected }) => [action, expected])));
      }),
    };
    const identity = {
      accountInventory: jest.fn((client: DbTx) => {
        record('accountInventory', client);
        return Promise.resolve({
          superAdmin: { holders: 1, status: 'ACTIVE', activationState: 'ACTIVATED', loginEmail: 'bao@acme.vn' },
          accountsByState: { ACTIVE_ACTIVATED: 1, ACTIVE_INVITED: 0, LOCKED_ACTIVATED: 0, LOCKED_INVITED: 0 },
          directRoles: { SUPER_ADMIN: 1, IT_ADMIN: 1, FINANCE: 0, EMPLOYEE: 0 },
          approvalRoles: { SPENDING_APPROVER: 0, CONFLICT_SUBSTITUTE: 0, FALLBACK_APPROVER: 0 },
        });
      }),
      usableItAdminEmployeeIds: jest.fn((ids: readonly string[], client?: DbTx) => {
        record('usableItAdminEmployeeIds', client);
        return Promise.resolve(new Set(ids));
      }),
    };
    const service = new InstallationInspectionService(
      runner as unknown as TransactionRunner,
      migrations,
      organization as unknown as OrganizationService,
      audit as unknown as AuditService,
      identity as unknown as IdentityAccessInspectionService,
    );
    return { service, runner, identity };
  }

  it('reads everything in one transaction, each read given that transaction while it is open', async () => {
    const { service, runner } = build();

    await service.inspect();

    expect(runner.run).toHaveBeenCalledTimes(1);
    expect(reads.map(({ read }) => read)).toEqual([
      'appliedMigrations',
      'getOrganization',
      'countByAction',
      'accountInventory',
      'getOnboardingFacts',
      'usableItAdminEmployeeIds',
    ]);
    expect(reads.filter(({ client, inside: open }) => client !== TX || !open)).toEqual([]);
  });

  it('builds the report from that one transaction result', async () => {
    const { service, identity } = build();

    await expect(service.inspect()).resolves.toMatchObject({
      status: 'INSTALLED',
      superAdmin: { maskedEmail: 'b***@a***.vn' },
      departments: { active: 2, withoutCurrentHead: 1, withoutUsableItAdmin: 1 },
    });
    expect(identity.usableItAdminEmployeeIds).toHaveBeenCalledWith(['e-1'], TX);
  });
});
