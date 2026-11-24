import type { PrismaService } from '../../../../infrastructure/database/prisma.service';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { RenewalSavingsRepo } from './renewal-savings.repo';

describe('RenewalSavingsRepo', () => {
  const row = {
    id: 'ren-1',
    organizationId: 'org-1',
    subscriptionId: 'sub-old',
    nextSubscriptionId: 'sub-new',
    state: 'OUTCOME_RECORDED' as const,
    outcome: 'AS_DECIDED' as const,
    decidedChoice: 'REDUCE' as const,
    decidedQuantity: 10,
    realisedSavingsMinor: null,
    realisedSavingsCurrency: null,
    realisedSavingsRecordedAt: null,
    realisedSavingsInvoiceId: null,
  };

  const build = () => {
    const findFirst = jest.fn().mockResolvedValue(row);
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const queryRaw = jest.fn().mockResolvedValue([
      {
        id: row.id,
        organization_id: row.organizationId,
        subscription_id: row.subscriptionId,
        next_subscription_id: row.nextSubscriptionId,
        state: row.state,
        outcome: row.outcome,
        decided_choice: row.decidedChoice,
        decided_quantity: row.decidedQuantity,
        realised_savings_minor: null,
        realised_savings_currency: null,
        realised_savings_recorded_at: null,
        realised_savings_invoice_id: null,
      },
    ]);
    const prisma = { subscriptionRenewal: { findFirst, updateMany }, $queryRaw: queryRaw } as unknown as PrismaService;
    const tx = { subscriptionRenewal: { findFirst, updateMany }, $queryRaw: queryRaw } as unknown as DbTx;

    return { repo: new RenewalSavingsRepo(prisma), tx, findFirst, updateMany, queryRaw };
  };

  it('finds and locks the renewal whose next_subscription_id matches', async () => {
    const { repo, tx, queryRaw } = build();

    expect(await repo.findByNextSubscriptionId('sub-new', tx)).toEqual(row);
    expect(await repo.lockByNextSubscriptionId(tx, 'sub-new')).toEqual(row);

    queryRaw.mockResolvedValueOnce([]);
    expect(await repo.lockByNextSubscriptionId(tx, 'sub-missing')).toBeNull();
  });

  it('records realised savings once when unrecorded and returns whether a row updated', async () => {
    const { repo, tx, updateMany } = build();
    const recordedAt = new Date('2027-02-01T10:00:00.000Z');

    const wrote = await repo.recordRealisedSaving(tx, {
      renewalId: 'ren-1',
      minor: 200_000n,
      currency: 'VND',
      recordedAt,
      invoiceId: 'inv-1',
    });

    expect(wrote).toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: 'ren-1',
        state: 'OUTCOME_RECORDED',
        outcome: 'AS_DECIDED',
        nextSubscriptionId: { not: null },
        realisedSavingsMinor: null,
        realisedSavingsRecordedAt: null,
      },
      data: {
        realisedSavingsMinor: 200_000n,
        realisedSavingsCurrency: 'VND',
        realisedSavingsRecordedAt: recordedAt,
        realisedSavingsInvoiceId: 'inv-1',
      },
    });

    updateMany.mockResolvedValueOnce({ count: 0 });
    expect(
      await repo.recordRealisedSaving(tx, {
        renewalId: 'ren-1',
        minor: 0n,
        currency: 'VND',
        recordedAt,
        invoiceId: 'inv-2',
      }),
    ).toBe(false);
  });
});
