import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { AccessRequestRepo } from '../../../src/modules/requests/access-request/access-request.repo';
import type { NewAccessRequest } from '../../../src/modules/requests/access-request/access-request.types';
import { RequestTicketRepo } from '../../../src/modules/requests/request-ticket/request-ticket.repo';
import { bodyOf } from '../../support/api-body';
import { Barrier } from '../../support/concurrency-harness';
import { type Person } from '../../support/request-harness';
import { buildTicketWorld, type TicketWorld } from '../../support/request-ticket-harness';
import { SpendHarness } from '../../support/spend-harness';

const h = new SpendHarness();
const SUBMITTED_AT = new Date('2026-06-01T08:00:00.000Z');

describe('W4-08: withdraw a whole request ticket (integration, real PostgreSQL)', () => {
  let world: TicketWorld;
  let outsider: Person;
  let runner: TransactionRunner;
  let ticketRepo: RequestTicketRepo;
  let requestRepo: AccessRequestRepo;

  beforeAll(async () => {
    await h.start();
    world = await buildTicketWorld(h);
    outsider = await h.staff(world.other, 'OTH-W1');
    runner = h.ctx.app.get(TransactionRunner);
    ticketRepo = h.ctx.app.get(RequestTicketRepo);
    requestRepo = h.ctx.app.get(AccessRequestRepo);

    const summary = h.dataOf<{ totals: Record<string, { runningUncommitted: { amount: string; currency: string } }> }>(
      await request(h.server()).get('/api/v1/budgets/summary').query({ year: 2026 }).set(h.as(h.finance)).expect(200),
    );
    expect(summary.totals[h.reporting].runningUncommitted).toEqual({ amount: '0', currency: h.reporting });
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const baseItem = (
    requester: Person,
    department: { id: string; unitId: string },
    planId: string,
    ticket: { id: string; position: number },
    over: Partial<NewAccessRequest> = {},
  ): NewAccessRequest => ({
    organizationId: h.seed.organizationId,
    type: 'GRANT',
    branch: 'PAID_IN_CATALOG',
    state: 'PENDING',
    planId,
    requesterEmployeeId: requester.employeeId,
    beneficiaryEmployeeIds: [requester.employeeId],
    departmentId: department.id,
    costCenterId: department.unitId,
    businessReason: 'Need license for project',
    termMonths: 6,
    pricing: {
      status: 'PRICED',
      missingReason: null,
      kind: 'RECURRING',
      budgetYear: 2026,
      expectedEndDate: null,
      amountMonths: 6,
      amount: { amountMinor: 3_000_000n, currency: 'VND' },
      unitPrice: { amountMinor: 500_000n, currency: 'VND' },
      monthlyPriceMinor: 500_000n,
      billingCycle: 'MONTHLY',
      nextYearAmount: null,
    },
    policy: {
      version: 2,
      branch: 'PAID_IN_CATALOG',
      chain: ['NEED', 'SPEND_APPROVAL', 'IT_EXECUTION'],
      slaWorkingDays: 3,
    },
    createdByAppUserId: requester.account.appUserId,
    now: SUBMITTED_AT,
    needStep: {
      state: 'PENDING',
      assigneeEmployeeId: world.h1.employeeId,
      routingRow: 1,
      waitingReason: null,
      slaWorkingDays: 3,
    },
    ticket,
    ...over,
  });

  const insertTicket = async (
    requester: Person,
    department: { id: string; unitId: string },
    specs: { planId: string; position: number; over?: Partial<NewAccessRequest> }[],
    submittedAt: Date = SUBMITTED_AT,
  ) =>
    runner.run(async (tx) => {
      const ticket = await ticketRepo.insert(tx, {
        organizationId: h.seed.organizationId,
        requesterEmployeeId: requester.employeeId,
        departmentId: department.id,
        submittedAt,
      });
      const requestIds: string[] = [];
      for (const spec of specs) {
        const created = await requestRepo.insert(
          tx,
          baseItem(
            requester,
            department,
            spec.planId,
            { id: ticket.id, position: spec.position },
            {
              now: submittedAt,
              ...spec.over,
            },
          ),
        );
        requestIds.push(created.id);
      }
      return { ticketId: ticket.id, requestIds };
    });

  const withdrawTicket = (ticketId: string, account: Person['account'], body: object = {}) =>
    request(h.server()).post(`/api/v1/request-tickets/${ticketId}/withdrawal`).set(h.as(account)).send(body);

  const withdrawSingle = (requestId: string, account: Person['account'], body: object = {}) =>
    request(h.server()).post(`/api/v1/access-requests/${requestId}/withdraw`).set(h.as(account)).send(body);

  const withdrawnEventsCount = async (requestId: string): Promise<number> => {
    const { rows } = await h.ctx.sql.query<{ cnt: number }>(
      `SELECT count(*)::int AS cnt FROM audit_events WHERE action = 'ACCESS_REQUEST.WITHDRAWN' AND resource_id = $1`,
      [requestId],
    );
    return rows[0].cnt;
  };

  it('§7.8 A, B, C & G: single withdraw keeps ticket in progress, non-requester gets 403, outsider gets 404, whole withdraw & retry are idempotent', async () => {
    const { ticketId, requestIds } = await insertTicket(world.e1, world.pDes, [
      { planId: world.plans.figmaFull, position: 1 },
      { planId: world.plans.figmaDev, position: 2 },
      { planId: world.plans.miro, position: 3 },
    ]);
    const [r1, r2, r3] = requestIds;

    // (A) H1 approves R1 and sends R1 to spend decision so C1 can view it; E1 withdraws R2 individually -> R2 WITHDRAWN, R1/R3 remain open
    await h.decide(r1, { decision: 'APPROVE' }, world.h1.account).expect(200);
    await h.sendOn([r1], world.h1.account).expect(201);
    await withdrawSingle(r2, world.e1.account).expect(200);
    expect(await h.state(r2)).toBe('WITHDRAWN');
    expect(await h.state(r1)).toBe('AWAITING_SPEND_DECISION');
    expect(await h.state(r3)).toBe('PENDING');

    // (C) H1 & C1 (can view, not requester) -> 403 REQUEST_TICKET.NOT_REQUESTER; outsider -> 404 REQUEST_TICKET.NOT_FOUND
    const headForbidden = await withdrawTicket(ticketId, world.h1.account).expect(403);
    expect(bodyOf(headForbidden).error.code).toBe('REQUEST_TICKET.NOT_REQUESTER');
    const c1Forbidden = await withdrawTicket(ticketId, world.c1.account).expect(403);
    expect(bodyOf(c1Forbidden).error.code).toBe('REQUEST_TICKET.NOT_REQUESTER');
    const outsiderHidden = await withdrawTicket(ticketId, outsider.account).expect(404);
    expect(bodyOf(outsiderHidden).error.code).toBe('REQUEST_TICKET.NOT_FOUND');
    const missingTicket = await withdrawTicket(randomUUID(), world.e1.account).expect(404);
    expect(bodyOf(missingTicket).error.code).toBe('REQUEST_TICKET.NOT_FOUND');

    // (B) E1 withdraws whole ticket -> R1 SKIPPED WITHDRAWAL_AFTER_DECISION, R2 ALREADY_WITHDRAWN, R3 WITHDRAWN
    const whole = await withdrawTicket(ticketId, world.e1.account, { reason: 'Project cancelled' }).expect(200);
    expect(bodyOf(whole).message).toBe('REQUEST_TICKET.WITHDRAWN');
    expect(h.dataOf<{ results: unknown[] }>(whole).results).toEqual([
      { requestId: r1, outcome: 'SKIPPED', reason: 'WITHDRAWAL_AFTER_DECISION' },
      { requestId: r2, outcome: 'WITHDRAWN', reason: 'ALREADY_WITHDRAWN' },
      { requestId: r3, outcome: 'WITHDRAWN', reason: null },
    ]);
    expect(await h.state(r3)).toBe('WITHDRAWN');
    expect(await withdrawnEventsCount(r2)).toBe(1);
    expect(await withdrawnEventsCount(r3)).toBe(1);

    // (G) Retrying whole ticket withdrawal writes nothing extra
    const retry = await withdrawTicket(ticketId, world.e1.account, { reason: 'Retry call' }).expect(200);
    expect(h.dataOf<{ results: unknown[] }>(retry).results).toEqual([
      { requestId: r1, outcome: 'SKIPPED', reason: 'WITHDRAWAL_AFTER_DECISION' },
      { requestId: r2, outcome: 'WITHDRAWN', reason: 'ALREADY_WITHDRAWN' },
      { requestId: r3, outcome: 'WITHDRAWN', reason: 'ALREADY_WITHDRAWN' },
    ]);
    expect(await withdrawnEventsCount(r2)).toBe(1);
    expect(await withdrawnEventsCount(r3)).toBe(1);
    const { rows } = await h.ctx.sql.query<{ withdrawal_reason: string | null }>(
      `SELECT withdrawal_reason FROM access_requests WHERE id = $1`,
      [r3],
    );
    expect(rows[0].withdrawal_reason).toBe('Project cancelled');
  });

  it('§7.8 D: withdraws an item in WAITING_CONTROLLED', async () => {
    const noHeadDept = await h.departmentWithUnit('P-NOHEAD');
    await h.setItAdminInCharge(noHeadDept, { employeeId: world.it1.employeeId, account: world.it1 });
    const eNoHead = await h.staff(noHeadDept, 'ENH-W1');

    const { ticketId, requestIds } = await insertTicket(eNoHead, noHeadDept, [
      {
        planId: world.plans.notion,
        position: 1,
        over: {
          state: 'WAITING_CONTROLLED',
          needStep: {
            state: 'WAITING',
            assigneeEmployeeId: null,
            routingRow: 4,
            waitingReason: 'NO_DEPARTMENT_HEAD',
            slaWorkingDays: 3,
          },
        },
      },
    ]);

    const response = await withdrawTicket(ticketId, eNoHead.account).expect(200);
    expect(h.dataOf<{ results: unknown[] }>(response).results).toEqual([
      { requestId: requestIds[0], outcome: 'WITHDRAWN', reason: null },
    ]);
    expect(await h.state(requestIds[0])).toBe('WITHDRAWN');
  });

  it('§7.8 F: withdraws an item returned by the head (AWAITING_REQUESTER_REVISION)', async () => {
    const { ticketId, requestIds } = await insertTicket(world.e1, world.pDes, [
      { planId: world.plans.slack, position: 1 },
    ]);
    const [r1] = requestIds;

    await h.decide(r1, { decision: 'RETURN', reason: 'Clarify team size' }, world.h1.account).expect(200);
    expect(await h.state(r1)).toBe('AWAITING_REQUESTER_REVISION');

    const response = await withdrawTicket(ticketId, world.e1.account).expect(200);
    expect(h.dataOf<{ results: unknown[] }>(response).results).toEqual([
      { requestId: r1, outcome: 'WITHDRAWN', reason: null },
    ]);
    expect(await h.state(r1)).toBe('WITHDRAWN');
  });

  it('§7.8: returns per-item outcomes when every item is already in ENDED_STATES', async () => {
    const { ticketId, requestIds } = await insertTicket(world.e1, world.pDes, [
      { planId: world.plans.figmaFull, position: 1 },
      { planId: world.plans.figmaDev, position: 2 },
    ]);
    const [rRej, rWd] = requestIds;

    await h.decide(rRej, { decision: 'REJECT', reason: 'Not needed' }, world.h1.account).expect(200);
    await withdrawSingle(rWd, world.e1.account).expect(200);

    const response = await withdrawTicket(ticketId, world.e1.account).expect(200);
    expect(h.dataOf<{ results: unknown[] }>(response).results).toEqual([
      { requestId: rRej, outcome: 'SKIPPED', reason: 'ALREADY_ENDED' },
      { requestId: rWd, outcome: 'WITHDRAWN', reason: 'ALREADY_WITHDRAWN' },
    ]);
  });

  it('Barrier(2) concurrency: two concurrent ticket withdrawals produce no 40P01 and withdraw each item once', async () => {
    for (let round = 0; round < 10; round += 1) {
      const { ticketId, requestIds } = await insertTicket(world.e1, world.pDes, [
        { planId: world.plans.miro, position: 1 },
        { planId: world.plans.notion, position: 2 },
      ]);
      const barrier = new Barrier(2);
      const first = (async () => {
        await barrier.wait();
        return withdrawTicket(ticketId, world.e1.account, { reason: `Race A ${round}` });
      })();
      const second = (async () => {
        await barrier.wait();
        return withdrawTicket(ticketId, world.e1.account, { reason: `Race B ${round}` });
      })();

      const [resA, resB] = await Promise.all([first, second]);
      expect(resA.status).toBe(200);
      expect(resB.status).toBe(200);
      const resultsA = h.dataOf<{ results: { requestId: string; outcome: string; reason: string | null }[] }>(
        resA,
      ).results;
      const resultsB = h.dataOf<{ results: { requestId: string; outcome: string; reason: string | null }[] }>(
        resB,
      ).results;
      expect(resultsA.map((r) => r.requestId)).toEqual(requestIds);
      expect(resultsB.map((r) => r.requestId)).toEqual(requestIds);
      for (let i = 0; i < requestIds.length; i += 1) {
        expect(resultsA[i].outcome).toBe('WITHDRAWN');
        expect(resultsB[i].outcome).toBe('WITHDRAWN');
        expect(new Set([resultsA[i].reason, resultsB[i].reason])).toEqual(new Set([null, 'ALREADY_WITHDRAWN']));
      }
      for (const reqId of requestIds) {
        expect(await h.state(reqId)).toBe('WITHDRAWN');
        expect(await withdrawnEventsCount(reqId)).toBe(1);
      }
    }
  }, 120000);

  it('§7.8 E: GH-2 still counts withdrawn ticket items toward weekly open-request limit', async () => {
    const eGh2 = await h.staff(world.pDes, 'GH2-W1');
    await h.enforceRequestLimits();
    await h.setParameter('REQUEST_OPEN_NEW_LIMIT', 2).expect(200);

    const { ticketId, requestIds } = await insertTicket(
      eGh2,
      world.pDes,
      [
        { planId: world.plans.notion, position: 1 },
        { planId: world.plans.slack, position: 2 },
      ],
      new Date(),
    );

    await withdrawTicket(ticketId, eGh2.account).expect(200);
    for (const id of requestIds) expect(await h.state(id)).toBe('WITHDRAWN');

    const third = await h.submit(h.form(world.plans.miro, { termMonths: 1 }), eGh2.account).expect(422);
    expect(bodyOf(third).error.code).toBe('ACCESS_REQUEST.OPEN_LIMIT_REACHED');
  });
});
