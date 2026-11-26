import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { Barrier } from '../../support/concurrency-harness';
import { GroupHarness } from '../../support/group-harness';
import type { Unit } from '../../support/spend-harness';
import { liftWithdrawalAfterDecisionRefusal } from '../../support/withdrawal-after-decision';

const h = new GroupHarness();
const M = 1_000_000;

/**
 * FIX-W3-FINAL F-18: `PurchaseInvoicePlanService.lotConfirmationContextOf` and `GroupWithdrawalAftermath.after`
 * both lock the license lot at tier `6a` (`LicenseLotApi.lockLot`) BEFORE reading active beneficiary count (`m`)
 * or `invoiceActualMinor`. Across 20 concurrent barrier rounds of invoice confirmation || group member withdrawal,
 * Cost Center allocation settles to the exact final `u * m` with zero `40P01` deadlocks.
 */
describe('lot invoice confirmation vs group member withdrawal race (integration, F-18)', () => {
  let k4PlanId: string;
  let vendorId: string;
  let unit: Unit;
  let seq = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    const k4SubId = await h.subscription(1, 'K4');
    k4PlanId = await h.planOf(k4SubId);
    vendorId = (await h.vendorOf(k4PlanId)).id;
    await h.declareTaxProfile(vendorId, [{ taxType: 'GTGT', ratePercent: '10', deductible: true }]).expect(200);
    unit = await h.departmentWithHead('P-F18R');
    await h.setItAdminInCharge(unit.department, { employeeId: h.it1.employeeId, account: h.it1 });
    await h.roomFor(unit);
  }, 300000);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await h.stop();
  });

  async function seedApprovedK4Group(members: readonly string[]): Promise<string> {
    const reqId = randomUUID();
    const needStepId = randomUUID();
    const spendStepId = randomUUID();
    const policyJson = JSON.stringify({
      version: 1,
      branch: 'PAID_IN_CATALOG',
      chain: ['NEED', 'SPEND_APPROVAL'],
      slaWorkingDays: 3,
    });
    const totalMinor = String(members.length * 12 * M);
    await h.ctx.sql.query(
      `INSERT INTO access_requests
         (id, organization_id, type, branch, state, plan_id, department_id, cost_center_id,
          requester_employee_id, business_reason, submitted_at, budget_year, amount_months,
          amount_currency, unit_price_minor, amount_minor, pricing_status, policy, created_by_app_user_id)
       VALUES ($1, $2, 'GROUP_GRANT', 'PAID_IN_CATALOG', 'AWAITING_EXECUTION', $3, $4, $5, $6,
               'K4 group lot race test', now(), $7, 1, 'VND', 12000000, $8, 'PRICED', $9::jsonb, $10)`,
      [
        reqId,
        h.seed.organizationId,
        k4PlanId,
        unit.department.id,
        unit.department.unitId,
        unit.head.employeeId,
        h.year,
        totalMinor,
        policyJson,
        unit.head.account.appUserId,
      ],
    );
    await h.ctx.sql.query(
      `INSERT INTO access_request_steps
         (id, request_id, kind, sequence, state, assignee_employee_id, routing_row, sla_working_days, assigned_at, decided_at)
       VALUES ($1, $2, 'NEED', 1, 'APPROVED', $3, 1, 3, now(), now()),
              ($4, $2, 'SPEND_APPROVAL', 2, 'APPROVED', $5, 1, 3, now(), now())`,
      [needStepId, reqId, unit.head.employeeId, spendStepId, h.boss.employeeId],
    );
    await h.ctx.sql.query(
      `INSERT INTO spend_decisions (step_id, request_id, decision, decided_by_employee_id, decided_at)
       VALUES ($1, $2, 'APPROVED', $3, now())`,
      [spendStepId, reqId, h.boss.employeeId],
    );
    for (let i = 0; i < members.length; i += 1) {
      await h.ctx.sql.query(
        `INSERT INTO access_request_beneficiaries (request_id, employee_id, position) VALUES ($1, $2, $3)`,
        [reqId, members[i], i + 1],
      );
      await h.ctx.sql.query(
        `INSERT INTO access_request_lines (request_id, employee_id, state, need_step_id) VALUES ($1, $2, 'APPROVED', $3)`,
        [reqId, members[i], needStepId],
      );
      await h.ctx.sql.query(
        `INSERT INTO access_request_line_amounts (request_id, employee_id, budget_year, amount_minor, currency, held)
         VALUES ($1, $2, $3, 12000000, 'VND', true)`,
        [reqId, members[i], h.year],
      );
    }
    await h.ctx.sql.query(
      `INSERT INTO budget_commitments
         (id, organization_id, request_id, cost_center_id, year, amount_minor, currency, state, origin, unattached_reason)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'VND', 'HELD', 'APPROVAL', 'NO_BUDGET')`,
      [h.seed.organizationId, reqId, unit.department.unitId, h.year, totalMinor],
    );

    return reqId;
  }

  async function seedGroupLotAndSubmittedInvoice() {
    seq += 1;
    const people = await h.colleagues(unit, 3);
    const reqId = await seedApprovedK4Group(people.map((person) => person.employeeId));
    await h
      .grantLine(
        { requestId: reqId, beneficiaryEmployeeId: people[0].employeeId, purchase: { reason: 'Buy K4 lot' } },
        h.it1,
      )
      .expect(201);

    const lotId = h.dataOf<{ id: string }>(
      await request(h.server())
        .post('/api/v1/license-lots')
        .set(h.as(h.it1))
        .send({
          planId: k4PlanId,
          purchasedOn: h.today(),
          licenseCount: 3,
          unitPrice: { amount: '12000000', currency: 'VND' },
          purpose: 'REQUEST',
          requestId: reqId,
        })
        .expect(201),
    ).id;

    const purchaseInvoiceId = randomUUID();
    const serviceMonth = `${h.today().slice(0, 7)}-01`;
    await h.ctx.sql.query(
      `INSERT INTO purchase_invoices
         (id, organization_id, link_kind, request_id, vendor_id, number, issued_on, service_month, label,
          quantity, unit_price_original_minor, unit_price_original_currency, net_minor, deductible_tax_minor,
          non_deductible_tax_minor, match_result, payment_source, flags, charged_cost_center_id, state,
          submitted_by_employee_id, submitted_at)
       VALUES ($1, $2, 'REQUEST', $3, $4, $5, $6, $7, 'NEW_PURCHASE',
               1, '36000000', 'VND', '36000000', 0, 0, 'MATCHED', 'COMPANY_CARD', ARRAY[]::text[], $8, 'SUBMITTED',
               $9, now())`,
      [
        purchaseInvoiceId,
        h.seed.organizationId,
        reqId,
        vendorId,
        `F18-INV-${seq}`,
        h.today(),
        serviceMonth,
        unit.department.unitId,
        unit.head.employeeId,
      ],
    );

    return { reqId, lotId, purchaseInvoiceId, withdrawnEmployeeId: people[2].employeeId };
  }

  it('barrier x20: lot invoice confirmation || group member withdrawal yields final u * m (24M CC, 12M POOL_IDLE) with zero 40P01', async () => {
    liftWithdrawalAfterDecisionRefusal();

    for (let i = 0; i < 20; i += 1) {
      const { reqId, lotId, purchaseInvoiceId, withdrawnEmployeeId } = await seedGroupLotAndSubmittedInvoice();
      const barrier = new Barrier(2);

      const confirmTask = (async () => {
        await barrier.wait();
        return request(h.server())
          .post(`/api/v1/purchase-invoices/${purchaseInvoiceId}/confirmation`)
          .set(h.as(h.finance));
      })();
      const withdrawTask = (async () => {
        await barrier.wait();
        return h.withdrawLine(reqId, withdrawnEmployeeId, { reason: 'No longer needed' }, unit.head.account);
      })();

      const [confirmRes, withdrawRes] = await Promise.all([confirmTask, withdrawTask]);

      expect(confirmRes.status).toBe(200);
      expect(withdrawRes.status).toBe(200);

      const { rows: buckets } = await h.ctx.sql.query<{ bucket: string; total: string }>(
        `SELECT a.bucket::text, COALESCE(SUM(a.amount_minor), 0)::text AS total
           FROM invoice_allocations a
           JOIN invoices inv ON inv.id = a.invoice_id
          WHERE inv.subscription_id = $1
          GROUP BY a.bucket`,
        [lotId],
      );
      const byBucket = new Map(buckets.map((row) => [row.bucket, row.total]));
      expect(byBucket.get('COST_CENTER')).toBe(String(24 * M));
      expect(byBucket.get('POOL_IDLE')).toBe(String(12 * M));
    }
  });
});
