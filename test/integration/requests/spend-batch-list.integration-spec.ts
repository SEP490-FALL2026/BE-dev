import { SpendHarness, Unit } from '../../support/spend-harness';

const h = new SpendHarness();
const M = 1_000_000;

interface BatchListItem {
  id: string;
  department: { id: string; name: string };
  submittedBy: { employeeId: string };
  submittedAt: string;
  itemCount: number;
  approvedCount: number;
  pendingCount: number;
  approvedAmounts: Record<string, string>;
}

describe('the list of batches Finance reads over PostgreSQL (US-06-14)', () => {
  let plan: string;
  let design: Unit;
  let sales: Unit;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    plan = await h.planOf(await h.subscription(10));
    design = await h.departmentWithHead('P-DES');
    sales = await h.departmentWithHead('P-SAL');
    await h.budgetFor(design, { total: 1000 * M });
    await h.budgetFor(sales, { total: 1000 * M });
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const send = async (unit: Unit, amounts: number[]) => {
    const ids: string[] = [];
    for (const amount of amounts) ids.push(await h.paidRequest(unit, plan, { amount }));
    const batch = h.dataOf<{ batch: { id: string } }>(await h.sendOn(ids, unit.head.account).expect(201)).batch;

    return { ids, batchId: batch.id };
  };
  const list = async (query: Record<string, string | number> = {}) =>
    h.dataOf<{ items: BatchListItem[]; pagination: { totalItems: number } }>(
      await h.batchList(h.finance, { pageSize: 100, ...query }).expect(200),
    );
  const entryOf = async (batchId: string) => (await list()).items.find((item) => item.id === batchId);

  it('counts a batch no one has decided yet as all pending, with no money approved', async () => {
    const { batchId } = await send(design, [10 * M, 10 * M]);

    expect(await entryOf(batchId)).toMatchObject({
      itemCount: 2,
      approvedCount: 0,
      pendingCount: 2,
      approvedAmounts: {},
      department: { id: design.department.id },
    });
  });

  it('counts an approved request with what it was committed for, a refused one in neither, and the rest as pending', async () => {
    const { ids, batchId } = await send(design, [10 * M, 20 * M, 30 * M]);
    await h.decideSpend(ids[0], { decision: 'APPROVE' }, h.boss.account).expect(200);
    await h
      .decideSpend(ids[1], { decision: 'REJECT', reason: 'Postponed to next quarter' }, h.boss.account)
      .expect(200);

    const entry = await entryOf(batchId);

    expect(entry).toMatchObject({ itemCount: 3, approvedCount: 1, pendingCount: 1 });
    expect(Object.keys(entry?.approvedAmounts ?? {})).toEqual([h.reporting]);
    // The commitment of the first request: its cost with the tax that falls on the company, not less than its price.
    const committed = await h.ctx.sql.query<{ amount_minor: string }>(
      `SELECT amount_minor::text FROM budget_commitments WHERE request_id = $1`,
      [ids[0]],
    );
    expect(Number(entry?.approvedAmounts[h.reporting])).toBe(Number(committed.rows[0].amount_minor));
  });

  it('narrows the list by department and keeps the newest batch first', async () => {
    const { batchId: salesBatch } = await send(sales, [5 * M]);
    const { batchId: designBatch } = await send(design, [5 * M]);

    const onlySales = await list({ departmentId: sales.department.id });
    const all = await list();

    expect(onlySales.items.every((item) => item.department.id === sales.department.id)).toBe(true);
    expect(onlySales.items.map((item) => item.id)).toContain(salesBatch);
    expect(onlySales.items.map((item) => item.id)).not.toContain(designBatch);
    const times = all.items.map((item) => Date.parse(item.submittedAt));
    expect(times).toEqual([...times].sort((a, b) => b - a));
    expect(all.pagination.totalItems).toBe(all.items.length);
  });

  it('narrows the list to the batches sent in a window, which includes its start and leaves out its end', async () => {
    const { batchId } = await send(design, [5 * M]);
    const entry = await entryOf(batchId);
    const sentAt = entry?.submittedAt ?? '';

    const from = await list({ submittedFrom: sentAt });
    const until = await list({ submittedTo: sentAt });

    expect(from.items.map((item) => item.id)).toContain(batchId);
    expect(until.items.map((item) => item.id)).not.toContain(batchId);
    await h.batchList(h.finance, { submittedFrom: sentAt, submittedTo: sentAt }).expect(422);
  });

  it('pages the list and counts every batch in the total', async () => {
    const first = await list({ pageSize: 1 });
    const second = await list({ pageSize: 1, page: 2 });

    expect(first.items).toHaveLength(1);
    expect(second.items).toHaveLength(1);
    expect(second.items[0].id).not.toBe(first.items[0].id);
    expect(first.pagination.totalItems).toBe((await list()).items.length);
  });

  it('turns every other role away from the list; the spending approver reads it (FIX-BUDGET 6a)', async () => {
    await h.batchList(design.head.account).expect(403);
    await h.batchList(h.boss.account).expect(200);
    await h.batchList(design.member.account).expect(403);
  });

  describe('reading one batch (US-06-14 AC-1, AC-3)', () => {
    it('lets Finance read any batch and every item of it, which the head of another department still cannot', async () => {
      const { ids, batchId } = await send(design, [5 * M, 6 * M]);

      const batch = h.dataOf<{ batch: { id: string; itemCount: number } }>(
        await h.batchOf(batchId, h.finance).expect(200),
      );
      const items = h.dataOf<{ items: { requestId: string }[] }>(await h.batchItems(batchId, h.finance).expect(200));

      expect(batch.batch).toMatchObject({ id: batchId, itemCount: 2 });
      expect(items.items.map((item) => item.requestId).sort()).toEqual([...ids].sort());
      await h.batchOf(batchId, sales.head.account).expect(404);
      await h.batchItems(batchId, sales.head.account).expect(404);
    });

    it('still answers an unknown batch with 404 for Finance', async () => {
      await h.batchOf('0a1b2c3d-0000-4000-8000-000000000099', h.finance).expect(404);
    });
  });
});
