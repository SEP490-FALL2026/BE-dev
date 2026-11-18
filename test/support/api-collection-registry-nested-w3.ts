import type { NestedArrayEntry } from './api-collection-registry';

const BLOCK_REASONS = {
  classification: 'bounded',
  findings: [],
  owner: 'qd103-budget-check-three-outcomes',
  businessMaximum: {
    maxItems: 3,
    source:
      'BlockReason in budget-check.policy.ts has three values (PRICE_EXPIRED, NO_APPROVED_BUDGET, OVER_RESERVE), each at most once; the maxItems of the schema',
  },
  rationale: 'Every reason a request is blocked when the budget is checked (BR-MF1-06g), at most the three there are.',
  removeWhen: 'Review when a reason is added to BlockReason in budget-check.policy.ts.',
} as const;

/** The nested arrays of the answers changed by the package 3 (MF1-B) of `mf1-mf4-reaudit`: the reasons a request is blocked. */
export const NESTED_ARRAYS_W3: readonly NestedArrayEntry[] = [
  { key: 'accessRequestGet#request.spend.blockedReasons', ...BLOCK_REASONS },
  { key: 'budgetCheckGet#budgetCheck.blockedReasons', ...BLOCK_REASONS },
  { key: 'spendApprovalGet#spendApproval.budgetSnapshot.blockedReasons', ...BLOCK_REASONS },
  { key: 'spendQueueList#blockedReasons', ...BLOCK_REASONS },
];
