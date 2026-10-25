import { GroupHarness } from '../support/group-harness';
import type { Unit } from '../support/spend-harness';

const h = new GroupHarness();

interface SupplementWire {
  number: number;
  reason: string;
  expectedSpendOn: { before: string; after: string };
  amount: { before: { amount: string }; after: { amount: string } };
  droppedCount: number;
}

describe('the head leaves people of a group out of the supplementary file over PostgreSQL (US-06-14 AC-13, US-05-17)', () => {
  let paid: string;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    paid = await h.planOf(await h.subscription(100));
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const unit = async (): Promise<Unit> => {
    counter += 1;
    const made = await h.departmentWithHead(`P-F${counter}`);
    await h.roomFor(made);

    return made;
  };
  /** A group the head sent for the people that waits in the queue of the head to be sent on. */
  const queued = async (count = 5) => {
    const u = await unit();
    const people = await h.colleagues(u, count);
    const id = h.dataOf<{ request: { id: string } }>(
      await h.submitGroup(h.groupBody(paid, people), u.head.account).expect(201),
    ).request.id;

    return { u, people, id };
  };
  const supplement = (response: Parameters<typeof h.dataOf>[0]) =>
    h.dataOf<{ supplement: SupplementWire }>(response).supplement;
  const amountOf = async (id: string, account: Parameters<typeof h.fetch>[1]) =>
    h.dataOf<{ request: { pricing: { amount: { amount: string } } } }>(await h.fetch(id, account).expect(200)).request
      .pricing.amount.amount;

  it('leaves one of five out: the line is dropped, the cost is made again for four, and the file keeps before and after', async () => {
    const { u, people, id } = await queued(5);
    const [, , , , e5] = people;

    const file = supplement(
      await h
        .addSupplement(id, { dropEmployeeIds: [e5.employeeId], reason: 'Left the team' }, u.head.account)
        .expect(201),
    );

    expect(file).toMatchObject({
      number: 1,
      reason: 'Left the team',
      droppedCount: 1,
      amount: { before: { amount: '60000000' }, after: { amount: '48000000' } },
    });
    expect(file.expectedSpendOn.before).toBe(file.expectedSpendOn.after);
    expect(await h.lineStates(id)).toEqual([
      'NEED_CONFIRMED',
      'NEED_CONFIRMED',
      'NEED_CONFIRMED',
      'NEED_CONFIRMED',
      'DROPPED',
    ]);
    expect(await amountOf(id, u.head.account)).toBe('48000000');
    expect(await h.state(id)).toBe('AWAITING_SPEND_SUBMISSION');
    const dropped = await h.ctx.sql.query<{ employee_id: string }>(
      `SELECT employee_id FROM request_supplement_drops WHERE request_id = $1 AND number = 1`,
      [id],
    );
    expect(dropped.rows).toEqual([{ employee_id: e5.employeeId }]);
    const line = (await h.lineRows(id))[4];
    expect(line).toMatchObject({ ended_by_employee_id: u.head.employeeId, end_reason: 'Left the team' });
    const list = h.dataOf<{ items: SupplementWire[] }>(await h.supplements(id, u.head.account).expect(200)).items;
    expect(list.map((item) => item.droppedCount)).toEqual([1]);
  });

  it('runs the whole check again on a second sending: the approver decides the four that are left', async () => {
    const { u, people, id } = await queued(5);
    await h
      .addSupplement(id, { dropEmployeeIds: [people[4].employeeId], reason: 'Left the team' }, u.head.account)
      .expect(201);
    await h.setPlanLine(id, { offPlan: true }, u.head.account).expect(200);
    await h.sendOn([id], u.head.account).expect(201);

    const four = people.slice(0, 4).map((person) => ({ employeeId: person.employeeId, decision: 'APPROVE' }));
    await h
      .decideSpendLines(
        id,
        { lines: [...four, { employeeId: people[4].employeeId, decision: 'APPROVE' }] },
        h.boss.account,
      )
      .expect(422);
    await h.decideSpendLines(id, { lines: four }, h.boss.account).expect(200);

    expect(await h.lineStates(id)).toEqual(['APPROVED', 'APPROVED', 'APPROVED', 'APPROVED', 'DROPPED']);
    expect(await h.state(id)).toBe('AWAITING_EXECUTION');
  });

  it('changes the day and leaves a person out in one file', async () => {
    const { u, people, id } = await queued(3);
    const today = h.today();
    const later = `${Number(today.slice(0, 4)) + 1}-${today.slice(5)}`;

    const file = supplement(
      await h
        .addSupplement(
          id,
          { expectedSpendOn: later, dropEmployeeIds: [people[2].employeeId], reason: 'Moved and smaller' },
          u.head.account,
        )
        .expect(201),
    );

    expect(file.expectedSpendOn.after).toBe(later);
    expect(file.droppedCount).toBe(1);
    expect(await amountOf(id, u.head.account)).toBe('24000000');
  });

  describe('what is refused', () => {
    it('does not leave out the last person', async () => {
      const { u, people, id } = await queued(2);
      await h
        .addSupplement(id, { dropEmployeeIds: [people[0].employeeId], reason: 'One goes' }, u.head.account)
        .expect(201);

      const last = await h
        .addSupplement(id, { dropEmployeeIds: [people[1].employeeId], reason: 'The last' }, u.head.account)
        .expect(422);

      expect(h.codeOf(last)).toBe('SUPPLEMENT.CANNOT_DROP_LAST_LINE');
      expect(await h.lineStates(id)).toEqual(['DROPPED', 'NEED_CONFIRMED']);
    });

    it('does not leave out a person whose need is not confirmed, or who is not in the request', async () => {
      const u = await unit();
      const [e1, e2, e3] = await h.colleagues(u, 3);
      const id = h.dataOf<{ request: { id: string } }>(
        await h.submitGroup(h.groupBody(paid, [e1, e2, u.head, e3]), u.head.account).expect(201),
      ).request.id;
      // The approver refuses the head's own line, so the request is in the queue of the head with that line ended.
      await h
        .decideLines(
          id,
          { lines: [{ employeeId: u.head.employeeId, decision: 'REJECT', reason: 'No' }] },
          h.boss.account,
        )
        .expect(200);
      const stranger = await h.colleague(await unit());

      const notDroppable = await h
        .addSupplement(id, { dropEmployeeIds: [u.head.employeeId], reason: 'x' }, u.head.account)
        .expect(409);
      const outsider = await h
        .addSupplement(id, { dropEmployeeIds: [stranger.employeeId], reason: 'x' }, u.head.account)
        .expect(409);

      expect(h.codeOf(notDroppable)).toBe('SUPPLEMENT.LINE_NOT_DROPPABLE');
      expect(h.codeOf(outsider)).toBe('SUPPLEMENT.LINE_NOT_DROPPABLE');
      expect(await h.lineStates(id)).toEqual(['NEED_CONFIRMED', 'NEED_CONFIRMED', 'NEED_REJECTED', 'NEED_CONFIRMED']);
    });

    it('is a file for a group: a request of one person has nobody to leave out', async () => {
      const u = await unit();
      const id = await h.paidRequest(u, paid);

      const refused = await h
        .addSupplement(id, { dropEmployeeIds: [u.member.employeeId], reason: 'x' }, u.head.account)
        .expect(422);

      expect(h.codeOf(refused)).toBe('SUPPLEMENT.DROP_NOT_FOR_GROUP');
    });

    it('wants a change: the day or a person', async () => {
      const { u, id } = await queued(2);

      const none = await h.addSupplement(id, { reason: 'nothing' }, u.head.account).expect(422);

      expect(h.codeOf(none)).toBe('VALIDATION_ERROR');
    });
  });
});
