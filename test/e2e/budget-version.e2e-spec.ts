import { BudgetHarness, type ProposalWire, type VersionWire } from '../support/budget-harness';
import type { Department, Person } from '../support/request-harness';

const h = new BudgetHarness();
const M = 1_000_000;

interface MyBudgetWire {
  status: string;
  total: { amount: string };
  version: { number: number };
}

/**
 * E2E smoke: the head proposes the budget of the department for next year, Finance builds the version and sends it, the spending
 * approver approves it and it is the budget in force; a revision approved later replaces it. Real HTTP and PostgreSQL.
 */
describe('a budget version from the proposal to the version in force (e2e)', () => {
  let boss: Person;
  let department: Department;
  let head: Person;
  let proposal: ProposalWire;
  let first: VersionWire;

  const versionOf = async (id: string) => h.dataOf<{ version: VersionWire }>(await h.versionOf(id).expect(200)).version;
  const myBudget = async () =>
    h.dataOf<{ budget: MyBudgetWire }>(await h.mine(head.account, h.next).expect(200)).budget;

  beforeAll(async () => {
    await h.start();
    // The spending approver heads a department of their own and is named by the Super Admin.
    const executive = await h.departmentWithUnit('P-EXE');
    boss = await h.staff(executive, 'EXE-C1');
    await h.makeHead(executive, boss);
    await h.setRole('SPENDING_APPROVER', boss);
    ({ department, head } = await h.departmentWithHead('P-DES'));
  }, 180000);

  afterAll(async () => {
    await h.stop();
  });

  it('the head proposes the budget of the Unit Cost Center of the department for next year', async () => {
    proposal = await h.budgetProposed(head, department.unitId, h.twoLines(), h.next);

    expect(proposal).toMatchObject({
      state: 'SUBMITTED',
      year: h.next,
      costCenter: { id: department.unitId },
      total: { amount: String(70 * M) },
    });
  });

  it('Finance builds the first version from the proposal and sends it to the approver', async () => {
    first = await h.built(proposal.id, { base: h.money(60 * M), reserve: h.money(20 * M) });
    expect(first).toMatchObject({ kind: 'INITIAL', number: 1, state: 'DRAFT', total: { amount: String(80 * M) } });

    await h.sendVersion(first.id).expect(200);

    expect((await versionOf(first.id)).state).toBe('SENT');
  });

  it('the spending approver approves it: it is the budget in force for the department', async () => {
    const decided = h.dataOf<{ version: VersionWire }>(
      await h.decideVersion(first.id, { decision: 'APPROVE' }, boss.account).expect(200),
    ).version;

    expect(decided).toMatchObject({
      state: 'APPROVED',
      decision: { decision: 'APPROVED', by: { employeeId: boss.employeeId } },
    });
    expect(await myBudget()).toMatchObject({
      status: 'ACTIVE',
      total: { amount: String(80 * M) },
      version: { number: 1 },
    });
  });

  it('a revision Finance sends and the approver approves replaces it as the version in force', async () => {
    const revision = h.dataOf<{ version: VersionWire }>(
      await h
        .createRevision({
          costCenterId: department.unitId,
          year: h.next,
          base: h.money(80 * M),
          reserve: h.money(20 * M),
          reason: 'Growth of the team',
        })
        .expect(201),
    ).version;
    await h.sendVersion(revision.id).expect(200);
    await h.decideVersion(revision.id, { decision: 'APPROVE' }, boss.account).expect(200);

    expect((await versionOf(first.id)).state).toBe('SUPERSEDED');
    expect(await versionOf(revision.id)).toMatchObject({ kind: 'REVISION', number: 2, state: 'APPROVED' });
    expect(await myBudget()).toMatchObject({
      status: 'ACTIVE',
      total: { amount: String(100 * M) },
      version: { number: 2 },
    });
  });
});
