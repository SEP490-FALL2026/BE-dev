import request from 'supertest';
import { BudgetFactsRepo } from '../../../src/modules/budgets/budget/budget-facts.repo';
import { InvoiceHarness } from '../../support/invoice-harness';
import type { Unit } from '../../support/spend-harness';

const h = new InvoiceHarness();
const M = 1_000_000;

interface AdjustmentWire {
  id: string;
  kind: string;
  state: string;
  amount: { amount: string };
  from: { id: string } | null;
  to: { id: string } | null;
  createdBy: { employeeId: string } | null;
  decidedBy: { employeeId: string } | null;
  decisionReason: string | null;
  createdVersionId: string | null;
}
interface PageWire {
  items: AdjustmentWire[];
  pagination: { totalItems: number };
}

/**
 * The adjustment of the budget in the year (`AD-1.2`, `T-AD1`): Finance asks and the spending approver decides; what is not allocated is 1.800 - 1.771 = 29 tr (here the ceiling
 * is the budgets of the Cost Centers and 29 tr); a return and the source of a transfer keep the forecast of the end of the year (Hành chính: base 180 tr, reserve 18 tr, 80 tr spent
 * and 30 tr held, forecast 110 tr); a Cost Center with no version is given one (R-48); every condition is looked at again at the decision.
 */
