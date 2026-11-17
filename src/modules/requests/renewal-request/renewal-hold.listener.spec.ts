import type { PrismaService } from '../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { RenewalHoldHook } from '../../licensing/public/licensing.extension-points';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { RenewalRequestRepo } from '../renewal-apply/renewal-request.repo';
import { RenewalHoldReader } from './renewal-hold.listener';

type CountArgs = [{ where: { planId: string; state: { notIn: string[] } } }];

describe('RenewalHoldReader', () => {
  const count = jest.fn();
  const countLines = jest.fn();
  const hook = new RenewalHoldHook();
  const reader = new RenewalHoldReader(
    {} as RenewalRequestRepo,
    new AccessRequestRepo({
      accessRequest: { count },
      accessRequestLine: { count: countLines },
    } as unknown as PrismaService),
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

  describe('approvedAwaitingGrantOfPlan', () => {
    type RequestArgs = [{ where: { planId: string; type: { in: string[] }; state: string } }];
    type LineArgs = [{ where: { state: string; request: { planId: string; type: string; state: { in: string[] } } } }];

    it('counts the requests of a person and of a service account that wait for the IT Admin, and the approved lines of a group, never a renewal', async () => {
      count.mockResolvedValue(2);
      countLines.mockResolvedValue(3);

      expect(await reader.approvedAwaitingGrantOfPlan('plan-1')).toBe(5);

      const single = (count.mock.calls[0] as RequestArgs)[0].where;
      expect(single).toEqual({
        planId: 'plan-1',
        type: { in: ['GRANT', 'SERVICE_ACCOUNT'] },
        state: 'AWAITING_EXECUTION',
      });
      const grouped = (countLines.mock.calls[0] as LineArgs)[0].where;
      expect(grouped.state).toBe('APPROVED');
      expect(grouped.request).toMatchObject({ planId: 'plan-1', type: 'GROUP_GRANT' });
      expect([...grouped.request.state.in].sort()).toEqual(['AWAITING_EXECUTION', 'EXECUTING']);
    });

    it('reads inside the transaction it is given', async () => {
      const inTx = jest.fn().mockResolvedValue(1);
      const inTxLines = jest.fn().mockResolvedValue(1);

      const tx = { accessRequest: { count: inTx }, accessRequestLine: { count: inTxLines } } as unknown as DbTx;
      expect(await reader.approvedAwaitingGrantOfPlan('plan-1', tx)).toBe(2);
      expect(count).not.toHaveBeenCalled();
      expect(countLines).not.toHaveBeenCalled();
    });
  });

  it('is what licensing reads through its hook once the module has started', () => {
    reader.onModuleInit();

    expect(hook.get()).toBe(reader);
  });
});
