import type { RenewalPeriodFacts } from '../../../catalog/public/subscription-period.types';
import { checkProposable, checkProposedQuantity, milestoneOf } from './renewal-proposal.policy';

const period = (extra: Partial<RenewalPeriodFacts> = {}): RenewalPeriodFacts => ({
  subscriptionId: 'sub',
  planId: 'plan',
  planName: 'Organization',
  planPricingModel: 'PER_SEAT',
  applicationId: 'app',
  applicationName: 'Figma',
  applicationKind: 'SAAS',
  ownerDepartmentId: 'dep',
  kind: 'TERM',
  status: 'ACTIVE',
  purchasedQuantity: 100,
  unitPrice: { amountMinor: 12_000n, currency: 'USD' },
  billingCycle: 'ANNUAL',
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  renewalDate: '2027-01-01',
  autoRenew: true,
  allowsMidTermReduction: false,
  notice: { source: 'DECLARED', deadline: '2026-12-01', baseDate: '2026-12-01' },
  renewedFromId: null,
  renewedById: null,
  ...extra,
});

describe('whether a renewal can be proposed (US-11-05 AC-1, AC-15, QĐ-49c)', () => {
  it('is open for an active term with a milestone', () => {
    expect(checkProposable(period())).toBeNull();
    expect(milestoneOf(period())).toEqual({ basis: 'DECLARED', baseDate: '2026-12-01' });
    expect(milestoneOf(period({ notice: { source: 'BY_END_DATE', deadline: null, baseDate: '2026-12-31' } }))).toEqual({
      basis: 'BY_END_DATE',
      baseDate: '2026-12-31',
    });
  });

  it('is closed for a perpetual purchase, internal software, a draft or a period already continued', () => {
    expect(checkProposable(period({ kind: 'PERPETUAL' }))).toBe('NOT_RENEWABLE');
    expect(checkProposable(period({ applicationKind: 'INTERNAL' }))).toBe('NOT_RENEWABLE');
    expect(checkProposable(period({ status: 'DRAFT' }))).toBe('NOT_RENEWABLE');
    expect(checkProposable(period({ renewedById: 'next' }))).toBe('NOT_RENEWABLE');
  });

  it('waits for the contract data when there is no milestone, never guessing one (AC-1)', () => {
    expect(checkProposable(period({ notice: { source: 'MISSING', deadline: null, baseDate: null } }))).toBe(
      'CONTRACT_DATA_INCOMPLETE',
    );
  });

  it('lets a proposed reduction name fewer seats than bought and the others none', () => {
    expect(checkProposedQuantity('REDUCE', 88, 100)).toBeNull();
    expect(checkProposedQuantity('REDUCE', 100, 100)).toBe('QUANTITY_INVALID');
    expect(checkProposedQuantity('REDUCE', null, 100)).toBe('QUANTITY_INVALID');
    expect(checkProposedQuantity('CANCEL', null, 100)).toBeNull();
    expect(checkProposedQuantity('RENEW', 100, 100)).toBe('QUANTITY_INVALID');
  });
});
