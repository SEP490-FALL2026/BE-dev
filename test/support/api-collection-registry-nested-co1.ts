import type { NestedArrayEntry } from './api-collection-registry';

const OWNER = 'c1-contract-list-and-fields';

/**
 * The nested arrays of the detail of a contract added by `CO-1.2` (`QĐ-111t`, `US-04-13` AC-11): a slice of what hangs on the contract. Each
 * holds at most CONTRACT_DETAIL_ARRAY_MAX (100) and the detail says with `truncated` when there are more, so none of them grows the answer.
 */
export const NESTED_ARRAYS_CO1: readonly NestedArrayEntry[] = [
  {
    key: 'contractGet#contract.subscriptions',
    rationale: 'The subscriptions of a shared stock (K2 or K4) that rest on the contract, the last linked first.',
  },
  {
    key: 'contractGet#contract.documents',
    rationale: 'The files attached to the contract that are ready, the last attached first.',
  },
  {
    key: 'contractGet#contract.applicationIds',
    rationale: 'The applications of the linked subscriptions, each once, which the reader asks the usage sources for.',
  },
].map(({ key, rationale }): NestedArrayEntry => ({
  key,
  classification: 'bounded',
  findings: [],
  owner: OWNER,
  businessMaximum: {
    maxItems: 100,
    source:
      'CONTRACT_DETAIL_ARRAY_MAX in contract-fields.policy.ts, the maxItems of the array in contract.dto.ts: the detail reads at most that many and the truncated flag says when the contract has more',
  },
  rationale,
  removeWhen:
    'Review when CONTRACT_DETAIL_ARRAY_MAX changes or the detail of a contract becomes a set of paged subresources.',
}));
