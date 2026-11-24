import type { DbTx } from '../../infrastructure/database/transaction-runner';
import type { IdentityAccessApi } from '../identity-access/public/identity-access.api';
import type { NotificationsApi } from '../notifications/public/notifications.api';
import type { OrganizationReadApi } from '../organization/public/organization-read.api';
import { LicensingAlerts } from './licensing-alerts.service';

const TX = {} as DbTx;

function setup(world: {
  inCharge?: string | null;
  substitute?: string | null;
  usableItAdmins?: string[];
  superAdmin?: string | null;
  placements?: Record<string, string>;
}) {
  const usableSet = new Set(world.usableItAdmins ?? []);
  const findUsableItAdminEmployeeIds = jest.fn((ids: readonly string[]) =>
    Promise.resolve(new Set(ids.filter((id) => usableSet.has(id)))),
  );
  const findUsableSuperAdminEmployeeId = jest.fn().mockResolvedValue(world.superAdmin ?? null);
  const identity = {
    findUsableItAdminEmployeeIds,
    findUsableSuperAdminEmployeeId,
  } as unknown as IdentityAccessApi;

  const itAdminsActingFor = jest.fn(
    async (deptIds: readonly string[], usableAmong: (ids: string[]) => Promise<Set<string>>) => {
      const candidates = [world.inCharge, world.substitute].filter((id): id is string => Boolean(id));
      const usable = candidates.length === 0 ? new Set<string>() : await usableAmong(candidates);
      const inCharge = world.inCharge && usable.has(world.inCharge) ? world.inCharge : null;
      const substitute = world.substitute && usable.has(world.substitute) ? world.substitute : null;
      const actors = [inCharge, substitute].filter((id): id is string => id !== null);
      return new Map(
        deptIds.map((id) => [id, { inCharge, substitute, defaultAssignee: substitute ?? inCharge, actors }]),
      );
    },
  );
  const getEmployeePlacement = jest.fn((_empId: string, onDate: string) => {
    const deptId = world.placements?.[onDate];
    return Promise.resolve(deptId ? { departmentId: deptId } : null);
  });
  const organizationReads = {
    itAdminsActingFor,
    getEmployeePlacement,
  } as unknown as OrganizationReadApi;
  const notifications = { notifyInApp: jest.fn() } as unknown as NotificationsApi;

  return {
    alerts: new LicensingAlerts(notifications, organizationReads, identity),
    itAdminsActingFor,
    findUsableItAdminEmployeeIds,
    findUsableSuperAdminEmployeeId,
    getEmployeePlacement,
  };
}

describe('LicensingAlerts', () => {
  it('returns usable in-charge IT Admin when no substitute is active', async () => {
    const { alerts, findUsableItAdminEmployeeIds } = setup({
      inCharge: 'it-1',
      usableItAdmins: ['it-1'],
      superAdmin: 'sa-1',
    });

    await expect(alerts.itAdminOfDepartment('dept-1', TX)).resolves.toBe('it-1');
    expect(findUsableItAdminEmployeeIds).toHaveBeenCalledWith(['it-1'], TX);
  });

  it('returns active substitute (defaultAssignee) when appointed', async () => {
    const { alerts } = setup({
      inCharge: 'it-1',
      substitute: 'sub-1',
      usableItAdmins: ['it-1', 'sub-1'],
      superAdmin: 'sa-1',
    });

    await expect(alerts.itAdminOfDepartment('dept-1', TX)).resolves.toBe('sub-1');
  });

  it('falls back to usable Super Admin when acting set is empty', async () => {
    const { alerts, findUsableSuperAdminEmployeeId } = setup({
      inCharge: 'it-locked',
      usableItAdmins: [],
      superAdmin: 'sa-1',
    });

    await expect(alerts.itAdminOfDepartment('dept-1', TX)).resolves.toBe('sa-1');
    expect(findUsableSuperAdminEmployeeId).toHaveBeenCalledWith(TX);
  });

  it('returns null when departmentId is null', async () => {
    const { alerts, itAdminsActingFor, findUsableSuperAdminEmployeeId } = setup({ superAdmin: 'sa-1' });

    await expect(alerts.itAdminOfDepartment(null, TX)).resolves.toBeNull();
    expect(itAdminsActingFor).not.toHaveBeenCalled();
    expect(findUsableSuperAdminEmployeeId).not.toHaveBeenCalled();
  });

  it('resolves placement across dates and delegates to itAdminOfDepartment in itAdminOfPerson', async () => {
    const { alerts, getEmployeePlacement } = setup({
      inCharge: 'it-1',
      substitute: 'sub-1',
      usableItAdmins: ['it-1', 'sub-1'],
      placements: { '2026-11-01': 'dept-1' },
    });

    await expect(alerts.itAdminOfPerson('emp-1', ['2026-11-02', '2026-11-01'], TX)).resolves.toBe('sub-1');
    expect(getEmployeePlacement).toHaveBeenNthCalledWith(1, 'emp-1', '2026-11-02', TX);
    expect(getEmployeePlacement).toHaveBeenNthCalledWith(2, 'emp-1', '2026-11-01', TX);
  });
});
