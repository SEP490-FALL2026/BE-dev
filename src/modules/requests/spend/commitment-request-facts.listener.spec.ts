import type { CatalogApi } from '../../catalog/public/catalog.api';
import { CommitmentRequestFactsHook } from '../../budgets/public/budgets.extension-points';
import { RequestCommitmentFacts } from './commitment-request-facts.listener';
import type { CommitmentRequestRow, SpendRequestRepo } from './spend-request.repo';
import type { SpendWireViewService } from './spend-wire-view.service';

const APPROVED_AT = new Date('2026-11-01T03:00:00.000Z');

const row = (id: string, planId: string | null, requester = 'emp-1'): CommitmentRequestRow => ({
  id,
  planId,
  proposedSoftwareName: null,
  assessedVendorId: null,
  requesterEmployeeId: requester,
  beneficiaryCount: 3,
  spendApprovedAt: APPROVED_AT,
});

function build(rows: CommitmentRequestRow[]) {
  const commitmentFactsOf = jest.fn().mockResolvedValue(rows);
  const getPlanSummaries = jest.fn().mockResolvedValue([
    { planId: 'plan-1', planName: 'Team', applicationId: 'app-1', applicationName: 'Figma' },
    { planId: 'plan-2', planName: 'Pro', applicationId: 'app-2', applicationName: 'Notion' },
  ]);
  const getPlanVendorIds = jest.fn().mockResolvedValue(
    new Map<string, string | null>([
      ['plan-1', 'vendor-1'],
      ['plan-2', null],
    ]),
  );
  const people = jest
    .fn()
    .mockResolvedValue(new Map([['emp-1', { employeeId: 'emp-1', employeeCode: 'NV-1', fullName: 'An Nguyen' }]]));
  const hook = new CommitmentRequestFactsHook();
  const facts = new RequestCommitmentFacts(
    { commitmentFactsOf } as unknown as SpendRequestRepo,
    { getPlanSummaries, getPlanVendorIds } as unknown as CatalogApi,
    { people } as unknown as SpendWireViewService,
    hook,
  );

  return { facts, hook, commitmentFactsOf, getPlanSummaries, getPlanVendorIds, people };
}

describe('RequestCommitmentFacts', () => {
  it('binds itself to the hook of the budgets when the module starts', () => {
    const { facts, hook } = build([]);

    expect(hook.isBound()).toBe(false);
    facts.onModuleInit();

    expect(hook.get()).toBe(facts);
  });

  it('shows each request with its software, plan, requester, number of people, approval time and vendor', async () => {
    const { facts } = build([row('req-1', 'plan-1'), row('req-2', 'plan-2')]);

    const found = await facts.factsOf(['req-1', 'req-2']);

    expect(found.get('req-1')).toEqual({
      id: 'req-1',
      software: { name: 'Figma' },
      plan: { name: 'Team' },
      requester: { employeeCode: 'NV-1', fullName: 'An Nguyen' },
      beneficiaryCount: 3,
      spendApprovedAt: APPROVED_AT,
      vendorId: 'vendor-1',
    });
    // Internal software has no vendor.
    expect(found.get('req-2')?.vendorId).toBeNull();
  });

  it('reads the whole page at once: one read of each kind, whatever the number of requests', async () => {
    const rows = Array.from({ length: 50 }, (_, index) => row(`req-${index}`, index % 2 === 0 ? 'plan-1' : 'plan-2'));
    const { facts, commitmentFactsOf, getPlanSummaries, getPlanVendorIds, people } = build(rows);

    const found = await facts.factsOf(rows.map((item) => item.id));

    expect(found.size).toBe(50);
    expect(commitmentFactsOf).toHaveBeenCalledTimes(1);
    expect(getPlanSummaries).toHaveBeenCalledTimes(1);
    expect(getPlanSummaries).toHaveBeenCalledWith(['plan-1', 'plan-2']);
    expect(getPlanVendorIds).toHaveBeenCalledTimes(1);
    expect(people).toHaveBeenCalledTimes(1);
  });

  it('shows the software proposed and the vendor the assessment names for a request whose plan is not linked yet', async () => {
    const proposal: CommitmentRequestRow = {
      ...row('proposal', null),
      proposedSoftwareName: 'Miro',
      assessedVendorId: 'vendor-9',
    };
    const { facts } = build([proposal]);

    const found = await facts.factsOf(['proposal']);

    expect(found.get('proposal')).toEqual({
      id: 'proposal',
      software: { name: 'Miro' },
      plan: null,
      requester: { employeeCode: 'NV-1', fullName: 'An Nguyen' },
      beneficiaryCount: 3,
      spendApprovedAt: APPROVED_AT,
      vendorId: 'vendor-9',
    });
  });

  it('has no vendor for a proposal that the assessment has not named one for, and still shows the request', async () => {
    const { facts } = build([{ ...row('proposal', null), proposedSoftwareName: 'Miro' }]);

    const found = await facts.factsOf(['proposal']);

    expect(found.get('proposal')).toMatchObject({ software: { name: 'Miro' }, plan: null, vendorId: null });
  });

  it('leaves out a request with neither a plan nor a proposal, one whose plan is gone, and one whose requester cannot be read', async () => {
    const { facts } = build([row('no-plan', null), row('gone-plan', 'plan-9'), row('no-person', 'plan-1', 'emp-9')]);

    const found = await facts.factsOf(['no-plan', 'gone-plan', 'no-person']);

    expect(found.size).toBe(0);
  });
});
