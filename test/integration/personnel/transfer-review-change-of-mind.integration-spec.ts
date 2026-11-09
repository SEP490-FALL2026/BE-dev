import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import type request from 'supertest';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { TransferReviewReplacementService } from '../../../src/modules/personnel/transfer-review/transfer-review-replacement.service';
import type { RequestOutcomeEvent } from '../../../src/modules/requests/public/requests.extension-points';
import { waitForLockWaiters } from '../../support/lock-wait';
import type { Department, Person } from '../../support/request-harness';
import { TransferReviewHarness, type ReviewItemWire, type ReviewWire } from '../../support/transfer-review-harness';

const h = new TransferReviewHarness();

/**
 * `g0-g6-final-business-baseline-remediation`, spec G, F43, T-6 (migration `20261029100900_transfer_review_change_of_mind`): the head
 * who said a tool is "still needed" may say "no longer needed" through the same route until the old seat is on its way back. It opens
 * the revocation exactly as a first "no longer needed" does and the Audit Trail keeps the earlier decision; every other change, and
 * a change once the revocation of the review exists, is refused as a decision that is final; the seat is taken back once, whichever
 * of the head and the new Request comes first.
 */
describe('the head changes their mind about a tool that is still needed (integration, real PostgreSQL)', () => {
  let des: Department;
  let fin: Department;
  let h1: Person;
  let h2: Person;

  beforeAll(async () => {
    await h.start();
    des = await h.departmentWithUnit('P-DES');
    fin = await h.departmentWithUnit('P-FIN');
    h1 = await h.veteran(des, 'H1-CM');
    h2 = await h.veteran(fin, 'H2-CM');
    await h.makeHead(des, h1);
    await h.makeHead(fin, h2);
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  const say = (reviewId: string, assignmentId: string, decision: string, extra: object = {}, account = h2.account) =>
    h.decide(reviewId, { assignmentId, decision, ...extra }, account);
  const itemOf = async (reviewId: string, assignmentId: string) =>
    (await h.itemRows(reviewId)).find((item) => item.assignment_id === assignmentId);
  const replacement = () => h.ctx.app.get(TransferReviewReplacementService, { strict: false });
  const hear = (event: RequestOutcomeEvent) =>
    h.ctx.app.get(TransactionRunner, { strict: false }).run((tx) => replacement().requestOutcome(tx, event));
  const outcomeOf = (person: Person, planId: string): RequestOutcomeEvent => ({
    organizationId: h.seed.organizationId,
    requestId: randomUUID(),
    departmentId: fin.id,
    planId,
    beneficiaryEmployeeIds: [person.employeeId],
    outcome: 'GRANTED',
    endedOn: h.today(),
  });

  /** A person moved to the head's department with `tools` seats; the first is said to be "still needed". */
  const stillNeeded = async (tools = 1) => {
    const subscriptions: { subscriptionId: string }[] = [];
    for (let index = 0; index < tools; index += 1)
      subscriptions.push({ subscriptionId: await h.subscription(80, 'K2') });
    const { person, seats, review } = await h.movedWith(des, fin, subscriptions);
    const reviewId = review?.id ?? '';
    await say(reviewId, seats[0], 'STILL_NEEDED').expect(201);
    const planId = (await itemOf(reviewId, seats[0]))?.plan_id ?? '';

    return { person, seats, reviewId, planId };
  };

  describe('the change', () => {
    it('opens the revocation as a first "no longer needed" does: one task, in the name of the head, with the review as its reference', async () => {
      const { seats, reviewId } = await stillNeeded();
      expect(await h.liveTaskOf(seats[0])).toBeNull();

      const answer = h.dataOf<{ review: ReviewWire; item: ReviewItemWire }>(
        await say(reviewId, seats[0], 'NOT_NEEDED').expect(201),
      );

      const taskId = await h.liveTaskOf(seats[0]);
      expect(taskId).not.toBeNull();
      expect(answer.item).toMatchObject({
        assignmentId: seats[0],
        decision: 'NOT_NEEDED',
        needsNewRequest: false,
        decidedBy: { id: h2.employeeId },
        revocationTaskId: taskId,
      });
      expect(await itemOf(reviewId, seats[0])).toMatchObject({
        decision: 'NOT_NEEDED',
        decided_by_employee_id: h2.employeeId,
        revocation_task_id: taskId,
      });
      expect(await h.reasonRows(seats[0])).toEqual([
        {
          source: 'TRANSFER_REVIEW',
          decided_by_employee_id: h2.employeeId,
          decided_role: 'DEPARTMENT_HEAD',
          reference_kind: 'TRANSFER_REVIEW',
          reference_id: reviewId,
        },
      ]);
    });

    it('keeps the earlier decision in the Audit Trail, and does not complete the review a second time', async () => {
      const { seats, reviewId } = await stillNeeded();

      await say(reviewId, seats[0], 'NOT_NEEDED').expect(201);

      const changed = await h.auditEventsOf('TRANSFER_REVIEW.DECISION_CHANGED', reviewId);
      expect(changed).toHaveLength(1);
      expect(changed[0].before).toEqual({ decision: 'STILL_NEEDED', reason: 'Cần để tiếp tục công việc' });
      expect(changed[0].after).toMatchObject({
        assignmentId: seats[0],
        decision: 'NOT_NEEDED',
        decidedByEmployeeId: h2.employeeId,
      });
      const actions = await h.auditActions(reviewId);
      expect(actions.filter((action) => action === 'TRANSFER_REVIEW.COMPLETED')).toHaveLength(1);
      expect(actions.filter((action) => action === 'TRANSFER_REVIEW.DECIDED')).toHaveLength(1);
    });

    it('works on a review that is still open as well: the other tool keeps waiting', async () => {
      const { seats, reviewId } = await stillNeeded(2);

      await say(reviewId, seats[0], 'NOT_NEEDED').expect(201);

      expect(await itemOf(reviewId, seats[0])).toMatchObject({ decision: 'NOT_NEEDED' });
      expect(await itemOf(reviewId, seats[1])).toMatchObject({ decision: 'PENDING' });
      expect(await h.liveTaskOf(seats[1])).toBeNull();
    });

    it('is refused for anyone but the head of the department today', async () => {
      const { seats, reviewId } = await stillNeeded();

      for (const account of [h1.account, h.it1, h.finance]) {
        expect(h.codeOf(await say(reviewId, seats[0], 'NOT_NEEDED', {}, account).expect(403))).toBe(
          'TRANSFER_REVIEW.NOT_REVIEWER',
        );
      }

      expect(await itemOf(reviewId, seats[0])).toMatchObject({ decision: 'STILL_NEEDED', revocation_task_id: null });
      expect(await h.liveTaskOf(seats[0])).toBeNull();
    });

    it('is refused when the kind of tool cannot be taken away through the system, and the tool stays "still needed"', async () => {
      const { seats, reviewId } = await stillNeeded();
      const planId = (await itemOf(reviewId, seats[0]))?.plan_id ?? '';
      await h.ctx.sql.query(`UPDATE plans SET provisioning_type = 'K3', pricing_model = NULL WHERE id = $1`, [planId]);
      try {
        expect(h.codeOf(await say(reviewId, seats[0], 'NOT_NEEDED').expect(409))).toBe(
          'TRANSFER_REVIEW.REVOCATION_NOT_SUPPORTED',
        );
      } finally {
        await h.ctx.sql.query(`UPDATE plans SET provisioning_type = 'K2', pricing_model = 'PER_SEAT' WHERE id = $1`, [
          planId,
        ]);
      }

      expect(await itemOf(reviewId, seats[0])).toMatchObject({ decision: 'STILL_NEEDED', revocation_task_id: null });
      expect(await h.auditEventsOf('TRANSFER_REVIEW.DECISION_CHANGED', reviewId)).toEqual([]);
    });
  });

  describe('what can no longer change', () => {
    it('refuses a second change, and every other change of a decided tool, as a decision that is final', async () => {
      const { seats, reviewId } = await stillNeeded(3);
      await say(reviewId, seats[0], 'NOT_NEEDED').expect(201);
      await h.legacyNewTool(reviewId, seats[1], h2.employeeId, 'A bigger plan');
      const refused = async (assignmentId: string, decision: string, extra: object = {}) =>
        h.codeOf(await say(reviewId, assignmentId, decision, extra).expect(409));

      expect(await refused(seats[0], 'NOT_NEEDED')).toBe('TRANSFER_REVIEW.DECISION_ALREADY_RECORDED');
      expect(await refused(seats[0], 'STILL_NEEDED')).toBe('TRANSFER_REVIEW.DECISION_ALREADY_RECORDED');
      expect(await refused(seats[1], 'NOT_NEEDED')).toBe('TRANSFER_REVIEW.DECISION_ALREADY_RECORDED');
      expect(await refused(seats[1], 'STILL_NEEDED')).toBe('TRANSFER_REVIEW.DECISION_ALREADY_RECORDED');

      expect(await itemOf(reviewId, seats[0])).toMatchObject({ decision: 'NOT_NEEDED' });
      expect(await itemOf(reviewId, seats[1])).toMatchObject({ decision: 'NEEDS_NEW_TOOL', revocation_task_id: null });
      expect(await h.revocationSourcesOf(seats[0])).toEqual(['TRANSFER_REVIEW']);
      expect(await h.liveTaskOf(seats[1])).toBeNull();
    });

    it('refuses "still needed" again, leaving the tool as it was', async () => {
      const { seats, reviewId } = await stillNeeded(2);

      expect(h.codeOf(await say(reviewId, seats[0], 'STILL_NEEDED').expect(409))).toBe(
        'TRANSFER_REVIEW.DECISION_ALREADY_RECORDED',
      );

      expect(await itemOf(reviewId, seats[0])).toMatchObject({ decision: 'STILL_NEEDED', revocation_task_id: null });
      expect(await h.auditEventsOf('TRANSFER_REVIEW.DECISION_CHANGED', reviewId)).toEqual([]);
    });

    it('a review that is complete answers a second attempt as a review that is not open, as it always did', async () => {
      const { seats, reviewId } = await stillNeeded(1);
      await say(reviewId, seats[0], 'NOT_NEEDED').expect(201);

      expect(h.codeOf(await say(reviewId, seats[0], 'NOT_NEEDED').expect(409))).toBe('TRANSFER_REVIEW.NOT_OPEN');
      expect(h.codeOf(await say(reviewId, seats[0], 'STILL_NEEDED').expect(409))).toBe('TRANSFER_REVIEW.NOT_OPEN');
    });

    it('the database holds the same line: only "still needed" to "no longer needed", and that move still needs its revocation task', async () => {
      const { seats, reviewId } = await stillNeeded(1);
      const sqlState = async (statement: string, values: unknown[]) => {
        try {
          await h.ctx.sql.query(statement, values);
        } catch (error) {
          return (error as { code?: string }).code ?? 'other';
        }

        return 'ok';
      };
      const update = (decision: string) =>
        sqlState(
          `UPDATE transfer_review_items SET decision = $1::"TransferReviewDecision" WHERE review_id = $2 AND assignment_id = $3`,
          [decision, reviewId, seats[0]],
        );

      expect(await update('NEEDS_NEW_TOOL')).toBe('55000');
      expect(await update('STILL_NEEDED')).toBe('55000');
      // The move itself passes the guard; without the task of the revocation the line is not whole (decision and task come together).
      expect(await update('NOT_NEEDED')).toBe('23514');
      await say(reviewId, seats[0], 'NOT_NEEDED').expect(201);
      expect(await update('STILL_NEEDED')).toBe('55000');
      expect(await update('NEEDS_NEW_TOOL')).toBe('55000');
    });
  });

  describe('the old seat is taken back once (T-6)', () => {
    it('refuses the change once the new Request ended and asked for the old seat back: the revocation of the review exists', async () => {
      const { person, seats, reviewId, planId } = await stillNeeded();
      await hear(outcomeOf(person, planId));
      const task = await h.liveTaskOf(seats[0]);
      expect(task).not.toBeNull();

      const response = await say(reviewId, seats[0], 'NOT_NEEDED').expect(409);

      expect(h.codeOf(response)).toBe('TRANSFER_REVIEW.DECISION_ALREADY_RECORDED');
      expect(await itemOf(reviewId, seats[0])).toMatchObject({ decision: 'STILL_NEEDED', revocation_task_id: null });
      expect(await h.revocationSourcesOf(seats[0])).toEqual(['TRANSFER_REVIEW']);
      expect(await h.liveTaskOf(seats[0])).toBe(task);
      expect(await h.auditEventsOf('TRANSFER_REVIEW.DECISION_CHANGED', reviewId)).toEqual([]);
    });

    it('does not revoke again when the new Request ends after the change: one task, one reason, no second ask', async () => {
      const { person, seats, reviewId, planId } = await stillNeeded();
      await say(reviewId, seats[0], 'NOT_NEEDED').expect(201);
      const task = await h.liveTaskOf(seats[0]);

      await hear(outcomeOf(person, planId));
      await hear(outcomeOf(person, planId));

      expect(await h.liveTaskOf(seats[0])).toBe(task);
      expect(await h.reasonRows(seats[0])).toHaveLength(1);
      expect(await h.auditActions(reviewId)).not.toContain('TRANSFER_REVIEW.OLD_SEAT_REVOCATION_OPENED');
    });

    it('is the same whichever comes first when both meet: one revocation, and the head is told it is done or that it is final', async () => {
      const { person, seats, reviewId, planId } = await stillNeeded();
      const holder = new Client({ connectionString: h.ctx.database.url });
      await holder.connect();
      await holder.query('BEGIN');
      await holder.query(
        `SELECT 1 FROM subscriptions WHERE id = (SELECT subscription_id FROM license_assignments WHERE id = $1) FOR UPDATE`,
        [seats[0]],
      );
      let change: Promise<request.Response>;
      let heard: Promise<void>;
      try {
        change = Promise.resolve(say(reviewId, seats[0], 'NOT_NEEDED'));
        await waitForLockWaiters(h.ctx.sql, 1);
        heard = hear(outcomeOf(person, planId));
        await waitForLockWaiters(h.ctx.sql, 2);
      } finally {
        await holder.query('COMMIT');
        await holder.end();
      }
      const [answer] = await Promise.all([change, heard]);

      const line = await itemOf(reviewId, seats[0]);
      const outcome = [answer.status, line?.decision];
      // The head first: the change is recorded and the Request finds the revocation of the review there. The Request first: it
      // revoked the old seat, and the head's change is refused as final and writes nothing.
      expect([
        [201, 'NOT_NEEDED'],
        [409, 'STILL_NEEDED'],
      ]).toContainEqual(outcome);
      if (answer.status === 409) expect(h.codeOf(answer)).toBe('TRANSFER_REVIEW.DECISION_ALREADY_RECORDED');
      expect(await h.revocationSourcesOf(seats[0])).toEqual(['TRANSFER_REVIEW']);
      expect(await h.reasonRows(seats[0])).toHaveLength(1);
    });

    it('two calls of the head at once change the mind once: one is recorded, the other is final, one revocation', async () => {
      const { seats, reviewId } = await stillNeeded(2);
      const holder = new Client({ connectionString: h.ctx.database.url });
      await holder.connect();
      await holder.query('BEGIN');
      await holder.query(`SELECT 1 FROM transfer_reviews WHERE id = $1 FOR UPDATE`, [reviewId]);
      const queued: Array<Promise<request.Response>> = [];
      try {
        queued.push(Promise.resolve(say(reviewId, seats[0], 'NOT_NEEDED')));
        await waitForLockWaiters(h.ctx.sql, 1);
        queued.push(Promise.resolve(say(reviewId, seats[0], 'NOT_NEEDED')));
        await waitForLockWaiters(h.ctx.sql, 2);
      } finally {
        await holder.query('COMMIT');
        await holder.end();
      }
      const responses = await Promise.all(queued);

      expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
      const refusal = responses.find((response) => response.status === 409);
      expect(refusal && h.codeOf(refusal)).toBe('TRANSFER_REVIEW.DECISION_ALREADY_RECORDED');
      expect(await h.revocationSourcesOf(seats[0])).toEqual(['TRANSFER_REVIEW']);
      expect(await h.auditEventsOf('TRANSFER_REVIEW.DECISION_CHANGED', reviewId)).toHaveLength(1);
    });
  });
});
