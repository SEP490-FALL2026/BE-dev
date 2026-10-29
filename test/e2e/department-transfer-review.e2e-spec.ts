import type { Department, Person } from '../support/request-harness';
import type { TransferWire } from '../support/transfer-harness';
import { type ReviewItemWire, type ReviewWire, TransferReviewHarness } from '../support/transfer-review-harness';

const h = new TransferReviewHarness();

/**
 * E2E smoke: a person who holds two seats moves from one department to another. The transfer opens the review of their tools for
 * the head of the new department, who keeps one and gives up the other; the IT Admin takes the one given up away. Real HTTP and
 * PostgreSQL.
 */
describe('a transfer between departments and the review of the tools (e2e)', () => {
  let design: Department;
  let finance: Department;
  let oldHead: Person;
  let newHead: Person;
  let mover: Person;
  let kept: string;
  let givenUp: string;
  let transfer: TransferWire;
  let reviewId: string;
  let taskId: string;

  beforeAll(async () => {
    await h.start();
    design = await h.departmentWithUnit('P-DES');
    finance = await h.departmentWithUnit('P-FIN');
    oldHead = await h.veteran(design, 'DES-H1');
    newHead = await h.veteran(finance, 'FIN-H1');
    await h.makeHead(design, oldHead);
    await h.makeHead(finance, newHead);
    // Two subscriptions the department the person leaves owns.
    const notes = await h.subscription(20, 'K2', design.id);
    const canva = await h.subscription(20, 'K2', design.id);
    // The person has been in the department long, and holds a seat of each tool as the seat baseline recorded it.
    mover = await h.veteran(design, 'DES-E1');
    kept = await h.seatOf(mover, { subscriptionId: notes }, 'DES-E1');
    givenUp = await h.seatOf(mover, { subscriptionId: canva }, 'DES-E1');
  }, 180000);

  afterAll(async () => {
    await h.stop();
  });

  it('the Super Admin records the transfer from today: the person is placed in the new department', async () => {
    transfer = await h.moveToday(mover, finance);

    expect(transfer).toMatchObject({
      status: 'EFFECTIVE',
      employee: { id: mover.employeeId },
      from: { department: { id: design.id } },
      to: { department: { id: finance.id } },
      effectiveOn: h.today(),
    });
    const placements = await h.placements(mover.employeeId);
    expect(placements[placements.length - 1]).toMatchObject({ department_id: finance.id, valid_to: null });
  });

  it('the review of the tools is open for the head of the new department, with each seat to decide', async () => {
    const listed = h.dataOf<{ items: ReviewWire[] }>(
      await h.reviews('?pageSize=100', newHead.account).expect(200),
    ).items;
    const review = listed.find((row) => row.employee.id === mover.employeeId);
    reviewId = review?.id ?? '';

    expect(review).toMatchObject({
      origin: 'TRANSFER',
      status: 'OPEN',
      department: { id: finance.id },
      totalItems: 2,
      pendingItems: 2,
      canDecide: true,
    });
    const items = h.dataOf<{ items: ReviewItemWire[] }>(
      await h.reviewItems(reviewId, '?pageSize=100', newHead.account).expect(200),
    ).items;
    expect(items.map((item) => [item.assignmentId, item.decision]).sort()).toEqual(
      [
        [kept, 'PENDING'],
        [givenUp, 'PENDING'],
      ].sort(),
    );
  });

  it('the new head keeps one tool and gives up the other: the review is completed and a revocation opens', async () => {
    await h.decide(reviewId, { assignmentId: kept, decision: 'STILL_NEEDED' }, newHead.account).expect(201);
    const answer = h.dataOf<{ review: ReviewWire; item: ReviewItemWire }>(
      await h.decide(reviewId, { assignmentId: givenUp, decision: 'NOT_NEEDED' }, newHead.account).expect(201),
    );

    expect(answer.review).toMatchObject({ status: 'COMPLETED', pendingItems: 0 });
    expect(answer.item).toMatchObject({ decision: 'NOT_NEEDED', decidedBy: { id: newHead.employeeId } });
    taskId = answer.item.revocationTaskId ?? '';
    expect(await h.taskRow(taskId)).toMatchObject({ kind: 'REVOKE', revocation_source: 'TRANSFER_REVIEW' });
    expect(await h.liveTaskOf(kept)).toBeNull();
  });

  it('the IT Admin removes the account of the tool given up: that seat ends and the one kept stays', async () => {
    // A tool that loses data on removal waits for the head to confirm the handover first.
    for (const duty of await h.dutyRows(givenUp)) {
      await h.confirmDuty(duty.id, { value: 'HANDLED' }, newHead.account).expect(201);
    }
    await h.claim(taskId).expect(200);
    await h.revoked(taskId, { completion: 'ACCOUNT_REMOVED', evidence: 'Removed from the workspace' }).expect(200);

    expect((await h.assignmentRow(givenUp)).valid_until).not.toBeNull();
    expect((await h.assignmentRow(kept)).valid_until).toBeNull();
    expect(await h.auditActions(reviewId)).toEqual([
      'TRANSFER_REVIEW.OPENED',
      'TRANSFER_REVIEW.DECIDED',
      'TRANSFER_REVIEW.DECIDED',
      'TRANSFER_REVIEW.COMPLETED',
    ]);
  });
});
