import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { AccessRequestRepo } from '../../../src/modules/requests/access-request/access-request.repo';
import type { NewAccessRequest } from '../../../src/modules/requests/access-request/access-request.types';
import { RequestTicketRepo } from '../../../src/modules/requests/request-ticket/request-ticket.repo';
import { createCostCenter, createDepartment } from '../../support/builders/organization.builder';
import { approvedBudget } from '../../support/builders/budget.builder';
import { buildTicketWorld, type TicketWorld } from '../../support/request-ticket-harness';
import { BudgetCheckRepo } from '../../../src/modules/requests/spend/budget-check.repo';
import { SpendHarness } from '../../support/spend-harness';

const h = new SpendHarness();

// W4-07
describe('ticket order in spend batches (integration, real PostgreSQL)', () => {
  let w: TicketWorld;
  let runner: TransactionRunner;
  let ticketRepo: RequestTicketRepo;
  let requestRepo: AccessRequestRepo;

  beforeAll(async () => {
    await h.start();
    w = await buildTicketWorld(h, { budget: { baseMinor: 3_000_000n, reserveMinor: 0n } });
    runner = h.ctx.app.get(TransactionRunner);
    ticketRepo = h.ctx.app.get(RequestTicketRepo);
    requestRepo = h.ctx.app.get(AccessRequestRepo);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const buildTicketRequest = (input: {
    departmentId: string;
    costCenterId: string;
    requesterEmployeeId: string;
    requesterAppUserId: string;
    headEmployeeId: string;
    planId: string;
    termMonths: number;
    monthlyPriceMinor: bigint;
    ticket: { id: string; position: number };
  }): NewAccessRequest => {
    const amountMinor = input.monthlyPriceMinor * BigInt(input.termMonths);
    return {
      organizationId: h.seed.organizationId,
      type: 'GRANT',
      branch: 'PAID_IN_CATALOG',
      state: 'PENDING',
      planId: input.planId,
      requesterEmployeeId: input.requesterEmployeeId,
      beneficiaryEmployeeIds: [input.requesterEmployeeId],
      departmentId: input.departmentId,
      costCenterId: input.costCenterId,
      businessReason: 'Need license for team',
      termMonths: input.termMonths,
      pricing: {
        status: 'PRICED',
        missingReason: null,
        kind: 'RECURRING',
        budgetYear: 2026,
        expectedEndDate: null,
        amountMonths: input.termMonths,
        amount: { amountMinor, currency: 'VND' },
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
      ticket: input.ticket,
    };
  };

  it('§7.7 (a): processes same-ticket items in ticket position order while keeping body order in results, batch items, and audit', async () => {
    const summary = h.dataOf<{ totals: Record<string, { runningUncommitted: { amount: string; currency: string } }> }>(
      await h.summary(h.finance, { year: 2026 }).expect(200),
    );
    expect(summary.totals[h.reporting].runningUncommitted).toEqual({ amount: '0', currency: h.reporting });

    const { miroId, notionId } = await runner.run(async (tx) => {
      const ticket = await ticketRepo.insert(tx, {
        organizationId: h.seed.organizationId,
        requesterEmployeeId: w.e1.employeeId,
        departmentId: w.pDes.id,
        submittedAt: new Date('2026-06-01T08:00:00.000Z'),
      });
      const miro = await requestRepo.insert(
        tx,
        buildTicketRequest({
          departmentId: w.pDes.id,
          costCenterId: w.pDes.unitId,
          requesterEmployeeId: w.e1.employeeId,
          requesterAppUserId: w.e1.account.appUserId,
          headEmployeeId: w.h1.employeeId,
          planId: w.plans.miro,
          termMonths: 4,
          monthlyPriceMinor: 500_000n,
          ticket: { id: ticket.id, position: 1 },
        }),
      );
      const notion = await requestRepo.insert(
        tx,
        buildTicketRequest({
          departmentId: w.pDes.id,
          costCenterId: w.pDes.unitId,
          requesterEmployeeId: w.e1.employeeId,
          requesterAppUserId: w.e1.account.appUserId,
          headEmployeeId: w.h1.employeeId,
          planId: w.plans.notion,
          termMonths: 5,
          monthlyPriceMinor: 300_000n,
          ticket: { id: ticket.id, position: 2 },
        }),
      );
      return { miroId: miro.id, notionId: notion.id };
    });

    await h.decide(miroId, { decision: 'APPROVE' }, w.h1.account).expect(200);
    await h.decide(notionId, { decision: 'APPROVE' }, w.h1.account).expect(200);

    // Body sends #2 Notion (1.5M) before #1 Miro (2.0M) against 3.0M base / 0 reserve.
    // Ticket order processes #1 Miro first -> SENT_TO_APPROVER (2.0M), leaving 1.0M -> #2 Notion STOPPED (OVER_RESERVE).
    const submitted = h.dataOf<{
      batch: { id: string };
      results: Array<{ requestId: string; outcome: string; stopReason: string | null }>;
    }>(await h.sendOn([notionId, miroId], w.h1.account).expect(201));

    expect(submitted.results).toEqual([
      { requestId: notionId, outcome: 'STOPPED', stopReason: 'OVER_RESERVE', reserveConfirmation: 'NOT_GIVEN' },
      { requestId: miroId, outcome: 'SENT_TO_APPROVER', stopReason: null, reserveConfirmation: 'NOT_GIVEN' },
    ]);

    const batchItems = h.dataOf<{
      items: Array<{ requestId: string; position: number; outcome: string; stopReason: string | null }>;
    }>(await h.batchItems(submitted.batch.id, w.h1.account).expect(200)).items;
    expect(batchItems.map((item) => [item.position, item.requestId, item.outcome, item.stopReason])).toEqual([
      [1, notionId, 'STOPPED', 'OVER_RESERVE'],
      [2, miroId, 'SENT_TO_APPROVER', null],
    ]);

    const events = await h.ctx.sql.query<{ after: { requestIds: string; sentToApprover: number; stopped: number } }>(
      `SELECT after FROM audit_events WHERE resource_id = $1 AND action = 'SPEND_BATCH.SUBMITTED'`,
      [submitted.batch.id],
    );
    expect(events.rows).toHaveLength(1);
    expect(events.rows[0].after).toMatchObject({
      requestIds: `${notionId},${miroId}`,
      sentToApprover: 1,
      stopped: 1,
    });
    expect(await h.state(miroId)).toBe('AWAITING_SPEND_DECISION');
    expect(await h.state(notionId)).toBe('AWAITING_SPEND_SUBMISSION');
  });

  it('§7.7 (b): unconfirmed item awaiting reserve confirmation does not consume base for the next ticket item', async () => {
    const depB = await createDepartment(h.ctx, h.admin, {
      code: 'P-ORD-B',
      name: 'Order Reserve',
      itAdminEmployeeId: h.it1.employeeId,
    });
    const ccB = await createCostCenter(h.ctx, h.finance.accessToken, {
      code: 'CC-ORD-B',
      name: 'Order Reserve',
      kind: 'UNIT',
      departmentId: depB.id,
    });
    const unitB = { ...depB, unitId: ccB.id };
    const reqB = await h.staff(unitB, 'ORD-E2');
    const headB = await h.staff(unitB, 'ORD-H2');
    await h.makeHead(unitB, headB);
    await h.setItAdminInCharge(unitB, { employeeId: h.it1.employeeId, account: h.it1 });
    await approvedBudget(h.ctx, {
      headToken: headB.account.accessToken,
      financeToken: h.finance.accessToken,
      deciderToken: w.c1.account.accessToken,
      proposal: { year: 2026, requestedAmount: { amount: '3000000' } },
      version: {
        base: { amount: '2000000' },
        reserve: { amount: '1000000' },
        reserveReason: 'Fixture reserve for order test',
      },
    });

    const summary = h.dataOf<{ totals: Record<string, { runningUncommitted: { amount: string; currency: string } }> }>(
      await h.summary(h.finance, { year: 2026 }).expect(200),
    );
    expect(summary.totals[h.reporting].runningUncommitted).toEqual({ amount: '0', currency: h.reporting });

    const { ticketId, miroId, notionId } = await runner.run(async (tx) => {
      const ticket = await ticketRepo.insert(tx, {
        organizationId: h.seed.organizationId,
        requesterEmployeeId: reqB.employeeId,
        departmentId: unitB.id,
        submittedAt: new Date('2026-06-01T08:30:00.000Z'),
      });
      const miro = await requestRepo.insert(
        tx,
        buildTicketRequest({
          departmentId: unitB.id,
          costCenterId: unitB.unitId,
          requesterEmployeeId: reqB.employeeId,
          requesterAppUserId: reqB.account.appUserId,
          headEmployeeId: headB.employeeId,
          planId: w.plans.miro,
          termMonths: 5,
          monthlyPriceMinor: 500_000n,
          ticket: { id: ticket.id, position: 1 },
        }),
      );
      const notion = await requestRepo.insert(
        tx,
        buildTicketRequest({
          departmentId: unitB.id,
          costCenterId: unitB.unitId,
          requesterEmployeeId: reqB.employeeId,
          requesterAppUserId: reqB.account.appUserId,
          headEmployeeId: headB.employeeId,
          planId: w.plans.notion,
          termMonths: 5,
          monthlyPriceMinor: 300_000n,
          ticket: { id: ticket.id, position: 2 },
        }),
      );
      return { ticketId: ticket.id, miroId: miro.id, notionId: notion.id };
    });

    await h.decide(miroId, { decision: 'APPROVE' }, headB.account).expect(200);
    await h.decide(notionId, { decision: 'APPROVE' }, headB.account).expect(200);

    // #1 Miro (2.5M) uses reserve without confirmation -> AWAITING_RESERVE_CONFIRMATION (does not deduct base).
    // #2 Notion (1.5M) fits in 2.0M base -> SENT_TO_APPROVER.
    const submitted = h.dataOf<{
      results: Array<{ requestId: string; outcome: string; stopReason: string | null }>;
    }>(await h.sendOn([miroId, notionId], headB.account).expect(201));

    expect(submitted.results).toEqual([
      {
        requestId: miroId,
        outcome: 'AWAITING_RESERVE_CONFIRMATION',
        stopReason: null,
        reserveConfirmation: 'NOT_GIVEN',
      },
      { requestId: notionId, outcome: 'SENT_TO_APPROVER', stopReason: null, reserveConfirmation: 'NOT_GIVEN' },
    ]);
    expect(await h.state(miroId)).toBe('AWAITING_SPEND_SUBMISSION');
    expect(await h.state(notionId)).toBe('AWAITING_SPEND_DECISION');

    // Scope matrix on pendingForItem (Miro #1 2.5M is still AWAITING_RESERVE_CONFIRMATION; exclude Notion #2):
    const checkRepo = h.ctx.app.get(BudgetCheckRepo, { strict: false });
    expect(
      await checkRepo.pendingForItem(unitB.unitId, 2026, {
        id: notionId,
        ticket: { id: ticketId, position: 2 },
      }),
    ).toBe(0n);
    expect(
      await checkRepo.pendingForItem(unitB.unitId, 2026, {
        id: notionId,
        ticket: { id: ticketId, position: 0 },
      }),
    ).toBe(2_500_000n);
    expect(
      await checkRepo.pendingForItem(unitB.unitId, 2026, {
        id: notionId,
        ticket: { id: '00000000-0000-4000-8000-0000000000dd', position: 2 },
      }),
    ).toBe(2_500_000n);
    expect(
      await checkRepo.pendingForItem(unitB.unitId, 2026, {
        id: notionId,
        ticket: null,
      }),
    ).toBe(2_500_000n);
  });
});
