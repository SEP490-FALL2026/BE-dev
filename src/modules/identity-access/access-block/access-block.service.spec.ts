import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { AccessBlockRepo } from './access-block.repo';
import { AccessBlockService } from './access-block.service';

const TX = {} as DbTx;
const INPUT = { employeeId: 'e-1', cause: 'DEPARTURE_LAST_DAY', blockedFrom: '2026-11-20', caseId: 'case-1' } as const;

function setUp(options: { employee?: boolean; current?: { blockedFrom: string; releasable?: boolean } | null } = {}) {
  const upsert = jest.fn().mockResolvedValue(undefined);
  const remove = jest.fn().mockResolvedValue(undefined);
  const blocks = {
    find: jest
      .fn()
      .mockResolvedValue(
        options.current
          ? { cause: 'DEPARTURE_LAST_DAY', releasable: false, sourceCaseId: 'old', ...options.current }
          : null,
      ),
    upsert,
    delete: remove,
  };
  const organizationReads = {
    getEmployee: jest.fn().mockResolvedValue(options.employee === false ? null : { organizationId: 'org-1' }),
    businessToday: jest.fn().mockResolvedValue('2026-11-10'),
  };
  const service = new AccessBlockService(
    blocks as unknown as AccessBlockRepo,
    organizationReads as unknown as OrganizationReadApi,
  );

  return { service, upsert, remove };
}

describe('AccessBlockService', () => {
  it('throws for an employee that does not exist instead of leaving the person without a block (L5)', async () => {
    const { service, upsert } = setUp({ employee: false });

    await expect(service.set(TX, INPUT)).rejects.toThrow(/not found/);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('writes the day it is given when there is no block, or the block has not begun', async () => {
    const none = setUp();
    const pending = setUp({ current: { blockedFrom: '2026-11-15' } });

    await none.service.set(TX, INPUT);
    await pending.service.set(TX, INPUT);

    expect(none.upsert).toHaveBeenCalledWith(TX, expect.objectContaining({ blockedFrom: '2026-11-20' }));
    expect(pending.upsert).toHaveBeenCalledWith(TX, expect.objectContaining({ blockedFrom: '2026-11-20' }));
  });

  it('never pushes a block in force later: the person refused yesterday is refused today (M1)', async () => {
    const { service, upsert } = setUp({ current: { blockedFrom: '2026-11-05', releasable: true } });

    await service.set(TX, INPUT);

    expect(upsert).toHaveBeenCalledWith(TX, expect.objectContaining({ blockedFrom: '2026-11-05', caseId: 'case-1' }));
  });

  it('lifts only a releasable block that has begun, refuses a live one and ignores one that has not begun', async () => {
    const releasable = setUp({ current: { blockedFrom: '2026-11-05', releasable: true } });
    const live = setUp({ current: { blockedFrom: '2026-11-05' } });
    const pending = setUp({ current: { blockedFrom: '2026-11-15' } });
    const none = setUp();

    await expect(releasable.service.releaseForUnlock(TX, 'e-1')).resolves.toBe(true);
    await expect(live.service.releaseForUnlock(TX, 'e-1')).rejects.toThrow(/still under way/);
    await expect(pending.service.releaseForUnlock(TX, 'e-1')).resolves.toBe(false);
    await expect(none.service.releaseForUnlock(TX, 'e-1')).resolves.toBe(false);

    expect(releasable.remove).toHaveBeenCalledTimes(1);
    expect(live.remove).not.toHaveBeenCalled();
  });

  it('clears a block that has not begun when the departure is cancelled', async () => {
    const pending = setUp({ current: { blockedFrom: '2026-11-15' } });

    await expect(pending.service.clearPending(TX, 'e-1', '2026-11-10')).resolves.toBe('CLEARED');
    expect(pending.remove).toHaveBeenCalledTimes(1);
  });
});
