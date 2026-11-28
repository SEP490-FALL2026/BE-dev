import request from 'supertest';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { AccessRequestRepo } from '../../../src/modules/requests/access-request/access-request.repo';
import type { NewAccessRequest } from '../../../src/modules/requests/access-request/access-request.types';
import { RequestTicketRepo } from '../../../src/modules/requests/request-ticket/request-ticket.repo';
import { bodyOf } from '../../support/api-body';
import { approvedBudget } from '../../support/builders/budget.builder';
import { createCostCenter, createDepartment } from '../../support/builders/organization.builder';
import { buildTicketWorld, type TicketWorld } from '../../support/request-ticket-harness';
import { SpendHarness } from '../../support/spend-harness';

const h = new SpendHarness();

interface ReplyRow {
  id: string;
  kind: string;
  returned_step_id: string | null;
  note: string;
  author_employee_id: string;
}

describe('W4-10 & W4-04: head resubmission reply notes in spend batches and queue/batch item fields (integration, real PostgreSQL)', () => {
  let w: TicketWorld;
  let runner: TransactionRunner;
  let ticketRepo: RequestTicketRepo;
  let requestRepo: AccessRequestRepo;
  let deptCounter = 0;

  beforeAll(async () => {
    await h.start();
    w = await buildTicketWorld(h, { budget: { baseMinor: 50_000_000n, reserveMinor: 0n } });
    runner = h.ctx.app.get(TransactionRunner);
    ticketRepo = h.ctx.app.get(RequestTicketRepo);
    requestRepo = h.ctx.app.get(AccessRequestRepo);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const makeUnitWithBudget = async (baseMinor: bigint) => {
    deptCounter += 1;
    const dep = await createDepartment(h.ctx, h.admin, {
      code: `P-BR-${deptCounter}`,
      name: `Batch Reply ${deptCounter}`,
      itAdminEmployeeId: h.it1.employeeId,
    });
    const cc = await createCostCenter(h.ctx, h.finance.accessToken, {
      code: `CC-BR-${deptCounter}`,
      name: `Batch Reply CC ${deptCounter}`,
      kind: 'UNIT',
      departmentId: dep.id,
    });
    const unit = { ...dep, unitId: cc.id };
    const member = await h.staff(unit, `BRE-${deptCounter}`);
    const head = await h.staff(unit, `BRH-${deptCounter}`);
    await h.makeHead(unit, head);
    await h.setItAdminInCharge(unit, { employeeId: h.it1.employeeId, account: h.it1 });
    await approvedBudget(h.ctx, {
      headToken: head.account.accessToken,
      financeToken: h.finance.accessToken,
      deciderToken: w.c1.account.accessToken,
      proposal: { year: 2026, requestedAmount: { amount: baseMinor.toString() } },
      version: {
        base: { amount: baseMinor.toString() },
        reserve: { amount: '0' },
        reserveReason: 'Fixture budget for reply-note batch test',
      },
    });
    return { unit, member, head };
  };

  const ticketRequest = (input: {
    departmentId: string;
    costCenterId: string;
    requesterEmployeeId: string;
    requesterAppUserId: string;
    headEmployeeId: string;
    planId: string;
    termMonths: number;
    monthlyPriceMinor: bigint;
    ticket?: { id: string; position: number };
  }): NewAccessRequest => ({
    organizationId: h.seed.organizationId,
    type: 'GRANT',
    branch: 'PAID_IN_CATALOG',
    state: 'PENDING',
    planId: input.planId,
    requesterEmployeeId: input.requesterEmployeeId,
    beneficiaryEmployeeIds: [input.requesterEmployeeId],
    departmentId: input.departmentId,
    costCenterId: input.costCenterId,
    businessReason: 'Need license for project',
    termMonths: input.termMonths,
    pricing: {
      status: 'PRICED',
      missingReason: null,
      kind: 'RECURRING',
      budgetYear: 2026,
      expectedEndDate: null,
      amountMonths: input.termMonths,
      amount: { amountMinor: input.monthlyPriceMinor * BigInt(input.termMonths), currency: 'VND' },
      unitPrice: { amountMinor: input.monthlyPriceMinor, currency: 'VND' },
      monthlyPriceMinor: input.monthlyPriceMinor,
      billingCycle: 'MONTHLY',
      nextYearAmount: null,
    },
    policy: {
      version: 2,
      branch: 'PAID_IN_CATALOG',
      chain: ['NEED', 'SPEND_APPROVAL', 'IT_EXECUTION'],
      slaWorkingDays: 3,
    },
    createdByAppUserId: input.requesterAppUserId,
    now: new Date('2026-06-01T08:00:00.000Z'),
    needStep: {
      state: 'PENDING',
      assigneeEmployeeId: input.headEmployeeId,
      routingRow: 1,
      waitingReason: null,
      slaWorkingDays: 3,
    },
    ...(input.ticket ? { ticket: input.ticket } : {}),
  });

  const submitWithNotes = (
    requestIds: string[],
    account: typeof w.h1.account,
    replyNotes?: Array<{ requestId: string; note: string }>,
  ) =>
    request(h.server())
      .post('/api/v1/spend-batches')
      .set(h.as(account))
      .send({ requestIds, ...(replyNotes !== undefined ? { replyNotes } : {}) });

  const repliesOf = (requestId: string) =>
    h.ctx.sql
      .query<ReplyRow>(
        `SELECT id, kind::text, returned_step_id, note, author_employee_id
           FROM access_request_replies WHERE request_id = $1 ORDER BY created_at, id`,
        [requestId],
      )
      .then((res) => res.rows);

  const spendStepIdsOf = (requestId: string) =>
    h.ctx.sql
      .query<{ id: string }>(
        `SELECT id FROM access_request_steps WHERE request_id = $1 AND kind = 'SPEND_APPROVAL' ORDER BY sequence`,
        [requestId],
      )
      .then((res) => res.rows.map((row) => row.id));

  it('§7.10 A, B, C & §7.4: enforces reply note on C1 return, exposes replyNoteRequired & ticketRef in queue/batch items, and rejects outside replyNote', async () => {
    const { unit, member, head } = await makeUnitWithBudget(20_000_000n);
    const { ticketId, r1, r4 } = await runner.run(async (tx) => {
      const ticket = await ticketRepo.insert(tx, {
        organizationId: h.seed.organizationId,
        requesterEmployeeId: member.employeeId,
        departmentId: unit.id,
        submittedAt: new Date('2026-06-01T08:00:00.000Z'),
      });
      const first = await requestRepo.insert(
        tx,
        ticketRequest({
          departmentId: unit.id,
          costCenterId: unit.unitId,
          requesterEmployeeId: member.employeeId,
          requesterAppUserId: member.account.appUserId,
          headEmployeeId: head.employeeId,
          planId: w.plans.miro,
          termMonths: 2,
          monthlyPriceMinor: 500_000n,
          ticket: { id: ticket.id, position: 1 },
        }),
      );
      const other = await requestRepo.insert(
        tx,
        ticketRequest({
          departmentId: unit.id,
          costCenterId: unit.unitId,
          requesterEmployeeId: member.employeeId,
          requesterAppUserId: member.account.appUserId,
          headEmployeeId: head.employeeId,
          planId: w.plans.notion,
          termMonths: 2,
          monthlyPriceMinor: 300_000n,
        }),
      );
      return { ticketId: ticket.id, r1: first.id, r4: other.id };
    });

    await h.decide(r1, { decision: 'APPROVE' }, head.account).expect(200);
    await h.decide(r4, { decision: 'APPROVE' }, head.account).expect(200);

    // Send r1 to C1, then C1 returns r1 to head.
    await submitWithNotes([r1], head.account).expect(201);
    const [returnedStepId] = await spendStepIdsOf(r1);
    await h.decideSpend(r1, { decision: 'RETURN', reason: 'Explain why Miro is needed' }, w.c1.account).expect(200);
    expect(await h.state(r1)).toBe('AWAITING_SPEND_SUBMISSION');

    // Queue shows replyNoteRequired = true and ticketRef for r1, and false/null for standalone r4.
    const queueBefore = h.dataOf<{
      items: Array<{
        requestId: string;
        replyNoteRequired: boolean;
        ticketRef: { id: string; position: number; itemCount: number } | null;
      }>;
    }>(await h.spendQueue(head.account, { pageSize: 100 }).expect(200)).items;
    expect(queueBefore.find((item) => item.requestId === r1)).toMatchObject({
      requestId: r1,
      replyNoteRequired: true,
      ticketRef: { id: ticketId, position: 1, itemCount: 1 },
    });
    expect(queueBefore.find((item) => item.requestId === r4)).toMatchObject({
      requestId: r4,
      replyNoteRequired: false,
      ticketRef: null,
    });

    // (C) Reply note for request outside batch -> 422 SPEND.REPLY_NOTE_NOT_IN_BATCH, no batch created.
    const batchCountBefore = await h.budgetRows('spend_batches');
    const outsideResp = await submitWithNotes([r4], head.account, [{ requestId: r1, note: 'Wrong batch' }]).expect(422);
    expect(bodyOf(outsideResp).error.code).toBe('SPEND.REPLY_NOTE_NOT_IN_BATCH');
    expect(await h.budgetRows('spend_batches')).toBe(batchCountBefore);

    // Validation boundaries (Trọng tâm 5)
    const blankNote = await submitWithNotes([r1], head.account, [{ requestId: r1, note: '   ' }]).expect(422);
    expect(bodyOf(blankNote).error.code).toBe('VALIDATION_ERROR');
    const longNote = await submitWithNotes([r1], head.account, [{ requestId: r1, note: 'a'.repeat(1001) }]).expect(422);
    expect(bodyOf(longNote).error.code).toBe('VALIDATION_ERROR');

    // (A) Submit [r1, r4] without replyNotes -> r1 STOPPED REPLY_NOTE_REQUIRED, r4 SENT_TO_APPROVER.
    const resA = h.dataOf<{
      batch: { id: string };
      results: Array<{ requestId: string; outcome: string; stopReason: string | null }>;
    }>(await submitWithNotes([r1, r4], head.account).expect(201));
    expect(resA.results).toEqual([
      { requestId: r1, outcome: 'STOPPED', stopReason: 'REPLY_NOTE_REQUIRED', reserveConfirmation: 'NOT_GIVEN' },
      { requestId: r4, outcome: 'SENT_TO_APPROVER', stopReason: null, reserveConfirmation: 'NOT_GIVEN' },
    ]);
    expect(await repliesOf(r1)).toEqual([]);
    expect(await h.state(r1)).toBe('AWAITING_SPEND_SUBMISSION');
    expect(await h.state(r4)).toBe('AWAITING_SPEND_DECISION');

    // spendBatchItemList includes ticketRef for ticket items and null for standalone items.
    const batchItemsA = h.dataOf<{
      items: Array<{ requestId: string; ticketRef: { id: string; position: number; itemCount: number } | null }>;
    }>(await h.batchItems(resA.batch.id, head.account, { pageSize: 100 }).expect(200)).items;
    expect(batchItemsA).toMatchObject([
      { requestId: r1, ticketRef: { id: ticketId, position: 1, itemCount: 1 } },
      { requestId: r4, ticketRef: null },
    ]);

    // (B) Submit r1 with replyNote -> SENT_TO_APPROVER, 1 HEAD_RESUBMISSION reply linked to returnedStepId.
    const resB = h.dataOf<{
      results: Array<{ requestId: string; outcome: string; stopReason: string | null }>;
    }>(
      await submitWithNotes([r1], head.account, [{ requestId: r1, note: 'Used for design prototypes in Q3' }]).expect(
        201,
      ),
    );
    expect(resB.results).toEqual([
      { requestId: r1, outcome: 'SENT_TO_APPROVER', stopReason: null, reserveConfirmation: 'NOT_GIVEN' },
    ]);
    expect(await repliesOf(r1)).toMatchObject([
      {
        kind: 'HEAD_RESUBMISSION',
        returned_step_id: returnedStepId,
        note: 'Used for design prototypes in Q3',
        author_employee_id: head.employeeId,
      },
    ]);
    expect(await h.state(r1)).toBe('AWAITING_SPEND_DECISION');
  });

  it('§7.10 D: system rechecked return (RECHECKED_RETURNED_TO_HEAD) does not require replyNote', async () => {
    const { unit, member, head } = await makeUnitWithBudget(2_000_000n);
    const { rRecheck, rConsume } = await runner.run(async (tx) => {
      const first = await requestRepo.insert(
        tx,
        ticketRequest({
          departmentId: unit.id,
          costCenterId: unit.unitId,
          requesterEmployeeId: member.employeeId,
          requesterAppUserId: member.account.appUserId,
          headEmployeeId: head.employeeId,
          planId: w.plans.miro,
          termMonths: 3, // 1.5M
          monthlyPriceMinor: 500_000n,
        }),
      );
      const second = await requestRepo.insert(
        tx,
        ticketRequest({
          departmentId: unit.id,
          costCenterId: unit.unitId,
          requesterEmployeeId: member.employeeId,
          requesterAppUserId: member.account.appUserId,
          headEmployeeId: head.employeeId,
          planId: w.plans.notion,
          termMonths: 4, // 1.2M
          monthlyPriceMinor: 300_000n,
        }),
      );
      return { rRecheck: first.id, rConsume: second.id };
    });

    await h.decide(rRecheck, { decision: 'APPROVE' }, head.account).expect(200);
    await h.decide(rConsume, { decision: 'APPROVE' }, head.account).expect(200);
    await submitWithNotes([rRecheck, rConsume], head.account).expect(201);

    // Approve rConsume (1.2M) leaving 0.8M -> approving rRecheck (1.5M) triggers RECHECKED_RETURNED_TO_HEAD.
    await h.decideSpend(rConsume, { decision: 'APPROVE' }, w.c1.account).expect(200);
    const bounced = await h.decideSpend(rRecheck, { decision: 'APPROVE' }, w.c1.account).expect(409);
    expect(h.codeOf(bounced)).toBe('SPEND.RECHECKED_RETURNED_TO_HEAD');

    const queue = h.dataOf<{ items: Array<{ requestId: string; replyNoteRequired: boolean }> }>(
      await h.spendQueue(head.account, { pageSize: 100 }).expect(200),
    ).items;
    expect(queue.find((item) => item.requestId === rRecheck)).toMatchObject({ replyNoteRequired: false });

    // Shorten rRecheck to 1 month (0.5M <= 0.8M) and resubmit WITHOUT replyNotes -> 201 SENT_TO_APPROVER.
    await h.addSupplement(rRecheck, { termMonths: 1, reason: 'Fit remaining budget' }, head.account).expect(201);
    const res = h.dataOf<{ results: Array<{ requestId: string; outcome: string }> }>(
      await submitWithNotes([rRecheck], head.account).expect(201),
    );
    expect(res.results).toEqual([expect.objectContaining({ requestId: rRecheck, outcome: 'SENT_TO_APPROVER' })]);
    expect(await repliesOf(rRecheck)).toEqual([]);
  });

  it('§7.10 E: does not insert reply when item is STOPPED by budget, then succeeds with one reply when budget fits', async () => {
    const { unit, member, head } = await makeUnitWithBudget(2_500_000n);
    const { r1, rConsume } = await runner.run(async (tx) => {
      const first = await requestRepo.insert(
        tx,
        ticketRequest({
          departmentId: unit.id,
          costCenterId: unit.unitId,
          requesterEmployeeId: member.employeeId,
          requesterAppUserId: member.account.appUserId,
          headEmployeeId: head.employeeId,
          planId: w.plans.miro,
          termMonths: 4, // 2.0M
          monthlyPriceMinor: 500_000n,
        }),
      );
      const second = await requestRepo.insert(
        tx,
        ticketRequest({
          departmentId: unit.id,
          costCenterId: unit.unitId,
          requesterEmployeeId: member.employeeId,
          requesterAppUserId: member.account.appUserId,
          headEmployeeId: head.employeeId,
          planId: w.plans.notion,
          termMonths: 6, // 1.8M
          monthlyPriceMinor: 300_000n,
        }),
      );
      return { r1: first.id, rConsume: second.id };
    });

    await h.decide(r1, { decision: 'APPROVE' }, head.account).expect(200);
    await h.decide(rConsume, { decision: 'APPROVE' }, head.account).expect(200);
    await submitWithNotes([r1], head.account).expect(201);
    const [returnedStepId] = await spendStepIdsOf(r1);
    await h.decideSpend(r1, { decision: 'RETURN', reason: 'Need reply' }, w.c1.account).expect(200);

    // Consume 1.8M so remaining is 0.7M (< r1 2.0M).
    await submitWithNotes([rConsume], head.account).expect(201);
    await h.decideSpend(rConsume, { decision: 'APPROVE' }, w.c1.account).expect(200);

    // Attempt 1 with replyNote while over budget -> STOPPED OVER_RESERVE, NO reply inserted!
    const attempt1 = h.dataOf<{ results: Array<{ requestId: string; outcome: string; stopReason: string | null }> }>(
      await submitWithNotes([r1], head.account, [{ requestId: r1, note: 'Reply attempt 1' }]).expect(201),
    );
    expect(attempt1.results).toEqual([
      { requestId: r1, outcome: 'STOPPED', stopReason: 'OVER_RESERVE', reserveConfirmation: 'NOT_GIVEN' },
    ]);
    expect(await repliesOf(r1)).toEqual([]);

    // Queue still requires reply note.
    const queue = h.dataOf<{ items: Array<{ requestId: string; replyNoteRequired: boolean }> }>(
      await h.spendQueue(head.account, { pageSize: 100 }).expect(200),
    ).items;
    expect(queue.find((item) => item.requestId === r1)).toMatchObject({ replyNoteRequired: true });

    // Shorten r1 to 1 month (0.5M <= 0.7M) and resubmit WITH replyNote -> SENT_TO_APPROVER, 1 reply, no 500.
    await h.addSupplement(r1, { termMonths: 1, reason: 'Fit remaining 0.7M' }, head.account).expect(201);
    const attempt2 = h.dataOf<{ results: Array<{ requestId: string; outcome: string; stopReason: string | null }> }>(
      await submitWithNotes([r1], head.account, [{ requestId: r1, note: 'Reply attempt 2' }]).expect(201),
    );
    expect(attempt2.results).toEqual([
      { requestId: r1, outcome: 'SENT_TO_APPROVER', stopReason: null, reserveConfirmation: 'NOT_GIVEN' },
    ]);
    expect(await repliesOf(r1)).toMatchObject([
      {
        kind: 'HEAD_RESUBMISSION',
        returned_step_id: returnedStepId,
        note: 'Reply attempt 2',
        author_employee_id: head.employeeId,
      },
    ]);
  });

  it('D-10: POST /spend-batches returns STOPPED/REPLY_NOTE_REQUIRED, persists the spend_batch_items row, and GET /spend-batches/{id}/items matches', async () => {
    const { unit, member, head } = await makeUnitWithBudget(10_000_000n);
    const r1 = await runner.run(async (tx) => {
      const created = await requestRepo.insert(
        tx,
        ticketRequest({
          departmentId: unit.id,
          costCenterId: unit.unitId,
          requesterEmployeeId: member.employeeId,
          requesterAppUserId: member.account.appUserId,
          headEmployeeId: head.employeeId,
          planId: w.plans.miro,
          termMonths: 2,
          monthlyPriceMinor: 500_000n,
        }),
      );
      return created.id;
    });

    await h.decide(r1, { decision: 'APPROVE' }, head.account).expect(200);
    await submitWithNotes([r1], head.account).expect(201);
    await h.decideSpend(r1, { decision: 'RETURN', reason: 'Missing spend justification' }, w.c1.account).expect(200);

    const submitted = h.dataOf<{
      batch: { id: string };
      results: Array<{ requestId: string; outcome: string; stopReason: string | null; reserveConfirmation: string }>;
    }>(await submitWithNotes([r1], head.account).expect(201));

    expect(submitted.results).toEqual([
      { requestId: r1, outcome: 'STOPPED', stopReason: 'REPLY_NOTE_REQUIRED', reserveConfirmation: 'NOT_GIVEN' },
    ]);

    const persisted = await h.ctx.sql.query<{ request_id: string; outcome: string; stop_reason: string | null }>(
      `SELECT request_id, outcome::text, stop_reason FROM spend_batch_items WHERE batch_id = $1`,
      [submitted.batch.id],
    );
    expect(persisted.rows).toEqual([{ request_id: r1, outcome: 'STOPPED', stop_reason: 'REPLY_NOTE_REQUIRED' }]);

    const batchItems = h.dataOf<{
      items: Array<{ requestId: string; outcome: string; stopReason: string | null }>;
    }>(await h.batchItems(submitted.batch.id, head.account, { pageSize: 100 }).expect(200)).items;
    expect(batchItems).toMatchObject([{ requestId: r1, outcome: 'STOPPED', stopReason: 'REPLY_NOTE_REQUIRED' }]);
  });
});
