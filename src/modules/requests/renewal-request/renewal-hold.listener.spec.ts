import type { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { RenewalHoldHook } from '../../licensing/public/licensing.extension-points';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { RenewalRequestRepo } from '../renewal-apply/renewal-request.repo';
import { RenewalHoldReader } from './renewal-hold.listener';

type CountArgs = [{ where: { planId: string; state: { notIn: string[] } } }];

describe('RenewalHoldReader', () => {
  const count = jest.fn();
  const hook = new RenewalHoldHook();
  const reader = new RenewalHoldReader(
    {} as RenewalRequestRepo,
    new AccessRequestRepo({ accessRequest: { count } } as unknown as PrismaService),
    hook,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    count.mockResolvedValue(3);
  });

  describe('openRequestsOfPlan', () => {
    it('counts the requests for the plan that are not in a final state, a draft among the final ones', async () => {
      expect(await reader.openRequestsOfPlan('plan-1')).toBe(3);

      const { where } = (count.mock.calls[0] as CountArgs)[0];
      expect(where.planId).toBe('plan-1');
      expect([...where.state.notIn].sort()).toEqual(
        ['CANCELLED', 'COMPLETED', 'DRAFT', 'FAILED', 'IT_REJECTED', 'REJECTED', 'WITHDRAWN'].sort(),
      );
    });

    it('keeps a request that waits for the IT Admin to close its withdrawal open, the work is still there', async () => {
      await reader.openRequestsOfPlan('plan-1');

      expect((count.mock.calls[0] as CountArgs)[0].where.state.notIn).not.toContain('AWAITING_IT_CLOSE');
    });

    it('reads inside the transaction it is given', async () => {
      const inTx = jest.fn().mockResolvedValue(1);

      expect(await reader.openRequestsOfPlan('plan-1', { accessRequest: { count: inTx } } as unknown as DbTx)).toBe(1);
      expect(count).not.toHaveBeenCalled();
    });
  });

  it('is what licensing reads through its hook once the module has started', () => {
    reader.onModuleInit();

    expect(hook.get()).toBe(reader);
  });
});
