import { randomUUID } from 'node:crypto';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { AccessRequestRepo } from '../../../src/modules/requests/access-request/access-request.repo';
import type { NewAccessRequest } from '../../../src/modules/requests/access-request/access-request.types';
import { RequestTicketRepo } from '../../../src/modules/requests/request-ticket/request-ticket.repo';
import { PgRelay } from '../../support/pg-relay';
import { QueryCounter, dataStatements } from '../../support/query-count';
import { type Department, type Person, RequestHarness } from '../../support/request-harness';

const h = new RequestHarness();

describe('RequestTicketRepo and AccessRequestRepo ticket integration (PostgreSQL)', () => {
  let relay: PgRelay;
  let counter: QueryCounter;
  let runner: TransactionRunner;
  let ticketRepo: RequestTicketRepo;
  let requestRepo: AccessRequestRepo;
  let department: Department;
  let requester: Person;
  let head: Person;
  let plan1: string;
  let plan2: string;
  let plan3: string;

  beforeAll(async () => {
    await h.start({
      appDatabaseUrl: async (directUrl) => {
        const url = new URL(directUrl);
        relay = await PgRelay.start(url.hostname, Number(url.port || 5432));
        url.port = String(relay.port);

        return url.toString();
      },
    });
    counter = QueryCounter.on(relay);
    runner = h.ctx.app.get(TransactionRunner);
    ticketRepo = h.ctx.app.get(RequestTicketRepo);
    requestRepo = h.ctx.app.get(AccessRequestRepo);

    department = await h.departmentWithUnit('P-TKR');
    requester = await h.staff(department, 'TKR-E1');
    head = await h.staff(department, 'TKR-H1');
    await h.makeHead(department, head);
    plan1 = await h.plan('K2');
    plan2 = await h.plan('K2');
    plan3 = await h.plan('K2');
  }, 240000);

  afterAll(async () => {
    await h.stop();
    await relay?.stop();
  });

  const baseNewRequest = (planId: string, ticket?: { id: string; position: number }): NewAccessRequest => ({
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
    createdByAppUserId: randomUUID(),
    now: new Date('2026-06-01T08:00:00.000Z'),
    needStep: {
      state: 'PENDING',
      assigneeEmployeeId: head.employeeId,
      routingRow: 1,
      waitingReason: null,
      slaWorkingDays: 3,
    },
    ...(ticket ? { ticket } : {}),
  });

  it('reads standalone request with ticket === null, and loads 3-item ticket view (with latestReply) and refsOf with constant queries', async () => {
    const standalone = await runner.run((tx) => requestRepo.insert(tx, baseNewRequest(plan1)));
    const standaloneRecord = await requestRepo.findById(standalone.id);
    expect(standaloneRecord?.ticket).toBeNull();

    const submittedAt = new Date('2026-06-01T08:00:00.000Z');
    const singleTicket = await runner.run(async (tx) => {
      const ticket = await ticketRepo.insert(tx, {
        organizationId: h.seed.organizationId,
        requesterEmployeeId: requester.employeeId,
        departmentId: department.id,
        submittedAt,
      });
      await requestRepo.insert(tx, baseNewRequest(plan1, { id: ticket.id, position: 1 }));
      return ticket.id;
    });

    const createdTicket = await runner.run(async (tx) => {
      const ticket = await ticketRepo.insert(tx, {
        organizationId: h.seed.organizationId,
        requesterEmployeeId: requester.employeeId,
        departmentId: department.id,
        submittedAt,
      });
      const r3 = await requestRepo.insert(tx, baseNewRequest(plan3, { id: ticket.id, position: 3 }));
      const r1 = await requestRepo.insert(tx, baseNewRequest(plan1, { id: ticket.id, position: 1 }));
      const r2 = await requestRepo.insert(tx, baseNewRequest(plan2, { id: ticket.id, position: 2 }));
      return { ticketId: ticket.id, r1: r1.id, r2: r2.id, r3: r3.id };
    });

    await h.ctx.sql.query(
      `INSERT INTO access_request_replies (id, organization_id, request_id, kind, note, author_employee_id, created_at)
       VALUES
         ($1, $2, $3, 'REQUESTER_RESUBMISSION', 'Older reply', $4, '2026-06-02T08:00:00.000Z'),
         ($5, $2, $3, 'REQUESTER_RESUBMISSION', 'Latest reply', $4, '2026-06-02T09:00:00.000Z')`,
      [randomUUID(), h.seed.organizationId, createdTicket.r2, requester.employeeId, randomUUID()],
    );

    const view1Counted = await counter.run(() => runner.run((tx) => ticketRepo.view(tx, singleTicket)));
    const viewCounted = await counter.run(() => runner.run((tx) => ticketRepo.view(tx, createdTicket.ticketId)));
    expect(dataStatements(viewCounted.statements)).toHaveLength(dataStatements(view1Counted.statements).length);
    expect(viewCounted.result).not.toBeNull();
    expect(viewCounted.result?.items.map((item) => ({ pos: item.position, id: item.requestId }))).toEqual([
      { pos: 1, id: createdTicket.r1 },
      { pos: 2, id: createdTicket.r2 },
      { pos: 3, id: createdTicket.r3 },
    ]);
    expect(viewCounted.result?.items[0].latestReply).toBeNull();
    expect(viewCounted.result?.items[1].latestReply).toMatchObject({
      kind: 'REQUESTER_RESUBMISSION',
      note: 'Latest reply',
      author: { id: requester.employeeId },
    });
    expect(viewCounted.result?.items[2].latestReply).toBeNull();

    const refsCounted = await counter.run(() =>
      ticketRepo.refsOf([createdTicket.r1, createdTicket.r2, createdTicket.r3, standalone.id]),
    );
    expect(dataStatements(refsCounted.statements)).toHaveLength(1);
    expect(refsCounted.result.get(createdTicket.r1)).toEqual({
      id: createdTicket.ticketId,
      position: 1,
      itemCount: 3,
    });
    expect(refsCounted.result.get(createdTicket.r2)).toEqual({
      id: createdTicket.ticketId,
      position: 2,
      itemCount: 3,
    });
    expect(refsCounted.result.get(createdTicket.r3)).toEqual({
      id: createdTicket.ticketId,
      position: 3,
      itemCount: 3,
    });
    expect(refsCounted.result.has(standalone.id)).toBe(false);

    const itemRecord = await requestRepo.findById(createdTicket.r2);
    expect(itemRecord?.ticket).toEqual({ id: createdTicket.ticketId, position: 2, itemCount: 3 });

    const orderedIds = await runner.run((tx) => ticketRepo.itemsOf(tx, createdTicket.ticketId));
    expect(orderedIds).toEqual([
      { requestId: createdTicket.r1, position: 1 },
      { requestId: createdTicket.r2, position: 2 },
      { requestId: createdTicket.r3, position: 3 },
    ]);
  }, 180000);
});
