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
 * The long-term commitments of the quarterly review (`RV-3`, `QĐ-111aj`, US-12-21 AC-8): `GET /budget-commitments?longTerm=true` lists what is still held and was made before the quarter that
 * is running began, by page; Finance reads every Cost Center, a head of a department only the Cost Centers of the departments they head, and everybody else is refused. The review never
 * shortens the term of a request, and the route offers no way to take anything back.
 */
describe('the long-term commitments the quarterly review shows (integration; RV-3.2)', () => {
  let a: Unit;
  let b: Unit;
  let oldA: string[] = [];
  let recentA: string;
  let oldB: string;
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
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  it('Finance reads what is still held and was made before the running quarter: not the commitment of this quarter', async () => {
    const page = h.dataOf<PageWire>(await asked({ longTerm: 'true' }).expect(200));

    expect(idsOf(page)).toEqual([...oldA, oldB].sort());
    expect(page.items.every((item) => item.state === 'HELD')).toBe(true);
    expect(page.pagination).toMatchObject({ page: 1, totalItems: 3 });
    expect(idsOf(h.dataOf<PageWire>(await asked({}).expect(200)))).toContain(recentA);
    expect(idsOf(h.dataOf<PageWire>(await asked({ longTerm: 'false' }).expect(200)))).toContain(recentA);
  }, 120000);

  it('narrows by Cost Center and year, and by page', async () => {
    const ofA = h.dataOf<PageWire>(await asked({ longTerm: 'true', costCenterId: a.department.unitId }).expect(200));
    expect(idsOf(ofA)).toEqual([...oldA].sort());
    expect(idsOf(h.dataOf<PageWire>(await asked({ longTerm: 'true', year: h.year + 1 }).expect(200)))).toEqual([]);
    const first = h.dataOf<PageWire>(await asked({ longTerm: 'true', pageSize: 2, page: 1 }).expect(200));
    const second = h.dataOf<PageWire>(await asked({ longTerm: 'true', pageSize: 2, page: 2 }).expect(200));
    expect(first.items).toHaveLength(2);
    expect(second.items).toHaveLength(1);
    expect(first.pagination).toMatchObject({ totalItems: 3, totalPages: 2 });
    expect(idsOf(first).concat(idsOf(second)).sort()).toEqual([...oldA, oldB].sort());
  }, 120000);

  it('a head reads only the Cost Centers of the department they head: another Cost Center, asked for by id, is an empty page; an outsider and a spending approver get 403', async () => {
    const mine = h.dataOf<PageWire>(await asked({ longTerm: 'true' }, a.head.account).expect(200));
    expect(idsOf(mine)).toEqual([...oldA].sort());
    expect(
      idsOf(
        h.dataOf<PageWire>(
          await asked({ longTerm: 'true', costCenterId: b.department.unitId }, a.head.account).expect(200),
        ),
      ),
    ).toEqual([]);
    expect(idsOf(h.dataOf<PageWire>(await asked({}, b.head.account).expect(200)))).toEqual([oldB]);
    await asked({ longTerm: 'true' }, h.boss.account).expect(403);
    await asked({ longTerm: 'true' }, h.bystander.account).expect(403);
  }, 120000);

  it('refuses a query that is not one', async () => {
    await asked({ longTerm: 'maybe' }).expect(422);
  }, 120000);
});
