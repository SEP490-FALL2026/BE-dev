import request from 'supertest';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { RequestReplyRepo } from '../../../src/modules/requests/request-reply/request-reply.repo';
import { bodyOf } from '../../support/api-body';
import { Barrier } from '../../support/concurrency-harness';
import { GroupHarness } from '../../support/group-harness';
import type { AccessRequestWire } from '../../support/request-harness';
import { handOthersToSecondItAdmin } from '../../support/second-it-admin';
import type { Unit } from '../../support/spend-harness';

const h = new GroupHarness();
const M = 1_000_000;

interface ReplyRow {
  id: string;
  kind: string;
  returned_step_id: string | null;
  note: string;
  author_employee_id: string;
}

describe('W4-09: reply note on requester resubmission (integration, real PostgreSQL)', () => {
  let paid: string;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    await handOthersToSecondItAdmin(h);
    paid = await h.planOf(await h.subscription(100));
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const unit = async (budget?: { total: number; reserve?: number }): Promise<Unit> => {
    counter += 1;
    const u = await h.departmentWithHead(`P-DES-${counter}`);
    await h.setItAdminInCharge(u.department, { employeeId: h.it1.employeeId, account: h.it1 });
    if (budget) await h.budgetFor(u, budget);
    return u;
  };

  const resubmit = (id: string, account: Unit['member']['account'], body?: object) => {
    const req = request(h.server()).post(`/api/v1/access-requests/${id}/resubmission`).set(h.as(account));
    return body === undefined ? req : req.send(body);
  };

  const repliesOf = (requestId: string) =>
    h.ctx.sql
      .query<ReplyRow>(
        `SELECT id, kind::text, returned_step_id, note, author_employee_id
           FROM access_request_replies WHERE request_id = $1 ORDER BY created_at, id`,
        [requestId],
      )
      .then((res) => res.rows);

  const stepsOf = (requestId: string) =>
    h.ctx.sql
      .query<{ id: string; kind: string; state: string; sequence: number }>(
        `SELECT id, kind::text, state::text, sequence
           FROM access_request_steps WHERE request_id = $1 ORDER BY sequence`,
        [requestId],
      )
      .then((res) => res.rows);

  it('§7.9 A & B: requires replyNote after head return (422 with returnedStepId), then accepts and saves reply linked to returned step', async () => {
    const u = await unit({ total: 100 * M });
    const sent = await h.sent(u.member, paid, { termMonths: 1 });
    const returned = h.dataOf<{ request: AccessRequestWire }>(
      await h.decide(sent.id, { decision: 'RETURN', reason: 'Nêu rõ dự án' }, u.head.account).expect(200),
    ).request;
    expect(returned.state).toBe('AWAITING_REQUESTER_REVISION');

    // A: missing replyNote -> 422 ACCESS_REQUEST.REPLY_NOTE_REQUIRED, request unchanged
    const missing = await resubmit(sent.id, u.member.account, {}).expect(422);
    expect(bodyOf(missing).error).toMatchObject({
      code: 'ACCESS_REQUEST.REPLY_NOTE_REQUIRED',
      details: { returnedStepId: returned.needStep.id },
    });
    expect(await h.state(sent.id)).toBe('AWAITING_REQUESTER_REVISION');
    expect(await repliesOf(sent.id)).toEqual([]);

    // B: with replyNote -> 200, 1 reply referencing the returned NEED step, new NEED step, audit has replyId
    const again = h.dataOf<{ request: AccessRequestWire }>(
      await resubmit(sent.id, u.member.account, { replyNote: 'dùng cho dự án X, 3 tháng' }).expect(200),
    ).request;
    expect(again.state).toBe('PENDING');
    expect(again.needStep.id).not.toBe(returned.needStep.id);

    const replies = await repliesOf(sent.id);
    expect(replies).toHaveLength(1);
    expect(replies[0]).toMatchObject({
      kind: 'REQUESTER_RESUBMISSION',
      returned_step_id: returned.needStep.id,
      note: 'dùng cho dự án X, 3 tháng',
      author_employee_id: u.member.employeeId,
    });
    const events = await h.auditEvents('ACCESS_REQUEST', sent.id);
    const resubmitted = events.find((e) => e.action === 'ACCESS_REQUEST.RESUBMITTED');
    expect(resubmitted?.after).toMatchObject({ replyId: replies[0].id });
  });

  it('§7.9 D: allows one-step request blocked by budget to resubmit without replyNote (200), and stores voluntary note with null returnedStepId', async () => {
    const u = await unit();
    const blocked = await h.sent(u.head, paid, { termMonths: 1 });
    expect(blocked.state).toBe('AWAITING_REQUESTER_REVISION');

    await resubmit(blocked.id, u.head.account).expect(200);
    expect(await repliesOf(blocked.id)).toEqual([]);

    await resubmit(blocked.id, u.head.account, { replyNote: 'Đang xin cấp ngân sách' }).expect(200);
    expect(await repliesOf(blocked.id)).toMatchObject([
      {
        kind: 'REQUESTER_RESUBMISSION',
        returned_step_id: null,
        note: 'Đang xin cấp ngân sách',
        author_employee_id: u.head.employeeId,
      },
    ]);
  });

  it('§7.9 E: one-step returned by C1 requires replyNote once, then subsequent budget-blocked resubmission succeeds without replyNote and without 23505', async () => {
    const u = await unit({ total: 100 * M });
    const summary = h.dataOf<{ totals: Record<string, { runningUncommitted: { amount: string; currency: string } }> }>(
      await h.summary(h.finance, { year: h.year }).expect(200),
    );
    expect(summary.totals[h.reporting].runningUncommitted).toEqual({ amount: '0', currency: h.reporting });

    const sent = await h.sent(u.head, paid, { termMonths: 1 });
    expect(sent.state).toBe('AWAITING_SPEND_DECISION');
    const [spendStep] = await stepsOf(sent.id).then((rows) => rows.filter((s) => s.kind === 'SPEND_APPROVAL'));

    await h.decideSpend(sent.id, { decision: 'RETURN', reason: 'Bổ sung lý do chi' }, h.boss.account).expect(200);
    expect(await h.state(sent.id)).toBe('AWAITING_REQUESTER_REVISION');

    // Missing note -> 422 referencing the returned SPEND_APPROVAL step
    const missing = await resubmit(sent.id, u.head.account).expect(422);
    expect(bodyOf(missing).error).toMatchObject({
      code: 'ACCESS_REQUEST.REPLY_NOTE_REQUIRED',
      details: { returnedStepId: spendStep.id },
    });

    // Raise amount above budget so budget check blocks on resubmission
    await h.setPayments(sent.id, { amount: 150 * M });
    await resubmit(sent.id, u.head.account, { replyNote: 'Giải trình chi phí cho C1' }).expect(200);
    expect(await h.state(sent.id)).toBe('AWAITING_REQUESTER_REVISION');
    const replies1 = await repliesOf(sent.id);
    expect(replies1).toHaveLength(1);
    const eventsAfterNote = await h.auditEvents('ACCESS_REQUEST', sent.id);
    expect(eventsAfterNote.filter((e) => e.action === 'ACCESS_REQUEST.RESUBMITTED')).toHaveLength(0);
    const checkedWithNote = eventsAfterNote.filter((e) => e.action === 'ACCESS_REQUEST.BUDGET_CHECKED');
    expect(checkedWithNote[checkedWithNote.length - 1].after).toMatchObject({
      trigger: 'SUBMISSION',
      replyId: replies1[0].id,
    });

    // Lower amount back within budget and resubmit WITHOUT replyNote -> 200, no 23505, still 1 reply
    await h.setPayments(sent.id, { amount: 50 * M });
    await resubmit(sent.id, u.head.account).expect(200);
    expect(await h.state(sent.id)).toBe('AWAITING_SPEND_DECISION');
    expect(await repliesOf(sent.id)).toHaveLength(1);
    expect((await repliesOf(sent.id))[0].returned_step_id).toBe(spendStep.id);
  });

  it('§7.9 F: proposal returned at IT assessment (1.3) requires replyNote and links reply to assessment step', async () => {
    const u = await unit({ total: 100 * M });
    const proposed = await h.proposed(u.member);
    await h.decide(proposed.id, { decision: 'APPROVE' }, u.head.account).expect(200);
    await h.saveAssessment(proposed.id, h.assessmentBody(), h.it1).expect(200);
    await h.rejectAssessment(proposed.id, { decision: 'RETURN', reason: 'Bổ sung số ghế dự kiến' }, h.it1).expect(200);

    const assessmentStep = (await stepsOf(proposed.id)).find((s) => s.kind === 'IT_ASSESSMENT');
    expect(assessmentStep?.state).toBe('CLOSED');

    const missing = await resubmit(proposed.id, u.member.account, {}).expect(422);
    expect(bodyOf(missing).error).toMatchObject({
      code: 'ACCESS_REQUEST.REPLY_NOTE_REQUIRED',
      details: { returnedStepId: assessmentStep?.id },
    });

    await resubmit(proposed.id, u.member.account, { replyNote: 'Dự kiến 5 ghế cho team thiết kế' }).expect(200);
    expect(await h.state(proposed.id)).toBe('AWAITING_IT_ASSESSMENT');
    expect(await repliesOf(proposed.id)).toMatchObject([
      {
        kind: 'REQUESTER_RESUBMISSION',
        returned_step_id: assessmentStep?.id,
        note: 'Dự kiến 5 ghế cho team thiết kế',
        author_employee_id: u.member.employeeId,
      },
    ]);
  });

  it('§7.9 G: 2 concurrent resubmissions via Barrier(2) x20 yield one 200 and one 409 NOT_AWAITING_REVISION with exactly one reply', async () => {
    const u = await unit({ total: 100 * M });

    for (let round = 0; round < 20; round += 1) {
      const sent = await h.sent(u.member, paid, { termMonths: 1 });
      await h.decide(sent.id, { decision: 'RETURN', reason: `Round ${round}` }, u.head.account).expect(200);

      const barrier = new Barrier(2);
      const first = (async () => {
        await barrier.wait();
        return resubmit(sent.id, u.member.account, { replyNote: `Reply A ${round}` });
      })();
      const second = (async () => {
        await barrier.wait();
        return resubmit(sent.id, u.member.account, { replyNote: `Reply B ${round}` });
      })();

      const responses = await Promise.all([first, second]);
      const statuses = responses.map((res) => res.status).sort((a, b) => a - b);
      expect(statuses).toEqual([200, 409]);

      const refused = responses.find((res) => res.status === 409);
      expect(bodyOf(refused!).error.code).toBe('ACCESS_REQUEST.NOT_AWAITING_REVISION');
      expect(await repliesOf(sent.id)).toHaveLength(1);
    }
  }, 120000);

  it('RequestReplyRepo.latestOfMany & spendReturnsAwaitingReply batch queries return exact map and awaiting set', async () => {
    const u = await unit({ total: 100 * M });
    const reqReturned = await h.sent(u.member, paid, { termMonths: 1 });
    const reqReplied = await h.sent(u.member, paid, { termMonths: 1 });
    const reqPending = await h.sent(u.member, paid, { termMonths: 1 });

    await h.decide(reqReturned.id, { decision: 'APPROVE' }, u.head.account).expect(200);
    await h.decide(reqReplied.id, { decision: 'APPROVE' }, u.head.account).expect(200);
    await h.sendOn([reqReturned.id, reqReplied.id], u.head.account).expect(201);
    await h.decideSpend(reqReturned.id, { decision: 'RETURN', reason: 'Need spend info' }, h.boss.account).expect(200);
    await h.decideSpend(reqReplied.id, { decision: 'RETURN', reason: 'Need spend info 2' }, h.boss.account).expect(200);

    await request(h.server())
      .post('/api/v1/spend-batches')
      .set(h.as(u.head.account))
      .send({ requestIds: [reqReplied.id], replyNotes: [{ requestId: reqReplied.id, note: 'Answered spend info' }] })
      .expect(201);

    const repo = h.ctx.app.get(RequestReplyRepo, { strict: false });
    const awaiting = await repo.spendReturnsAwaitingReply([reqReturned.id, reqReplied.id, reqPending.id]);
    expect(awaiting).toEqual(new Set([reqReturned.id]));

    const latest = await repo.latestOfMany([reqReturned.id, reqReplied.id, reqPending.id]);
    expect(latest.has(reqReturned.id)).toBe(false);
    expect(latest.has(reqPending.id)).toBe(false);
    expect(latest.get(reqReplied.id)).toMatchObject({
      kind: 'HEAD_RESUBMISSION',
      note: 'Answered spend info',
      author: { id: u.head.employeeId },
    });
  });

  it('nit: COMPLETED IT_ASSESSMENT step is not treated as pending human return when proposal blocks on budget', async () => {
    const u = await unit(); // 0 budget -> blocks after completed IT assessment
    const oneStepProposal = await h.proposed(u.head);
    await h.saveAssessment(oneStepProposal.id, h.assessmentBody(), h.it1).expect(200);
    await h.completeAssessment(oneStepProposal.id, h.it1).expect(200);
    expect(await h.state(oneStepProposal.id)).toBe('AWAITING_REQUESTER_REVISION');

    const runner = h.ctx.app.get(TransactionRunner, { strict: false });
    const repo = h.ctx.app.get(RequestReplyRepo, { strict: false });
    const returns = await runner.run((tx) => repo.humanReturnsOf(tx, oneStepProposal.id));
    expect(returns).toEqual([]);

    await resubmit(oneStepProposal.id, u.head.account).expect(200);
    expect(await repliesOf(oneStepProposal.id)).toEqual([]);
  });

  it('nit: group request returned at NEED requires replyNote on resubmission (422 -> 200)', async () => {
    const u = await unit({ total: 100 * M });
    const [e1, e2] = await h.colleagues(u, 2);
    const group = h.dataOf<{ request: AccessRequestWire }>(
      await h.submitGroup(h.groupBody(paid, [e1, e2]), e1.account).expect(201),
    ).request;

    const no = h.checklists.questionsOf('1.2')[0];
    await h
      .decideLines(
        group.id,
        {
          lines: [
            { employeeId: e1.employeeId, decision: 'RETURN', reason: 'Clarify group size' },
            { employeeId: e2.employeeId, decision: 'RETURN', reason: 'Clarify group size' },
          ],
          checklist: h.checklists.answer('1.2', [no]),
        },
        u.head.account,
      )
      .expect(200);
    expect(await h.state(group.id)).toBe('AWAITING_REQUESTER_REVISION');

    const missing = await resubmit(group.id, e1.account, {}).expect(422);
    expect(bodyOf(missing).error.code).toBe('ACCESS_REQUEST.REPLY_NOTE_REQUIRED');

    await resubmit(group.id, e1.account, { replyNote: 'Both people work on design' }).expect(200);
    expect(await h.state(group.id)).toBe('PENDING');
    expect(await repliesOf(group.id)).toHaveLength(1);
  });
});
