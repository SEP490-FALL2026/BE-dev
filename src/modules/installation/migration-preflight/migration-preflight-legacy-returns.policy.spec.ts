import { judgeContractGates, withContractGates } from './migration-preflight-judgement.policy';
import { formatPreflight } from '../public/migration-preflight-report.mapper';
import type { ContractGateFacts, PreflightReport } from '../public/migration-preflight.types';

/**
 * The proposals `7c28e75` gave back because their first version was refused, as `ops:preflight` judges them: R1 and R2
 * are information (the migration `…_budget_lifecycle_structure` reconciles them), every other case is a blocker named by id, and nothing
 * is guessed. The same expressions as the first block of that migration; the facts are read only until it has run.
 */
const nothingElse: Omit<ContractGateFacts, 'legacyReturns'> = {
  subscriptionOwner: { schema: 'NO_TABLE', subscriptionIds: [] },
  costCenterDirection: {
    schema: 'NO_TABLE',
    organizationIds: [],
    costCenterIds: [],
    mismatches: [],
    notActivated: [],
  },
  retiredKinds: { pendingNoticeIds: [], pendingTransferIds: [], pendingMoveIds: [], serviceAccountIds: [] },
};
const returns = (legacyReturns: ContractGateFacts['legacyReturns']): ContractGateFacts => ({
  ...nothingElse,
  legacyReturns,
});
const candidate = (proposalId: string, traced = true) => ({
  proposalId,
  versionIds: [`${proposalId}-v`],
  decisionIds: [`${proposalId}-d`],
  traced,
});
const next = (proposalId: string, id: string, previousProposalId: string | null, submittedAfter = true) => ({
  proposalId,
  id,
  previousProposalId,
  submittedAfter,
});
const converged: PreflightReport = {
  status: 'READY',
  history: 'CONVERGED',
  blockers: [],
  corrections: [],
  companyCostCentersRemoved: [],
  information: [],
};

describe('judgeContractGates: the proposals given back because their first version was refused (F63, spec J.2)', () => {
  it('leaves alone a proposal Finance gave back: no refusal on its versions makes it no candidate', () => {
    expect(judgeContractGates(returns({ candidates: [], neighbours: [] }))).toEqual({ blockers: [], information: [] });
  });

  it('R1: nothing was sent after the return, so the proposal goes back to REVIEWED (information, ids and the rule only)', () => {
    expect(judgeContractGates(returns({ candidates: [candidate('p-1')], neighbours: [] }))).toEqual({
      blockers: [],
      information: [{ code: 'BUDGET_PROPOSAL_LEGACY_RETURN_RECONCILE', proposalId: 'p-1', rule: 'R1' }],
    });
  });

  it('R2: exactly one proposal sends it again and every proposal sent after the return is in the chain of that one', () => {
    const facts = returns({
      candidates: [candidate('p-1')],
      neighbours: [next('p-1', 'c-1', 'p-1'), next('p-1', 'c-2', 'c-1'), next('p-1', 'c-3', 'c-2')],
    });

    expect(judgeContractGates(facts)).toEqual({
      blockers: [],
      information: [{ code: 'BUDGET_PROPOSAL_LEGACY_RETURN_RECONCILE', proposalId: 'p-1', rule: 'R2' }],
    });
  });

  it('A: a proposal sent after the return that does not point back at it blocks, with every id it needs and nothing else', () => {
    expect(
      judgeContractGates(returns({ candidates: [candidate('p-1')], neighbours: [next('p-1', 'x-9', null)] })),
    ).toEqual({
      blockers: [
        {
          code: 'BUDGET_PROPOSAL_LEGACY_RETURN_AMBIGUOUS',
          proposalId: 'p-1',
          versionIds: ['p-1-v'],
          decisionIds: ['p-1-d'],
          relatedProposalIds: ['x-9'],
        },
      ],
      information: [],
    });
  });

  it('A: one chain and another proposal outside it, two proposals that send it again, or a resubmission that is not later', () => {
    const outside = returns({
      candidates: [candidate('p-1')],
      neighbours: [next('p-1', 'c-1', 'p-1'), next('p-1', 'x-9', null)],
    });
    const two = returns({
      candidates: [candidate('p-1')],
      neighbours: [next('p-1', 'c-1', 'p-1'), next('p-1', 'c-2', 'p-1')],
    });
    const notLater = returns({ candidates: [candidate('p-1')], neighbours: [next('p-1', 'c-1', 'p-1', false)] });

    for (const facts of [outside, two, notLater]) {
      expect(judgeContractGates(facts).blockers.map((blocker) => blocker.code)).toEqual([
        'BUDGET_PROPOSAL_LEGACY_RETURN_AMBIGUOUS',
      ]);
      expect(judgeContractGates(facts).information).toEqual([]);
    }
  });

  it('A: a refusal that does not match the return exactly (several, another decider, reason or moment, not the first version) is never guessed', () => {
    expect(judgeContractGates(returns({ candidates: [candidate('p-1', false)], neighbours: [] }))).toEqual({
      blockers: [
        {
          code: 'BUDGET_PROPOSAL_LEGACY_RETURN_AMBIGUOUS',
          proposalId: 'p-1',
          versionIds: ['p-1-v'],
          decisionIds: ['p-1-d'],
          relatedProposalIds: [],
        },
      ],
      information: [],
    });
  });

  it('blocks the deploy and prints the decision, ids only, beside the information of the cases it can reconcile', () => {
    const judged = judgeContractGates(
      returns({ candidates: [candidate('p-1'), candidate('p-2', false)], neighbours: [] }),
    );
    const text = formatPreflight(withContractGates(converged, judged));

    expect(text).toContain('BUDGET_PROPOSAL_LEGACY_RETURN_AMBIGUOUS');
    expect(text).toContain('budget proposal p-2 (versions p-2-v; decisions p-2-d; related none)');
    expect(text).toContain('BUDGET_PROPOSAL_LEGACY_RETURN_RECONCILE');
    expect(text).toContain('budget proposal p-1 (R1)');
  });
});
