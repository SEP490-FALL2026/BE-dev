import { ReturnHarness, type ReturnWire } from '../support/return-harness';
import type { Unit } from '../support/spend-harness';

const h = new ReturnHarness();
const NOTE = 'Export the boards before the seat is taken away';

describe('the return of a seat over PostgreSQL (US-05-13)', () => {
  /** A plan whose removal loses data (a K2 seat, as Figma), one with only a note (K1, as Canva), one with neither. */
  let lossy: { subscriptionId: string; planId: string };
  let noted: { subscriptionId: string; planId: string };
  let plain: { subscriptionId: string; planId: string };
  let internalPlan: string;
  let counter = 0;

  const subscriptionOf = async (type: 'K1' | 'K2', note: string | null, dataLoss: boolean) => {
    const subscriptionId = await h.subscription(10, type);
    const planId = await h.planOf(subscriptionId);
    await h.describeRemoval(planId, note, dataLoss);

    return { subscriptionId, planId };
  };

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    lossy = await subscriptionOf('K2', NOTE, true);
    noted = await subscriptionOf('K1', 'Cancel the renewal at the vendor first', false);
    plain = await subscriptionOf('K2', null, false);
    internalPlan = await h.plan('K5');
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  /** A department with a head and a member who holds a seat of the target. */
  const holder = async (target: { subscriptionId?: string; planId?: string }, options = {}) => {
    counter += 1;
    const unit = await h.departmentWithHead(`P-RR${counter}`);
    const assignmentId = await h.seatOf(unit.member, target, options);

    return { unit, assignmentId };
  };
  const sent = async (assignmentId: string, account: Unit['member']['account'], extra: object = {}) =>
    h.returned(account, { assignmentId, reason: 'The project is over', ...extra });
  const taskOfReturn = async (wire: ReturnWire) => (await h.returnRow(wire.id)).revocation_task_id;
  const claimed = async (taskId: string) => {
    await h.claim(taskId).expect(200);

    return taskId;
  };

  describe('the holder returns their seat, and the head confirms it is no longer needed (AC-1, AC-2, AC-9)', () => {
    it('queues the revocation at once, with no step to approve, and does not give the seat back yet (AC-1)', async () => {
      const { unit, assignmentId } = await holder(lossy);
      const requestsBefore = await h.requestRows();
      const freeBefore = await h.freeSeats(lossy.subscriptionId);

      const wire = await sent(assignmentId, unit.member.account);

      expect(wire).toMatchObject({
        state: 'AWAITING_REVOCATION',
        source: 'EMPLOYEE_RETURN',
        assignmentId,
        holder: { employeeId: unit.member.employeeId },
        requestedBy: { employeeId: unit.member.employeeId },
        department: { id: unit.department.id },
        requestedOn: h.today(),
        reason: 'The project is over',
        revocationNote: NOTE,
        handover: { required: true, confirmed: false, flagged: false },
        completedAt: null,
        failedAt: null,
      });
      expect(wire.plan.planId).toBe(lossy.planId);
      const task = await h.liveTaskOf(assignmentId);
      expect(task).toMatchObject({ status: 'QUEUED', source: 'RETURN' });
      expect(await taskOfReturn(wire)).toBe(task?.id);
      expect(await h.reasonsOf(task?.id ?? '')).toEqual([
        { source: 'RETURN', decided_role: 'EMPLOYEE', reference_kind: 'RETURN_REQUEST', reference_id: wire.id },
      ]);
      // It is not a request: nothing was approved, and the seat is still held until the IT Admin has taken the access away.
      expect(await h.requestRows()).toBe(requestsBefore);
      expect((await h.seatRow(assignmentId)).valid_until).toBeNull();
      expect(await h.freeSeats(lossy.subscriptionId)).toBe(freeBefore);
      const [submitted] = await h.eventsOf('RETURN_REQUEST.SUBMITTED', wire.id);
      expect(submitted.after).toMatchObject({
        holderEmployeeId: unit.member.employeeId,
        source: 'EMPLOYEE_RETURN',
        assignmentId,
        revocationTaskCreated: true,
      });
      expect(JSON.stringify(submitted.after)).not.toContain('The project is over');
      expect(JSON.stringify(submitted.after)).not.toContain('@acme.vn');
    });

    it('lets the head of the department of the holder confirm that the seat is no longer needed (AC-2)', async () => {
      const { unit, assignmentId } = await holder(plain);

      const wire = await sent(assignmentId, unit.head.account, { reason: 'The person moved to another product' });

      expect(wire.revocationNote).toBeNull();
      expect(wire.handover.required).toBe(false);
      expect(wire).toMatchObject({
        source: 'HEAD_CONFIRMATION',
        holder: { employeeId: unit.member.employeeId },
        requestedBy: { employeeId: unit.head.employeeId },
      });
      const task = await h.liveTaskOf(assignmentId);
      expect(task).toMatchObject({ status: 'QUEUED', source: 'MANAGER_NOT_NEEDED' });
      expect(await h.reasonsOf(task?.id ?? '')).toEqual([
        {
          source: 'MANAGER_NOT_NEEDED',
          decided_role: 'MANAGER',
          reference_kind: 'RETURN_REQUEST',
          reference_id: wire.id,
        },
      ]);
      const card = h.dataOf<{
        task: { requestId: string | null; revocation: { source: string; firstReason: { referenceId: string } } };
      }>(await h.getTask(task?.id ?? '').expect(200)).task;
      expect(card.requestId).toBeNull();
      expect(card.revocation).toMatchObject({ source: 'MANAGER_NOT_NEEDED', firstReason: { referenceId: wire.id } });
    });

    it('takes the return of a person whose department has no head, and gives nothing to a head who is not there (AC-9)', async () => {
      const headless = await h.departmentWithUnit('P-RR-NOHEAD');
      const e4 = await h.staff(headless, 'RR-E4');
      const assignmentId = await h.seatOf(e4, plain);
      const stepsBefore = await h.count('access_request_steps');

      const wire = await sent(assignmentId, e4.account);

      expect(wire).toMatchObject({ source: 'EMPLOYEE_RETURN', state: 'AWAITING_REVOCATION' });
      expect(await h.count('access_request_steps')).toBe(stepsBefore);
      expect(await h.liveTaskOf(assignmentId)).toMatchObject({ source: 'RETURN' });
    });

    it('answers an IT Admin who returns their own seat as the holder, not as the one who works the task', async () => {
      counter += 1;
      const unit = await h.departmentWithHead(`P-RR${counter}`);
      const admin = await h.staff(unit.department, `RR-IT${counter}`, ['IT_ADMIN']);
      const assignmentId = await h.seatOf(admin, plain);

      const wire = await sent(assignmentId, admin.account);

      expect(wire.source).toBe('EMPLOYEE_RETURN');
      expect(await h.liveTaskOf(assignmentId)).toMatchObject({ status: 'QUEUED' });
    });
  });

  describe('who may return which seat (AC-3, AC-5)', () => {
    it('refuses a person who is not the holder and a head of another department, and writes nothing (AC-5)', async () => {
      const { unit, assignmentId } = await holder(plain);
      const other = await h.departmentWithHead(`P-RR-X${(counter += 1)}`);
      const returnsBefore = await h.count('return_requests');
      const tasksBefore = await h.count('provisioning_tasks');

      const colleague = await h.returnSeat({ assignmentId, reason: 'Not mine' }, unit.head.account);
      expect(colleague.status).toBe(201);
      const stranger = await h.returnSeat({ assignmentId, reason: 'Not mine' }, other.member.account).expect(403);
      const foreignHead = await h.returnSeat({ assignmentId, reason: 'Not mine' }, other.head.account).expect(403);
      const missing = await h
        .returnSeat({ assignmentId: '00000000-0000-4000-8000-000000000000', reason: 'No seat' }, unit.member.account)
        .expect(404);

      expect(h.codeOf(stranger)).toBe('RETURN_REQUEST.NOT_HOLDER');
      expect(h.codeOf(foreignHead)).toBe('RETURN_REQUEST.OUTSIDE_DEPARTMENT');
      expect(h.codeOf(missing)).toBe('RETURN_REQUEST.ASSIGNMENT_NOT_FOUND');
      // Only the head's own, legitimate return of the first call was written.
      expect(await h.count('return_requests')).toBe(returnsBefore + 1);
      expect(await h.count('provisioning_tasks')).toBe(tasksBefore + 1);
    });

    it('shows the return, with its plan, source and note, to the holder, the sender, the head and the IT Admin only (AC-3)', async () => {
      const { unit, assignmentId } = await holder(lossy);
      const wire = await sent(assignmentId, unit.head.account);
      const outsider = await h.departmentWithHead(`P-RR-O${(counter += 1)}`);

      for (const account of [unit.member.account, unit.head.account, h.it1]) {
        const detail = h.dataOf<{ returnRequest: ReturnWire }>(await h.returnGet(wire.id, account).expect(200));
        expect(detail.returnRequest).toMatchObject({
          id: wire.id,
          source: 'HEAD_CONFIRMATION',
          revocationNote: NOTE,
          plan: { planId: lossy.planId },
        });
      }
      await h.returnGet(wire.id, outsider.head.account).expect(404);
      await h.returnGet(wire.id, outsider.member.account).expect(404);

      const mine = h.dataOf<{ items: ReturnWire[]; pagination: { totalItems: number } }>(
        await h.returnList(unit.member.account).expect(200),
      );
      expect(mine.items.map((row) => row.id)).toEqual([wire.id]);
      expect(mine.items[0]).not.toHaveProperty('reason');
      expect(mine.items[0]).not.toHaveProperty('revocationNote');
      const strangers = h.dataOf<{ items: ReturnWire[] }>(await h.returnList(outsider.head.account).expect(200));
      expect(strangers.items).toEqual([]);
      const all = h.dataOf<{ items: ReturnWire[]; pagination: { totalItems: number } }>(
        await h.returnList(h.it1, { pageSize: 100 }).expect(200),
      );
      expect(all.items.some((row) => row.id === wire.id)).toBe(true);
      const filtered = h.dataOf<{ items: ReturnWire[] }>(
        await h.returnList(h.it1, { assignmentId, state: 'AWAITING_REVOCATION' }).expect(200),
      );
      expect(filtered.items.map((row) => row.id)).toEqual([wire.id]);
    });
  });

  describe('a return names exactly one seat (US-01-12 AC-3)', () => {
    it('refuses a list of seats, two seats, none and anything else, and writes nothing', async () => {
      const { unit, assignmentId } = await holder(plain);
      const second = await h.seatOf(await h.staff(unit.department, `RR-S${(counter += 1)}`), plain);
      const before = [await h.count('return_requests'), await h.count('provisioning_tasks')];
      const reason = 'The project is over';

      for (const body of [
        { assignmentId: [assignmentId, second], reason },
        { assignmentIds: [assignmentId], reason },
        { assignmentId, secondAssignmentId: second, reason },
        { reason },
        { assignmentId },
        { assignmentId: 'not-a-uuid', reason },
        { assignmentId, reason: '   ' },
      ]) {
        const response = await h.returnSeat(body, unit.member.account).expect(422);
        expect(h.codeOf(response)).toBe('VALIDATION_ERROR');
      }

      expect([await h.count('return_requests'), await h.count('provisioning_tasks')]).toEqual(before);
      expect((await sent(assignmentId, unit.member.account)).assignmentId).toBe(assignmentId);
    });
  });

  describe('the revocation gives the seat back, and saves nothing (postconditions)', () => {
    it('frees the seat today when the IT Admin completes the revocation, and completes the return', async () => {
      const { unit, assignmentId } = await holder(plain);
      const wire = await sent(assignmentId, unit.member.account);
      const taskId = await claimed(await taskOfReturn(wire));
      const freeBefore = await h.freeSeats(plain.subscriptionId);
      const commitmentsBefore = await h.count('budget_commitments');

      await h.revoked(taskId, { completion: 'ACCOUNT_REMOVED', evidence: 'Removed from the workspace' }).expect(200);

      const seat = await h.seatRow(assignmentId);
      expect(seat.valid_until).toBe(h.today());
      expect(await h.freeSeats(plain.subscriptionId)).toBe((freeBefore ?? 0) + 1);
      const row = await h.returnRow(wire.id);
      expect(row).toMatchObject({ state: 'COMPLETED', handover_flagged: false });
      const done = h.dataOf<{ returnRequest: ReturnWire }>(await h.returnGet(wire.id, unit.member.account).expect(200));
      expect(done.returnRequest).toMatchObject({ state: 'COMPLETED', handover: { flagged: false } });
      expect(done.returnRequest.completedAt).not.toBeNull();
      expect((await h.eventsOf('RETURN_REQUEST.COMPLETED', wire.id))[0].after).toMatchObject({
        holderEmployeeId: unit.member.employeeId,
        handoverFlagged: false,
      });
      // It saves nothing: no commitment or invoice moves.
      expect(await h.count('budget_commitments')).toEqual(commitmentsBefore);
    });

    it('returns a K5 right off the system, taking no seat and changing no subscription (AC-10)', async () => {
      counter += 1;
      const unit = await h.departmentWithHead(`P-RR${counter}`);
      const assignmentId = await h.seatOf(unit.member, { planId: internalPlan });
      const subscriptionsBefore = await h.count('subscriptions');
      const wire = await sent(assignmentId, unit.member.account);
      const taskId = await claimed(await taskOfReturn(wire));

      await h
        .revoked(taskId, { completion: 'OFF_SYSTEM_REVOKED', evidence: 'Revoked in the internal portal' })
        .expect(200);

      expect((await h.seatRow(assignmentId)).valid_until).toBe(h.today());
      expect((await h.returnRow(wire.id)).state).toBe('COMPLETED');
      expect(await h.count('subscriptions')).toBe(subscriptionsBefore);
    });

    it('lets a K1 right run to the end of the paid period, and the return is complete when the renewal is cancelled', async () => {
      const { unit, assignmentId } = await holder(noted);
      const wire = await sent(assignmentId, unit.member.account);
      const taskId = await claimed(await taskOfReturn(wire));

      await h
        .revoked(taskId, {
          completion: 'RENEWAL_CANCELLED',
          evidence: 'Cancelled in the billing page',
          paidThroughOn: h.inDays(20),
          accessState: 'UNTIL_PAID_END',
        })
        .expect(200);

      expect((await h.seatRow(assignmentId)).valid_until).toBe(h.inDays(20));
      expect((await h.returnRow(wire.id)).state).toBe('COMPLETED');
    });
  });
});
