import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import type { NotificationsApi } from '../../notifications/public/notifications.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { unplacedWorkKey } from '../../organization/public/organization.types';
import { DeviceReturnTaskNotifier } from './device-return-task-notifier.service';
import type { ReturnTaskRecord } from './device-return-task.types';

const task = (overrides: Partial<ReturnTaskRecord> = {}): ReturnTaskRecord => ({
  id: 'task-1',
  organizationId: 'org-1',
  deviceId: 'dev-1',
  registrationId: 'reg-1',
  employeeId: 'emp-1',
  offboardingCaseId: 'case-1',
  departmentId: 'dep-1',
  dueOn: '2026-11-20',
  state: 'OPEN',
  conditionOnReceipt: null,
  softwareRemoval: null,
  softwareRemovalNote: null,
  outcomeNote: null,
  handledByAppUserId: null,
  handledAt: null,
  overdueNoticedOn: null,
  createdAt: new Date('2026-11-15T00:00:00.000Z'),
  ...overrides,
});

function buildNotifier(
  actors: string[] = ['it-1'],
  superAdmin: string | null = 'sa-1',
  unplacedDesignee: string | null = null,
) {
  const notifyInApp = jest.fn().mockResolvedValue(undefined);
  const notifications = { notifyInApp } as unknown as NotificationsApi;
  const itAdminsActingForUnplacedWork = jest
    .fn()
    .mockResolvedValue(new Map([[unplacedWorkKey('DEVICE_RETURN_TASK', 'task-1'), unplacedDesignee]]));
  const organizationReads = {
    itAdminsActingFor: jest
      .fn()
      .mockResolvedValue(new Map([['dep-1', { inCharge: actors[0] ?? null, substitute: actors[1] ?? null, actors }]])),
    itAdminsActingForUnplacedWork,
  } as unknown as OrganizationReadApi;
  const identity = {
    findUsableItAdminEmployeeIds: jest
      .fn()
      .mockResolvedValue(new Set([...actors, ...(unplacedDesignee ? [unplacedDesignee] : [])])),
    findUsableSuperAdminEmployeeId: jest.fn().mockResolvedValue(superAdmin),
  } as unknown as IdentityAccessApi;

  const notifier = new DeviceReturnTaskNotifier(notifications, organizationReads, identity);

  return { notifier, notifyInApp, itAdminsActingForUnplacedWork, tx: {} as DbTx };
}

describe('DeviceReturnTaskNotifier', () => {
  it('sends DEVICE_RETURN_WAITING to Super Admin when leaver is sole IT Admin or department is null', async () => {
    const { notifier, notifyInApp, tx } = buildNotifier(['emp-1']);

    const sent = await notifier.waitingIfUnassigned(tx, {
      organizationId: 'org-1',
      task: task({ employeeId: 'emp-1' }),
      assetCode: 'LAP-26-0001',
    });

    expect(sent).toBe(true);
    expect(notifyInApp).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        recipientEmployeeId: 'sa-1',
        code: 'DEVICE_RETURN_WAITING',
        subject: { type: 'DEVICE_RETURN_TASK', id: 'task-1' },
        eventKey: 'deviceReturnWaiting:task-1',
        params: {
          taskId: 'task-1',
          deviceId: 'dev-1',
          assetCode: 'LAP-26-0001',
          employeeId: 'emp-1',
          departmentId: 'dep-1',
          dueOn: '2026-11-20',
        },
      }),
    );

    const { notifier: withOtherIt, notifyInApp: skippedCalls } = buildNotifier(['it-1']);
    const notSent = await withOtherIt.waitingIfUnassigned(tx, {
      organizationId: 'org-1',
      task: task(),
      assetCode: 'LAP-26-0001',
    });
    expect(notSent).toBe(false);
    expect(skippedCalls).not.toHaveBeenCalled();
  });

  it('sends deduplicated DEVICE_RETURN_OVERDUE reminders to acting non-leaver IT Admins and Super Admin', async () => {
    const { notifier, notifyInApp, tx } = buildNotifier(['emp-1', 'it-sub']);

    await notifier.overdue(tx, {
      organizationId: 'org-1',
      task: task({ employeeId: 'emp-1' }),
      assetCode: 'LAP-26-0001',
      today: '2026-11-25',
    });

    expect(notifyInApp).toHaveBeenCalledTimes(2);
    expect(notifyInApp).toHaveBeenNthCalledWith(
      1,
      tx,
      expect.objectContaining({
        recipientEmployeeId: 'it-sub',
        code: 'DEVICE_RETURN_OVERDUE',
        eventKey: 'deviceReturnOverdue:task-1:it-sub:2026-11-25',
      }),
    );
    expect(notifyInApp).toHaveBeenNthCalledWith(
      2,
      tx,
      expect.objectContaining({
        recipientEmployeeId: 'sa-1',
        code: 'DEVICE_RETURN_OVERDUE',
        eventKey: 'deviceReturnOverdue:task-1:sa-1:2026-11-25',
      }),
    );
  });

  it('notifies appointed unplaced designee (excluding task employee) and Super Admin on overdue when departmentId is null', async () => {
    const withDesignee = buildNotifier([], 'sa-1', 'it-des');
    await withDesignee.notifier.overdue(withDesignee.tx, {
      organizationId: 'org-1',
      task: task({ departmentId: null, employeeId: 'emp-unplaced' }),
      assetCode: 'LAP-26-0007',
      today: '2026-11-25',
    });

    expect(withDesignee.itAdminsActingForUnplacedWork).toHaveBeenCalledWith(
      [{ workKind: 'DEVICE_RETURN_TASK', workId: 'task-1', employeeId: 'emp-unplaced' }],
      expect.any(Function),
      withDesignee.tx,
    );
    expect(withDesignee.notifyInApp).toHaveBeenCalledTimes(2);
    expect(withDesignee.notifyInApp).toHaveBeenNthCalledWith(
      1,
      withDesignee.tx,
      expect.objectContaining({
        recipientEmployeeId: 'it-des',
        code: 'DEVICE_RETURN_OVERDUE',
        eventKey: 'deviceReturnOverdue:task-1:it-des:2026-11-25',
      }),
    );
    expect(withDesignee.notifyInApp).toHaveBeenNthCalledWith(
      2,
      withDesignee.tx,
      expect.objectContaining({
        recipientEmployeeId: 'sa-1',
        code: 'DEVICE_RETURN_OVERDUE',
        eventKey: 'deviceReturnOverdue:task-1:sa-1:2026-11-25',
      }),
    );

    const selfDesignee = buildNotifier([], 'sa-1', 'emp-unplaced');
    await selfDesignee.notifier.overdue(selfDesignee.tx, {
      organizationId: 'org-1',
      task: task({ departmentId: null, employeeId: 'emp-unplaced' }),
      assetCode: 'LAP-26-0007',
      today: '2026-11-25',
    });
    expect(selfDesignee.notifyInApp).toHaveBeenCalledTimes(1);
    expect(selfDesignee.notifyInApp).toHaveBeenCalledWith(
      selfDesignee.tx,
      expect.objectContaining({ recipientEmployeeId: 'sa-1', code: 'DEVICE_RETURN_OVERDUE' }),
    );
  });
});
