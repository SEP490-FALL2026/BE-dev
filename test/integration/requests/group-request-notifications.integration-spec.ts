import { GroupHarness } from '../../support/group-harness';
import type { Unit } from '../../support/spend-harness';

const h = new GroupHarness();

describe('what the people of a group are told, each of what became of them alone, over PostgreSQL (US-05-15 AC-9, US-05-17)', () => {
  let subscriptionId: string;
  let paid: string;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    subscriptionId = await h.subscription(100);
    paid = await h.planOf(subscriptionId);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const unit = async (): Promise<Unit> => {
    counter += 1;
    const made = await h.departmentWithHead(`P-M${counter}`);
    await h.roomFor(made);

    return made;
  };
  const approve = (employeeId: string) => ({ employeeId, decision: 'APPROVE' });
  const refuse = (employeeId: string, reason: string) => ({ employeeId, decision: 'REJECT', reason });
  const finish = async (id: string, employeeId: string, how: 'COMPLETE' | 'FAIL') => {
    const task = h.dataOf<{ task: { id: string } }>(
      await h.grantLine({ requestId: id, beneficiaryEmployeeId: employeeId, subscriptionId }, h.it1).expect(201),
    ).task;
    await h.claim(task.id).expect(200);
    if (how === 'COMPLETE') {
      await h.complete(task.id, { evidence: 'Invited by work email' }).expect(200);
    } else {
      await h.fail(task.id, { reason: 'The vendor refused the invitation' }).expect(200);
      await h.closeFailed(task.id, { reason: 'Given up' }).expect(200);
    }
  };

  it('tells each person only of their own line when the spend, the grant and a failure differ, and the sender of all three', async () => {
    const u = await unit();
    const [e1, e2, e3] = await h.colleagues(u, 3);
    const id = await h.groupWaiting(u, paid, [e1, e2, e3]);
    await h
      .decideSpendLines(
        id,
        { lines: [approve(e1.employeeId), approve(e2.employeeId), refuse(e3.employeeId, 'Not this quarter')] },
        h.boss.account,
      )
      .expect(200);
    await finish(id, e1.employeeId, 'COMPLETE');
    await finish(id, e2.employeeId, 'FAIL');
    await h.project();

    expect(await h.codesFor(e1.employeeId, id)).toEqual(['REQUEST_GRANTED']);
    expect(await h.codesFor(e2.employeeId, id)).toEqual(['REQUEST_FAILED']);
    expect(await h.codesFor(e3.employeeId, id)).toEqual(['REQUEST_REJECTED']);
    const [refused] = await h.noticesOf(e3.employeeId, 'REQUEST_REJECTED');
    expect(refused.params).toMatchObject({ requestId: id, by: 'SPEND', reason: 'Not this quarter' });
    const told = await h.codesFor(u.head.employeeId, id);
    expect(told).toEqual(
      expect.arrayContaining([
        'REQUEST_SUBMITTED',
        'REQUEST_SPEND_APPROVED',
        'REQUEST_REJECTED',
        'REQUEST_GRANTED',
        'REQUEST_FAILED',
      ]),
    );
    expect(told.filter((code) => code === 'REQUEST_GRANTED')).toHaveLength(1);
    // One notice for each person and event, never two for the same: the key of a notice names the person it is about.
    const keys = (await h.noticesAbout(id)).map((row) => `${row.recipient_employee_id}:${row.event_key}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('tells the person refused at the need, and the sender, and nobody else of the people', async () => {
    const u = await unit();
    const [e1, e2, e3] = await h.colleagues(u, 3);
    const id = h.dataOf<{ request: { id: string } }>(
      await h.submitGroup(h.groupBody(paid, [e1, e2, e3]), e1.account).expect(201),
    ).request.id;
    await h
      .decideLines(
        id,
        {
          lines: [approve(e1.employeeId), approve(e2.employeeId), refuse(e3.employeeId, 'No longer needed')],
        },
        u.head.account,
      )
      .expect(200);
    await h.project();

    const refused = await h.noticesOf(e3.employeeId, 'REQUEST_REJECTED');
    expect(refused).toHaveLength(1);
    expect(refused[0].params).toMatchObject({ requestId: id, by: 'NEED', reason: 'No longer needed' });
    expect(await h.noticesOf(e2.employeeId, 'REQUEST_REJECTED')).toEqual([]);
    expect(await h.noticesOf(e1.employeeId, 'REQUEST_REJECTED')).toHaveLength(1);
    expect(await h.noticesOf(u.head.employeeId, 'REQUEST_REJECTED')).toEqual([]);
    expect(await h.codesFor(e1.employeeId, id)).toEqual(
      expect.arrayContaining(['REQUEST_SUBMITTED', 'REQUEST_NEED_APPROVED']),
    );
  });

  it('tells the person withdrawn and the sender of a withdrawal that is not the sender’s own, and the others nothing', async () => {
    const u = await unit();
    const [e1, e2] = await h.colleagues(u, 2);
    const id = await h.groupWaiting(u, paid, [e1, e2]);
    await h.withdrawLine(id, e2.employeeId, { reason: 'Left the project' }, u.head.account).expect(200);
    await h.project();

    const told = await h.noticesOf(e2.employeeId, 'REQUEST_WITHDRAWN');
    expect(told).toHaveLength(1);
    expect(told[0].params).toMatchObject({ requestId: id, byRequester: true });
    expect(await h.noticesOf(e1.employeeId, 'REQUEST_WITHDRAWN')).toEqual([]);
    expect(await h.noticesOf(u.head.employeeId, 'REQUEST_WITHDRAWN')).toEqual([]);
  });
});
