import type { DbTx, TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { PurchaseInvoiceRefusedError } from './purchase-invoice.errors';
import type { PurchaseInvoiceRepo } from './purchase-invoice.repo';
import { PurchaseInvoiceSubmissionService } from './purchase-invoice-submission.service';

const tx = { kind: 'tx' } as unknown as DbTx;
const actor = { employeeId: 'it-1' } as unknown as AuthenticatedPrincipal;

describe('PurchaseInvoiceSubmissionService.resubmit', () => {
  function build(options: { resubmitted: boolean; refuse?: PurchaseInvoiceRefusedError; state?: string }) {
    const resubmittedAs = jest.fn(() =>
      Promise.resolve(options.resubmitted ? new Map([['inv-1', 'inv-2']]) : new Map()),
    );
    const invoices = {
      lock: jest.fn(() =>
        Promise.resolve({ id: 'inv-1', submittedByEmployeeId: 'it-1', state: options.state ?? 'RETURNED' }),
      ),
      resubmittedAs,
    } as unknown as PurchaseInvoiceRepo;
    const runner = {
      run: jest.fn((work: (client: DbTx) => Promise<unknown>) => work(tx)),
    } as unknown as TransactionRunner;
    const service = new PurchaseInvoiceSubmissionService(
      runner,
      {} as never,
      {
        requireToResubmit: jest.fn(() => (options.refuse ? Promise.reject(options.refuse) : Promise.resolve())),
      } as never,
      invoices,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    return { service, resubmittedAs };
  }

  it('asks whether the returned invoice was already submitted again through the transaction of the call, not through the pool', async () => {
    const { service, resubmittedAs } = build({ resubmitted: true });

    await expect(service.resubmit(actor, 'inv-1', {} as never)).rejects.toThrow(PurchaseInvoiceRefusedError);

    expect(resubmittedAs).toHaveBeenCalledWith(['inv-1'], tx);
  });

  it('asks who may submit the invoice again before it looks at its state: another IT Admin is told NOT_RESPONSIBLE, not NOT_RETURNED (QĐ-118f, Owner 28/11/2026)', async () => {
    const { service } = build({
      resubmitted: false,
      state: 'SUBMITTED',
      refuse: new PurchaseInvoiceRefusedError('NOT_RESPONSIBLE'),
    });

    await expect(service.resubmit(actor, 'inv-1', {} as never)).rejects.toMatchObject({ reason: 'NOT_RESPONSIBLE' });
  });

  it('is told NOT_RETURNED by the one allowed to submit it again when the invoice was not returned', async () => {
    const { service } = build({ resubmitted: false, state: 'SUBMITTED' });

    await expect(service.resubmit(actor, 'inv-1', {} as never)).rejects.toMatchObject({ reason: 'NOT_RETURNED' });
  });
});
