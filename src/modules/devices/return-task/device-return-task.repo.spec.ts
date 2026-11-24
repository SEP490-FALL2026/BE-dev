import type { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { DeviceReturnTaskRepo } from './device-return-task.repo';

describe('DeviceReturnTaskRepo', () => {
  it('locks managed_devices in ascending id order before locking open return tasks of a case', async () => {
    const order: string[] = [];
    const findMany = jest
      .fn()
      .mockImplementationOnce(() => {
        order.push('findOpenDevices');
        return Promise.resolve([{ deviceId: 'dev-b' }, { deviceId: 'dev-a' }, { deviceId: 'dev-b' }]);
      })
      .mockImplementationOnce(() => {
        order.push('rereadLocked');
        return Promise.resolve([
          {
            id: 'task-1',
            organizationId: 'org-1',
            deviceId: 'dev-a',
            registrationId: 'reg-1',
            employeeId: 'emp-1',
            offboardingCaseId: 'case-1',
            departmentId: 'dep-1',
            dueOn: new Date('2026-11-30T00:00:00.000Z'),
            state: 'OPEN',
            conditionOnReceipt: null,
            softwareRemoval: null,
            softwareRemovalNote: null,
            outcomeNote: null,
            handledByAppUserId: null,
            handledAt: null,
            overdueNoticedOn: new Date('2026-11-29T00:00:00.000Z'),
            createdAt: new Date('2026-11-20T00:00:00.000Z'),
          },
        ]);
      });
    const $queryRaw = jest.fn().mockImplementation((strings: TemplateStringsArray, ...values: unknown[]) => {
      const sql = strings.join('?');
      if (sql.includes('managed_devices')) {
        order.push(`lockDevices:${JSON.stringify(values[0])}`);
        return Promise.resolve([]);
      }
      if (sql.includes('device_return_tasks')) {
        order.push(`lockTasks:${String(values[0])}`);
        return Promise.resolve([{ id: 'task-1' }]);
      }
      return Promise.resolve([]);
    });
    const tx = { deviceReturnTask: { findMany }, $queryRaw } as unknown as DbTx;
    const repo = new DeviceReturnTaskRepo({} as PrismaService);

    const locked = await repo.lockOpenByCaseId(tx, 'case-1');

    expect(order).toEqual(['findOpenDevices', 'lockDevices:["dev-a","dev-b"]', 'lockTasks:case-1', 'rereadLocked']);
    expect(locked).toHaveLength(1);
    expect(locked[0]).toMatchObject({
      id: 'task-1',
      dueOn: '2026-11-30',
      overdueNoticedOn: '2026-11-29',
      state: 'OPEN',
    });
  });

  it('returns empty array without locking when the case has no open return tasks', async () => {
    const findMany = jest.fn().mockResolvedValueOnce([]);
    const $queryRaw = jest.fn();
    const tx = { deviceReturnTask: { findMany }, $queryRaw } as unknown as DbTx;
    const repo = new DeviceReturnTaskRepo({} as PrismaService);

    const locked = await repo.lockOpenByCaseId(tx, 'case-empty');

    expect(locked).toEqual([]);
    expect($queryRaw).not.toHaveBeenCalled();
  });

  it('inserts open tasks, updates due dates with optional notice clear, and cancels open tasks', async () => {
    const create = jest.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({
        ...data,
        conditionOnReceipt: null,
        softwareRemoval: null,
        softwareRemovalNote: null,
        outcomeNote: null,
        handledByAppUserId: null,
        handledAt: null,
        overdueNoticedOn: null,
        createdAt: new Date('2026-11-24T00:00:00.000Z'),
      }),
    );
    const update = jest.fn().mockResolvedValue(undefined);
    const findMany = jest.fn().mockResolvedValue([{ registrationId: 'reg-1' }]);
    const tx = { deviceReturnTask: { create, update, findMany } } as unknown as DbTx;
    const repo = new DeviceReturnTaskRepo({} as PrismaService);

    const existing = await repo.findExistingRegistrationIds(tx, ['reg-1', 'reg-2']);
    const inserted = await repo.insertOpen(tx, {
      organizationId: 'org-1',
      deviceId: 'dev-2',
      registrationId: 'reg-2',
      employeeId: 'emp-1',
      offboardingCaseId: 'case-1',
      departmentId: null,
      dueOn: '2026-12-01',
    });
    await repo.updateDueOn(tx, inserted.id, { dueOn: '2026-12-10', clearOverdueNotice: true });
    await repo.updateDueOn(tx, inserted.id, { dueOn: '2026-11-20', clearOverdueNotice: false });
    const cancelledAt = new Date('2026-11-24T10:00:00.000Z');
    await repo.markCancelled(tx, inserted.id, cancelledAt);

    expect(existing).toEqual(new Set(['reg-1']));
    expect(inserted).toMatchObject({ state: 'OPEN', departmentId: null, dueOn: '2026-12-01' });
    expect(update).toHaveBeenNthCalledWith(1, {
      where: { id: inserted.id },
      data: { dueOn: new Date('2026-12-10T00:00:00.000Z'), overdueNoticedOn: null },
    });
    expect(update).toHaveBeenNthCalledWith(2, {
      where: { id: inserted.id },
      data: { dueOn: new Date('2026-11-20T00:00:00.000Z') },
    });
    expect(update).toHaveBeenNthCalledWith(3, {
      where: { id: inserted.id },
      data: { state: 'CANCELLED', handledAt: cancelledAt },
    });
  });
});
