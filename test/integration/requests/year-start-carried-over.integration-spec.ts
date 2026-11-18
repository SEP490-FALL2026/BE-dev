import { Client } from 'pg';
import request from 'supertest';
import { CarriedOverContributions } from '../../../src/modules/budgets/public/budgets.extension-points';
import { YearStartCommitmentsService } from '../../../src/modules/requests/year-start-commitments/year-start-commitments.service';
import { GroupHarness } from '../../support/group-harness';
import { pretendBusinessToday } from '../../support/pretend-today';
import type { Unit } from '../../support/spend-harness';

const h = new GroupHarness();
const M = 1_000_000;
/** The plans of the suite are priced 1 000 000 a month (`subscription` of the seat harness). */
const MONTH = 1_000_000n;

interface BaselineWire {
  departments: { costCenterId: string | null; carriedOverNextYear: { amount: string } }[];
}

/**
 * `QĐ-111ac`, T-BG2, over the real source: what a Cost Center carries into the year the budget is made for is what the pass of 01/01 of that
 * year would commit in it, worked out now by the same rule and without writing or locking anything. Ten rights with no end (twelve months
 * of 1 000 000) and a request for months of use that kept 3 000 000 carry 123 000 000.
 */
describe('what a Cost Center carries into the year, from the requests (T-BG2, QĐ-111ac) over PostgreSQL', () => {
  let k2: string;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    k2 = await h.planOf(await h.subscription(100));
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  beforeEach(async () => {
    // The year of the suite is done (as it is once its pass ran), and nothing is for the year that begins: the pass of a test is the first of it.
    await h.ctx.sql.query(
      `INSERT INTO year_start_commitment_runs (organization_id, year, started_at, completed_at)
       SELECT id, $1, now(), now() FROM organizations ON CONFLICT DO NOTHING`,
      [h.year],
    );
    await h.ctx.sql.query(`DELETE FROM year_start_commitment_runs WHERE year = $1`, [h.next]);
  });

  afterEach(() => jest.restoreAllMocks());

  const unit = async (): Promise<Unit> => {
    counter += 1;
    const made = await h.departmentWithHead(`P-CO${counter}`);
    await h.roomFor(made);

    return made;
  };
  /** The department asks for ten seats of a plan, with no end, and they are approved as spend: each waits to be granted. */
  const tenRightsWithNoEnd = async (u: Unit): Promise<string> => h.groupApproved(u, k2, await h.colleagues(u, 10));
  /** A request for months of use approved as spend, whose approval kept `kept` of the year after (what the approval of a request for months writes). */
  const keptOf = async (u: Unit, kept: number): Promise<string> => {
    const id = await h.waitingForApprover(u, k2, { amount: 1 * M });
    await h.decideSpend(id, { decision: 'APPROVE' }, h.boss.account).expect(200);
    await h.ctx.sql.query(
      `UPDATE access_requests SET term_months = 6, expected_end_date = NULL, budget_year = $2, next_year_amount_minor = $3 WHERE id = $1`,
      [id, h.year, kept],
    );

    return id;
  };
  const carried = () => h.ctx.app.get(CarriedOverContributions, { strict: false });
  const passOn = () => {
    pretendBusinessToday(h.ctx.app, `${h.next}-01-01`);

    return h.ctx.app.get(YearStartCommitmentsService, { strict: false }).run(new Date());
  };
  const count = async (table: string): Promise<number> => h.budgetRows(table);
  const startCommitted = async (costCenterId: string): Promise<bigint> =>
    BigInt(
      (
        await h.ctx.sql.query<{ total: string }>(
          `SELECT COALESCE(sum(amount_minor), 0)::text AS total FROM budget_commitments
            WHERE cost_center_id = $1 AND year = $2 AND origin = 'YEAR_START'`,
          [costCenterId, h.next],
        )
      ).rows[0].total,
    );

  it('T-BG2: ten rights with no end at 1 000 000 and a request that kept 3 000 000 carry 10 x 1 000 000 x 12 + 3 000 000 = 123 000 000 into the year after', async () => {
    const u = await unit();
    await tenRightsWithNoEnd(u);
    await keptOf(u, 3 * M);

    const totals = await carried().totals([u.department.unitId], h.next);

    expect(totals.get(u.department.unitId)).toBe(10n * MONTH * 12n + 3n * MONTH);
    const baseline = h.dataOf<BaselineWire>(
      await request(h.server()).get(`/api/v1/budget-cycles/${h.next}/baseline`).set(h.as(h.finance)).expect(200),
    );
    expect(
      baseline.departments.find((department) => department.costCenterId === u.department.unitId)?.carriedOverNextYear,
    ).toMatchObject({ amount: '123000000' });
  });

  it('QĐ-111ac: tells only about the Cost Centers it is asked about, and a department with nothing running carries nothing', async () => {
    const busy = await unit();
    await tenRightsWithNoEnd(busy);
    const idle = await unit();

    const totals = await carried().totals([idle.department.unitId], h.next);

    expect(totals.get(idle.department.unitId) ?? 0n).toBe(0n);
    expect(totals.has(busy.department.unitId)).toBe(false);
  });

  it('QĐ-111ac: what it says before 01/01 is what the pass of 01/01 then commits in the Cost Center, and a request that holds a commitment for the year is not counted twice', async () => {
    const u = await unit();
    await tenRightsWithNoEnd(u);
    await keptOf(u, 3 * M);
    const before = (await carried().totals([u.department.unitId], h.next)).get(u.department.unitId);

    await passOn();

    expect(before).toBe(123n * MONTH);
    expect(await startCommitted(u.department.unitId)).toBe(before);
    // The commitments of the year are made now: what is carried into it is what they hold, and the dry run no longer adds them.
    expect((await carried().totals([u.department.unitId], h.next)).get(u.department.unitId) ?? 0n).toBe(0n);
  });

  it('QĐ-111ac: it only reads: nothing is written, and it does not wait for a request another transaction holds locked', async () => {
    const u = await unit();
    const group = await tenRightsWithNoEnd(u);
    const tables = ['budget_commitments', 'audit_events', 'year_start_commitment_runs'];
    const rowsBefore = await Promise.all(tables.map(count));
    const holder = new Client({ connectionString: h.ctx.database.url });
    await holder.connect();
    try {
      await holder.query('BEGIN');
      await holder.query(`SELECT id FROM access_requests WHERE id = $1 FOR UPDATE`, [group]);

      let timer: NodeJS.Timeout | undefined;
      const answer = await Promise.race([
        carried().totals([u.department.unitId], h.next),
        new Promise<'BLOCKED'>((resolve) => {
          timer = setTimeout(() => resolve('BLOCKED'), 10_000);
        }),
      ]).finally(() => clearTimeout(timer));

      expect(answer).not.toBe('BLOCKED');
      expect((answer as Map<string, bigint>).get(u.department.unitId)).toBe(10n * MONTH * 12n);
    } finally {
      await holder.query('ROLLBACK');
      await holder.end();
    }
    expect(await Promise.all(tables.map(count))).toEqual(rowsBefore);
  }, 60000);

  it('QĐ-111ac: a request that holds a commitment for the year already is not counted: the commitment is what it holds', async () => {
    const u = await unit();
    const id = await keptOf(u, 3 * M);
    expect((await carried().totals([u.department.unitId], h.next)).get(u.department.unitId)).toBe(3n * MONTH);
    await h.ctx.sql.query(
      `INSERT INTO budget_commitments (id, organization_id, request_id, cost_center_id, year, amount_minor, currency, state, unattached_reason)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 777, $5, 'HELD'::"CommitmentState", 'NO_BUDGET')`,
      [h.seed.organizationId, id, u.department.unitId, h.next, h.reporting],
    );

    expect((await carried().totals([u.department.unitId], h.next)).get(u.department.unitId) ?? 0n).toBe(0n);
  });
});
