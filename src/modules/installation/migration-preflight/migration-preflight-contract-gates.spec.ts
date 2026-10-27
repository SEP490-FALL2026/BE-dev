import { judgeContractGates, withContractGates } from './migration-preflight-judgement';
import { formatPreflight } from './migration-preflight-report';
import type { ContractGateFacts, PreflightReport } from './migration-preflight.types';

/**
 * The contract gates of `g0-g6-final-business-baseline-remediation`: what the release after this one needs from the data
 * before its migrations may run, judged beside the unit-only conversion. First gate (Task 1.2a, F02): every existing
 * subscription needs an owner department, recorded by an operator on a stated basis (`P03-D03`, spec L.3). Second gate
 * (Task 1.1a, F01): every Cost Center belongs to one department, linked by `ops:cost-center-direction` on a basis Finance
 * approved, and the operator has activated the link (`QĐ-87d(1)`, spec L.11).
 */
const noReturns: ContractGateFacts['legacyReturns'] = { candidates: [], neighbours: [] };
const gates = (overrides: Partial<ContractGateFacts['subscriptionOwner']> = {}): ContractGateFacts => ({
  subscriptionOwner: { schema: 'READY', subscriptionIds: [], ...overrides },
  costCenterDirection: { schema: 'NO_TABLE', costCenterIds: [], mismatches: [], notActivated: [] },
  retiredKinds: { pendingNoticeIds: [], pendingTransferIds: [], pendingMoveIds: [] },
  legacyReturns: noReturns,
});
const direction = (overrides: Partial<ContractGateFacts['costCenterDirection']> = {}): ContractGateFacts => ({
  subscriptionOwner: { schema: 'NO_TABLE', subscriptionIds: [] },
  costCenterDirection: { schema: 'READY', costCenterIds: [], mismatches: [], notActivated: [], ...overrides },
  retiredKinds: { pendingNoticeIds: [], pendingTransferIds: [], pendingMoveIds: [] },
  legacyReturns: noReturns,
});
const retired = (overrides: Partial<ContractGateFacts['retiredKinds']> = {}): ContractGateFacts => ({
  subscriptionOwner: { schema: 'NO_TABLE', subscriptionIds: [] },
  costCenterDirection: { schema: 'NO_TABLE', costCenterIds: [], mismatches: [], notActivated: [] },
  retiredKinds: { pendingNoticeIds: [], pendingTransferIds: [], pendingMoveIds: [], ...overrides },
  legacyReturns: noReturns,
});
const returns = (legacyReturns: ContractGateFacts['legacyReturns']): ContractGateFacts => ({
  ...gates(),
  subscriptionOwner: { schema: 'NO_TABLE', subscriptionIds: [] },
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

describe('judgeContractGates: the owner department of a subscription (F02, spec L.3)', () => {
  it('before the expansion migration: every subscription is a row to assign later, and nothing blocks the deploy', () => {
    expect(judgeContractGates(gates({ schema: 'ABSENT', subscriptionIds: ['s-2', 's-1'] }))).toEqual({
      blockers: [],
      information: [
        { code: 'SUBSCRIPTION_OWNER_TO_ASSIGN', subscriptionId: 's-1' },
        { code: 'SUBSCRIPTION_OWNER_TO_ASSIGN', subscriptionId: 's-2' },
      ],
    });
  });

  it('after it: each subscription with no valid assignment, or in conflict with one, blocks by its id, in order', () => {
    expect(judgeContractGates(gates({ schema: 'READY', subscriptionIds: ['s-9', 's-3'] }))).toEqual({
      blockers: [
        { code: 'SUBSCRIPTION_OWNER_UNASSIGNED', subscriptionId: 's-3' },
        { code: 'SUBSCRIPTION_OWNER_UNASSIGNED', subscriptionId: 's-9' },
      ],
      information: [],
    });
  });

  it('after it, with every subscription owned or assigned: nothing to report', () => {
    expect(judgeContractGates(gates({ schema: 'READY', subscriptionIds: [] }))).toEqual({
      blockers: [],
      information: [],
    });
  });

  it('with the column or the table but not both: blocks, because the history cannot be trusted either way', () => {
    expect(judgeContractGates(gates({ schema: 'PARTIAL' }))).toEqual({
      blockers: [{ code: 'SUBSCRIPTION_OWNER_SCHEMA_PARTIAL' }],
      information: [],
    });
  });

  it('with no subscriptions table (an empty database): nothing to report', () => {
    expect(judgeContractGates(gates({ schema: 'NO_TABLE' }))).toEqual({ blockers: [], information: [] });
  });
});

describe('judgeContractGates: every Cost Center belongs to one department (F01, spec L.11)', () => {
  it('before the compatibility migration: every Cost Center no department names is a row to link later, and nothing blocks', () => {
    expect(judgeContractGates(direction({ schema: 'ABSENT', costCenterIds: ['c-2', 'c-1'] }))).toEqual({
      blockers: [],
      information: [
        { code: 'COST_CENTER_TO_LINK', costCenterId: 'c-1' },
        { code: 'COST_CENTER_TO_LINK', costCenterId: 'c-2' },
      ],
    });
  });

  it('after it: each Cost Center with no department blocks by its id, whoever created it, in order', () => {
    expect(judgeContractGates(direction({ costCenterIds: ['c-9', 'c-3'] }))).toEqual({
      blockers: [
        { code: 'COST_CENTER_UNLINKED', costCenterId: 'c-3' },
        { code: 'COST_CENTER_UNLINKED', costCenterId: 'c-9' },
      ],
      information: [],
    });
  });

  it('after it: a department whose old Cost Center belongs to another department blocks with both ids (the sync triggers should prevent it)', () => {
    expect(
      judgeContractGates(direction({ mismatches: [{ costCenterId: 'c-1', departmentId: 'd-2' }] })).blockers,
    ).toEqual([{ code: 'COST_CENTER_LINK_MISMATCH', costCenterId: 'c-1', departmentId: 'd-2' }]);
  });

  it('after it: an organization whose link is not activated is information here (it blocks only in the final release)', () => {
    expect(judgeContractGates(direction({ notActivated: ['o-1'] }))).toEqual({
      blockers: [],
      information: [{ code: 'COST_CENTER_DIRECTION_NOT_ACTIVATED', organizationId: 'o-1' }],
    });
  });

  it('with only some of the objects of the compatibility migration: blocks, because the history cannot be trusted either way', () => {
    expect(judgeContractGates(direction({ schema: 'PARTIAL' }))).toEqual({
      blockers: [{ code: 'COST_CENTER_DIRECTION_SCHEMA_PARTIAL' }],
      information: [],
    });
  });

  it('with no Cost Centers table (an empty database), or everything linked and activated: nothing to report', () => {
    expect(judgeContractGates(direction({ schema: 'NO_TABLE' }))).toEqual({ blockers: [], information: [] });
    expect(judgeContractGates(direction())).toEqual({ blockers: [], information: [] });
  });

  it('is blocked through partial linking until the last Cost Center is linked, then ready', () => {
    const open = withContractGates(converged, judgeContractGates(direction({ costCenterIds: ['c-1', 'c-2'] })));
    const partial = withContractGates(converged, judgeContractGates(direction({ costCenterIds: ['c-2'] })));
    const done = withContractGates(converged, judgeContractGates(direction()));

    expect([open.status, partial.status, done.status]).toEqual(['BLOCKED', 'BLOCKED', 'READY']);
  });
});

describe('judgeContractGates: the kinds that are gone (F41, F06, spec L.4, L.5)', () => {
  it('blocks a notice of a change of job title, a transfer of the title only and a service account move that still wait, by id and in order', () => {
    expect(
      judgeContractGates(
        retired({ pendingNoticeIds: ['n-2', 'n-1'], pendingTransferIds: ['t-9'], pendingMoveIds: ['m-3', 'm-1'] }),
      ),
    ).toEqual({
      blockers: [
        { code: 'PERSONNEL_NOTICE_RETIRED_KIND_PENDING', noticeId: 'n-1' },
        { code: 'PERSONNEL_NOTICE_RETIRED_KIND_PENDING', noticeId: 'n-2' },
        { code: 'DEPARTMENT_TRANSFER_TITLE_ONLY_PENDING', transferId: 't-9' },
        { code: 'SERVICE_ACCOUNT_MOVE_PENDING', moveId: 'm-1' },
        { code: 'SERVICE_ACCOUNT_MOVE_PENDING', moveId: 'm-3' },
      ],
      information: [],
    });
  });

  it('has nothing to say when none waits, in any schema', () => {
    expect(judgeContractGates(retired())).toEqual({ blockers: [], information: [] });
  });

  it('blocks a ready report, and is ready again once the IT Admin has rejected and cancelled them', () => {
    const open = withContractGates(converged, judgeContractGates(retired({ pendingNoticeIds: ['n-1'] })));
    const done = withContractGates(converged, judgeContractGates(retired()));

    expect([open.status, done.status]).toEqual(['BLOCKED', 'READY']);
  });

  it('says in the text which fixed reason closes each row, ids only', () => {
    const text = formatPreflight({
      ...converged,
      status: 'BLOCKED',
      blockers: [
        { code: 'PERSONNEL_NOTICE_RETIRED_KIND_PENDING', noticeId: 'n-1' },
        { code: 'DEPARTMENT_TRANSFER_TITLE_ONLY_PENDING', transferId: 't-9' },
        { code: 'SERVICE_ACCOUNT_MOVE_PENDING', moveId: 'm-4' },
      ],
    });

    expect(text).toContain('service account move m-4');
    expect(text).toContain('Chuyển phòng tài khoản dịch vụ đã bỏ (QĐ-89c)');
    expect(text).toContain('notice n-1');
    expect(text).toContain('Loại BM-09 đã bỏ (QĐ-87e, D-1)');
    expect(text).toContain('transfer t-9');
    expect(text).toContain('Điều chuyển chỉ đổi chức vụ đã bỏ (QĐ-87e, D-1)');
  });
});

describe('withContractGates', () => {
  it('keeps a ready report ready and adds the rows to assign as information', () => {
    const report = withContractGates(
      converged,
      judgeContractGates(gates({ schema: 'ABSENT', subscriptionIds: ['s-1'] })),
    );

    expect(report.status).toBe('READY');
    expect(report.information).toEqual([{ code: 'SUBSCRIPTION_OWNER_TO_ASSIGN', subscriptionId: 's-1' }]);
  });

  it('turns a ready report into BLOCKED when a gate blocks, and keeps what the conversion found', () => {
    const withCorrection: PreflightReport = {
      ...converged,
      corrections: [{ assignmentId: 'a-1', recordedOn: '2026-10-12', fromDepartment: 'OPS', toDepartment: 'ENG' }],
    };

    const report = withContractGates(
      withCorrection,
      judgeContractGates(gates({ schema: 'READY', subscriptionIds: ['s-1'] })),
    );

    expect(report.status).toBe('BLOCKED');
    expect(report.blockers).toEqual([{ code: 'SUBSCRIPTION_OWNER_UNASSIGNED', subscriptionId: 's-1' }]);
    expect(report.corrections).toEqual(withCorrection.corrections);
  });

  it('sorts the blockers of the conversion and of the gates together by code, then by row', () => {
    const report = withContractGates(
      {
        ...converged,
        status: 'BLOCKED',
        blockers: [{ code: 'DEPARTMENT_CHARGED_TO_COMPANY', department: 'HQ', costCenter: 'CC-CORP' }],
      },
      judgeContractGates(gates({ schema: 'READY', subscriptionIds: ['s-1'] })),
    );

    expect(report.blockers.map((blocker) => blocker.code)).toEqual([
      'DEPARTMENT_CHARGED_TO_COMPANY',
      'SUBSCRIPTION_OWNER_UNASSIGNED',
    ]);
  });
});

describe('the text of the Cost Center gates (F01)', () => {
  it('lists the Cost Centers to link and the organizations to activate, and says how, without blocking', () => {
    const text = formatPreflight({
      ...converged,
      information: [
        { code: 'COST_CENTER_TO_LINK', costCenterId: 'c-1' },
        { code: 'COST_CENTER_DIRECTION_NOT_ACTIVATED', organizationId: 'o-1' },
      ],
    });

    expect(text).toMatch(/^Preflight: READY/);
    expect(text).toContain('COST_CENTER_TO_LINK');
    expect(text).toContain('c-1');
    expect(text).toContain('COST_CENTER_DIRECTION_NOT_ACTIVATED');
    expect(text).toContain('o-1');
    expect(text).toContain('ops:cost-center-direction');
  });

  it('names each blocked Cost Center by its id and the procedure that resolves it, with no inferred department', () => {
    const text = formatPreflight({
      ...converged,
      status: 'BLOCKED',
      blockers: [
        { code: 'COST_CENTER_UNLINKED', costCenterId: 'c-7' },
        { code: 'COST_CENTER_LINK_MISMATCH', costCenterId: 'c-8', departmentId: 'd-8' },
        { code: 'COST_CENTER_DIRECTION_SCHEMA_PARTIAL' },
      ],
    });

    expect(text).toContain('COST_CENTER_UNLINKED');
    expect(text).toContain('c-7');
    expect(text).toContain('ops:cost-center-direction link');
    expect(text).toContain('COST_CENTER_LINK_MISMATCH');
    expect(text).toContain('d-8');
    expect(text).toContain('COST_CENTER_DIRECTION_SCHEMA_PARTIAL');
  });
});

describe('the text of the contract gates', () => {
  it('lists the subscriptions that will need an owner department and says how they are assigned, without blocking', () => {
    const text = formatPreflight({
      ...converged,
      information: [{ code: 'SUBSCRIPTION_OWNER_TO_ASSIGN', subscriptionId: 's-1' }],
    });

    expect(text).toMatch(/^Preflight: READY/);
    expect(text).toContain('SUBSCRIPTION_OWNER_TO_ASSIGN');
    expect(text).toContain('s-1');
    expect(text).toContain('ops:assign-subscription-owner');
  });

  it('names every unassigned subscription by its id and what the operator has to do', () => {
    const text = formatPreflight({
      ...converged,
      status: 'BLOCKED',
      blockers: [
        { code: 'SUBSCRIPTION_OWNER_UNASSIGNED', subscriptionId: 's-7' },
        { code: 'SUBSCRIPTION_OWNER_SCHEMA_PARTIAL' },
      ],
    });

    expect(text).toMatch(/do not run `prisma migrate deploy`/i);
    expect(text).toContain('SUBSCRIPTION_OWNER_UNASSIGNED');
    expect(text).toContain('s-7');
    expect(text).toContain('ops:assign-subscription-owner');
    expect(text).toContain('SUBSCRIPTION_OWNER_SCHEMA_PARTIAL');
  });
});

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
