import { potentialSavingOf, type SavingFacts } from './potential-saving.policy';

const price = (monthlyPriceMinor: bigint | null, billingCycle: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL' | 'OTHER') => ({
  monthlyPriceMinor,
  currency: 'VND',
  billingCycle,
});

describe('the potential saving of a seat (FR-4.15, R-J09, US-10-04 AC-3, DA6-31, W3-02, W3-09)', () => {
  it.each<{
    name: string;
    input: SavingFacts;
    expected: ReturnType<typeof potentialSavingOf>;
  }>([
    {
      name: 'Standard K2 12-month upfront (before 01/06 deadline), 2 seats -> 12.000.000 đ at 2026-07-01 (RENEWAL)',
      input: {
        provisioningType: 'K2',
        price: price(500_000n, 'ANNUAL'),
        seats: 2,
        commitmentTermMonths: 12,
        realisableOn: '2026-07-01',
      },
      expected: {
        monthlyAmountMinor: '500000',
        amountAtPointMinor: '12000000',
        currency: 'VND',
        realisableOn: '2026-07-01',
        realisableAt: 'RENEWAL',
      },
    },
    {
      name: 'Standard K2 12-month past 01/06 deadline (Q-F) -> rolled to next cycle 2027-07-01 (RENEWAL)',
      input: {
        provisioningType: 'K2',
        price: price(500_000n, 'ANNUAL'),
        seats: 2,
        commitmentTermMonths: 12,
        realisableOn: '2027-07-01',
      },
      expected: {
        monthlyAmountMinor: '500000',
        amountAtPointMinor: '12000000',
        currency: 'VND',
        realisableOn: '2027-07-01',
        realisableAt: 'RENEWAL',
      },
    },
    {
      name: 'Figma K2 1-month monthly before determination point (10/02) -> x1 at 2026-03-01 (NEXT_BILLING)',
      input: {
        provisioningType: 'K2',
        price: price(500_000n, 'MONTHLY'),
        seats: 1,
        commitmentTermMonths: 1,
        realisableOn: '2026-03-01',
      },
      expected: {
        monthlyAmountMinor: '500000',
        amountAtPointMinor: '500000',
        currency: 'VND',
        realisableOn: '2026-03-01',
        realisableAt: 'NEXT_BILLING',
      },
    },
    {
      name: 'Figma K2 1-month between determination and B1-R3 deadline (16/02) -> x1 at 2026-03-01 (NEXT_BILLING)',
      input: {
        provisioningType: 'K2',
        price: price(500_000n, 'MONTHLY'),
        seats: 1,
        commitmentTermMonths: 1,
        realisableOn: '2026-03-01',
      },
      expected: {
        monthlyAmountMinor: '500000',
        amountAtPointMinor: '500000',
        currency: 'VND',
        realisableOn: '2026-03-01',
        realisableAt: 'NEXT_BILLING',
      },
    },
    {
      name: 'Claude K2 12-month commitment paid monthly -> still x12 at renewal (RENEWAL)',
      input: {
        provisioningType: 'K2',
        price: price(500_000n, 'MONTHLY'),
        seats: 1,
        commitmentTermMonths: 12,
        realisableOn: '2026-07-01',
      },
      expected: {
        monthlyAmountMinor: '500000',
        amountAtPointMinor: '6000000',
        currency: 'VND',
        realisableOn: '2026-07-01',
        realisableAt: 'RENEWAL',
      },
    },
    {
      name: 'K1 stays UNKNOWN in B1 with 1 month amountAtPoint',
      input: {
        provisioningType: 'K1',
        price: price(15n, 'QUARTERLY'),
      },
      expected: {
        monthlyAmountMinor: '15',
        amountAtPointMinor: '15',
        currency: 'VND',
        realisableOn: null,
        realisableAt: 'UNKNOWN',
      },
    },
    {
      name: 'K4 can never be had (NEVER)',
      input: {
        provisioningType: 'K4',
        price: price(15n, 'MONTHLY'),
      },
      expected: {
        monthlyAmountMinor: null,
        amountAtPointMinor: null,
        currency: null,
        realisableOn: null,
        realisableAt: 'NEVER',
      },
    },
  ])('$name', ({ input, expected }) => {
    expect(potentialSavingOf(input)).toEqual(expected);
  });

  it('W3-02: reads pre-rounded monthlyPriceMinor directly without floor division', () => {
    expect(potentialSavingOf({ provisioningType: 'K2', price: price(83_334n, 'ANNUAL') })).toMatchObject({
      monthlyAmountMinor: '83334',
      amountAtPointMinor: '1000008',
      realisableAt: 'RENEWAL',
    });
    expect(potentialSavingOf({ provisioningType: 'K2', price: price(83_333n, 'ANNUAL') })).toMatchObject({
      monthlyAmountMinor: '83333',
      amountAtPointMinor: '999996',
      realisableAt: 'RENEWAL',
    });
  });

  it('returns null when plan has no price, null monthlyPriceMinor, or OTHER cycle', () => {
    expect(potentialSavingOf({ provisioningType: 'K2', price: null })).toBeNull();
    expect(potentialSavingOf({ provisioningType: 'K2', price: price(null, 'ANNUAL') })).toBeNull();
    expect(potentialSavingOf({ provisioningType: 'K2', price: price(15n, 'OTHER') })).toBeNull();
  });
});
