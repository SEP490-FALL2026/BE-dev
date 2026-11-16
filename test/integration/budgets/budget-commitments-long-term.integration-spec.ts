import request from 'supertest';
import { InvoiceHarness } from '../../support/invoice-harness';
import type { Unit } from '../../support/spend-harness';

const h = new InvoiceHarness();
const M = 1_000_000;

interface CommitmentWire {
  id: string;
  costCenter: { id: string } | null;
  state: string;
}
interface PageWire {
  items: CommitmentWire[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

/**
 * The long-term commitments of the quarterly review (`RV-3`, `QĐ-111aj`, US-12-21 AC-8; the definition is FIX-RV23 RV3-02, D-104): `GET /budget-commitments?longTerm=true&year=` lists every commitment of
 * the year of the review that is still held (the rights that are running), whenever it was made, by page; the year is asked for. Finance reads every Cost Center, a head of a department only the
 * Cost Centers of the departments they head, and everybody else is refused. The review never shortens the term of a request, and the route offers no way to take anything back.
 */
describe('the long-term commitments the quarterly review shows (integration; RV-3.2)', () => {
  let a: Unit;
  let b: Unit;
  let oldA: string[] = [];
  let recentA: string;
  let oldB: string;
  let expensedA: string;
  let lastYearA: string;
  const asked = (query: Record<string, string | number>, account: Parameters<typeof h.as>[0] = h.finance) =>
    request(h.server()).get('/api/v1/budget-commitments').query(query).set(h.as(account));
  const idsOf = (page: PageWire): string[] => page.items.map((item) => item.id).sort();
  const commitmentOf = async (
    unit: Unit,
    versionId: string,
    amountTr: number,
    madeOn: string | null,
  ): Promise<string> => {
    await h.commit(unit, versionId, h.year, amountTr * M, 'HELD');
    const { rows } = await h.ctx.sql.query<{ id: string }>(
      `SELECT id FROM budget_commitments WHERE cost_center_id = $1 AND amount_minor = $2 AND created_at >= now() - interval '1 minute' ORDER BY created_at DESC LIMIT 1`,
      [unit.department.unitId, amountTr * M],
    );
    if (madeOn !== null) {
      await h.ctx.sql.query(`UPDATE budget_commitments SET created_at = $2::timestamptz WHERE id = $1`, [
        rows[0].id,
        madeOn,
      ]);
    }

    return rows[0].id;
  };

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    a = await h.departmentWithHead('P-RV3L-A');
    b = await h.departmentWithHead('P-RV3L-B');
    await h.ctx.sql.query(`UPDATE budget_cycles SET annual_ceiling_minor = 1000000000000 WHERE year = $1`, [h.year]);
    const versionA = await h.budgetFor(a, { total: 300 * M });
    const versionB = await h.budgetFor(b, { total: 300 * M });
    // Made long ago (first quarter of the year before), still held; and made a moment ago, in the running quarter.
    oldA = [
      await commitmentOf(a, versionA.id, 11, `${h.year - 1}-02-10T03:00:00Z`),
      await commitmentOf(a, versionA.id, 12, `${h.year - 1}-05-10T03:00:00Z`),
    ];
    recentA = await commitmentOf(a, versionA.id, 13, null);
    oldB = await commitmentOf(b, versionB.id, 14, `${h.year - 1}-03-01T03:00:00Z`);
    // What is not held (it became an expense) and what is held for another year are not of this review.
    await h.commit(a, versionA.id, h.year, 15 * M, 'EXPENSED');
    expensedA = (
      await h.ctx.sql.query<{ id: string }>(
        `SELECT id FROM budget_commitments WHERE cost_center_id = $1 AND amount_minor = $2 AND state = 'EXPENSED'`,
        [a.department.unitId, 15 * M],
      )
    ).rows[0].id;
    await h.commit(a, versionA.id, h.year - 1, 16 * M, 'HELD');
    lastYearA = (
      await h.ctx.sql.query<{ id: string }>(
        `SELECT id FROM budget_commitments WHERE cost_center_id = $1 AND amount_minor = $2`,
        [a.department.unitId, 16 * M],
      )
    ).rows[0].id;
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  it('RV3-02: Finance reads every commitment of the year of the review that is still held, whenever it was made (the quarter that runs too): not an expensed one, not one of another year', async () => {
    const page = h.dataOf<PageWire>(await asked({ longTerm: 'true', year: h.year }).expect(200));

    expect(idsOf(page)).toEqual([...oldA, recentA, oldB].sort());
    expect(page.items.every((item) => item.state === 'HELD')).toBe(true);
    expect(page.pagination).toMatchObject({ page: 1, totalItems: 4 });
    // Without the filter nothing is left out: the expensed and the other year are there.
    const all = idsOf(h.dataOf<PageWire>(await asked({}).expect(200)));
    expect(all).toEqual(expect.arrayContaining([expensedA, lastYearA, recentA]));
    expect(idsOf(h.dataOf<PageWire>(await asked({ longTerm: 'false' }).expect(200)))).toContain(expensedA);
    // The year before holds its own.
    expect(idsOf(h.dataOf<PageWire>(await asked({ longTerm: 'true', year: h.year - 1 }).expect(200)))).toEqual([
      lastYearA,
    ]);
  }, 120000);

  it('narrows by Cost Center and year, and by page', async () => {
    const ofA = h.dataOf<PageWire>(
      await asked({ longTerm: 'true', year: h.year, costCenterId: a.department.unitId }).expect(200),
    );
    expect(idsOf(ofA)).toEqual([...oldA, recentA].sort());
    expect(idsOf(h.dataOf<PageWire>(await asked({ longTerm: 'true', year: h.year + 1 }).expect(200)))).toEqual([]);
    const first = h.dataOf<PageWire>(await asked({ longTerm: 'true', year: h.year, pageSize: 3, page: 1 }).expect(200));
    const second = h.dataOf<PageWire>(
      await asked({ longTerm: 'true', year: h.year, pageSize: 3, page: 2 }).expect(200),
    );
    expect(first.items).toHaveLength(3);
    expect(second.items).toHaveLength(1);
    expect(first.pagination).toMatchObject({ totalItems: 4, totalPages: 2 });
    expect(idsOf(first).concat(idsOf(second)).sort()).toEqual([...oldA, recentA, oldB].sort());
  }, 120000);

  it('a head reads only the Cost Centers of the department they head: another Cost Center, asked for by id, is an empty page; an outsider and a spending approver get 403', async () => {
    const mine = h.dataOf<PageWire>(await asked({ longTerm: 'true', year: h.year }, a.head.account).expect(200));
    expect(idsOf(mine)).toEqual([...oldA, recentA].sort());
    expect(
      idsOf(
        h.dataOf<PageWire>(
          await asked({ longTerm: 'true', year: h.year, costCenterId: b.department.unitId }, a.head.account).expect(
            200,
          ),
        ),
      ),
    ).toEqual([]);
    expect(idsOf(h.dataOf<PageWire>(await asked({}, b.head.account).expect(200)))).toEqual([oldB]);
    await asked({ longTerm: 'true', year: h.year }, h.boss.account).expect(403);
    await asked({ longTerm: 'true', year: h.year }, h.bystander.account).expect(403);
  }, 120000);

  it('refuses a query that is not one, and the long-term list without the year of the review', async () => {
    await asked({ longTerm: 'maybe' }).expect(422);
    await asked({ longTerm: 'true' }).expect(422);
    await asked({ longTerm: 'false' }).expect(200);
  }, 120000);
});
