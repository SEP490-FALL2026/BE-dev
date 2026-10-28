import { judgeContractGates, withContractGates } from './migration-preflight-judgement';
import { formatPreflight } from './migration-preflight-report';
import type { ContractGateFacts, PreflightReport } from './migration-preflight.types';

/**
 * The contract gates of `g0-g6-final-business-baseline-remediation`, as the FINAL release judges them (spec L.3, L.10, L.11):
 * what its migrations need from the data, judged beside the unit-only conversion. A database that skipped the expansion of the
 * compatibility release, a subscription with no owner department, a Cost Center with no department or an organization whose
 * link was not activated, and a waiting row of a kind that is gone, each block; only the proposals the migration can reconcile
 * are information. An empty database and a fully migrated one are ready, with nothing listed.
 */
const noReturns: ContractGateFacts['legacyReturns'] = { candidates: [], neighbours: [] };
const noDirection: ContractGateFacts['costCenterDirection'] = {
  schema: 'NO_TABLE',
  organizationIds: [],
  costCenterIds: [],
  mismatches: [],
  notActivated: [],
};
const gates = (overrides: Partial<ContractGateFacts['subscriptionOwner']> = {}): ContractGateFacts => ({
  subscriptionOwner: { schema: 'READY', subscriptionIds: [], ...overrides },
  costCenterDirection: noDirection,
  retiredKinds: { pendingNoticeIds: [], pendingTransferIds: [], pendingMoveIds: [] },
  legacyReturns: noReturns,
});
const direction = (overrides: Partial<ContractGateFacts['costCenterDirection']> = {}): ContractGateFacts => ({
  subscriptionOwner: { schema: 'NO_TABLE', subscriptionIds: [] },
  costCenterDirection: { ...noDirection, schema: 'READY', ...overrides },
  retiredKinds: { pendingNoticeIds: [], pendingTransferIds: [], pendingMoveIds: [] },
  legacyReturns: noReturns,
});
const retired = (overrides: Partial<ContractGateFacts['retiredKinds']> = {}): ContractGateFacts => ({
  subscriptionOwner: { schema: 'NO_TABLE', subscriptionIds: [] },
  costCenterDirection: noDirection,
  retiredKinds: { pendingNoticeIds: [], pendingTransferIds: [], pendingMoveIds: [], ...overrides },
  legacyReturns: noReturns,
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
  it('before the expansion migration: each subscription blocks by its id, in order, and nothing is only information', () => {
    expect(judgeContractGates(gates({ schema: 'ABSENT', subscriptionIds: ['s-2', 's-1'] }))).toEqual({
      blockers: [
        { code: 'SUBSCRIPTION_OWNER_EXPANSION_REQUIRED', subscriptionId: 's-1' },
        { code: 'SUBSCRIPTION_OWNER_EXPANSION_REQUIRED', subscriptionId: 's-2' },
      ],
      information: [],
    });
  });

  it('before the expansion migration, with no subscription (an empty or new database): nothing to report', () => {
    expect(judgeContractGates(gates({ schema: 'ABSENT', subscriptionIds: [] }))).toEqual({
      blockers: [],
      information: [],
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

  it('after it, with every subscription owned or assigned, or once the final migration made the column required: nothing to report', () => {
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
  it('before the compatibility migration: each organization blocks by its id, in order (the release skipped the expansion)', () => {
    expect(judgeContractGates(direction({ schema: 'ABSENT', organizationIds: ['o-2', 'o-1'] }))).toEqual({
      blockers: [
        { code: 'COST_CENTER_DIRECTION_EXPANSION_REQUIRED', organizationId: 'o-1' },
        { code: 'COST_CENTER_DIRECTION_EXPANSION_REQUIRED', organizationId: 'o-2' },
      ],
      information: [],
    });
  });

  it('before the compatibility migration, with no organization (an empty or new database): nothing to report', () => {
    expect(judgeContractGates(direction({ schema: 'ABSENT', organizationIds: [] }))).toEqual({
      blockers: [],
      information: [],
    });
  });

  it('on the compatibility schema: each Cost Center with no department blocks by its id, whoever created it, in order', () => {
    expect(judgeContractGates(direction({ costCenterIds: ['c-9', 'c-3'] }))).toEqual({
      blockers: [
        { code: 'COST_CENTER_UNLINKED', costCenterId: 'c-3' },
        { code: 'COST_CENTER_UNLINKED', costCenterId: 'c-9' },
      ],
      information: [],
    });
  });

  it('on the compatibility schema: a department whose old Cost Center belongs to another department blocks with both ids (the sync triggers should prevent it)', () => {
    expect(
      judgeContractGates(direction({ mismatches: [{ costCenterId: 'c-1', departmentId: 'd-2' }] })).blockers,
    ).toEqual([{ code: 'COST_CENTER_LINK_MISMATCH', costCenterId: 'c-1', departmentId: 'd-2' }]);
  });

  it('on the compatibility schema: an organization whose link is not activated BLOCKS (it was information in the compatibility release)', () => {
    expect(judgeContractGates(direction({ notActivated: ['o-2', 'o-1'] }))).toEqual({
      blockers: [
        { code: 'COST_CENTER_DIRECTION_NOT_ACTIVATED', organizationId: 'o-1' },
        { code: 'COST_CENTER_DIRECTION_NOT_ACTIVATED', organizationId: 'o-2' },
      ],
      information: [],
    });
  });

  it('with only some of the objects of the compatibility migration: blocks, because the history cannot be trusted either way', () => {
    expect(judgeContractGates(direction({ schema: 'PARTIAL' }))).toEqual({
      blockers: [{ code: 'COST_CENTER_DIRECTION_SCHEMA_PARTIAL' }],
      information: [],
    });
  });

  it('with no Cost Centers table (an empty database), or on the final schema where the repository reads nothing open: nothing to report', () => {
    expect(judgeContractGates(direction({ schema: 'NO_TABLE' }))).toEqual({ blockers: [], information: [] });
    expect(judgeContractGates(direction())).toEqual({ blockers: [], information: [] });
  });

  it('is blocked through partial linking until the last Cost Center is linked and the link activated, then ready', () => {
    const open = withContractGates(converged, judgeContractGates(direction({ costCenterIds: ['c-1', 'c-2'] })));
    const partial = withContractGates(converged, judgeContractGates(direction({ costCenterIds: ['c-2'] })));
    const linked = withContractGates(converged, judgeContractGates(direction({ notActivated: ['o-1'] })));
    const done = withContractGates(converged, judgeContractGates(direction()));

    expect([open.status, partial.status, linked.status, done.status]).toEqual([
      'BLOCKED',
      'BLOCKED',
      'BLOCKED',
      'READY',
    ]);
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

  it('has nothing to say when none waits, in any schema (the tables and the rows are gone after the destructive migrations)', () => {
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
  it('keeps a ready report ready when no gate blocks, whatever the database holds on the final schema', () => {
    const report = withContractGates(
      converged,
      judgeContractGates({
        subscriptionOwner: { schema: 'READY', subscriptionIds: [] },
        costCenterDirection: { ...noDirection, schema: 'READY' },
        retiredKinds: { pendingNoticeIds: [], pendingTransferIds: [], pendingMoveIds: [] },
        legacyReturns: noReturns,
      }),
    );

    expect(report).toEqual(converged);
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
      judgeContractGates({
        ...gates({ schema: 'ABSENT', subscriptionIds: ['s-1'] }),
        costCenterDirection: { ...noDirection, schema: 'ABSENT', organizationIds: ['o-1'] },
      }),
    );

    expect(report.blockers.map((blocker) => blocker.code)).toEqual([
      'COST_CENTER_DIRECTION_EXPANSION_REQUIRED',
      'DEPARTMENT_CHARGED_TO_COMPANY',
      'SUBSCRIPTION_OWNER_EXPANSION_REQUIRED',
    ]);
  });

  it('is blocked for an installed database that skipped the compatibility release, and ready for an empty one', () => {
    const skipped = withContractGates(
      converged,
      judgeContractGates({
        ...gates({ schema: 'ABSENT', subscriptionIds: ['s-1'] }),
        costCenterDirection: { ...noDirection, schema: 'ABSENT', organizationIds: ['o-1'] },
      }),
    );
    const empty = withContractGates(
      converged,
      judgeContractGates({
        ...gates({ schema: 'NO_TABLE' }),
        costCenterDirection: { ...noDirection, schema: 'NO_TABLE' },
      }),
    );

    expect([skipped.status, empty.status]).toEqual(['BLOCKED', 'READY']);
    expect(empty.information).toEqual([]);
  });
});

describe('the text of the Cost Center gates (F01)', () => {
  it('names each organization of a database that skipped the compatibility release by its id, and says what to deploy and run first', () => {
    const text = formatPreflight({
      ...converged,
      status: 'BLOCKED',
      blockers: [{ code: 'COST_CENTER_DIRECTION_EXPANSION_REQUIRED', organizationId: 'o-1' }],
    });

    expect(text).toMatch(/do not run `prisma migrate deploy`/i);
    expect(text).toContain('COST_CENTER_DIRECTION_EXPANSION_REQUIRED');
    expect(text).toContain('organization o-1');
    expect(text).toContain('compatibility release');
    expect(text).toContain('ops:cost-center-direction activate');
    expect(text).toContain('ops:cost-center-direction link');
  });

  it('names an organization whose link is not activated as a blocked row, with the activation command and no inferred evidence', () => {
    const text = formatPreflight({
      ...converged,
      status: 'BLOCKED',
      blockers: [{ code: 'COST_CENTER_DIRECTION_NOT_ACTIVATED', organizationId: 'o-1' }],
    });

    expect(text).toMatch(/do not run `prisma migrate deploy`/i);
    expect(text).toContain('COST_CENTER_DIRECTION_NOT_ACTIVATED');
    expect(text).toContain('organization o-1');
    expect(text).toContain('ops:cost-center-direction activate');
    expect(text).toContain('releases/current-image');
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

describe('the text of the subscription owner gate (F02)', () => {
  it('names each subscription of a database that skipped the expansion by its id, and says to deploy the compatibility release and assign first', () => {
    const text = formatPreflight({
      ...converged,
      status: 'BLOCKED',
      blockers: [{ code: 'SUBSCRIPTION_OWNER_EXPANSION_REQUIRED', subscriptionId: 's-1' }],
    });

    expect(text).toMatch(/do not run `prisma migrate deploy`/i);
    expect(text).toContain('SUBSCRIPTION_OWNER_EXPANSION_REQUIRED');
    expect(text).toContain('subscription s-1');
    expect(text).toContain('compatibility release');
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

  it('lists nothing as information for a ready database: the only information left is the proposals the migration reconciles', () => {
    expect(formatPreflight(converged)).not.toMatch(/SUBSCRIPTION_OWNER|COST_CENTER/);
  });
});
