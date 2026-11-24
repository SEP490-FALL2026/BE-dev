import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { DepartmentUseContributions } from '../../organization/public/organization.extension-points';
import type { GhostSeatRepo } from './ghost-seat.repo';
import { GhostSeatOpenWorkReader } from './department-open-work.listener';

describe('GhostSeatOpenWorkReader', () => {
  const openOfDepartment = jest.fn();
  const repo = { openOfDepartment } as unknown as GhostSeatRepo;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers with DepartmentUseContributions in group OPEN_WORK on module init', () => {
    const contributions = new DepartmentUseContributions();
    const reader = new GhostSeatOpenWorkReader(repo, contributions);

    reader.onModuleInit();

    expect(reader.group).toBe('OPEN_WORK');
    expect(GhostSeatOpenWorkReader.binds).toEqual([DepartmentUseContributions]);
    expect(contributions.all()).toContain(reader);
  });

  it('maps unclosed ghost seat recommendations of the department into UseGroup items and passes tx through', async () => {
    const tx = { marker: 'tx' } as unknown as DbTx;
    openOfDepartment.mockResolvedValue({
      total: 2,
      items: [
        { id: 'rec-1', group: 'G2' },
        { id: 'rec-2', group: 'G3' },
      ],
    });
    const reader = new GhostSeatOpenWorkReader(repo, new DepartmentUseContributions());

    const result = await reader.read('dep-1', '2026-11-24', 5, tx);

    expect(openOfDepartment).toHaveBeenCalledWith('dep-1', 5, tx);
    expect(result).toEqual({
      total: 2,
      items: [
        { kind: 'GHOST_SEAT_RECOMMENDATION', id: 'rec-1', label: 'G2' },
        { kind: 'GHOST_SEAT_RECOMMENDATION', id: 'rec-2', label: 'G3' },
      ],
    });
  });
});
