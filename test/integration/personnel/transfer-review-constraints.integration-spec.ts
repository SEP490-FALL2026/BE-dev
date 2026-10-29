import { randomUUID } from 'node:crypto';
import type { Department, Person } from '../../support/request-harness';
import { TransferReviewHarness } from '../../support/transfer-review-harness';

const h = new TransferReviewHarness();

/** What the database refuses about a review after a transfer, whatever the application does (US-03-07). */
describe('what the database refuses about the review after a transfer (integration, real PostgreSQL)', () => {
  let des: Department;
  let fin: Department;
  let h2: Person;
  let tools: string[];

  beforeAll(async () => {
    await h.start();
    des = await h.departmentWithUnit('P-DES');
    fin = await h.departmentWithUnit('P-FIN');
    h2 = await h.veteran(fin, 'H2-TRC');
    await h.makeHead(fin, h2);
    tools = [await h.subscription(80, 'K2'), await h.subscription(80, 'K2')];
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  /** The code and the constraint the database answered with. */
  const refused = async (sql: string, values: unknown[] = []) => {
    try {
      await h.ctx.sql.query(sql, values);
    } catch (error) {
      const { code, constraint } = error as { code?: string; constraint?: string };

      return { code, constraint };
    }

    return null;
  };

  const fresh = async () => {
    const moved = await h.movedWith(des, fin, [{ subscriptionId: tools[0] }, { subscriptionId: tools[1] }]);

    return { ...moved, reviewId: moved.review?.id ?? '' };
  };

  it('keeps one review for a placement, and a line for a seat only once in a review', async () => {
    const { reviewId, review, seats } = await fresh();

    expect(
      await refused(
        `INSERT INTO transfer_reviews (id, organization_id, employee_id, placement_id, department_id, effective_on, due_on)
         SELECT $1, organization_id, employee_id, placement_id, department_id, effective_on, due_on FROM transfer_reviews WHERE id = $2`,
        [randomUUID(), reviewId],
      ),
    ).toMatchObject({ code: '23505', constraint: 'transfer_reviews_placement_id_key' });
    expect(review?.placement_id).toBeDefined();
    expect(
      await refused(
        `INSERT INTO transfer_review_items (review_id, assignment_id, plan_id, position) SELECT review_id, assignment_id, plan_id, 9 FROM transfer_review_items WHERE assignment_id = $1`,
        [seats[0]],
      ),
    ).toMatchObject({ code: '23505' });
  });

  it('keeps the decision, the person who made it and the moment together, and the note and the revocation with their decisions', async () => {
    const { reviewId, seats } = await fresh();
    const update = (set: string, assignmentId = seats[0]) =>
      refused(`UPDATE transfer_review_items SET ${set} WHERE review_id = $1 AND assignment_id = $2`, [
        reviewId,
        assignmentId,
      ]);

    expect(await update(`decision = 'STILL_NEEDED'`)).toMatchObject({
      code: '23514',
      constraint: 'transfer_review_items_decided_together',
    });
    expect(await update(`decision = 'STILL_NEEDED', decided_by_employee_id = '${h2.employeeId}'`)).toMatchObject({
      constraint: 'transfer_review_items_decided_together',
    });
    expect(await update(`decided_by_employee_id = '${h2.employeeId}', decided_at = now()`)).toMatchObject({
      constraint: 'transfer_review_items_decided_together',
    });
    expect(
      await update(
        `decision = 'STILL_NEEDED', decided_by_employee_id = '${h2.employeeId}', decided_at = now(), new_tool_note = 'x'`,
      ),
    ).toMatchObject({ constraint: 'transfer_review_items_note_for_new_tool' });
    expect(
      await update(
        `decision = 'NEEDS_NEW_TOOL', decided_by_employee_id = '${h2.employeeId}', decided_at = now(), new_tool_note = '  '`,
      ),
    ).toMatchObject({ constraint: 'transfer_review_items_note_for_new_tool' });
    expect(
      await update(
        `decision = 'NEEDS_NEW_TOOL', decided_by_employee_id = '${h2.employeeId}', decided_at = now(), new_tool_note = '${'x'.repeat(501)}'`,
      ),
    ).toMatchObject({ constraint: 'transfer_review_items_note_for_new_tool' });
    expect(
      await update(`decision = 'NOT_NEEDED', decided_by_employee_id = '${h2.employeeId}', decided_at = now()`),
    ).toMatchObject({ constraint: 'transfer_review_items_revocation_for_not_needed' });
    expect(
      await refused(
        `UPDATE transfer_review_items SET decision = 'STILL_NEEDED', decided_by_employee_id = $3, decided_at = now() WHERE review_id = $1 AND assignment_id = $2`,
        [reviewId, seats[1], h2.employeeId],
      ),
    ).toBeNull();
  });

  it('never changes a decision once it is written, nor the seat, the plan or the place of a line, and never deletes one', async () => {
    const { reviewId, seats } = await fresh();
    await h.ctx.sql.query(
      `UPDATE transfer_review_items SET decision = 'STILL_NEEDED', decided_by_employee_id = $3, decided_at = now() WHERE review_id = $1 AND assignment_id = $2`,
      [reviewId, seats[0], h2.employeeId],
    );

    const changes = [
      `decision = 'NEEDS_NEW_TOOL', new_tool_note = 'later'`,
      `decided_at = now()`,
      `decided_by_employee_id = NULL, decision = 'PENDING', decided_at = NULL`,
    ];
    for (const set of changes) {
      expect(
        await refused(`UPDATE transfer_review_items SET ${set} WHERE review_id = $1 AND assignment_id = $2`, [
          reviewId,
          seats[0],
        ]),
      ).toMatchObject({ code: '55000', constraint: 'transfer_review_item_decision_final' });
    }
    for (const set of [`position = 7`, `plan_id = '${randomUUID()}'`, `grant_reason = 'another reason'`]) {
      expect(
        await refused(`UPDATE transfer_review_items SET ${set} WHERE review_id = $1 AND assignment_id = $2`, [
          reviewId,
          seats[1],
        ]),
      ).toMatchObject({ code: '55000', constraint: 'transfer_review_item_identity_fixed' });
    }
    expect(await refused(`DELETE FROM transfer_review_items WHERE review_id = $1`, [reviewId])).toMatchObject({
      code: '55000',
      constraint: 'transfer_review_item_kept',
    });
  });

  it('keeps the person, the department and the deadline of a review, ends it once and never deletes it', async () => {
    const { reviewId } = await fresh();

    for (const set of [
      `due_on = due_on + 1`,
      `department_id = '${des.id}'`,
      `employee_id = '${h2.employeeId}'`,
      `effective_on = effective_on - 1`,
    ]) {
      expect(await refused(`UPDATE transfer_reviews SET ${set} WHERE id = $1`, [reviewId])).toMatchObject({
        code: '55000',
        constraint: 'transfer_review_identity_fixed',
      });
    }
    expect(await refused(`UPDATE transfer_reviews SET status = 'COMPLETED' WHERE id = $1`, [reviewId])).toMatchObject({
      code: '23514',
      constraint: 'transfer_reviews_completed_together',
    });
    expect(await refused(`UPDATE transfer_reviews SET status = 'SUPERSEDED' WHERE id = $1`, [reviewId])).toBeNull();
    expect(await refused(`UPDATE transfer_reviews SET status = 'OPEN' WHERE id = $1`, [reviewId])).toMatchObject({
      code: '55000',
      constraint: 'transfer_review_status_final',
    });
    expect(await refused(`DELETE FROM transfer_reviews WHERE id = $1`, [reviewId])).toMatchObject({
      code: '55000',
      constraint: 'transfer_review_kept',
    });
  });
});
