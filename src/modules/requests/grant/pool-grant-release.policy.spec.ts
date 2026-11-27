import type { GrantOutcomeFacts } from '../../licensing/public/licensing.types';
import {
  avoidedCostForPoolGrant,
  releasesAllOnPoolGrant,
  type PoolAvoidedCostInput,
} from './pool-grant-release.policy';

describe('BR-MF1-09: the commitment of a K4 request granted from the pool goes back in full (QĐ-106d, FR-5.8(2))', () => {
  const facts = (extra: Partial<GrantOutcomeFacts> = {}): GrantOutcomeFacts => ({
    taskId: 'task-1',
    fromPool: true,
    provisioningType: 'K4',
    grantedOn: '2026-11-10',
    assignmentId: 'a-1',
    effectiveFrom: '2026-11-10',
    expectedEndDate: null,
    ...extra,
  });

  it('releases everything when a K4 key was given from the pool', () => {
    expect(releasesAllOnPoolGrant('COMPLETED', facts())).toBe(true);
  });

  it('keeps the commitment of a K4 grant that bought its key, until the invoice', () => {
    expect(releasesAllOnPoolGrant('COMPLETED', facts({ fromPool: false }))).toBe(false);
  });

  it('is not the rule of a K2 seat from the pool, nor of K1 or K5', () => {
    expect(releasesAllOnPoolGrant('COMPLETED', facts({ provisioningType: 'K2' }))).toBe(false);
    expect(releasesAllOnPoolGrant('COMPLETED', facts({ provisioningType: 'K1', fromPool: false }))).toBe(false);
    expect(releasesAllOnPoolGrant('COMPLETED', facts({ provisioningType: 'K5', fromPool: false }))).toBe(false);
  });

  it('releases nothing for a failed grant here (its own rule does) or when the outcome carries no facts', () => {
    expect(releasesAllOnPoolGrant('FAILED', facts())).toBe(false);
    expect(releasesAllOnPoolGrant('COMPLETED', undefined)).toBe(false);
  });

  it('defers lot-backed K4 pool grants to license-lot settlement (W3-25 / F10)', () => {
    expect(releasesAllOnPoolGrant('COMPLETED', facts({ licenseLotId: 'lot-1' }))).toBe(false);
  });
});

describe('W3-09 (B1-R8, Q-G): per-person avoided cost for a pool grant', () => {
  it.each<{
    name: string;
    input: PoolAvoidedCostInput;
    expected: ReturnType<typeof avoidedCostForPoolGrant>;
  }>([
    {
      name: 'K2 single seat on 10/03 with 5.000.000 đ year commitment -> 5.000.000 đ (100%)',
      input: {
        provisioningType: 'K2',
        yearCommitment: { amountMinor: 5_000_000n, currency: 'VND' },
        commitmentSeatCount: 1,
        requestAmount: { amountMinor: 5_000_000n, currency: 'VND' },
        beneficiaryCount: 1,
      },
      expected: { amountMinor: 5_000_000n, currency: 'VND' },
    },
    {
      name: 'K2 delayed grant on 20/05 keeps full 5.000.000 đ year commitment without day proration',
      input: {
        provisioningType: 'K2',
        yearCommitment: { amountMinor: 5_000_000n, currency: 'VND' },
        commitmentSeatCount: 1,
        requestAmount: { amountMinor: 5_000_000n, currency: 'VND' },
        beneficiaryCount: 1,
      },
      expected: { amountMinor: 5_000_000n, currency: 'VND' },
    },
    {
      name: 'K2 group of 3 (15.000.000 đ year commitment) -> 5.000.000 đ per person',
      input: {
        provisioningType: 'K2',
        yearCommitment: { amountMinor: 15_000_000n, currency: 'VND' },
        commitmentSeatCount: 3,
        requestAmount: { amountMinor: 15_000_000n, currency: 'VND' },
        beneficiaryCount: 3,
      },
      expected: { amountMinor: 5_000_000n, currency: 'VND' },
    },
    {
      name: 'K2 uses roundHalfAway when 1.000.000 / 3 -> 333.333',
      input: {
        provisioningType: 'K2',
        yearCommitment: { amountMinor: 1_000_000n, currency: 'VND' },
        commitmentSeatCount: 3,
        requestAmount: null,
        beneficiaryCount: 3,
      },
      expected: { amountMinor: 333_333n, currency: 'VND' },
    },
    {
      name: 'K2 uses roundHalfAway when 2.000.000 / 3 -> 666.667 (kills floor mutant)',
      input: {
        provisioningType: 'K2',
        yearCommitment: { amountMinor: 2_000_000n, currency: 'VND' },
        commitmentSeatCount: 3,
        requestAmount: null,
        beneficiaryCount: 3,
      },
      expected: { amountMinor: 666_667n, currency: 'VND' },
    },
    {
      name: 'K2 exact half 5 / 2 rounds away from zero -> 3',
      input: {
        provisioningType: 'K2',
        yearCommitment: { amountMinor: 5n, currency: 'VND' },
        commitmentSeatCount: 2,
        requestAmount: null,
        beneficiaryCount: 2,
      },
      expected: { amountMinor: 3n, currency: 'VND' },
    },
    {
      name: 'K4 key taken from pool uses request.pricing.amount ÷ beneficiaryCount (2.000.000 / 1 -> 2.000.000)',
      input: {
        provisioningType: 'K4',
        yearCommitment: null,
        commitmentSeatCount: 1,
        requestAmount: { amountMinor: 2_000_000n, currency: 'VND' },
        beneficiaryCount: 1,
      },
      expected: { amountMinor: 2_000_000n, currency: 'VND' },
    },
    {
      name: 'K4 group rounds half away across beneficiaries (2.000.000 / 3 -> 666.667)',
      input: {
        provisioningType: 'K4',
        yearCommitment: null,
        commitmentSeatCount: 3,
        requestAmount: { amountMinor: 2_000_000n, currency: 'VND' },
        beneficiaryCount: 3,
      },
      expected: { amountMinor: 666_667n, currency: 'VND' },
    },
    {
      name: 'returns null when commitment is missing for K2, requestAmount missing for K4, or non-pool kind K1',
      input: {
        provisioningType: 'K2',
        yearCommitment: null,
        commitmentSeatCount: 1,
        requestAmount: { amountMinor: 1_000_000n, currency: 'VND' },
        beneficiaryCount: 1,
      },
      expected: null,
    },
    {
      name: 'returns null for non-pool provisioning type K1',
      input: {
        provisioningType: 'K1',
        yearCommitment: { amountMinor: 1_000_000n, currency: 'VND' },
        commitmentSeatCount: 1,
        requestAmount: { amountMinor: 1_000_000n, currency: 'VND' },
        beneficiaryCount: 1,
      },
      expected: null,
    },
  ])('$name', ({ input, expected }) => {
    expect(avoidedCostForPoolGrant(input)).toEqual(expected);
  });
});
