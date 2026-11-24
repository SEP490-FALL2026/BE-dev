import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { PurchaseInvoiceRefusedError } from './purchase-invoice.errors';
import { PurchaseInvoicePlanService } from './purchase-invoice-plan.service';

const tx = {} as DbTx;
const actor = { employeeId: 'it-1' } as unknown as AuthenticatedPrincipal;

describe('PurchaseInvoicePlanService acting scope (S2-2)', () => {
  it('checks request department against getItAdminActingScope', async () => {
    const findUsableItAdminEmployeeIds = jest.fn().mockResolvedValue(new Set(['it-1']));
    const getItAdminActingScope = jest.fn(
      async (_id: string, usable: (ids: readonly string[]) => Promise<ReadonlySet<string>>) => {
        await usable(['it-1']);
        return ['dept-other'];
      },
    );
    const service = new PurchaseInvoicePlanService(
      {
        requestFacts: jest
          .fn()
          .mockResolvedValue({ departmentId: 'dept-1', state: 'AWAITING_EXECUTION', planId: 'plan-1' }),
      } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { getItAdminActingScope } as never,
      { findUsableItAdminEmployeeIds } as never,
      {} as never,
    );

    await expect(
      service.plan(
        actor,
        {
          link: { requestId: 'req-1' },
          servicePeriodMonth: '2026-11',
        } as never,
        tx,
      ),
    ).rejects.toEqual(new PurchaseInvoiceRefusedError('LINK_NOT_FOUND'));

    expect(getItAdminActingScope).toHaveBeenCalledWith('it-1', expect.any(Function), tx);
    expect(findUsableItAdminEmployeeIds).toHaveBeenCalledWith(['it-1'], tx);
  });
});
