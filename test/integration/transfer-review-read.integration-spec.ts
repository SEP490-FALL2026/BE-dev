import type { Department, Person } from '../support/request-harness';
import { PgRelay } from '../support/pg-relay';
import { dataStatements, QueryCounter } from '../support/query-count';
import { TransferReviewHarness, type ReviewItemWire, type ReviewWire } from '../support/transfer-review-harness';

const h = new TransferReviewHarness();

/** What the reviews show to whom (US-03-07 AC-9, AC-12), with a number of statements that does not grow (API-LIST-DETAIL). */
describe('reading the reviews after a transfer (integration, real PostgreSQL)', () => {
  let relay: PgRelay;
  let counter: QueryCounter;
  let des: Department;
  let fin: Department;
  let ops: Department;
  let h1: Person;
  let h2: Person;
  let tools: string[];

  beforeAll(async () => {
    await h.start({
      appDatabaseUrl: async (directUrl) => {
        const url = new URL(directUrl);
        relay = await PgRelay.start(url.hostname, Number(url.port || 5432));
        url.port = String(relay.port);

        return url.toString();
      },
    });
    counter = QueryCounter.on(relay);
    des = await h.departmentWithUnit('P-DES');
    fin = await h.departmentWithUnit('P-FIN');
    ops = await h.departmentWithUnit('P-RDO');
    h1 = await h.veteran(des, 'H1-TRR');
    h2 = await h.veteran(fin, 'H2-TRR');
    await h.makeHead(des, h1);
    await h.makeHead(fin, h2);
    tools = [await h.subscription(80, 'K2'), await h.subscription(80, 'K2'), await h.subscription(80, 'K2')];
  }, 300000);

  afterAll(async () => {
    await h.stop();
    await relay?.stop();
  });

  const page = async (query = '', account = h.it1) =>
    h.dataOf<{
      items: ReviewWire[];
      pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
    }>(await h.reviews(query, account).expect(200));

  it('shows a head the reviews of the department they head today, the IT Admin every review, and anybody else nothing', async () => {
    const toFin = await h.movedWith(des, fin, [{ subscriptionId: tools[0] }]);
    const toOps = await h.movedWith(des, ops, [{ subscriptionId: tools[0] }]);
    const finId = toFin.review?.id ?? '';

    expect((await page('?pageSize=100', h2.account)).items.map((row) => row.id)).toContain(finId);
    expect((await page('?pageSize=100', h2.account)).items.map((row) => row.id)).not.toContain(toOps.review?.id);
    expect((await page('?pageSize=100', h1.account)).items).toEqual([]);
    for (const account of [h.finance, h.employee, toFin.person.account])
      expect((await page('', account)).items).toEqual([]);
    const all = (await page('?pageSize=100')).items.map((row) => row.id);
    expect(all).toEqual(expect.arrayContaining([finId, toOps.review?.id]));

    const forIt = h.dataOf<ReviewWire>(await h.review(finId).expect(200));
    expect(forIt).toMatchObject({ canDecide: false, reviewer: { id: h2.employeeId } });
    for (const account of [h1.account, h.finance, h.employee, toFin.person.account]) {
      expect(h.codeOf(await h.review(finId, account).expect(404))).toBe('TRANSFER_REVIEW.NOT_FOUND');
      expect(h.codeOf(await h.reviewItems(finId, '', account).expect(404))).toBe('TRANSFER_REVIEW.NOT_FOUND');
    }
    await h.review(finId, h2.account).expect(200);
    await h.reviewItems(finId, '', h2.account).expect(200);
  });

  it('keeps a review readable by the head who decided after the department has another head', async () => {
    const dept = await h.departmentWithUnit('P-RDH');
    const first = await h.veteran(dept, 'H-RD-A');
    const second = await h.veteran(dept, 'H-RD-B');
    await h.makeHead(dept, first);
    const { seats, review } = await h.movedWith(des, dept, [
      { subscriptionId: tools[0] },
      { subscriptionId: tools[1] },
    ]);
    await h.decide(review?.id ?? '', { assignmentId: seats[0], decision: 'STILL_NEEDED' }, first.account).expect(201);

    await h.makeHead(dept, second);

    expect(h.dataOf<ReviewWire>(await h.review(review?.id ?? '', first.account).expect(200))).toMatchObject({
      canDecide: false,
      reviewer: { id: second.employeeId },
    });
    expect(h.dataOf<ReviewWire>(await h.review(review?.id ?? '', second.account).expect(200)).canDecide).toBe(true);
    expect((await page('', first.account)).items).toEqual([]);
  });

  it('lists the earliest deadline first, filters by state, department, person and lateness, and pages', async () => {
    const dept = await h.departmentWithUnit('P-RDL');
    const head = await h.veteran(dept, 'H-RD-L');
    await h.makeHead(dept, head);
    const moved = [];
    for (let index = 0; index < 4; index += 1) moved.push(await h.movedWith(des, dept, [{ subscriptionId: tools[0] }]));
    // The second is the latest and the third the earliest; the fourth is completed.
    await h.backdate(moved[1].review?.id ?? '', h.day(10));
    await h.backdate(moved[2].review?.id ?? '', h.day(-3));
    await h
      .decide(moved[3].review?.id ?? '', { assignmentId: moved[3].seats[0], decision: 'STILL_NEEDED' }, head.account)
      .expect(201);

    const mine = await page('?pageSize=100', head.account);

    const dues = mine.items.map((row) => row.dueOn);
    expect([...dues].sort()).toEqual(dues);
    expect(mine.items).toHaveLength(4);
    expect(mine.items[0]).toMatchObject({ id: moved[2].review?.id, overdue: true, overdueDays: 3 });
    expect(mine.items.at(-1)?.id).toBe(moved[1].review?.id);
    const firstPage = await page('?pageSize=3&page=1', head.account);
    const secondPage = await page('?pageSize=3&page=2', head.account);
    expect(firstPage.items).toHaveLength(3);
    expect(firstPage.pagination).toEqual({ page: 1, pageSize: 3, totalItems: 4, totalPages: 2 });
    expect(secondPage.items.map((row) => row.id)).toEqual([mine.items[3].id]);
    expect((await page('?status=COMPLETED', head.account)).items.map((row) => row.id)).toEqual([moved[3].review?.id]);
    expect((await page('?status=OPEN', head.account)).items).toHaveLength(3);
    expect((await page('?status=SUPERSEDED', head.account)).items).toEqual([]);
    expect((await page('?overdue=true', head.account)).items.map((row) => row.id)).toEqual([moved[2].review?.id]);
    expect((await page(`?employeeId=${moved[0].person.employeeId}`)).items.map((row) => row.id)).toEqual([
      moved[0].review?.id,
    ]);
    expect((await page(`?departmentId=${dept.id}&pageSize=100`)).items).toHaveLength(4);
    expect((await page(`?departmentId=${fin.id}&pageSize=100`, head.account)).items).toEqual([]);
    expect(h.codeOf(await h.reviews('?status=DONE').expect(422))).toBe('VALIDATION_ERROR');
    expect(h.codeOf(await h.reviews('?pageSize=101').expect(422))).toBe('VALIDATION_ERROR');
  });

  it('lists the tools of a review in the order they were listed, with the plan and what was decided', async () => {
    const { seats, review } = await h.movedWith(
      des,
      fin,
      tools.map((subscriptionId) => ({ subscriptionId })),
    );
    const reviewId = review?.id ?? '';
    // The lines keep the order the seats came in, which is the one the database gave them.
    const order = (await h.itemRows(reviewId)).map((row) => row.assignment_id);
    expect([...order].sort()).toEqual([...seats].sort());
    await h
      .decide(reviewId, { assignmentId: order[1], decision: 'NEEDS_NEW_TOOL', newToolNote: 'Bản Pro' }, h2.account)
      .expect(201);

    const items = h.dataOf<{ items: ReviewItemWire[]; pagination: { totalItems: number; totalPages: number } }>(
      await h.reviewItems(reviewId, '?pageSize=2', h2.account).expect(200),
    );
    const rest = h.dataOf<{ items: ReviewItemWire[] }>(await h.reviewItems(reviewId, '?pageSize=2&page=2').expect(200));

    expect(items.pagination).toMatchObject({ totalItems: 3, totalPages: 2 });
    expect(items.items.map((item) => item.assignmentId)).toEqual([order[0], order[1]]);
    expect(items.items[1]).toMatchObject({
      decision: 'NEEDS_NEW_TOOL',
      newToolNote: 'Bản Pro',
      decidedBy: { id: h2.employeeId },
      provisioningType: 'K2',
      revocationTaskId: null,
    });
    expect(items.items[0]).toMatchObject({ decision: 'PENDING', decidedBy: null, decidedAt: null });
    expect(rest.items.map((item) => item.assignmentId)).toEqual([order[2]]);
    expect(items.items[0].application.name).toEqual(expect.any(String));
  });

  it('takes the same number of statements for a few reviews and tools as for many, for a head and for the IT Admin', async () => {
    const dept = await h.departmentWithUnit('P-RDC');
    const head = await h.veteran(dept, 'H-RD-C');
    await h.makeHead(dept, head);
    const first = await h.movedWith(des, dept, [{ subscriptionId: tools[0] }]);
    const run = async (id: string) => ({
      listHead: await counter.run(() => h.reviews('?pageSize=100', head.account).expect(200)),
      listIt: await counter.run(() => h.reviews(`?pageSize=100&departmentId=${dept.id}`).expect(200)),
      items: await counter.run(() => h.reviewItems(id, '?pageSize=100', head.account).expect(200)),
      detail: await counter.run(() => h.review(id, head.account).expect(200)),
    });
    const few = await run(first.review?.id ?? '');
    for (let index = 0; index < 3; index += 1)
      await h.movedWith(
        des,
        dept,
        tools.map((subscriptionId) => ({ subscriptionId })),
      );
    const wide = await h.movedWith(
      des,
      dept,
      tools.map((subscriptionId) => ({ subscriptionId })),
    );
    const many = await run(wide.review?.id ?? '');

    const sizeOf = (response: { result: { body: unknown } }) =>
      (response.result.body as { data: { items: unknown[] } }).data.items.length;
    expect(sizeOf(many.listHead)).toBeGreaterThan(sizeOf(few.listHead));
    expect(sizeOf(many.items)).toBeGreaterThan(sizeOf(few.items));
    for (const key of ['listHead', 'listIt', 'items', 'detail'] as const) {
      expect(dataStatements(many[key].statements)).toHaveLength(dataStatements(few[key].statements).length);
    }
  }, 300000);
});
