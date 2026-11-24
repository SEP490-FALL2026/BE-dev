import { DepartmentUseContributions } from '../../organization/public/organization.extension-points';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { DeviceReturnTaskRepo } from './device-return-task.repo';
import { DeviceReturnTaskOpenWorkReader } from './department-open-work.listener';

describe('DeviceReturnTaskOpenWorkReader', () => {
  const openOfDepartment = jest.fn();
  const repo = { openOfDepartment } as unknown as DeviceReturnTaskRepo;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers with DepartmentUseContributions in group OPEN_WORK on module init', () => {
    const contributions = new DepartmentUseContributions();
    const reader = new DeviceReturnTaskOpenWorkReader(repo, contributions);

    reader.onModuleInit();

    expect(reader.group).toBe('OPEN_WORK');
    expect(DeviceReturnTaskOpenWorkReader.binds).toEqual([DepartmentUseContributions]);
    expect(contributions.all()).toContain(reader);
  });

  it('maps open device return tasks of the department into UseGroup items and passes tx through', async () => {
    const tx = { marker: 'tx' } as unknown as DbTx;
    openOfDepartment.mockResolvedValue({
      total: 3,
      items: [
        { id: 'task-1', assetCode: 'LAP-26-0001' },
        { id: 'task-2', assetCode: 'LAP-26-0002' },
      ],
    });
    const reader = new DeviceReturnTaskOpenWorkReader(repo, new DepartmentUseContributions());

    const result = await reader.read('dep-1', '2026-11-24', 2, tx);

    expect(openOfDepartment).toHaveBeenCalledWith('dep-1', 2, tx);
    expect(result).toEqual({
      total: 3,
      items: [
        { kind: 'DEVICE_RETURN_TASK', id: 'task-1', label: 'LAP-26-0001' },
        { kind: 'DEVICE_RETURN_TASK', id: 'task-2', label: 'LAP-26-0002' },
      ],
    });
  });
});
