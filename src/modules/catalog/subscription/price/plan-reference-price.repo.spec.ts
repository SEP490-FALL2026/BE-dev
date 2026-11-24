import type { PrismaService } from '../../../../infrastructure/database/prisma.service';
import { PlanReferencePriceRepo } from './plan-reference-price.repo';

const repoReading = (row: object | null) =>
  new PlanReferencePriceRepo({ plan: { findUnique: jest.fn().mockResolvedValue(row) } } as unknown as PrismaService);

describe('QĐ-113a the reference price a request falls back to is one in dong above zero', () => {
  it('reads a price in dong with the kind of the plan', async () => {
    const price = await repoReading({
      provisioningType: 'K2',
      referencePriceMinor: 500_000n,
      referencePriceCurrency: 'VND',
    }).findOfPlan('plan');

    expect(price).toEqual({
      provisioningType: 'K2',
      amountMinor: 500_000n,
      currency: 'VND',
      referenceCommitmentMonths: null,
    });
  });

  it.each([
    ['a price in another currency', { referencePriceMinor: 20n, referencePriceCurrency: 'USD' }],
    ['a price of 0', { referencePriceMinor: 0n, referencePriceCurrency: 'VND' }],
    ['no price', { referencePriceMinor: null, referencePriceCurrency: null }],
  ])('reads %s as no price', async (_label, columns) => {
    expect(await repoReading({ provisioningType: 'K2', ...columns }).findOfPlan('plan')).toBeNull();
  });

  it('reads a missing plan as no price', async () => {
    expect(await repoReading(null).findOfPlan('plan')).toBeNull();
  });

  it('counts by cycle only the plans with a price above zero in dong', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { id: 'a', provisioningType: 'K1' },
      { id: 'b', provisioningType: 'K4' },
    ]);
    const repo = new PlanReferencePriceRepo({ plan: { findMany } } as unknown as PrismaService);

    expect(await repo.findCyclesOfPlans(['a', 'b'])).toEqual(
      new Map([
        ['a', 'MONTHLY'],
        ['b', 'ONE_TIME'],
      ]),
    );
    expect((findMany.mock.calls[0] as [{ where: object }])[0].where).toMatchObject({
      referencePriceMinor: { gt: 0n },
      referencePriceCurrency: 'VND',
    });
  });
});
