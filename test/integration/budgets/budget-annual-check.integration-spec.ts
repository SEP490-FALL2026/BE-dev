import request from 'supertest';
import { BudgetHarness } from '../../support/budget-harness';

const h = new BudgetHarness();

/**
 * `qd103-budget-baseline-annual-check`, Task 3 (R-I06, QĐ-103i, QĐ-100v): sending a version is checked against the annual ceiling
 * less the shared-pool reserve (the versions of the year add up, the one being sent in the place of its Cost Center's), the cycle
 * is locked first so two sendings take turns, and the base moves only with its reason.
 */
describe('the annual check of a version and the reason of the base (integration, real PostgreSQL)', () => {
  const VERSION_TOTAL = 80_000_000;
  let counter = 0;

  const cycleOf = (year: number, annual: number, reserve = 0) =>
    h.ctx.sql.query(
      `UPDATE budget_cycles SET annual_ceiling_minor = $2, shared_pool_reserve_minor = $3 WHERE year = $1`,
      [year, annual, reserve],
    );
  /** A department that has a built version of the year (base 60M, reserve 20M), not sent yet. */
  const built = async (year: number) => {
    counter += 1;
    const u = await h.departmentWithHead(`P-AC${counter}`);
    const proposal = await h.budgetProposed(u.head, u.department.unitId, undefined, year);

    return h.built(proposal.id);
  };

  beforeAll(async () => {
    await h.start();
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  it('lets the versions add up to exactly what is available, and refuses the one that goes over, saying by how much (R-I06)', async () => {
    const year = h.year + 2;
    await cycleOf(year, 2 * VERSION_TOTAL + 5_000_000, 5_000_000);
    const a = await built(year);
    const b = await built(year);
    const c = await built(year);

    await h.sendVersion(a.id).expect(200);
    await h.sendVersion(b.id).expect(200);
    const over = await h.sendVersion(c.id).expect(409);

    expect(h.codeOf(over)).toBe('BUDGET.OVER_ANNUAL_CEILING');
    expect(h.detailsOf(over)).toEqual({
      gapMinor: String(VERSION_TOTAL),
      availableMinor: String(2 * VERSION_TOTAL),
    });
    const state = await h.ctx.sql.query<{ state: string }>(`SELECT state FROM budget_versions WHERE id = $1`, [c.id]);
    expect(state.rows[0].state).toBe('DRAFT');
  });

  it('refuses a version that is one unit over (R-I06)', async () => {
    const year = h.year + 3;
    await cycleOf(year, VERSION_TOTAL - 1);
    const a = await built(year);

    const over = await h.sendVersion(a.id).expect(409);

    expect(h.codeOf(over)).toBe('BUDGET.OVER_ANNUAL_CEILING');
    expect(h.detailsOf(over)).toMatchObject({ gapMinor: '1' });
  });

  it('takes one of two sendings made at once when together they go over, never both (R-I06, concurrency)', async () => {
    const year = h.year + 1;
    await cycleOf(year, VERSION_TOTAL + 10_000_000);
    const a = await built(year);
    const b = await built(year);

    const [first, second] = await Promise.all([h.sendVersion(a.id), h.sendVersion(b.id)]);

    expect([first.status, second.status].sort()).toEqual([200, 409]);
    const loser = first.status === 409 ? first : second;
    expect(h.codeOf(loser)).toBe('BUDGET.OVER_ANNUAL_CEILING');
  });

  it('refuses to send a version of a year whose cycle was never published (R-I06)', async () => {
    const year = h.year + 2;
    await cycleOf(year, 10 * VERSION_TOTAL);
    const a = await built(year);
    await h.ctx.sql.query(
      `UPDATE budget_cycles SET first_published_at = NULL, published_at = NULL, published_by_employee_id = NULL WHERE year = $1`,
      [year],
    );

    try {
      const refused = await h.sendVersion(a.id).expect(409);

      expect(h.codeOf(refused)).toBe('BUDGET.CYCLE_NOT_PUBLISHED');
    } finally {
      await h.publishedCycle(year);
      await h.ctx.sql.query(
        `UPDATE budget_cycles SET first_published_at = now(), published_at = now(), published_by_employee_id = $2 WHERE year = $1`,
        [year, h.finance.employeeId],
      );
    }
  });

  describe('the reason of the base (QĐ-100v)', () => {
    const patch = (id: string, body: object) =>
      request(h.server()).put(`/api/v1/budget-versions/${id}`).set(h.as(h.finance)).send(body);

    it('asks why when the base changes, keeps the reason, and shows it in the history', async () => {
      const draft = await built(h.year + 2);

      const missing = await patch(draft.id, { base: h.money(61_000_000) }).expect(422);
      const given = await patch(draft.id, { base: h.money(61_000_000), baseReason: 'The licences cost more' }).expect(
        200,
      );

      expect(h.codeOf(missing)).toBe('BUDGET.BASE_REASON_REQUIRED');
      expect(h.dataOf<{ version: { baseReason: string | null } }>(given).version.baseReason).toBe(
        'The licences cost more',
      );
      const history = await h.versionHistory(draft.id).expect(200);
      expect(JSON.stringify(h.dataOf(history))).toContain('The licences cost more');
    });

    it('asks nothing for a base the draft already has, or when the base is not touched', async () => {
      const draft = await built(h.year + 2);

      await patch(draft.id, { base: h.money(60_000_000) }).expect(200);
      await patch(draft.id, { reserve: h.money(21_000_000), reserveReason: 'A bigger reserve' }).expect(200);
    });
  });
});