describe('Finance asks for an adjustment of the budget and the spending approver decides it (integration; AD-1.2, T-AD1)', () => {
  let admin: Unit;
  let sales: Unit;
  let fresh: Unit;
  let outsider: Unit;
  const ceilingOf = async (): Promise<bigint> =>
    BigInt(
      (
        await h.ctx.sql.query<{ c: string }>(
          `SELECT annual_ceiling_minor::text AS c FROM budget_cycles WHERE year = $1`,
          [h.year],
        )
      ).rows[0].c,
    );
  /** The ceiling is what the Cost Centers hold (their effective budgets) and `leftTr` more; the reserve of the shared pool is nothing. */
  const ceilingLeaving = async (leftTr: number): Promise<void> => {
    const allocated = await h.ctx.app
      .get(BudgetFactsRepo, { strict: false })
      .allocatedOfYear(h.seed.organizationId, h.year);
    await h.ctx.sql.query(`UPDATE budget_cycles SET annual_ceiling_minor = $2 WHERE year = $1`, [
      h.year,
      (allocated + BigInt(leftTr * M)).toString(),
    ]);
  };
  const ask = (body: Record<string, unknown>) =>
    request(h.server())
      .post('/api/v1/budget-adjustments')
      .set(h.as(h.finance))
      .send({ year: h.year, reason: 'Điều chỉnh trong năm', ...body });
  const supplement = (to: Unit, tr: number) =>
    ask({ kind: 'SUPPLEMENT', toCostCenterId: to.department.unitId, amount: h.money(tr * M) });
  const transfer = (from: Unit, to: Unit, tr: number, extra: Record<string, unknown> = {}) =>
    ask({
      kind: 'TRANSFER',
      fromCostCenterId: from.department.unitId,
      toCostCenterId: to.department.unitId,
      amount: h.money(tr * M),
      ...extra,
    });
  const decide = (id: string, body: Record<string, unknown>, account: Parameters<typeof h.as>[0] = h.deciderOf()) =>
    request(h.server()).post(`/api/v1/budget-adjustments/${id}/decision`).set(h.as(account)).send(body);
  const made = async (response: request.Test): Promise<AdjustmentWire> =>
    h.dataOf<AdjustmentWire>(await response.expect(201));
  const facts = async (unit: Unit) =>
    (await h.ctx.app.get(BudgetFactsRepo, { strict: false }).yearFacts(unit.department.unitId, [h.year])).get(h.year);
  const code = (response: { body: unknown }) => (response.body as { error: { code: string } }).error.code;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    admin = await h.departmentWithHead('P-AD1A');
    sales = await h.departmentWithHead('P-AD1S');
    fresh = await h.departmentWithHead('P-AD1N');
    outsider = await h.departmentWithHead('P-AD1O');
    await h.budgetFor(admin, { total: 180 * M, reserve: 18 * M, spent: 80 * M, held: 30 * M });
    await h.budgetFor(sales, { total: 100 * M });
    await ceilingLeaving(29);
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  it('T-AD1: with 29 tr not allocated a supplement of 20 tr is asked, one of 30 tr is 422, and so is a reduction of the ceiling of 30 tr', async () => {
    const ok = await made(supplement(sales, 20));

    expect(ok).toMatchObject({
      kind: 'SUPPLEMENT',
      state: 'PENDING',
      amount: { amount: String(20 * M) },
      createdBy: { employeeId: h.finance.employeeId },
    });
    const over = await supplement(sales, 30).expect(422);
    expect(code(over)).toBe('BUDGET_ADJUSTMENT.OVER_UNALLOCATED');
    expect((over.body as { error: { details: Record<string, string> } }).error.details).toMatchObject({
      availableMinor: String(29 * M),
      requestedMinor: String(30 * M),
    });
    expect(code(await ask({ kind: 'CEILING_REDUCTION', amount: h.money(30 * M) }).expect(422))).toBe(
      'BUDGET_ADJUSTMENT.OVER_UNALLOCATED',
    );
  });

  it('T-AD1: Hành chính (base 180, reserve 18, forecast 110) gives 20 tr (178 is not below 110) and not 90 tr (108 is), and a return follows the same floor', async () => {
    expect(await made(transfer(admin, sales, 20))).toMatchObject({ kind: 'TRANSFER', state: 'PENDING' });
    const below = await transfer(admin, sales, 90).expect(422);
    expect(code(below)).toBe('BUDGET_ADJUSTMENT.BELOW_FORECAST_FLOOR');
    expect((below.body as { error: { details: Record<string, string> } }).error.details).toMatchObject({
      floorMinor: String(110 * M),
      afterMinor: String(108 * M),
    });
    expect(
      code(
        await ask({ kind: 'RETURN', fromCostCenterId: admin.department.unitId, amount: h.money(90 * M) }).expect(422),
      ),
    ).toBe('BUDGET_ADJUSTMENT.BELOW_FORECAST_FLOOR');
    expect(
      await made(ask({ kind: 'RETURN', fromCostCenterId: admin.department.unitId, amount: h.money(20 * M) })),
    ).toMatchObject({ kind: 'RETURN' });
  });

  it('T-AD1: a transfer because the department changed its Cost Center is not held to the floor: 170 tr passes, 181 tr is more than the base', async () => {
    expect(await made(transfer(admin, sales, 170, { transferReason: 'COST_CENTER_CHANGE' }))).toMatchObject({
      kind: 'TRANSFER',
    });
    expect(code(await transfer(admin, sales, 181, { transferReason: 'COST_CENTER_CHANGE' }).expect(422))).toBe(
      'BUDGET_ADJUSTMENT.OVER_BASE',
    );
    expect(code(await transfer(fresh, sales, 1).expect(422))).toBe('BUDGET_ADJUSTMENT.NO_BUDGET');
  });

  it('refuses the shapes a kind does not have, and a Cost Center that is not one', async () => {
    expect(
      code(
        await ask({
          kind: 'SUPPLEMENT',
          fromCostCenterId: admin.department.unitId,
          toCostCenterId: sales.department.unitId,
          amount: h.money(M),
        }).expect(422),
      ),
    ).toBe('BUDGET_ADJUSTMENT.INVALID_SHAPE');
    expect(code(await transfer(sales, sales, 1).expect(422))).toBe('BUDGET_ADJUSTMENT.INVALID_SHAPE');
    expect(
      code(
        await ask({
          kind: 'SUPPLEMENT',
          toCostCenterId: '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11',
          amount: h.money(M),
        }).expect(404),
      ),
    ).toBe('BUDGET.COST_CENTER_NOT_FOUND');
  });

  it('the spending approver is asked once, and decides: an approval gives the base of Sales 20 tr more and leaves its reserve; a refusal needs a reason and changes nothing', async () => {
    const asked = await made(supplement(sales, 10));
    const notices = await h.ctx.sql.query<{ recipient_employee_id: string }>(
      `SELECT recipient_employee_id FROM in_app_notifications WHERE code = 'BUDGET_ADJUSTMENT_REQUESTED' AND params->>'adjustmentId' = $1`,
      [asked.id],
    );
    expect(notices.rows.map((row) => row.recipient_employee_id)).toEqual([h.deciderOf().employeeId]);
    const before = await facts(sales);

    expect(code(await decide(asked.id, { decision: 'REJECT' }).expect(422))).toBe('BUDGET.ADJUSTMENT_REASON_REQUIRED');
    const approved = h.dataOf<AdjustmentWire>(await decide(asked.id, { decision: 'APPROVE' }).expect(200));
    expect(approved).toMatchObject({
      state: 'APPROVED',
      decidedBy: { employeeId: h.deciderOf().employeeId },
      createdVersionId: null,
    });
    const after = await facts(sales);
    expect(after?.baseMinor).toBe((before?.baseMinor ?? 0n) + BigInt(10 * M));
    expect(after).toMatchObject({ versionBaseMinor: before?.versionBaseMinor, reserveMinor: before?.reserveMinor });
    expect(code(await decide(asked.id, { decision: 'APPROVE' }).expect(409))).toBe('BUDGET_ADJUSTMENT.ALREADY_DECIDED');

    const refused = await made(supplement(sales, 5));
    const done = h.dataOf<AdjustmentWire>(
      await decide(refused.id, { decision: 'REJECT', reason: 'Chưa cần' }).expect(200),
    );
    expect(done).toMatchObject({ state: 'REJECTED', decisionReason: 'Chưa cần' });
    expect((await facts(sales))?.baseMinor).toBe(after?.baseMinor);
    const told = await h.ctx.sql.query<{ recipient_employee_id: string }>(
      `SELECT recipient_employee_id FROM in_app_notifications WHERE code = 'BUDGET_ADJUSTMENT_DECIDED' AND params->>'adjustmentId' = $1`,
      [asked.id],
    );
    expect(told.rows.map((row) => row.recipient_employee_id)).toEqual(
      expect.arrayContaining([h.finance.employeeId, sales.head.account.employeeId]),
    );
  });

  it('only the spending approver decides, the person who asked never does, and an id that is not an adjustment is a 404', async () => {
    const asked = await made(supplement(sales, 1));

    expect(code(await decide(asked.id, { decision: 'APPROVE' }, h.finance).expect(403))).toBe(
      'AUTHORIZATION.FORBIDDEN',
    );
    expect(code(await decide(asked.id, { decision: 'APPROVE' }, sales.head.account).expect(403))).toBe(
      'AUTHORIZATION.FORBIDDEN',
    );
    expect(code(await decide('3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11', { decision: 'APPROVE' }).expect(404))).toBe(
      'BUDGET_ADJUSTMENT.NOT_FOUND',
    );
  });

  it('looks at everything again at the decision: two supplements of exactly what is left both pass when asked and only one passes when decided, even decided together', async () => {
    await ceilingLeaving(29);
    const first = await made(supplement(sales, 29));
    const second = await made(supplement(admin, 29));

    const outcomes = await Promise.all([first, second].map((one) => decide(one.id, { decision: 'APPROVE' })));

    expect(outcomes.map((response) => response.status).sort()).toEqual([200, 422]);
    expect(code(outcomes.find((response) => response.status === 422) as { body: unknown })).toBe(
      'BUDGET_ADJUSTMENT.OVER_UNALLOCATED',
    );
    const left = await h.ctx.app.get(BudgetFactsRepo, { strict: false }).allocatedOfYear(h.seed.organizationId, h.year);
    expect(BigInt(await ceilingOf()) - left).toBe(0n);
  });

  it('R-48: a Cost Center with no version is given an approved version of origin ADJUSTMENT with the amount as its base and no reserve, and the amount is counted once', async () => {
    await ceilingLeaving(40);
    expect(await facts(fresh)).toBeUndefined();
    const asked = await made(supplement(fresh, 20));
    const approved = h.dataOf<AdjustmentWire>(await decide(asked.id, { decision: 'APPROVE' }).expect(200));

    expect(approved.createdVersionId).not.toBeNull();
    const version = await h.ctx.sql.query<{
      origin: string;
      state: string;
      base_minor: string;
      reserve_minor: string;
      proposal_id: string | null;
    }>(
      `SELECT origin::text, state::text, base_minor::text, reserve_minor::text, proposal_id FROM budget_versions WHERE id = $1`,
      [approved.createdVersionId],
    );
    expect(version.rows[0]).toEqual({
      origin: 'ADJUSTMENT',
      state: 'APPROVED',
      base_minor: String(20 * M),
      reserve_minor: '0',
      proposal_id: null,
    });
    expect(await facts(fresh)).toMatchObject({
      baseMinor: BigInt(20 * M),
      versionBaseMinor: BigInt(20 * M),
      adjustmentMinor: 0n,
      reserveMinor: 0n,
    });
    const more = await made(supplement(fresh, 5));
    await decide(more.id, { decision: 'APPROVE' }).expect(200);
    expect(await facts(fresh)).toMatchObject({
      baseMinor: BigInt(25 * M),
      versionBaseMinor: BigInt(20 * M),
      adjustmentMinor: BigInt(5 * M),
    });
  });

  it('a Cost Center whose version of the year is still being decided is not given another: the decision waits for that one (409)', async () => {
    await ceilingLeaving(40);
    const costCenterId = outsider.department.unitId;
    await h.ctx.sql.query(
      `INSERT INTO budget_versions (id, organization_id, cost_center_id, year, number, kind, state, origin, base_minor, reserve_minor, total_minor,
          currency, created_by_employee_id)
       VALUES (gen_random_uuid(), $1, $2, $3, 1, 'INITIAL', 'DRAFT', 'BASELINE_NO_PROPOSAL'::"BudgetVersionOrigin", 1000000, 0, 1000000, 'VND', $4)`,
      [h.seed.organizationId, costCenterId, h.year, h.finance.employeeId],
    );
    const asked = await made(supplement(outsider, 5));

    expect(code(await decide(asked.id, { decision: 'APPROVE' }).expect(409))).toBe(
      'BUDGET_ADJUSTMENT.VERSION_IN_FLIGHT',
    );
  });

  it('an approved reduction of the ceiling lowers the annual ceiling by the amount, and nothing else', async () => {
    await ceilingLeaving(29);
    const ceiling = await ceilingOf();
    const asked = await made(ask({ kind: 'CEILING_REDUCTION', amount: h.money(9 * M) }));
    await decide(asked.id, { decision: 'APPROVE' }).expect(200);

    expect(await ceilingOf()).toBe(ceiling - BigInt(9 * M));
  });

  it('is read by Finance and the spending approver in full, by the manager of a department for the Cost Centers of their own, with the filters and the pages', async () => {
    const read = async (account: Parameters<typeof h.as>[0], query: Record<string, unknown> = {}) =>
      h.dataOf<PageWire>(
        await request(h.server())
          .get('/api/v1/budget-adjustments')
          .query({ pageSize: 100, ...query })
          .set(h.as(account))
          .expect(200),
      );

    const all = await read(h.finance);
    expect(all.pagination.totalItems).toBeGreaterThan(8);
    expect((await read(h.deciderOf())).pagination.totalItems).toBe(all.pagination.totalItems);
    const own = await read(admin.head.account);
    expect(own.items.length).toBeGreaterThan(0);
    expect(
      own.items.every((one) => one.from?.id === admin.department.unitId || one.to?.id === admin.department.unitId),
    ).toBe(true);
    expect(own.items.some((one) => one.kind === 'CEILING_REDUCTION')).toBe(false);
    expect((await read(outsider.head.account, { costCenterId: admin.department.unitId })).items).toEqual([]);
    expect((await read(h.finance, { state: 'REJECTED' })).items.map((one) => one.state)).toEqual(['REJECTED']);
    const page = await read(h.finance, { pageSize: 3, page: 2 });
    expect(page.items).toHaveLength(3);
    expect(page.pagination.totalItems).toBe(all.pagination.totalItems);
  });
});
