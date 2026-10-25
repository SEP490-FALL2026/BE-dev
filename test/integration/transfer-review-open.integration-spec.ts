import { randomUUID } from 'node:crypto';
import { addWorkingDays } from '../../src/core/working-days';
import { TransactionRunner } from '../../src/infrastructure/database/transaction-runner';
import { TransferReviewService } from '../../src/modules/personnel/transfer-review/transfer-review.service';
import type { Department, Person } from '../support/request-harness';
import { TransferReviewHarness, type ReviewItemWire, type ReviewWire } from '../support/transfer-review-harness';

const h = new TransferReviewHarness();
const NO_DAYS: ReadonlySet<string> = new Set();

/** US-03-07 AC-1, AC-2, AC-7, AC-8: when a transfer takes effect the new head is given the tools outside the standard toolset to review. */
describe('opening the review of the tools after a transfer (integration, real PostgreSQL)', () => {
  let des: Department;
  let fin: Department;
  let noHead: Department;
  let h1: Person;
  let h2: Person;
  let excel: string;
  let jira: string;
  let figma: string;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    des = await h.departmentWithUnit('P-DES');
    fin = await h.departmentWithUnit('P-FIN');
    noHead = await h.departmentWithUnit('P-NOH');
    h1 = await h.veteran(des, 'H1-TRO');
    h2 = await h.veteran(fin, 'H2-TRO');
    await h.makeHead(des, h1);
    await h.makeHead(fin, h2);
    excel = await h.subscription(80, 'K2');
    jira = await h.subscription(80, 'K2');
    figma = await h.subscription(80, 'K2');
    await h.setToolset(fin, [await h.planOf(excel), await h.planOf(jira)]);
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  /** A person of P-DES who holds the tools. */
  const holder = async (subscriptions: string[]) => {
    const code = `E-TRO-${(counter += 1)}`;
    const person = await h.veteran(des, code);
    const seats: string[] = [];
    for (const subscriptionId of subscriptions) seats.push(await h.seatOf(person, { subscriptionId }, code));

    return { person, seats };
  };
  const reviewsFor = async (employeeId: string) => h.reviewRows(employeeId);
  const itemsOf = async (id: string) =>
    h.dataOf<{ items: ReviewItemWire[] }>(await h.reviewItems(id).expect(200)).items;

  it('US-03-07 AC-1: E1 moves to P-FIN holding exactly Excel and Jira, the toolset of P-FIN: no review, the head has no work, both seats stay', async () => {
    const { person, seats } = await holder([excel, jira]);

    await h.moveToday(person, fin);

    expect(await reviewsFor(person.employeeId)).toEqual([]);
    const forHead = h.dataOf<{ items: ReviewWire[] }>(
      await h.reviews(`?employeeId=${person.employeeId}`, h2.account).expect(200),
    );
    expect(forHead.items).toEqual([]);
    for (const seat of seats) expect(await h.liveTaskOf(seat)).toBeNull();
    expect((await h.assignmentRow(seats[0])).valid_until).toBeNull();
  });

  it('US-03-07 AC-2: with Figma outside the toolset the head of P-FIN gets one review with Figma alone, due five working days after the day, and nothing is taken away', async () => {
    const { person, seats } = await holder([excel, figma, jira]);

    const transfer = await h.moveToday(person, fin);

    const rows = await reviewsFor(person.employeeId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: 'OPEN',
      department_id: fin.id,
      effective_on: h.today(),
      due_on: addWorkingDays(h.today(), 5, NO_DAYS),
    });
    const items = await h.itemRows(rows[0].id);
    expect(items).toEqual([expect.objectContaining({ assignment_id: seats[1], decision: 'PENDING', position: 1 })]);
    for (const seat of seats) {
      expect(await h.liveTaskOf(seat)).toBeNull();
      expect((await h.assignmentRow(seat)).valid_until).toBeNull();
    }
    expect(await h.auditActions(rows[0].id)).toEqual(['TRANSFER_REVIEW.OPENED']);
    const forHead = h.dataOf<ReviewWire>(await h.review(rows[0].id, h2.account).expect(200));
    expect(forHead).toMatchObject({
      status: 'OPEN',
      totalItems: 1,
      pendingItems: 1,
      waitingReason: null,
      overdue: false,
      canDecide: true,
      reviewer: { id: h2.employeeId },
      transferId: transfer.id,
    });
    expect((await itemsOf(rows[0].id))[0]).toMatchObject({
      assignmentId: seats[1],
      decision: 'PENDING',
      provisioningType: 'K2',
    });
  });

  it('US-03-07 AC-2: a transfer set for a day to come opens the review when the day arrives, from that day', async () => {
    const { person } = await holder([figma]);
    const day = h.day(3);
    await h.recorded({ employeeId: person.employeeId, toDepartmentId: fin.id, effectiveOn: day, grounds: h.grounds });
    expect(await reviewsFor(person.employeeId)).toEqual([]);

    await h.sweepAt(day);

    const rows = await reviewsFor(person.employeeId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ effective_on: day, due_on: addWorkingDays(day, 5, NO_DAYS) });
  });

  it('US-03-07 AC-8: the title changes inside P-DES: no review, the seats stay', async () => {
    const { person, seats } = await holder([figma]);

    await h.moveToday(person, des, { toDepartmentId: undefined, toJobTitleId: await h.jobTitle('Senior Designer') });

    expect(await reviewsFor(person.employeeId)).toEqual([]);
    expect(await h.liveTaskOf(seats[0])).toBeNull();
  });

  it('US-03-07 AC-7: a department with no head gets the review all the same, and nobody may decide until it has one; the deadline stays', async () => {
    const { person, seats } = await holder([figma]);
    await h.moveToday(person, noHead);
    const [row] = await reviewsFor(person.employeeId);
    const waiting = h.dataOf<ReviewWire>(await h.review(row.id).expect(200));
    expect(waiting).toMatchObject({ status: 'OPEN', waitingReason: 'NO_HEAD', canDecide: false, reviewer: null });

    for (const account of [h1.account, h2.account, h.it1]) {
      const refused = await h.decide(row.id, { assignmentId: seats[0], decision: 'STILL_NEEDED' }, account).expect(403);
      expect(h.codeOf(refused)).toBe('TRANSFER_REVIEW.NOT_REVIEWER');
    }
    const h6 = await h.veteran(noHead, 'H6-TRO');
    await h.makeHeadFrom(noHead, h6, h.today());

    const taken = h.dataOf<ReviewWire>(await h.review(row.id, h6.account).expect(200));
    expect(taken).toMatchObject({
      waitingReason: null,
      canDecide: true,
      dueOn: row.due_on,
      reviewer: { id: h6.employeeId },
    });
    expect((await h.reviewRows(person.employeeId))[0].due_on).toBe(row.due_on);
  });

  it('a second department change makes the review that was open obsolete, and judges the tools again against the new department', async () => {
    const { person } = await holder([figma]);
    await h.moveToday(person, fin);
    const [first] = await reviewsFor(person.employeeId);
    const day = h.day(2);
    await h.recorded({ employeeId: person.employeeId, toDepartmentId: des.id, effectiveOn: day, grounds: h.grounds });

    await h.sweepAt(day);

    const rows = await reviewsFor(person.employeeId);
    expect(rows.map((row) => [row.id === first.id, row.status, row.department_id])).toEqual([
      [true, 'SUPERSEDED', fin.id],
      [false, 'OPEN', des.id],
    ]);
    expect(await h.auditActions(first.id)).toEqual(['TRANSFER_REVIEW.OPENED', 'TRANSFER_REVIEW.SUPERSEDED']);
    const [, second] = rows;
    expect(await h.itemRows(second.id)).toHaveLength(1);
  });

  it('the event told twice makes one review: the placement is unique and the second call writes nothing', async () => {
    const { person } = await holder([figma]);
    await h.moveToday(person, fin);
    const [row] = await reviewsFor(person.employeeId);
    const placements = await h.placements(person.employeeId);
    const change = {
      id: randomUUID(),
      kind: 'PLACEMENT_START' as const,
      placementId: row.placement_id,
      employeeId: person.employeeId,
      fromDepartmentId: des.id,
      toDepartmentId: fin.id,
      fromJobTitleId: placements[0].job_title_id,
      toJobTitleId: placements[1].job_title_id,
      effectiveOn: h.today(),
    };

    await h.ctx.app.get(TransactionRunner).run((tx) => h.ctx.app.get(TransferReviewService).openFor(tx, change));
    await h.ctx.app.get(TransactionRunner).run((tx) => h.ctx.app.get(TransferReviewService).openFor(tx, change));

    expect(await reviewsFor(person.employeeId)).toHaveLength(1);
    expect(await h.itemRows(row.id)).toHaveLength(1);
    expect(await h.auditActions(row.id)).toEqual(['TRANSFER_REVIEW.OPENED']);
  });

  it('a seat that is already being taken away is not a tool the new head is asked about', async () => {
    const { person, seats } = await holder([figma, excel]);
    await h.open(seats[0], 'MANAGER_NOT_NEEDED', { decision: { decidedByEmployeeId: h1.employeeId } });

    await h.moveToday(person, noHead);

    const rows = await reviewsFor(person.employeeId);
    expect(rows).toHaveLength(1);
    expect((await h.itemRows(rows[0].id)).map((item) => item.assignment_id)).toEqual([seats[1]]);
  });
});
