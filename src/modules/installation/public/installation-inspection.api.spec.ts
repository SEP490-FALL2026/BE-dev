import { Prisma } from '../../../generated/prisma/client';
import { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { AuditApi } from '../../audit/public/audit.api';
import { IdentityAccessInspectionApi } from '../../identity-access/public/identity-access-inspection.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { CURRENT_INSTALLATION_RECORDS } from '../inspect/inspection-facts.policy';
import { InstallationInspectionApi } from './installation-inspection.api';

/**
 * Every database read of `ops:inspect` runs in the one command transaction. Each fake records the client it
 * was given and whether the transaction callback was still running when it was called.
 */
describe('InstallationInspectionApi', () => {
  const TX = { name: 'the inspection transaction' } as unknown as DbTx;
  const reads: { read: string; client: unknown; inside: boolean }[] = [];
  let inside = false;
  const record = (read: string, client: unknown) => reads.push({ read, client, inside });

  function build(options: { seededAt?: Date | null; gaps?: Record<string, number> } = {}) {
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
      changeAnnouncementsSeededAt: jest.fn((client: DbTx) => {
        record('changeAnnouncementsSeededAt', client);
        return Promise.resolve(options.seededAt === undefined ? new Date('2026-10-24T15:00:00Z') : options.seededAt);
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
          costCenterDirectionActivated: false,
          departmentsWithoutHead: [{ code: 'P-ENG', name: 'Engineering' }],
          departmentsByItAdmin: [
            { code: 'P-ENG', name: 'Engineering', itAdminEmployeeId: 'e-1', itAdminStatus: 'ACTIVE' as const },
            { code: 'P-OPS', name: 'Ops', itAdminEmployeeId: null, itAdminStatus: null },
          ],
        });
      }),
      countUnmarkedChangesAsOf: jest.fn((client: DbTx, asOf: Date) => {
        record(`countUnmarkedChangesAsOf(${asOf.toISOString()})`, client);
        return Promise.resolve({ PLACEMENT_START: 0, HEAD_PERIOD_START: 0, HEAD_PERIOD_END: 0, ...options.gaps });
      }),
    };
    const audit = {
      firstAfterField: jest.fn(() => Promise.resolve('SHARED')),
      countByAction: jest.fn((client: DbTx) => {
        record('countByAction', client);
        return Promise.resolve(new Map(Object.entries(CURRENT_INSTALLATION_RECORDS)));
      }),
    };
    const identity = {
      accountInventory: jest.fn((client: DbTx) => {
        record('accountInventory', client);
        return Promise.resolve({
          superAdmin: { holders: 1, status: 'ACTIVE', activationState: 'ACTIVATED', loginEmail: 'bao@acme.vn' },
          accountsByState: { ACTIVE_ACTIVATED: 1, ACTIVE_INVITED: 0, LOCKED_ACTIVATED: 0, LOCKED_INVITED: 0 },
          directRoles: { SUPER_ADMIN: 1, IT_ADMIN: 1, FINANCE: 0, EMPLOYEE: 0 },
        });
      }),
      usableItAdminEmployeeIds: jest.fn((ids: readonly string[], client?: DbTx) => {
        record('usableItAdminEmployeeIds', client);
        return Promise.resolve(new Set(ids));
      }),
    };
    const service = new InstallationInspectionApi(
      runner as unknown as TransactionRunner,
      migrations,
      organization as unknown as OrganizationReadApi,
      audit as unknown as AuditApi,
      identity as unknown as IdentityAccessInspectionApi,
    );
    return { service, runner, identity, organization };
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
      'changeAnnouncementsSeededAt',
      'countUnmarkedChangesAsOf(2026-10-24T15:00:00.000Z)',
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

  it('reports no change announcement missing when the seeding migration was never recorded, and reads none', async () => {
    const { service, organization } = build({ seededAt: null });

    await expect(service.inspect()).resolves.toMatchObject({
      status: 'INSTALLED',
      problems: [],
      changeAnnouncements: {
        complete: true,
        missing: { PLACEMENT_START: 0, HEAD_PERIOD_START: 0, HEAD_PERIOD_END: 0 },
      },
    });
    expect(organization.countUnmarkedChangesAsOf).not.toHaveBeenCalled();
  });

  it('reports the changes the seeding migration missed as a problem with counts only, and the installation INCOMPLETE (F47)', async () => {
    const { service, organization } = build({ gaps: { PLACEMENT_START: 2, HEAD_PERIOD_END: 1 } });

    await expect(service.inspect()).resolves.toMatchObject({
      status: 'INCOMPLETE',
      problems: ['CHANGE_ANNOUNCEMENTS_MISSING'],
      changeAnnouncements: {
        complete: false,
        missing: { PLACEMENT_START: 2, HEAD_PERIOD_START: 0, HEAD_PERIOD_END: 1 },
      },
    });
    expect(organization.countUnmarkedChangesAsOf).toHaveBeenCalledWith(TX, new Date('2026-10-24T15:00:00Z'));
  });
  it('seedCheck reads one snapshot without any migration metadata', async () => {
    const { service } = build();
    expect(await service.seedCheck()).toEqual({
      state: 'INSTALLED',
      organization: 'x',
      environment: 'SHARED',
      departments: 2,
      accounts: 1,
    });
    expect(reads.some((read) => /migration|seededAt/i.test(read.read))).toBe(false);
    expect(reads.every((read) => read.client === TX && read.inside)).toBe(true);
  });
  it('seedCheck distinguishes unmigrated tables from other database failures', async () => {
    const h = build();
    jest
      .spyOn(h.organization, 'getOrganization')
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError('missing table', { code: 'P2021', clientVersion: 'test' }),
      );
    expect((await h.service.seedCheck()).state).toBe('NOT_MIGRATED');
    jest.spyOn(h.organization, 'getOrganization').mockRejectedValueOnce(new Error('connection lost'));
    await expect(h.service.seedCheck()).rejects.toThrow('connection lost');
  });
});
