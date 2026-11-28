import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { AccessRequestRepo } from '../../../src/modules/requests/access-request/access-request.repo';
import type {
  AccessRequestState,
  NewAccessRequest,
} from '../../../src/modules/requests/access-request/access-request.types';
import { RequestReplyRepo } from '../../../src/modules/requests/request-reply/request-reply.repo';
import { RequestTicketRepo } from '../../../src/modules/requests/request-ticket/request-ticket.repo';
import { RequestHarness } from '../../support/request-harness';
import { buildTicketWorld, type TicketWorld } from '../../support/request-ticket-harness';

const h = new RequestHarness();

describe('GET /request-tickets/:id and GET /access-requests/:id ticketRef/latestReply integration', () => {
  let world: TicketWorld;
  let runner: TransactionRunner;
  let ticketRepo: RequestTicketRepo;
  let requestRepo: AccessRequestRepo;
  let replyRepo: RequestReplyRepo;

  beforeAll(async () => {
    await h.start();
    world = await buildTicketWorld(h);
    runner = h.ctx.app.get(TransactionRunner);
    ticketRepo = h.ctx.app.get(RequestTicketRepo);
    requestRepo = h.ctx.app.get(AccessRequestRepo);
    replyRepo = h.ctx.app.get(RequestReplyRepo);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const baseNewRequest = (
    planId: string,
    state: Exclude<AccessRequestState, 'DRAFT'>,
    monthlyPriceMinor: bigint,
    ticket?: { id: string; position: number },
  ): NewAccessRequest => ({
    organizationId: h.seed.organizationId,
    type: 'GRANT',
    branch: 'PAID_IN_CATALOG',
    state,
    planId,
    requesterEmployeeId: world.e1.employeeId,
    beneficiaryEmployeeIds: [world.e1.employeeId],
    departmentId: world.pDes.id,
    costCenterId: world.ccDes?.id ?? null,
    businessReason: 'Need software for project',
    termMonths: 3,
    pricing: {
      status: 'PRICED',
      missingReason: null,
      kind: 'RECURRING',
      budgetYear: 2026,
      expectedEndDate: null,
      amountMonths: 3,
      amount: { amountMinor: monthlyPriceMinor * 3n, currency: 'VND' },
      unitPrice: { amountMinor: monthlyPriceMinor, currency: 'VND' },
      monthlyPriceMinor,
      billingCycle: 'MONTHLY',
      nextYearAmount: null,
    },
    policy: {
      version: 2,
      branch: 'PAID_IN_CATALOG',
      chain: ['NEED', 'SPEND_APPROVAL', 'IT_EXECUTION'],
      slaWorkingDays: 3,
    },
    createdByAppUserId: world.e1.account.appUserId,
    now: new Date('2026-06-01T08:00:00.000Z'),
    needStep: {
      state: 'APPROVED',
      assigneeEmployeeId: world.h1.employeeId,
      routingRow: 1,
      waitingReason: null,
      slaWorkingDays: 3,
    },
    ...(ticket ? { ticket } : {}),
  });

  it('returns visible ticket items, ticket-wide IN_PROGRESS/DONE status, latestReply, and ticketRef on accessRequestGet', async () => {
    const outsider = await h.staff(world.other, 'OUT-1');
    const submittedAt = new Date('2026-06-01T08:00:00.000Z');

    const standalone = await runner.run((tx) =>
      requestRepo.insert(tx, baseNewRequest(world.plans.figmaFull, 'PENDING', 600_000n)),
    );

    const inProgress = await runner.run(async (tx) => {
      const ticket = await ticketRepo.insert(tx, {
        organizationId: h.seed.organizationId,
        requesterEmployeeId: world.e1.employeeId,
        departmentId: world.pDes.id,
        submittedAt,
      });
      const r1 = await requestRepo.insert(
        tx,
        baseNewRequest(world.plans.figmaFull, 'COMPLETED', 600_000n, { id: ticket.id, position: 1 }),
      );
      const r2 = await requestRepo.insert(
        tx,
        baseNewRequest(world.plans.miro, 'REJECTED', 500_000n, { id: ticket.id, position: 2 }),
      );
      const r3 = await requestRepo.insert(
        tx,
        baseNewRequest(world.plans.notion, 'AWAITING_SPEND_DECISION', 300_000n, { id: ticket.id, position: 3 }),
      );
      await tx.accessRequestStep.create({
        data: {
          requestId: r3.id,
          kind: 'SPEND_APPROVAL',
          sequence: 2,
          state: 'PENDING',
          assigneeEmployeeId: world.c1.employeeId,
          routingRow: 1,
          slaWorkingDays: 3,
          createdAt: submittedAt,
          assignedAt: submittedAt,
        },
      });
      await replyRepo.insert(tx, {
        organizationId: h.seed.organizationId,
        requestId: r3.id,
        kind: 'REQUESTER_RESUBMISSION',
        returnedStepId: null,
        note: 'dùng cho dự án X, 3 tháng',
        authorEmployeeId: world.e1.employeeId,
      });
      return { ticketId: ticket.id, r1: r1.id, r2: r2.id, r3: r3.id };
    });

    const headView = await request(h.server())
      .get(`/api/v1/request-tickets/${inProgress.ticketId}`)
      .set(h.as(world.h1.account))
      .expect(200);

    const headTicket = h.dataOf<{
      ticket: {
        id: string;
        status: string;
        items: { position: number; requestId: string; state: string; latestReply: { note: string } | null }[];
      };
    }>(headView).ticket;
    expect(headTicket.id).toBe(inProgress.ticketId);
    expect(headTicket.status).toBe('IN_PROGRESS');
    expect(headTicket.items.map((item) => ({ position: item.position, state: item.state }))).toEqual([
      { position: 1, state: 'COMPLETED' },
      { position: 2, state: 'REJECTED' },
      { position: 3, state: 'AWAITING_SPEND_DECISION' },
    ]);
    expect(headTicket.items[0].latestReply).toBeNull();
    expect(headTicket.items[2].latestReply?.note).toBe('dùng cho dự án X, 3 tháng');

    const approverView = await request(h.server())
      .get(`/api/v1/request-tickets/${inProgress.ticketId}`)
      .set(h.as(world.c1.account))
      .expect(200);

    const approverTicket = h.dataOf<{
      ticket: {
        status: string;
        items: { position: number; requestId: string; latestReply: { note: string } | null }[];
      };
    }>(approverView).ticket;
    expect(approverTicket.status).toBe('IN_PROGRESS');
    expect(approverTicket.items).toHaveLength(1);
    expect(approverTicket.items[0].requestId).toBe(inProgress.r3);
    expect(approverTicket.items[0].latestReply?.note).toBe('dùng cho dự án X, 3 tháng');

    const outsiderRes = await request(h.server())
      .get(`/api/v1/request-tickets/${inProgress.ticketId}`)
      .set(h.as(outsider.account))
      .expect(404);
    expect(h.codeOf(outsiderRes)).toBe('REQUEST_TICKET.NOT_FOUND');

    const missingRes = await request(h.server())
      .get(`/api/v1/request-tickets/${randomUUID()}`)
      .set(h.as(world.h1.account))
      .expect(404);
    expect(h.codeOf(missingRes)).toBe('REQUEST_TICKET.NOT_FOUND');

    const r3Detail = await request(h.server())
      .get(`/api/v1/access-requests/${inProgress.r3}`)
      .set(h.as(world.h1.account))
      .expect(200);
    const r3Data = h.dataOf<{
      request: {
        ticketRef: { id: string; position: number; itemCount: number } | null;
        latestReply: { note: string } | null;
      };
    }>(r3Detail).request;
    expect(r3Data.ticketRef).toEqual({ id: inProgress.ticketId, position: 3, itemCount: 3 });
    expect(r3Data.latestReply?.note).toBe('dùng cho dự án X, 3 tháng');

    const standaloneDetail = await request(h.server())
      .get(`/api/v1/access-requests/${standalone.id}`)
      .set(h.as(world.h1.account))
      .expect(200);
    const standaloneData = h.dataOf<{
      request: { ticketRef: unknown; latestReply: unknown };
    }>(standaloneDetail).request;
    expect(standaloneData.ticketRef).toBeNull();
    expect(standaloneData.latestReply).toBeNull();

    const doneTicketId = await runner.run(async (tx) => {
      const ticket = await ticketRepo.insert(tx, {
        organizationId: h.seed.organizationId,
        requesterEmployeeId: world.e1.employeeId,
        departmentId: world.pDes.id,
        submittedAt,
      });
      await requestRepo.insert(
        tx,
        baseNewRequest(world.plans.figmaFull, 'COMPLETED', 600_000n, { id: ticket.id, position: 1 }),
      );
      await requestRepo.insert(
        tx,
        baseNewRequest(world.plans.miro, 'REJECTED', 500_000n, { id: ticket.id, position: 2 }),
      );
      await requestRepo.insert(
        tx,
        baseNewRequest(world.plans.notion, 'WITHDRAWN', 300_000n, { id: ticket.id, position: 3 }),
      );
      return ticket.id;
    });

    const doneView = await request(h.server())
      .get(`/api/v1/request-tickets/${doneTicketId}`)
      .set(h.as(world.h1.account))
      .expect(200);
    expect(h.dataOf<{ ticket: { status: string } }>(doneView).ticket.status).toBe('DONE');
  }, 180000);
});
