import request from 'supertest';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { AccessRequestRepo } from '../../../src/modules/requests/access-request/access-request.repo';
import type { NewAccessRequest } from '../../../src/modules/requests/access-request/access-request.types';
import { RequestTicketRepo } from '../../../src/modules/requests/request-ticket/request-ticket.repo';
import { ReassignmentHarness } from '../../support/reassignment-harness';
import { changeRoleTo } from '../../support/builders/account.builder';
import { buildTicketWorld, type TicketWorld } from '../../support/request-ticket-harness';

const h = new ReassignmentHarness();

interface RequestMetaRow {
  routing_mode: string;
  one_step_reason: string | null;
  state: string;
}

// W4-07 / W4-14
describe('ticket items keep ticket position order on one-step conversion (integration, real PostgreSQL)', () => {
  let world: TicketWorld;

  beforeAll(async () => {
    await h.start();
    world = await buildTicketWorld(h, { budget: { baseMinor: 3_000_000n, reserveMinor: 0n } });
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const requestMeta = async (id: string): Promise<RequestMetaRow> =>
    (
      await h.ctx.sql.query<RequestMetaRow>(
        `SELECT routing_mode::text, one_step_reason, state::text FROM access_requests WHERE id = $1`,
        [id],
      )
    ).rows[0];

  it.each([
    { label: 'R11 (#2) inserted before R12 (#1)', insertR12First: false, suffix: 'A' },
    { label: 'R12 (#1) inserted before R11 (#2)', insertR12First: true, suffix: 'B' },
  ])(
    // RB-9
    '($label): when requester becomes department head, ticket #1 checks budget first and passes while #2 pending is blocked',
    async ({ insertR12First, suffix }) => {
      const summary = h.dataOf<{
        totals: Record<string, { runningUncommitted: { amount: string; currency: string } }>;
      }>(await h.summary(h.finance, { year: 2026 }).expect(200));
      expect(summary.totals[h.reporting].runningUncommitted).toEqual({ amount: '0', currency: h.reporting });

      const e5 = await h.staff(world.pDes, `W4-E5-${suffix}`);
      const runner = h.ctx.app.get(TransactionRunner, { strict: false });
      const ticketRepo = h.ctx.app.get(RequestTicketRepo, { strict: false });
      const requestRepo = h.ctx.app.get(AccessRequestRepo, { strict: false });
      const now = new Date('2026-06-01T08:00:00.000Z');

      const itemBase = (
        planId: string,
        termMonths: number,
        monthlyPriceMinor: bigint,
        ticket: { id: string; position: number },
      ): NewAccessRequest => ({
        organizationId: h.seed.organizationId,
        type: 'GRANT',
        branch: 'PAID_IN_CATALOG',
        state: 'PENDING',
        planId,
        requesterEmployeeId: e5.employeeId,
        beneficiaryEmployeeIds: [e5.employeeId],
        departmentId: world.pDes.id,
        costCenterId: world.ccDes!.id,
        businessReason: 'Need license for design project',
        termMonths,
        pricing: {
          status: 'PRICED',
          missingReason: null,
          kind: 'RECURRING',
          budgetYear: 2026,
          expectedEndDate: null,
          amountMonths: termMonths,
          amount: { amountMinor: monthlyPriceMinor * BigInt(termMonths), currency: 'VND' },
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
        createdByAppUserId: e5.account.appUserId,
        now,
        needStep: {
          state: 'PENDING',
          assigneeEmployeeId: world.h1.employeeId,
          routingRow: 1,
          waitingReason: null,
          slaWorkingDays: 3,
        },
        ticket,
      });

      // R11 (#2 Notion 5m x 300k = 1.5M) stays PENDING; R12 (#1 Miro 4m x 500k = 2.0M) advances to AWAITING_SPEND_SUBMISSION.
      const { r11, r12 } = await runner.run(async (tx) => {
        const ticket = await ticketRepo.insert(tx, {
          organizationId: h.seed.organizationId,
          requesterEmployeeId: e5.employeeId,
          departmentId: world.pDes.id,
          submittedAt: now,
        });
        if (insertR12First) {
          const r12Inserted = await requestRepo.insert(
            tx,
            itemBase(world.plans.miro, 4, 500_000n, { id: ticket.id, position: 1 }),
          );
          const r11Inserted = await requestRepo.insert(
            tx,
            itemBase(world.plans.notion, 5, 300_000n, { id: ticket.id, position: 2 }),
          );
          return { r11: r11Inserted, r12: r12Inserted };
        }
        const r11Inserted = await requestRepo.insert(
          tx,
          itemBase(world.plans.notion, 5, 300_000n, { id: ticket.id, position: 2 }),
        );
        const r12Inserted = await requestRepo.insert(
          tx,
          itemBase(world.plans.miro, 4, 500_000n, { id: ticket.id, position: 1 }),
        );
        return { r11: r11Inserted, r12: r12Inserted };
      });

      try {
        await h.decide(r12.id, { decision: 'APPROVE' }, world.h1.account).expect(200);
        expect(await h.state(r12.id)).toBe('AWAITING_SPEND_SUBMISSION');
        expect(await h.state(r11.id)).toBe('PENDING');

        await h.makeHead(world.pDes, e5);

        expect(await requestMeta(r12.id)).toEqual({
          routing_mode: 'ONE_STEP',
          one_step_reason: 'REQUESTER_IS_HEAD',
          state: 'AWAITING_SPEND_DECISION',
        });
        expect(await h.steps(r12.id, 'SPEND_APPROVAL')).toEqual([
          expect.objectContaining({ state: 'PENDING', assignee_employee_id: world.c1.employeeId }),
        ]);

        expect(await requestMeta(r11.id)).toEqual({
          routing_mode: 'ONE_STEP',
          one_step_reason: 'REQUESTER_IS_HEAD',
          state: 'AWAITING_REQUESTER_REVISION',
        });
        expect(await h.stepOf(r11.id, 'NEED')).toMatchObject({ id: r11.needStepId, state: 'NOT_REQUIRED' });
        expect(await h.steps(r11.id, 'SPEND_APPROVAL')).toEqual([]);

        const { rows: checksR12 } = await h.ctx.sql.query<{ outcome: string }>(
          `SELECT outcome::text FROM request_budget_checks WHERE request_id = $1 ORDER BY number DESC LIMIT 1`,
          [r12.id],
        );
        const { rows: checksR11 } = await h.ctx.sql.query<{ outcome: string }>(
          `SELECT outcome::text FROM request_budget_checks WHERE request_id = $1 ORDER BY number DESC LIMIT 1`,
          [r11.id],
        );
        expect(checksR12[0]?.outcome).toBe('WITHIN_BASE');
        expect(checksR11[0]?.outcome).toBe('BLOCKED');
      } finally {
        // RB-9 cleanup
        await h.decideSpend(r12.id, { decision: 'REJECT', reason: 'Cleanup iteration' }, world.c1.account);
        await h.withdrawRequest(r11.id, {}, e5.account);
        await h.makeHead(world.pDes, world.h1);
      }
    },
  );

  it.each([
    { label: 'R11 (#2) inserted before R12 (#1)', insertR12First: false, suffix: 'SW-A' },
    { label: 'R12 (#1) inserted before R11 (#2)', insertR12First: true, suffix: 'SW-B' },
  ])(
    'EFFECTIVE_DATE_REACHED sweep ($label): future-dated head checked in ticket position order (#1 before #2)',
    async ({ insertR12First, suffix }) => {
      const e5 = await h.staff(world.pDes, `W4-E5-${suffix}`);
      const runner = h.ctx.app.get(TransactionRunner, { strict: false });
      const ticketRepo = h.ctx.app.get(RequestTicketRepo, { strict: false });
      const requestRepo = h.ctx.app.get(AccessRequestRepo, { strict: false });
      const now = new Date('2026-06-01T08:00:00.000Z');

      const make = (
        planId: string,
        termMonths: number,
        monthlyPriceMinor: bigint,
        ticket: { id: string; position: number },
      ): NewAccessRequest => ({
        organizationId: h.seed.organizationId,
        type: 'GRANT',
        branch: 'PAID_IN_CATALOG',
        state: 'PENDING',
        planId,
        requesterEmployeeId: e5.employeeId,
        beneficiaryEmployeeIds: [e5.employeeId],
        departmentId: world.pDes.id,
        costCenterId: world.ccDes!.id,
        businessReason: 'Need license for design project',
        termMonths,
        pricing: {
          status: 'PRICED',
          missingReason: null,
          kind: 'RECURRING',
          budgetYear: 2026,
          expectedEndDate: null,
          amountMonths: termMonths,
          amount: { amountMinor: monthlyPriceMinor * BigInt(termMonths), currency: 'VND' },
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
        createdByAppUserId: e5.account.appUserId,
        now,
        needStep: {
          state: 'PENDING',
          assigneeEmployeeId: world.h1.employeeId,
          routingRow: 1,
          waitingReason: null,
          slaWorkingDays: 3,
        },
        ticket,
      });

      const { r11, r12 } = await runner.run(async (tx) => {
        const ticket = await ticketRepo.insert(tx, {
          organizationId: h.seed.organizationId,
          requesterEmployeeId: e5.employeeId,
          departmentId: world.pDes.id,
          submittedAt: now,
        });
        if (insertR12First) {
          const r12Row = await requestRepo.insert(
            tx,
            make(world.plans.miro, 4, 500_000n, { id: ticket.id, position: 1 }),
          );
          const r11Row = await requestRepo.insert(
            tx,
            make(world.plans.notion, 5, 300_000n, { id: ticket.id, position: 2 }),
          );
          return { r11: r11Row, r12: r12Row };
        }
        const r11Row = await requestRepo.insert(
          tx,
          make(world.plans.notion, 5, 300_000n, { id: ticket.id, position: 2 }),
        );
        const r12Row = await requestRepo.insert(
          tx,
          make(world.plans.miro, 4, 500_000n, { id: ticket.id, position: 1 }),
        );
        return { r11: r11Row, r12: r12Row };
      });

      try {
        await h.decide(r12.id, { decision: 'APPROVE' }, world.h1.account).expect(200);
        await changeRoleTo(h.ctx, h.admin, e5.employeeId, 'MANAGER');
        await request(h.server())
          .post(`/api/v1/departments/${world.pDes.id}/head-assignments`)
          .set({ Authorization: `Bearer ${h.admin}` })
          .send({ employeeId: e5.employeeId, effectiveFrom: h.tomorrow() })
          .expect(200);
        await h.sweep();
        expect(await h.state(r12.id)).toBe('AWAITING_SPEND_SUBMISSION');
        expect(await h.state(r11.id)).toBe('PENDING');

        await h.ctx.sql.query(
          `UPDATE department_head_periods
              SET valid_from = LEAST(valid_from, ($2::date - 1)), valid_to = $2::date
            WHERE department_id = $1 AND employee_id = $3 AND valid_to = $4::date`,
          [world.pDes.id, h.today(), world.h1.employeeId, h.tomorrow()],
        );
        await h.ctx.sql.query(
          `UPDATE department_head_periods SET valid_from = $2::date WHERE department_id = $1 AND employee_id = $3 AND valid_to IS NULL`,
          [world.pDes.id, h.today(), e5.employeeId],
        );
        await h.sweep();

        expect(await requestMeta(r12.id)).toEqual({
          routing_mode: 'ONE_STEP',
          one_step_reason: 'REQUESTER_IS_HEAD',
          state: 'AWAITING_SPEND_DECISION',
        });
        expect(await requestMeta(r11.id)).toEqual({
          routing_mode: 'ONE_STEP',
          one_step_reason: 'REQUESTER_IS_HEAD',
          state: 'AWAITING_REQUESTER_REVISION',
        });
      } finally {
        await h.decideSpend(r12.id, { decision: 'REJECT', reason: 'Cleanup daily sweep test' }, world.c1.account);
        await h.withdrawRequest(r11.id, {}, e5.account);
        await h.makeHead(world.pDes, world.h1);
      }
    },
  );

  it('HEAD_PERIOD_END without successor: queued spend item is untouched while pending need item waits for head', async () => {
    const e5 = await h.staff(world.pDes, 'W4-E5-END');
    const runner = h.ctx.app.get(TransactionRunner, { strict: false });
    const ticketRepo = h.ctx.app.get(RequestTicketRepo, { strict: false });
    const requestRepo = h.ctx.app.get(AccessRequestRepo, { strict: false });
    const now = new Date('2026-06-01T08:00:00.000Z');

    const make = (
      planId: string,
      termMonths: number,
      monthlyPriceMinor: bigint,
      ticket: { id: string; position: number },
    ): NewAccessRequest => ({
      organizationId: h.seed.organizationId,
      type: 'GRANT',
      branch: 'PAID_IN_CATALOG',
      state: 'PENDING',
      planId,
      requesterEmployeeId: e5.employeeId,
      beneficiaryEmployeeIds: [e5.employeeId],
      departmentId: world.pDes.id,
      costCenterId: world.ccDes!.id,
      businessReason: 'Need license during head vacancy',
      termMonths,
      pricing: {
        status: 'PRICED',
        missingReason: null,
        kind: 'RECURRING',
        budgetYear: 2026,
        expectedEndDate: null,
        amountMonths: termMonths,
        amount: { amountMinor: monthlyPriceMinor * BigInt(termMonths), currency: 'VND' },
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
      createdByAppUserId: e5.account.appUserId,
      now,
      needStep: {
        state: 'PENDING',
        assigneeEmployeeId: world.h1.employeeId,
        routingRow: 1,
        waitingReason: null,
        slaWorkingDays: 3,
      },
      ticket,
    });

    const { r11, r12 } = await runner.run(async (tx) => {
      const ticket = await ticketRepo.insert(tx, {
        organizationId: h.seed.organizationId,
        requesterEmployeeId: e5.employeeId,
        departmentId: world.pDes.id,
        submittedAt: now,
      });
      const r12Row = await requestRepo.insert(tx, make(world.plans.miro, 4, 500_000n, { id: ticket.id, position: 1 }));
      const r11Row = await requestRepo.insert(
        tx,
        make(world.plans.notion, 5, 300_000n, { id: ticket.id, position: 2 }),
      );
      return { r11: r11Row, r12: r12Row };
    });

    try {
      await h.decide(r12.id, { decision: 'APPROVE' }, world.h1.account).expect(200);
      expect(await h.state(r12.id)).toBe('AWAITING_SPEND_SUBMISSION');
      expect(await h.state(r11.id)).toBe('PENDING');

      await h.vacateHead(world.pDes.id).expect(200);

      expect(await requestMeta(r12.id)).toEqual({
        routing_mode: 'VIA_HEAD',
        one_step_reason: null,
        state: 'AWAITING_SPEND_SUBMISSION',
      });
      expect(await h.steps(r12.id, 'SPEND_APPROVAL')).toEqual([]);
      const { rows: checksR12 } = await h.ctx.sql.query<{ count: string }>(
        `SELECT COUNT(*)::text AS count FROM request_budget_checks WHERE request_id = $1`,
        [r12.id],
      );
      expect(checksR12[0]?.count).toBe('0');
      expect(await h.audit('ACCESS_REQUEST.STEP_NOT_REQUIRED', r12.needStepId)).toEqual([]);

      expect(await requestMeta(r11.id)).toEqual({
        routing_mode: 'VIA_HEAD',
        one_step_reason: null,
        state: 'WAITING_CONTROLLED',
      });
      expect(await h.stepOf(r11.id, 'NEED')).toMatchObject({
        state: 'WAITING',
        waiting_reason: 'NO_DEPARTMENT_HEAD',
      });
    } finally {
      await h.makeHead(world.pDes, world.h1);
      await h.sendOn([r12.id], world.h1.account);
      await h.decideSpend(r12.id, { decision: 'REJECT', reason: 'Cleanup HEAD_PERIOD_END test' }, world.c1.account);
      await h.withdrawRequest(r11.id, {}, e5.account);
    }
  });
});
