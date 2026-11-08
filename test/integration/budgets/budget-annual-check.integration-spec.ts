import { Client } from 'pg';
import request from 'supertest';
import { BudgetHarness } from '../../support/budget-harness';
import { waitForLockWaiters } from '../../support/lock-wait';

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

  describe('the versions the check counts (Q-22)', () => {
    /** Takes every version of the year out of the count (and out of the way of the next case). */
    const clear = (year: number) =>
      h.ctx.sql.query(
        `UPDATE budget_versions SET state = 'REJECTED', sent_at = COALESCE(sent_at, now()),
                sent_by_employee_id = COALESCE(sent_by_employee_id, $2), detached_at = NULL, expired_at = NULL, never_current = false
          WHERE year = $1 AND state <> 'REJECTED'`,
        [year, h.finance.employeeId],
      );
    // A neighbour of 80M and a version being sent of 80M do not fit in 100M: the neighbour is counted or the sending passes.
    const neighbour = async (year: number, set: string) => {
      const other = await built(year);
      await h.ctx.sql.query(
        `UPDATE budget_versions SET ${set}, sent_at = now(), sent_by_employee_id = $2 WHERE id = $1`,
        [other.id, h.finance.employeeId],
      );
    };
    const sendWithNeighbour = async (set: string) => {
      const year = h.year + 2;
      await clear(year);
      await cycleOf(year, 100_000_000);
      await neighbour(year, set);
      const a = await built(year);
      const response = await h.sendVersion(a.id);
      await clear(year);

      return response;
    };

    it.each([
      ['SENT', "state = 'SENT'"],
      ['CHANGES_REQUESTED', "state = 'CHANGES_REQUESTED'"],
      ['APPROVED', "state = 'APPROVED'"],
    ])('counts a version of another Cost Center that is %s', async (_state, set) => {
      const response = await sendWithNeighbour(set);

      expect(response.status).toBe(409);
      expect(h.codeOf(response)).toBe('BUDGET.OVER_ANNUAL_CEILING');
    });

    it.each([
      ['REJECTED', "state = 'REJECTED'"],
      ['EXPIRED', "state = 'EXPIRED', expired_at = now(), never_current = true"],
      ['a draft', "state = 'DRAFT', sent_at = NULL, sent_by_employee_id = NULL"],
    ])('does not count a version of another Cost Center that is %s', async (_state, set) => {
      const year = h.year + 2;
      await clear(year);
      await cycleOf(year, 100_000_000);
      const other = await built(year);
      if (set.includes('DRAFT')) {
        await h.ctx.sql.query(`UPDATE budget_versions SET ${set} WHERE id = $1`, [other.id]);
      } else {
        await h.ctx.sql.query(
          `UPDATE budget_versions SET ${set}, sent_at = now(), sent_by_employee_id = $2 WHERE id = $1`,
          [other.id, h.finance.employeeId],
        );
      }
      const a = await built(year);

      const response = await h.sendVersion(a.id);

      expect(response.status).toBe(200);
      await clear(year);
    });

    it('does not count a draft that was detached from its proposal (the database allows a detached version only as a draft or expired)', async () => {
      const year = h.year + 2;
      await clear(year);
      await cycleOf(year, 100_000_000);
      const other = await built(year);
      await h.ctx.sql.query(`UPDATE budget_versions SET detached_at = now() WHERE id = $1`, [other.id]);
      const a = await built(year);

      const response = await h.sendVersion(a.id);

      expect(response.status).toBe(200);
      await clear(year);
    });
  });

  it('waits for the cycle before it locks the version, so a sending never holds a version while it waits for the cycle (R-I06, lock order)', async () => {
    const year = h.year + 3;
    await cycleOf(year, 10 * VERSION_TOTAL);
    const a = await built(year);
    const holder = new Client({ connectionString: h.ctx.database.url });
    const observer = new Client({ connectionString: h.ctx.database.url });
    await holder.connect();
    await observer.connect();
    try {
      await holder.query('BEGIN');
      await holder.query(`SELECT id FROM budget_cycles WHERE year = $1 FOR UPDATE`, [year]);

      const sent = h.sendVersion(a.id).then((response) => response);
      await waitForLockWaiters(observer, 1);
      // The sending waits for the cycle and holds nothing of the version yet: anybody else can lock it.
      await observer.query('BEGIN');
      const free = await observer.query(`SELECT id FROM budget_versions WHERE id = $1 FOR UPDATE NOWAIT`, [a.id]);
      await observer.query('ROLLBACK');
      await holder.query('COMMIT');

      expect(free.rows).toHaveLength(1);
      expect((await sent).status).toBe(200);
    } finally {
      await holder.query('ROLLBACK').catch(() => undefined);
      await holder.end();
      await observer.end();
    }
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
