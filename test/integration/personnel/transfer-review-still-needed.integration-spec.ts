import { randomUUID } from 'node:crypto';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import type { SeatBaselineClosedEvent } from '../../../src/modules/licensing/public/licensing.extension-points';
import type { RequestOutcomeEvent } from '../../../src/modules/requests/public/requests.extension-points';
import { PostSetupReviewService } from '../../../src/modules/personnel/transfer-review/post-setup-review.service';
import { TransferReviewReplacementService } from '../../../src/modules/personnel/transfer-review/transfer-review-replacement.service';
import type { Department, Person } from '../../support/request-harness';
import { TransferReviewHarness, type ReviewItemWire, type ReviewWire } from '../../support/transfer-review-harness';

const h = new TransferReviewHarness();

/**
 * `g0-g6-final-business-baseline-remediation`, Task 5.3 (F43, F21, F29, QĐ-89e; US-03-07): what becomes of a tool the new head said is
 * "still needed", and the review that follows the installation. Nothing is revoked by the decision itself: the old seat goes only when
 * a Request of the department the person is in now ends for the same plan; the listeners are called in the transaction that ends the
 * Request or closes the seat baseline, so none of it is left half done.
 */
describe('the review of tools: "still needed" and the review after the setup (integration, real PostgreSQL)', () => {
  let des: Department;
  let fin: Department;
  let h2: Person;
  let sequence = 0;

  beforeAll(async () => {
    await h.start();
    des = await h.departmentWithUnit('P-DES');
    fin = await h.departmentWithUnit('P-FIN');
    const h1 = await h.veteran(des, 'H1-SN');
    h2 = await h.veteran(fin, 'H2-SN');
    await h.makeHead(des, h1);
    await h.makeHead(fin, h2);
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  const replacement = () => h.ctx.app.get(TransferReviewReplacementService, { strict: false });
  const postSetup = () => h.ctx.app.get(PostSetupReviewService, { strict: false });
  const inTransaction = <T>(work: Parameters<TransactionRunner['run']>[0]): Promise<T> =>
    h.ctx.app.get(TransactionRunner, { strict: false }).run(work) as Promise<T>;
  const outcomeOf = (
    person: Person,
    planId: string | null,
    patch: Partial<RequestOutcomeEvent> = {},
  ): RequestOutcomeEvent => ({
    organizationId: h.seed.organizationId,
    requestId: randomUUID(),
    departmentId: fin.id,
    planId,
    beneficiaryEmployeeIds: [person.employeeId],
    outcome: 'GRANTED',
    endedOn: h.today(),
    ...patch,
  });
  const hear = (event: RequestOutcomeEvent) => inTransaction((tx) => replacement().requestOutcome(tx, event));
  const stillNeeded = async () => {
    const subscription = await h.subscription(80, 'K2');
    const { person, seats, review } = await h.movedWith(des, fin, [{ subscriptionId: subscription }]);
    const reviewId = review?.id ?? '';
    const answer = h.dataOf<{ review: ReviewWire; item: ReviewItemWire }>(
      await h.decide(reviewId, { assignmentId: seats[0], decision: 'STILL_NEEDED' }, h2.account).expect(201),
    );
    const planId = (await h.itemRows(reviewId))[0].plan_id;

    return { person, seat: seats[0], reviewId, planId: planId ?? '', answer };
  };

  describe('the decision "still needed" (F43)', () => {
    it('says the tool needs a new Request of the new department and that nothing is revoked: origin TRANSFER, needsNewRequest true, the seat untouched', async () => {
      const { seat, reviewId, answer } = await stillNeeded();

      expect(answer.item).toMatchObject({ decision: 'STILL_NEEDED', needsNewRequest: true, revocationTaskId: null });
      expect(answer.review).toMatchObject({ origin: 'TRANSFER', status: 'COMPLETED' });
      expect(await h.liveTaskOf(seat)).toBeNull();
      expect(await h.revocationSourcesOf(seat)).toEqual([]);
      expect((await h.assignmentRow(seat)).valid_until).toBeNull();
      const read = h.dataOf<ReviewWire>(await h.review(reviewId, h2.account).expect(200));
      expect(read.unfinishedRequests).toEqual([]);
    });
  });

  describe('the old seat goes when a Request of the new department for the same plan ends (T-6)', () => {
    it('opens one revocation of the old seat in the name of the head who decided, with the review as its reference, and again changes nothing', async () => {
      const { person, seat, reviewId, planId } = await stillNeeded();

      await hear(outcomeOf(person, planId));
      await hear(outcomeOf(person, planId));

      expect(await h.revocationSourcesOf(seat)).toEqual(['TRANSFER_REVIEW']);
      expect(await h.reasonRows(seat)).toEqual([
        {
          source: 'TRANSFER_REVIEW',
          decided_by_employee_id: h2.employeeId,
          decided_role: 'DEPARTMENT_HEAD',
          reference_kind: 'TRANSFER_REVIEW',
          reference_id: reviewId,
        },
      ]);
      expect(await h.auditActions(reviewId)).toContain('TRANSFER_REVIEW.OLD_SEAT_REVOCATION_OPENED');
    });

    it('does nothing for a Request of another department, for software outside the catalog, for another plan, or for a tool nobody said was still needed', async () => {
      const { person, seat, planId } = await stillNeeded();
      const other = await h.movedWith(des, fin, [{ subscriptionId: await h.subscription(80, 'K2') }]);

      await hear(outcomeOf(person, planId, { departmentId: des.id }));
      await hear(outcomeOf(person, null));
      await hear(outcomeOf(person, randomUUID()));
      await hear(outcomeOf(other.person, planId));
      await hear(
        outcomeOf(person, planId, {
          outcome: 'ENDED_WITHOUT_GRANT',
          beneficiaryEmployeeIds: [other.person.employeeId],
        }),
      );

      expect(await h.revocationSourcesOf(seat)).toEqual([]);
      expect(await h.revocationSourcesOf(other.seats[0])).toEqual([]);
    });

    it('revokes the old seat as well when the Request ended without a grant: nothing came to replace it', async () => {
      const { person, seat, planId } = await stillNeeded();

      await hear(outcomeOf(person, planId, { outcome: 'ENDED_WITHOUT_GRANT' }));

      expect(await h.revocationSourcesOf(seat)).toEqual(['TRANSFER_REVIEW']);
    });

    describe('what the line says once the Request ended (needsNewRequest)', () => {
      const lineOf = async (reviewId: string): Promise<ReviewItemWire> =>
        h.dataOf<{ items: ReviewItemWire[] }>(await h.reviewItems(reviewId, '', h2.account).expect(200)).items[0];

      it('stops asking for a new Request when the Request ended and the old seat is being taken back: the line stays "still needed" and carries no task', async () => {
        const { person, seat, reviewId, planId } = await stillNeeded();
        expect(await lineOf(reviewId)).toMatchObject({ decision: 'STILL_NEEDED', needsNewRequest: true });

        await hear(outcomeOf(person, planId, { outcome: 'ENDED_WITHOUT_GRANT' }));

        expect(await h.revocationSourcesOf(seat)).toEqual(['TRANSFER_REVIEW']);
        expect(await lineOf(reviewId)).toMatchObject({
          decision: 'STILL_NEEDED',
          needsNewRequest: false,
          revocationTaskId: null,
        });
      });

      it('goes on asking while a Request of the new department has not ended, and when only another source asked for the revocation of the seat', async () => {
        const { seat, reviewId } = await stillNeeded();

        await h.open(seat, 'MANAGER_NOT_NEEDED', { decision: { decidedByEmployeeId: h2.employeeId } });

        expect(await h.liveTaskOf(seat)).not.toBeNull();
        expect(await lineOf(reviewId)).toMatchObject({ decision: 'STILL_NEEDED', needsNewRequest: true });
      });

      it('says the same on the decision answer as on the list of lines, and a line decided as "no longer needed" never asks for a new Request', async () => {
        const subscription = await h.subscription(80, 'K2');
        const { seats, review } = await h.movedWith(des, fin, [{ subscriptionId: subscription }]);
        const reviewId = review?.id ?? '';

        const answer = h.dataOf<{ item: ReviewItemWire }>(
          await h.decide(reviewId, { assignmentId: seats[0], decision: 'NOT_NEEDED' }, h2.account).expect(201),
        );

        expect(answer.item).toMatchObject({ decision: 'NOT_NEEDED', needsNewRequest: false });
        expect((await lineOf(reviewId)).needsNewRequest).toBe(false);
      });
    });

    it('is undone with the outcome when the listener fails: the Request that ended and its revocation are one transaction', async () => {
      const { person, seat, planId } = await stillNeeded();

      await expect(
        inTransaction(async (tx) => {
          await replacement().requestOutcome(tx, outcomeOf(person, planId));
          throw new Error('the outcome of the Request failed after the listener ran');
        }),
      ).rejects.toThrow('the outcome of the Request failed');

      expect(await h.revocationSourcesOf(seat)).toEqual([]);
    });
  });

  describe('the review after the setup (F21, QĐ-89e)', () => {
    const closing = async (own: boolean) => {
      const code = `PS-${(sequence += 1)}`;
      const holder = await h.veteran(fin, code);
      const seat = await h.seatOf(holder, { subscriptionId: await h.subscription(80, 'K2') }, code);
      const event: SeatBaselineClosedEvent = {
        organizationId: h.seed.organizationId,
        closedOn: h.today(),
        holders: [
          {
            employeeId: holder.employeeId,
            employeeDepartmentId: fin.id,
            assignments: [{ assignmentId: seat, owningDepartmentId: own ? fin.id : des.id }],
          },
        ],
      };

      return { holder, seat, event };
    };
    const close = (event: SeatBaselineClosedEvent) => inTransaction((tx) => postSetup().baselineClosed(tx, event));

    it("opens a review with no transfer behind it for a person who holds a seat of another department, decided by the head of the holder's department", async () => {
      const { holder, seat, event } = await closing(false);

      await close(event);

      const [review] = await h.reviewRows(holder.employeeId);
      expect(review).toMatchObject({
        transfer_id: null,
        department_id: fin.id,
        status: 'OPEN',
        effective_on: h.today(),
      });
      expect((await h.itemRows(review.id)).map((item) => item.assignment_id)).toEqual([seat]);
      const read = h.dataOf<ReviewWire>(await h.review(review.id, h2.account).expect(200));
      expect(read).toMatchObject({ origin: 'POST_SETUP', canDecide: true });
      expect(await h.auditActions(review.id)).toEqual(['TRANSFER_REVIEW.OPENED']);
    });

    it("opens no second review for the same placement when it is told twice, and none for a seat of the holder's own department", async () => {
      const foreign = await closing(false);
      const own = await closing(true);

      await close(foreign.event);
      await close(foreign.event);
      await close(own.event);

      expect(await h.reviewRows(foreign.holder.employeeId)).toHaveLength(1);
      expect(await h.reviewRows(own.holder.employeeId)).toEqual([]);
    });

    it('revokes nothing by itself; a tool the head says is not needed opens a revocation whose source is the review after the setup', async () => {
      const { holder, seat, event } = await closing(false);
      await close(event);
      const [review] = await h.reviewRows(holder.employeeId);

      expect(await h.revocationSourcesOf(seat)).toEqual([]);
      await h.decide(review.id, { assignmentId: seat, decision: 'NOT_NEEDED' }, h2.account).expect(201);

      expect(await h.revocationSourcesOf(seat)).toEqual(['POST_SETUP_REVIEW']);
    });
  });
});
