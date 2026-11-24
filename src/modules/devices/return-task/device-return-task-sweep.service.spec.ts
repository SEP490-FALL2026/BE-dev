import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { OperatingParametersApi } from '../../operating-parameters/public/operating-parameters.api';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { DeviceReturnTaskNotifier } from './device-return-task-notifier.service';
import type { DeviceReturnTaskRepo } from './device-return-task.repo';
import { DeviceReturnTaskSweepService } from './device-return-task-sweep.service';

function setupSweep(today: string, nonWorking: string[] = []) {
  const tx = {} as DbTx;
  const runner = {
    run: jest.fn().mockImplementation((work: (t: DbTx) => Promise<unknown>) => work(tx)),
  } as unknown as TransactionRunner;
  const organizationReads = {
    getOrganization: jest.fn().mockResolvedValue({ id: 'org-1' }),
    businessToday: jest.fn().mockResolvedValue(today),
  } as unknown as OrganizationReadApi;
  const parameters = {
    getNonWorkingDates: jest.fn().mockResolvedValue(new Set(nonWorking)),
  } as unknown as OperatingParametersApi;
  const listOverdueCandidateIds = jest.fn().mockResolvedValue(['task-1']);
  const lockOverdueForNoticeSkipLocked = jest.fn().mockResolvedValue({
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
    assetCode: 'LAP-26-0001',
  });
  const markOverdueNoticed = jest.fn().mockResolvedValue(undefined);
  const repo = {
    listOverdueCandidateIds,
    lockOverdueForNoticeSkipLocked,
    markOverdueNoticed,
  } as unknown as DeviceReturnTaskRepo;
  const overdue = jest.fn().mockResolvedValue(undefined);
  const notifier = { overdue } as unknown as DeviceReturnTaskNotifier;

  const service = new DeviceReturnTaskSweepService(runner, organizationReads, parameters, repo, notifier);

  return { service, tx, listOverdueCandidateIds, lockOverdueForNoticeSkipLocked, markOverdueNoticed, overdue };
}

describe('DeviceReturnTaskSweepService', () => {
  it('skips weekends and company holidays without querying candidates', async () => {
    const weekend = setupSweep('2026-11-28');
    expect(await weekend.service.run()).toEqual({ told: 0 });
    expect(weekend.listOverdueCandidateIds).not.toHaveBeenCalled();

    const holiday = setupSweep('2026-11-25', ['2026-11-25']);
    expect(await holiday.service.run()).toEqual({ told: 0 });
    expect(holiday.listOverdueCandidateIds).not.toHaveBeenCalled();
  });

  it('stamps overdueNoticedOn and notifies once per working day under SKIP LOCKED', async () => {
    const { service, tx, markOverdueNoticed, overdue } = setupSweep('2026-11-25');

    const result = await service.run();

    expect(result).toEqual({ told: 1 });
    expect(markOverdueNoticed).toHaveBeenCalledWith(tx, 'task-1', '2026-11-25');
    expect(overdue).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ organizationId: 'org-1', assetCode: 'LAP-26-0001', today: '2026-11-25' }),
    );
  });

  it('skips notification when row was already stamped today or locked by another worker', async () => {
    const alreadyStampted = setupSweep('2026-11-25');
    alreadyStampted.lockOverdueForNoticeSkipLocked.mockResolvedValueOnce({
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
      overdueNoticedOn: '2026-11-25',
      createdAt: new Date('2026-11-15T00:00:00.000Z'),
      assetCode: 'LAP-26-0001',
    });
    expect(await alreadyStampted.service.run()).toEqual({ told: 0 });
    expect(alreadyStampted.markOverdueNoticed).not.toHaveBeenCalled();

    const skipLocked = setupSweep('2026-11-25');
    skipLocked.lockOverdueForNoticeSkipLocked.mockResolvedValueOnce(null);
    expect(await skipLocked.service.run()).toEqual({ told: 0 });
    expect(skipLocked.overdue).not.toHaveBeenCalled();
  });
});
