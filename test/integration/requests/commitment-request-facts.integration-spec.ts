import { RequestCommitmentFacts } from '../../../src/modules/requests/spend/commitment-request-facts.listener';
import { SpendHarness, Unit } from '../../support/spend-harness';

const h = new SpendHarness();

/**
 * What a commitment shows of its request, and the vendor an invoice is from, over PostgreSQL: for a request of a plan of the catalog and for
 * a proposal of software that has no plan until the IT Admin links one, which comes after the spend decision.
 */
describe('the request behind a commitment over PostgreSQL (US-12-02, US-06-07)', () => {
  let plan: string;
  let vendorId: string;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    plan = await h.planOf(await h.subscription(10));
    vendorId = (await h.vendorOf(plan)).id;
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const facts = () => h.ctx.app.get(RequestCommitmentFacts, { strict: false });
  const unit = async (): Promise<Unit> => {
    counter += 1;

    return h.departmentWithHead(`P-F${counter}`);
  };

  it('tells the software, the plan, who sent it, how many it is for and the vendor of a request of a plan', async () => {
    const u = await unit();
    await h.budgetFor(u, { total: 100_000_000 });
    const id = await h.waitingForApprover(u, plan, { amount: 10_000_000 });
    await h.decideSpend(id, { decision: 'APPROVE' }, h.boss.account).expect(200);

    const found = (await facts().factsOf([id])).get(id);

    expect(found).toMatchObject({
      id,
      plan: { name: expect.any(String) as string },
      requester: { employeeCode: expect.any(String) as string },
      beneficiaryCount: 1,
      vendorId,
    });
    expect(found?.software.name).toEqual(expect.any(String));
    expect(found?.spendApprovedAt).toBeInstanceOf(Date);
  });

  it('tells the software proposed and the vendor the assessment names for a proposal that has no plan yet', async () => {
    const u = await unit();
    await h.setItAdminInCharge(u.department, { employeeId: h.it1.employeeId, account: h.it1 });
    const proposed = await h.proposed(u.member);
    await h.decide(proposed.id, { decision: 'APPROVE' }, u.head.account).expect(200);
    await h.saveAssessment(proposed.id, h.assessmentBody({ vendorId }), h.it1).expect(200);

    const found = (await facts().factsOf([proposed.id])).get(proposed.id);

    const stored = await h.ctx.sql.query<{ software_name: string }>(
      `SELECT software_name FROM access_request_proposals WHERE request_id = $1`,
      [proposed.id],
    );
    expect(found).toMatchObject({ id: proposed.id, plan: null, beneficiaryCount: 1, vendorId });
    expect(found?.software.name).toBe(stored.rows[0].software_name);
  });

  it('has no vendor for a proposal whose assessment names none, and still shows the request', async () => {
    const u = await unit();
    const proposed = await h.proposed(u.member);

    const found = (await facts().factsOf([proposed.id])).get(proposed.id);

    expect(found).toMatchObject({ id: proposed.id, plan: null, vendorId: null });
  });

  it('does not show a request that does not exist', async () => {
    const found = await facts().factsOf(['0a1b2c3d-0000-4000-8000-000000000099']);

    expect(found.size).toBe(0);
  });
});
