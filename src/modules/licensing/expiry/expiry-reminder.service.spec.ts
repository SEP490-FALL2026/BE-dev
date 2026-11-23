import type { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuditApi } from '../../audit/public/audit.api';
import type { CatalogApi } from '../../catalog/public/catalog.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { LicensingAlerts } from '../licensing-alerts.service';
import type { RenewalHoldHook } from '../public/licensing.extension-points';
import type { ExpiryReminderRepo, ReminderCandidate } from './expiry-reminder.repo';
import { ExpiryReminderService } from './expiry-reminder.service';

const CANDIDATE: ReminderCandidate = {
  organizationId: 'org-1',
  assignmentId: 'assign-1',
  employeeId: 'emp-1',
  planId: 'plan-1',
  expectedEndDate: '2026-11-10',
};

function setup(world: {
  inCharge?: string | null;
  substitute?: string | null;
  usableItAdmins?: string[];
  head?: string | null;
}) {
  const inserted: Array<{ audience: string; recipientEmployeeId: string }> = [];
  const told: string[] = [];
  const repo = {
    candidates: jest.fn().mockResolvedValue([CANDIDATE]),
    insertMany: jest.fn((_tx: unknown, entries: Array<{ audience: string; recipientEmployeeId: string }>) => {
      inserted.push(...entries.map(({ audience, recipientEmployeeId }) => ({ audience, recipientEmployeeId })));
      return Promise.resolve(entries);
    }),
  } as unknown as ExpiryReminderRepo;

  const usableSet = new Set(world.usableItAdmins ?? []);
  const alerts = {
    usableItAdmins: jest.fn((ids: readonly (string | null)[]) =>
      Promise.resolve(new Set(ids.filter((id): id is string => id !== null && usableSet.has(id)))),
    ),
    tell: jest.fn((_tx: unknown, _org: string, people: readonly string[]) => {
      told.push(...people);
      return Promise.resolve(people.length);
    }),
  } as unknown as LicensingAlerts;

  const itAdminsActingFor = jest.fn(
    async (deptIds: readonly string[], usableAmong: (ids: string[]) => Promise<ReadonlySet<string>>) => {
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

  const organizationReads = {
    businessToday: jest.fn().mockResolvedValue('2026-11-03'),
    getOwningUnits: jest.fn().mockResolvedValue(new Map([['emp-1', { departmentId: 'dept-1' }]])),
    getDepartmentHeads: jest
      .fn()
      .mockResolvedValue(
        world.head === null ? new Map() : new Map([['dept-1', { employeeId: world.head ?? 'head-1' }]]),
      ),
    itAdminsActingFor,
  } as unknown as OrganizationReadApi;

  const runner = {
    run: jest.fn((fn: (tx: unknown) => Promise<number>) => fn({})),
  } as unknown as TransactionRunner;
  const audit = { record: jest.fn().mockResolvedValue(undefined) } as unknown as AuditApi;
  const renewals = {
    get: () => ({ pendingRenewalsOf: jest.fn().mockResolvedValue(new Map()) }),
  } as unknown as RenewalHoldHook;

  return {
    service: new ExpiryReminderService(repo, organizationReads, {} as CatalogApi, runner, audit, alerts, renewals),
    inserted,
    told,
    itAdminsActingFor,
  };
}

describe('ExpiryReminderService.noticeDue', () => {
  it('writes IT_ADMIN reminder for usable in-charge IT Admin', async () => {
    const { service, inserted, itAdminsActingFor } = setup({
      inCharge: 'it-1',
      usableItAdmins: ['it-1'],
      head: 'head-1',
    });

    const count = await service.noticeDue(new Date('2026-11-03T12:00:00Z'));

    expect(count).toBe(3);
    expect(itAdminsActingFor).toHaveBeenCalledWith(['dept-1'], expect.any(Function));
    expect(inserted).toEqual([
      { audience: 'EMPLOYEE', recipientEmployeeId: 'emp-1' },
      { audience: 'HEAD', recipientEmployeeId: 'head-1' },
      { audience: 'IT_ADMIN', recipientEmployeeId: 'it-1' },
    ]);
  });

  it('writes IT_ADMIN reminder for active substitute (defaultAssignee) when both are usable', async () => {
    const { service, inserted } = setup({
      inCharge: 'it-1',
      substitute: 'sub-1',
      usableItAdmins: ['it-1', 'sub-1'],
      head: 'head-1',
    });

    const count = await service.noticeDue(new Date('2026-11-03T12:00:00Z'));

    expect(count).toBe(3);
    expect(inserted.find((row) => row.audience === 'IT_ADMIN')?.recipientEmployeeId).toBe('sub-1');
  });

  it('writes IT_ADMIN reminder for active substitute when in-charge IT Admin is locked', async () => {
    const { service, inserted } = setup({
      inCharge: 'it-locked',
      substitute: 'sub-1',
      usableItAdmins: ['sub-1'],
      head: 'head-1',
    });

    const count = await service.noticeDue(new Date('2026-11-03T12:00:00Z'));

    expect(count).toBe(3);
    expect(inserted.find((row) => row.audience === 'IT_ADMIN')?.recipientEmployeeId).toBe('sub-1');
  });

  it('writes only EMPLOYEE and HEAD reminders when in-charge is locked and no substitute exists', async () => {
    const { service, inserted } = setup({
      inCharge: 'it-locked',
      usableItAdmins: [],
      head: 'head-1',
    });

    const count = await service.noticeDue(new Date('2026-11-03T12:00:00Z'));

    expect(count).toBe(2);
    expect(inserted).toEqual([
      { audience: 'EMPLOYEE', recipientEmployeeId: 'emp-1' },
      { audience: 'HEAD', recipientEmployeeId: 'head-1' },
    ]);
  });
});
