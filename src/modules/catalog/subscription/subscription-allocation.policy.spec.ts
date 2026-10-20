import { SubscriptionCostAllocationNotApplicableError } from './subscription.errors';
import { allocationApplicability, assertAllocatable } from './subscription-allocation.policy';

describe('allocationApplicability (QĐ-49g, QĐ-75b)', () => {
  it.each(['FLAT_RATE', 'CONCURRENT', 'CONSUMPTION', 'PER_HOST'] as const)(
    'takes an allocation for a %s plan: its cost does not follow the people who hold seats',
    (model) => {
      expect(allocationApplicability(model)).toBe('APPLICABLE');
    },
  );

  it('does not take one for a per-seat plan: its cost follows the people who hold the seats', () => {
    expect(allocationApplicability('PER_SEAT')).toBe('PER_SEAT');
  });

  it('does not take one while the pricing model is not declared: it may be per seat for all anyone knows', () => {
    expect(allocationApplicability(null)).toBe('PRICING_MODEL_UNDECLARED');
  });
});

describe('assertAllocatable', () => {
  it('lets an applicable plan through', () => {
    expect(() => assertAllocatable('FLAT_RATE')).not.toThrow();
  });

  it('refuses the others with the reason', () => {
    expect.assertions(4);
    for (const [model, reason] of [
      ['PER_SEAT', 'PER_SEAT'],
      [null, 'PRICING_MODEL_UNDECLARED'],
    ] as const) {
      try {
        assertAllocatable(model);
      } catch (error) {
        expect(error).toBeInstanceOf(SubscriptionCostAllocationNotApplicableError);
        expect((error as SubscriptionCostAllocationNotApplicableError).reason).toBe(reason);
      }
    }
  });
});
