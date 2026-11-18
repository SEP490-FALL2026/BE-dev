import { SpendHarness, Unit } from '../../support/spend-harness';

const h = new SpendHarness();
const M = 1_000_000;

interface CommitmentItem {
  id: string;
  requestId: string;
  state: string;
  amount: { amount: string };
  held: { amount: string };
  invoiced: { amount: string };
  invoiceCount: number;
  hasDiscrepancy: boolean;
  request: {
    id: string;
    software: { name: string };
    plan: { name: string } | null;
    requester: { employeeCode: string; fullName: string };
    beneficiaryCount: number;
    spendApprovedAt: string | null;
  } | null;
}

describe('the list of commitments Finance reads over PostgreSQL (US-06-07, US-12-01)', () => {
  let plan: string;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    plan = await h.planOf(await h.subscription(10));
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const unit = async (): Promise<Unit> => {
    counter += 1;

    return h.departmentWithHead(`P-L${counter}`);
  };
  const list = async (costCenterId: string, query: Record<string, string> = {}) =>
    h.dataOf<{ items: CommitmentItem[] }>(
      await h.commitmentList(h.finance, { costCenterId, year: h.year, ...query }).expect(200),
    ).items;

  it('shows the request behind a commitment the spending approver made, with no invoice against it yet', async () => {
    const u = await unit();
    await h.budgetFor(u, { total: 100 * M });
    const requestId = await h.waitingForApprover(u, plan, { amount: 20 * M });
    await h.decideSpend(requestId, { decision: 'APPROVE' }, h.boss.account).expect(200);

    const [commitment] = await list(u.department.unitId, { state: 'HELD' });

    expect(commitment).toMatchObject({
      requestId,
      state: 'HELD',
      invoiceCount: 0,
      hasDiscrepancy: false,
      invoiced: { amount: '0' },
    });
    expect(commitment.request).toMatchObject({ id: requestId, beneficiaryCount: 1 });
    expect(commitment.request?.software.name).toEqual(expect.any(String));
    expect(commitment.request?.plan?.name).toEqual(expect.any(String));
    expect(commitment.request?.requester.employeeCode).toEqual(expect.any(String));
    expect(commitment.request?.spendApprovedAt).toEqual(expect.any(String));
  });

  it('narrows the list to the commitments in the state asked for', async () => {
    const u = await unit();
    await h.budgetFor(u, { total: 100 * M, held: 10 * M, spent: 30 * M });

    const held = await list(u.department.unitId, { state: 'HELD' });
    const expensed = await list(u.department.unitId, { state: 'EXPENSED' });
    const released = await list(u.department.unitId, { state: 'RELEASED' });
    const all = await list(u.department.unitId);

    expect(held.map((item) => item.state)).toEqual(['HELD']);
    expect(expensed.map((item) => item.state)).toEqual(['EXPENSED']);
    expect(released).toEqual([]);
    expect(all).toHaveLength(2);
  });

  it('turns away a state that does not exist', async () => {
    await h.commitmentList(h.finance, { state: 'PENDING' }).expect(422);
  });
});
