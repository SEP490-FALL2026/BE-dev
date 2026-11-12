import { randomUUID } from 'node:crypto';
import type { Department, Person } from '../../support/request-harness';
import { TransferReviewHarness, type ReviewItemWire, type ReviewWire } from '../../support/transfer-review-harness';

const h = new TransferReviewHarness();

/** US-03-07 AC-3 to AC-6, AC-9, AC-11 to AC-14, US-07-05 AC-9: the head decides about each tool, once, and nobody else may. */
describe('deciding about the tools of a review after a transfer (integration, real PostgreSQL)', () => {
  let des: Department;
  let fin: Department;
  let h1: Person;
  let h2: Person;
  let figma: string;
  let canva: string;
  let notes: string;
  let portal: string;
  const SAVE = 'Sao lưu tệp thiết kế trước khi gỡ';

  beforeAll(async () => {
    await h.start();
    des = await h.departmentWithUnit('P-DES');
    fin = await h.departmentWithUnit('P-FIN');
    h1 = await h.veteran(des, 'H1-TRD');
    h2 = await h.veteran(fin, 'H2-TRD');
    await h.makeHead(des, h1);
    await h.makeHead(fin, h2);
    figma = await h.subscription(80, 'K2');
    canva = await h.subscription(80, 'K2');
    notes = await h.subscription(80, 'K2');
    portal = await h.plan('K5');
    await h.describePlan(figma, true, SAVE);
    await h.describePlan(canva, false, 'Tên miền riêng sẽ mất liên kết');
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  const say = (reviewId: string, assignmentId: string, decision: string, extra: object = {}, account = h2.account) =>
    h.decide(reviewId, { assignmentId, decision, ...extra }, account);
  const rowOf = async (reviewId: string) => (await h.reviewRows()).find((row) => row.id === reviewId);
  const itemOf = async (reviewId: string, assignmentId: string) =>
    (await h.itemRows(reviewId)).find((item) => item.assignment_id === assignmentId);
  const requests = () => h.count('access_requests');

  it('US-03-07 AC-3: "still needed" leaves the seat as it is, records who decided what and when, and completes the review when no tool waits', async () => {
    const { seats, review } = await h.movedWith(des, fin, [{ subscriptionId: notes }]);
    const reviewId = review?.id ?? '';
    const before = await requests();

    const answer = h.dataOf<{ review: ReviewWire; item: ReviewItemWire }>(
      await say(reviewId, seats[0], 'STILL_NEEDED').expect(201),
    );

    expect(answer.item).toMatchObject({
      assignmentId: seats[0],
      decision: 'STILL_NEEDED',
      decidedBy: { id: h2.employeeId },
      revocationTaskId: null,
    });
    expect(answer.review).toMatchObject({ status: 'COMPLETED', pendingItems: 0, canDecide: false });
    expect(await itemOf(reviewId, seats[0])).toMatchObject({
      decision: 'STILL_NEEDED',
      decided_by_employee_id: h2.employeeId,
    });
    expect((await itemOf(reviewId, seats[0]))?.decided_at).not.toBeNull();
    expect((await rowOf(reviewId))?.completed_at).not.toBeNull();
    expect(await h.liveTaskOf(seats[0])).toBeNull();
    expect((await h.assignmentRow(seats[0])).valid_until).toBeNull();
    expect(await h.auditActions(reviewId)).toEqual([
      'TRANSFER_REVIEW.OPENED',
      'TRANSFER_REVIEW.DECIDED',
      'TRANSFER_REVIEW.COMPLETED',
    ]);
    expect(await requests()).toBe(before);
  });

  it('US-03-07 AC-13: three tools outside, two decided: the third stays open with the same deadline; deciding it completes the review', async () => {
    const { seats, review } = await h.movedWith(des, fin, [
      { subscriptionId: notes },
      { subscriptionId: canva },
      { planId: portal },
    ]);
    const reviewId = review?.id ?? '';

    await say(reviewId, seats[0], 'STILL_NEEDED').expect(201);
    await say(reviewId, seats[1], 'STILL_NEEDED').expect(201);

    expect(await rowOf(reviewId)).toMatchObject({ status: 'OPEN', due_on: review?.due_on });
    const open = h.dataOf<ReviewWire>(await h.review(reviewId, h2.account).expect(200));
    expect(open).toMatchObject({ status: 'OPEN', totalItems: 3, pendingItems: 1, canDecide: true });
    expect(await itemOf(reviewId, seats[2])).toMatchObject({ decision: 'PENDING' });

    await say(reviewId, seats[2], 'STILL_NEEDED').expect(201);

    expect(await rowOf(reviewId)).toMatchObject({ status: 'COMPLETED' });
    // An internal tool (K5) has no Request to ask for: keeping it asks nothing more; a tool outside still waits for the new Request.
    const items = h.dataOf<{ items: ReviewItemWire[] }>(
      await h.reviewItems(reviewId, '?pageSize=10', h2.account).expect(200),
    );
    const byProvisioning = items.items.map((item) => [item.provisioningType, item.decision, item.needsNewRequest]);
    expect(byProvisioning).toContainEqual(['K5', 'STILL_NEEDED', false]);
    expect(byProvisioning).toContainEqual(['K2', 'STILL_NEEDED', true]);
  });

  it('US-03-07 AC-4, US-07-05 AC-9: until the head decides there is no revocation; "no longer needed" for a tool that loses data opens the task for the IT Admin with no handover step (QĐ-110g)', async () => {
    const { seats, review } = await h.movedWith(des, fin, [{ subscriptionId: figma }]);
    const reviewId = review?.id ?? '';
    expect(await h.liveTaskOf(seats[0])).toBeNull();
    expect(await h.count('handover_duties')).toBe(0);

    const answer = h.dataOf<{ item: ReviewItemWire }>(await say(reviewId, seats[0], 'NOT_NEEDED').expect(201));

    const taskId = await h.liveTaskOf(seats[0]);
    expect(taskId).not.toBeNull();
    expect(answer.item).toMatchObject({ decision: 'NOT_NEEDED', revocationTaskId: taskId });
    expect(await h.revocationSourcesOf(seats[0])).toEqual(['TRANSFER_REVIEW']);
    expect(await h.reasonRows(seats[0])).toEqual([
      {
        source: 'TRANSFER_REVIEW',
        decided_by_employee_id: h2.employeeId,
        decided_role: 'DEPARTMENT_HEAD',
        reference_kind: 'TRANSFER_REVIEW',
        reference_id: reviewId,
      },
    ]);
    // No handover is asked for a tool that loses data (QĐ-110g): the task goes to the IT Admin at once.
    expect(await h.count('handover_duties')).toBe(0);
    await h.claim(taskId ?? '').expect(200);
    await h.revoked(taskId ?? '', { completion: 'ACCOUNT_REMOVED', evidence: 'đã xóa' }).expect(200);
    expect(await h.count('handover_duties')).toBe(0);
    expect((await h.assignmentRow(seats[0])).valid_until).not.toBeNull();
  });

  it('US-03-07 AC-14: a plan with a notice that loses no data shows the notice and goes to the IT Admin at once, with no confirmation step', async () => {
    const { seats, review } = await h.movedWith(des, fin, [{ subscriptionId: canva }]);

    await say(review?.id ?? '', seats[0], 'NOT_NEEDED').expect(201);

    const taskId = await h.liveTaskOf(seats[0]);
    expect(await h.count('handover_duties')).toBe(0);
    await h.claim(taskId ?? '').expect(200);
    expect(await h.revocationSourcesOf(seats[0])).toEqual(['TRANSFER_REVIEW']);
  });

  it('US-03-07 AC-11: an internal tool is taken away by hand off the system: a manual task, no subscription or invoice touched', async () => {
    const { seats, review } = await h.movedWith(des, fin, [{ planId: portal }]);
    const subscriptions = await h.count('subscriptions');

    await say(review?.id ?? '', seats[0], 'NOT_NEEDED').expect(201);

    expect(await h.taskRow((await h.liveTaskOf(seats[0])) ?? '')).toMatchObject({
      kind: 'REVOKE',
      channel: 'MANUAL',
      status: 'QUEUED',
      revocation_source: 'TRANSFER_REVIEW',
    });
    expect(await h.count('subscriptions')).toBe(subscriptions);
  });

  it('US-03-07 AC-5, F17: "still needed" is recorded with the reason of the head; no request is made and the seat stays', async () => {
    const { seats, review } = await h.movedWith(des, fin, [{ subscriptionId: notes }]);
    const before = await requests();

    await say(review?.id ?? '', seats[0], 'STILL_NEEDED', { reason: '  Cần bản có SSO  ' }).expect(201);

    expect(await itemOf(review?.id ?? '', seats[0])).toMatchObject({
      decision: 'STILL_NEEDED',
      reason: 'Cần bản có SSO',
      new_tool_note: null,
    });
    expect(await requests()).toBe(before);
    expect(await h.liveTaskOf(seats[0])).toBeNull();
    expect((await h.assignmentRow(seats[0])).valid_until).toBeNull();
  });

  it('refuses a decision that is not one, the retired new tool and its note, and a reason that is missing, blank or too long, and writes nothing', async () => {
    const { seats, review } = await h.movedWith(des, fin, [{ subscriptionId: notes }]);
    const reviewId = review?.id ?? '';

    for (const body of [
      { assignmentId: seats[0], decision: 'PENDING' },
      { assignmentId: seats[0], decision: 'MAYBE' },
      { assignmentId: seats[0], decision: 'STILL_NEEDED', newToolNote: 'why' },
      { assignmentId: seats[0], decision: 'NEEDS_NEW_TOOL' },
      { assignmentId: seats[0], decision: 'NEEDS_NEW_TOOL', newToolNote: 'x' },
      { assignmentId: seats[0], decision: 'STILL_NEEDED', reason: undefined },
      { assignmentId: seats[0], decision: 'STILL_NEEDED', reason: '   ' },
      { assignmentId: seats[0], decision: 'NOT_NEEDED', reason: 'x'.repeat(501) },
      { assignmentId: 'not-a-uuid', decision: 'STILL_NEEDED' },
      { decision: 'STILL_NEEDED' },
    ]) {
      expect(h.codeOf(await h.decide(reviewId, body, h2.account).expect(422))).toBe('VALIDATION_ERROR');
    }
    expect(await itemOf(reviewId, seats[0])).toMatchObject({ decision: 'PENDING' });
  });

  it('US-03-07 AC-9: the head before, the IT Admin, Finance, an employee, the person themselves and the head of another department are refused and nothing changes', async () => {
    const { person, seats, review } = await h.movedWith(des, fin, [{ subscriptionId: notes }]);
    const reviewId = review?.id ?? '';

    for (const account of [h1.account, h.it1, h.finance, h.employee, person.account]) {
      expect(h.codeOf(await say(reviewId, seats[0], 'NOT_NEEDED', {}, account).expect(403))).toBe(
        'TRANSFER_REVIEW.NOT_REVIEWER',
      );
    }

    expect(await itemOf(reviewId, seats[0])).toMatchObject({ decision: 'PENDING', decided_by_employee_id: null });
    expect(await h.liveTaskOf(seats[0])).toBeNull();
    expect(await rowOf(reviewId)).toMatchObject({ status: 'OPEN' });
  });

  it('writes a decision once: a second one for the tool, and a tool that is not in the review, are refused (the one change of "still needed" is in transfer-review-change-of-mind)', async () => {
    const { seats, review } = await h.movedWith(des, fin, [{ subscriptionId: notes }, { subscriptionId: canva }]);
    const other = await h.movedWith(des, fin, [{ subscriptionId: notes }]);
    const reviewId = review?.id ?? '';
    await say(reviewId, seats[0], 'STILL_NEEDED').expect(201);

    expect(h.codeOf(await say(reviewId, seats[0], 'STILL_NEEDED').expect(409))).toBe(
      'TRANSFER_REVIEW.DECISION_ALREADY_RECORDED',
    );
    expect(h.codeOf(await say(reviewId, other.seats[0], 'STILL_NEEDED').expect(404))).toBe(
      'TRANSFER_REVIEW.ITEM_NOT_FOUND',
    );
    expect(h.codeOf(await say(reviewId, randomUUID(), 'STILL_NEEDED').expect(404))).toBe(
      'TRANSFER_REVIEW.ITEM_NOT_FOUND',
    );
    expect(h.codeOf(await say(randomUUID(), seats[0], 'STILL_NEEDED').expect(404))).toBe('TRANSFER_REVIEW.NOT_FOUND');
    expect(await itemOf(reviewId, seats[0])).toMatchObject({ decision: 'STILL_NEEDED' });
    expect(await h.liveTaskOf(seats[0])).toBeNull();
  });

  it('refuses a decision on a review that was completed or replaced, and about a person who has left', async () => {
    const done = await h.movedWith(des, fin, [{ subscriptionId: notes }]);
    await say(done.review?.id ?? '', done.seats[0], 'STILL_NEEDED').expect(201);
    expect(h.codeOf(await say(done.review?.id ?? '', done.seats[0], 'STILL_NEEDED').expect(409))).toBe(
      'TRANSFER_REVIEW.NOT_OPEN',
    );

    const left = await h.movedWith(des, fin, [{ subscriptionId: notes }]);
    await h.ctx.sql.query(`UPDATE employees SET status = 'TERMINATED' WHERE id = $1`, [left.person.employeeId]);
    expect(h.codeOf(await say(left.review?.id ?? '', left.seats[0], 'NOT_NEEDED').expect(409))).toBe(
      'TRANSFER_REVIEW.EMPLOYEE_LEFT',
    );
    expect(await itemOf(left.review?.id ?? '', left.seats[0])).toMatchObject({ decision: 'PENDING' });
    expect(await h.liveTaskOf(left.seats[0])).toBeNull();
  });

  it('refuses "no longer needed" for a kind of tool that cannot be taken away through the system, and records nothing', async () => {
    const { seats, review } = await h.movedWith(des, fin, [{ subscriptionId: notes }]);
    const planId = await h.planOf(notes);
    await h.ctx.sql.query(`UPDATE plans SET provisioning_type = 'K3', pricing_model = NULL WHERE id = $1`, [planId]);
    try {
      expect(h.codeOf(await say(review?.id ?? '', seats[0], 'NOT_NEEDED').expect(409))).toBe(
        'TRANSFER_REVIEW.REVOCATION_NOT_SUPPORTED',
      );
    } finally {
      await h.ctx.sql.query(`UPDATE plans SET provisioning_type = 'K2', pricing_model = 'PER_SEAT' WHERE id = $1`, [
        planId,
      ]);
    }

    expect(await itemOf(review?.id ?? '', seats[0])).toMatchObject({ decision: 'PENDING', revocation_task_id: null });
    expect(await h.liveTaskOf(seats[0])).toBeNull();
    await say(review?.id ?? '', seats[0], 'STILL_NEEDED').expect(201);
  });

  it('US-03-07 AC-6, AC-12: past five working days nothing is taken away, given to another or decided; the list shows it late and one reminder is written; the head may still decide', async () => {
    const { seats, review } = await h.movedWith(des, fin, [{ subscriptionId: notes }, { subscriptionId: canva }]);
    const reviewId = review?.id ?? '';
    await h.backdate(reviewId, h.day(-2));

    const late = h.dataOf<{ items: ReviewWire[] }>(await h.reviews('?overdue=true&pageSize=100').expect(200)).items;
    const row = late.find((item) => item.id === reviewId);
    expect(row).toMatchObject({ overdue: true, overdueDays: 2, pendingItems: 2, status: 'OPEN', canDecide: false });
    expect(row?.employee.id).toBe(review?.employee_id);
    expect(await h.noticeLateReviews()).toBeGreaterThanOrEqual(1);
    expect(await h.noticeLateReviews()).toBe(0);

    expect((await h.auditActions(reviewId)).filter((action) => action === 'TRANSFER_REVIEW.OVERDUE')).toHaveLength(1);
    expect(await rowOf(reviewId)).toMatchObject({ status: 'OPEN' });
    expect((await rowOf(reviewId))?.overdue_noticed_at).not.toBeNull();
    for (const seat of seats) {
      expect(await h.liveTaskOf(seat)).toBeNull();
      expect((await h.assignmentRow(seat)).valid_until).toBeNull();
    }
    await say(reviewId, seats[0], 'STILL_NEEDED').expect(201);
    expect(await itemOf(reviewId, seats[1])).toMatchObject({ decision: 'PENDING' });
  });

  it('OQ-A-17 (a): a late review of a department without a head is not told as late; it is told once the department has a head', async () => {
    const orphan = await h.departmentWithUnit('P-NOH');
    const { person, review } = await h.movedWith(des, orphan, [{ subscriptionId: notes }]);
    const reviewId = review?.id ?? '';
    await h.backdate(reviewId, h.day(-1));

    await h.noticeLateReviews();
    expect((await rowOf(reviewId))?.overdue_noticed_at).toBeNull();
    const waiting = h.dataOf<ReviewWire>(await h.review(reviewId).expect(200));
    expect(waiting).toMatchObject({ overdue: true, waitingReason: 'NO_HEAD' });

    const head = await h.veteran(orphan, 'H6-TRD');
    await h.makeHead(orphan, head);
    await h.noticeLateReviews();

    expect((await rowOf(reviewId))?.overdue_noticed_at).not.toBeNull();
    expect(person.employeeId).toBe(review?.employee_id);
  });
});
