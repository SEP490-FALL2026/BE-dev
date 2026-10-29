import { ReturnHarness, type ReturnWire } from '../../support/return-harness';

const h = new ReturnHarness();
const NOTE = 'Export the boards before the seat is taken away';

interface TaskWire {
  id: string;
  status: string;
}

describe('the handover of the data of a returned seat (US-05-13 AC-6, AC-7)', () => {
  let lossy: { subscriptionId: string; planId: string };
  let noted: { subscriptionId: string; planId: string };
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    for (const [index, type] of (['K2', 'K1'] as const).entries()) {
      const subscriptionId = await h.subscription(10, type);
      const planId = await h.planOf(subscriptionId);
      await h.describeRemoval(planId, NOTE, index === 0);
      if (index === 0) lossy = { subscriptionId, planId };
      else noted = { subscriptionId, planId };
    }
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const returned = async (target: { subscriptionId: string }, byHead = false) => {
    counter += 1;
    const unit = await h.departmentWithHead(`P-HO${counter}`);
    const assignmentId = await h.seatOf(unit.member, target);
    const sender = byHead ? unit.head : unit.member;
    const wire = await h.returned(sender.account, { assignmentId, reason: 'The project is over' });
    const taskId = (await h.returnRow(wire.id)).revocation_task_id;
    await h.claim(taskId).expect(200);

    return { unit, assignmentId, wire, taskId, sender };
  };
  /** The deadline went by: the days of the return are moved back together, which the database refuses to anyone else. */
  const overdue = async (id: string) => {
    await h.ctx.sql.query(`ALTER TABLE return_requests DISABLE TRIGGER return_requests_immutable`);
    try {
      await h.ctx.sql.query(
        `UPDATE return_requests SET requested_on = requested_on - 10, handover_due_on = handover_due_on - 10 WHERE id = $1`,
        [id],
      );
    } finally {
      await h.ctx.sql.query(`ALTER TABLE return_requests ENABLE TRIGGER return_requests_immutable`);
    }
  };

  it('asks a plan that loses data for the confirmation of the person who sent it, before the access is taken away (AC-6)', async () => {
    const { unit, assignmentId, wire, taskId, sender } = await returned(lossy);

    const refused = await h
      .revoked(taskId, { completion: 'ACCOUNT_REMOVED', evidence: 'Removed from the workspace' })
      .expect(409);
    expect(h.codeOf(refused)).toBe('PROVISIONING.HANDOVER_PENDING');
    expect(h.detailsOf(refused)).toMatchObject({ returnRequestId: wire.id, dueOn: wire.handover.dueOn });
    // Nothing changed: the task is still being worked and the seat is still held.
    expect(h.dataOf<{ task: TaskWire }>(await h.getTask(taskId).expect(200)).task.status).toBe('IN_PROGRESS');
    expect((await h.seatRow(assignmentId)).valid_until).toBeNull();
    expect((await h.returnRow(wire.id)).state).toBe('AWAITING_REVOCATION');

    expect(h.codeOf(await h.confirmHandover(wire.id, unit.head.account).expect(403))).toBe(
      'RETURN_REQUEST.NOT_REQUESTER',
    );
    const confirmed = h.dataOf<{ returnRequest: ReturnWire }>(
      await h.confirmHandover(wire.id, sender.account).expect(200),
    );
    expect(confirmed.returnRequest).toMatchObject({
      handover: { required: true, confirmed: true, flagged: false },
      handoverConfirmedBy: { employeeId: sender.employeeId },
    });
    expect(confirmed.returnRequest.handoverConfirmedAt).not.toBeNull();
    expect(h.codeOf(await h.confirmHandover(wire.id, sender.account).expect(409))).toBe(
      'RETURN_REQUEST.HANDOVER_ALREADY_CONFIRMED',
    );
    expect((await h.eventsOf('RETURN_REQUEST.HANDOVER_CONFIRMED', wire.id))[0].after).toMatchObject({
      confirmedByEmployeeId: sender.employeeId,
      onTime: true,
    });

    await h.revoked(taskId, { completion: 'ACCOUNT_REMOVED', evidence: 'Removed from the workspace' }).expect(200);
    expect(await h.returnRow(wire.id)).toMatchObject({ state: 'COMPLETED', handover_flagged: false });
  });

  it('asks the head who confirmed that the seat is no longer needed, and not the holder (AC-6)', async () => {
    const { unit, wire } = await returned(lossy, true);

    expect(h.codeOf(await h.confirmHandover(wire.id, unit.member.account).expect(403))).toBe(
      'RETURN_REQUEST.NOT_REQUESTER',
    );
    await h.confirmHandover(wire.id, unit.head.account).expect(200);
    const outsider = await h.departmentWithHead(`P-HO-X${(counter += 1)}`);
    expect(h.codeOf(await h.confirmHandover(wire.id, outsider.head.account).expect(404))).toBe(
      'RETURN_REQUEST.NOT_FOUND',
    );
  });

  it('completes the revocation after the deadline without the confirmation, and flags the return (AC-6)', async () => {
    const { wire, taskId } = await returned(lossy);
    await overdue(wire.id);

    await h.revoked(taskId, { completion: 'ACCOUNT_REMOVED', evidence: 'Removed from the workspace' }).expect(200);

    expect(await h.returnRow(wire.id)).toMatchObject({ state: 'COMPLETED', handover_flagged: true });
    expect((await h.eventsOf('RETURN_REQUEST.COMPLETED', wire.id))[0].after).toMatchObject({ handoverFlagged: true });
  });

  it('does not stop a plan that only has a note: no confirmation, no flag, the IT Admin completes at once (AC-7)', async () => {
    const { unit, wire, taskId, sender } = await returned(noted);

    expect(wire.handover).toMatchObject({ required: false, dueOn: null });
    expect(wire.revocationNote).toBe(NOTE);
    expect(h.codeOf(await h.confirmHandover(wire.id, sender.account).expect(409))).toBe(
      'RETURN_REQUEST.HANDOVER_NOT_REQUIRED',
    );

    await h
      .revoked(taskId, {
        completion: 'RENEWAL_CANCELLED',
        evidence: 'Cancelled in the billing page',
        paidThroughOn: h.inDays(10),
        accessState: 'UNTIL_PAID_END',
      })
      .expect(200);
    expect(await h.returnRow(wire.id)).toMatchObject({ state: 'COMPLETED', handover_flagged: false });
    expect(unit.member.employeeId).toBeTruthy();
  });

  it('refuses the confirmation of a return that has ended (AC-6)', async () => {
    const { wire, taskId, sender } = await returned(lossy);
    await h.confirmHandover(wire.id, sender.account).expect(200);
    await h.revoked(taskId, { completion: 'ACCOUNT_REMOVED', evidence: 'Removed from the workspace' }).expect(200);

    expect(h.codeOf(await h.confirmHandover(wire.id, sender.account).expect(409))).toBe('RETURN_REQUEST.NOT_AWAITING');
  });
});
