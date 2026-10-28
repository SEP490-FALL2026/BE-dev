import { RequestsService } from '../../src/modules/requests/requests.service';
import type { RequestOutcomeEvent } from '../../src/modules/requests/requests.types';
import { GroupHarness } from '../support/group-harness';
import type { Person } from '../support/request-harness';
import type { Unit } from '../support/spend-harness';

/**
 * `g0-g6-final-business-baseline-remediation`, the hand-off of F43 to the personnel context (`RequestOutcomeListener`, registered through
 * `RequestsService.registerOutcomeListener`): every end of a request for its people, and the grant that completes, is told in the
 * transaction of the end, for one person at a time, on the day it happened; a listener that throws undoes the end; with nobody
 * listening nothing changes. Proved with a fake listener, over HTTP, on real PostgreSQL.
 */
const h = new GroupHarness();
const M = 1_000_000;

interface TaskWire {
  id: string;
}

describe('the outcomes of a request told to the context that listens (integration, real PostgreSQL)', () => {
  const events: RequestOutcomeEvent[] = [];
  /** A request that the thrower refuses to hear about: its end must be undone. */
  const doomed = new Set<string>();
  let subscriptionId: string;
  let plan: string;
  let n = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    subscriptionId = await h.subscription(100);
    plan = await h.planOf(subscriptionId);
    await h
      .declareTaxProfile((await h.vendorOf(plan)).id, [{ taxType: 'GTGT', ratePercent: '10', deductible: true }])
      .expect(200);
    const requests = h.ctx.app.get(RequestsService, { strict: false });
    requests.registerOutcomeListener({
      requestOutcome: (_tx, event) => {
        events.push(event);

        return Promise.resolve();
      },
    });
    requests.registerOutcomeListener({
      requestOutcome: (_tx, event) =>
        doomed.has(event.requestId)
          ? Promise.reject(new Error('The listener refuses this outcome.'))
          : Promise.resolve(),
    });
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const heard = (requestId: string) => events.filter((event) => event.requestId === requestId);
  const example = async (): Promise<Unit & { person: Person }> => {
    n += 1;
    const u = await h.departmentWithHead(`P-OL${n}`);
    await h.budgetFor(u, { total: 200 * M, held: 20 * M, spent: 40 * M });

    return { ...u, person: await h.staff(u.department, `OL-E${n}`) };
  };
  const approvedFor = async (u: Unit, person: Person, amount: number): Promise<string> => {
    const sent = await h.sent(person, plan, { termMonths: 1 });
    await h.decide(sent.id, { decision: 'APPROVE' }, u.head.account).expect(200);
    await h.setPayments(sent.id, { amount });
    await h.sendOn([sent.id], u.head.account).expect(201);
    await h.decideSpend(sent.id, { decision: 'APPROVE' }, h.boss.account).expect(200);

    return sent.id;
  };
  const taskOf = async (requestId: string): Promise<string> =>
    h.dataOf<{ task: TaskWire }>(await h.grant({ requestId, subscriptionId }).expect(201)).task.id;

  it('tells it that the grant completed, for the person, on the day, and not before: a request that is only decided is not told', async () => {
    const u = await example();
    const id = await approvedFor(u, u.person, 10 * M);
    expect(heard(id)).toEqual([]);
    const task = await taskOf(id);
    await h.claim(task).expect(200);
    expect(heard(id)).toEqual([]);

    await h.complete(task, { evidence: 'Invited by work email' }).expect(200);

    expect(heard(id)).toEqual([
      {
        organizationId: h.seed.organizationId,
        requestId: id,
        departmentId: u.department.id,
        planId: plan,
        beneficiaryEmployeeIds: [u.person.employeeId],
        outcome: 'GRANTED',
        endedOn: h.today(),
      },
    ]);
  });

  it('tells it that a request ended without a grant when the head refuses the need, when it is withdrawn and when the IT Admin closes it for a person who left', async () => {
    const u = await example();
    const refused = (await h.sent(u.person, plan, { termMonths: 1 })).id;
    await h.decide(refused, { decision: 'REJECT', reason: 'Not needed this quarter' }, u.head.account).expect(200);
    const sender = await h.staff(u.department, `OL-W${n}`);
    const withdrawn = (await h.sent(sender, plan, { termMonths: 1 })).id;
    await h.withdrawRequest(withdrawn, {}, sender.account).expect(200);
    const leaver = await h.staff(u.department, `OL-L${n}`);
    const closed = await approvedFor(u, leaver, 10 * M);
    await h.depart(leaver);
    await h.closeForDeparture(closed, { cause: 'BENEFICIARY_LEFT', note: 'Left the company' }, h.it1).expect(200);

    for (const [id, person] of [
      [refused, u.person],
      [closed, leaver],
    ] as const) {
      expect(heard(id)).toEqual([
        expect.objectContaining({
          outcome: 'ENDED_WITHOUT_GRANT',
          beneficiaryEmployeeIds: [person.employeeId],
          endedOn: h.today(),
        }),
      ]);
    }
    expect(heard(withdrawn)).toEqual([expect.objectContaining({ outcome: 'ENDED_WITHOUT_GRANT' })]);
  });

  it('tells it for each person of a group on their own: the line that is granted and the line that is closed, and nobody else', async () => {
    n += 1;
    const u = await h.departmentWithHead(`P-OG${n}`);
    await h.roomFor(u);
    const [e1, e2, e3] = await h.colleagues(u, 3);
    const id = await h.groupApproved(u, plan, [e1, e2, e3]);
    const own = h.owned.subscriptionFor(subscriptionId, u.department.id);
    const task = h.dataOf<{ task: TaskWire }>(
      await h
        .grantLine({ requestId: id, beneficiaryEmployeeId: e1.employeeId, subscriptionId: own }, h.it1)
        .expect(201),
    ).task;
    await h.claim(task.id).expect(200);
    await h.complete(task.id, { evidence: 'Invited by work email' }).expect(200);
    await h.depart(e3);
    await h
      .closeLineForDeparture(id, e3.employeeId, { cause: 'BENEFICIARY_LEFT', note: 'Left the company' }, h.it1)
      .expect(200);

    expect(heard(id).map((event) => [event.outcome, event.beneficiaryEmployeeIds])).toEqual([
      ['GRANTED', [e1.employeeId]],
      ['ENDED_WITHOUT_GRANT', [e3.employeeId]],
    ]);
  });

  it('undoes the end when a listener throws: the request is as it was, and nothing was withdrawn', async () => {
    const u = await example();
    const id = (await h.sent(u.person, plan, { termMonths: 1 })).id;
    doomed.add(id);

    await h.withdrawRequest(id, {}, u.person.account).expect(500);

    expect(await h.state(id)).toBe('PENDING');
    expect(await h.audit('ACCESS_REQUEST.WITHDRAWN', id)).toEqual([]);
    doomed.delete(id);
    await h.withdrawRequest(id, {}, u.person.account).expect(200);
    expect(await h.state(id)).toBe('WITHDRAWN');
  });
});
