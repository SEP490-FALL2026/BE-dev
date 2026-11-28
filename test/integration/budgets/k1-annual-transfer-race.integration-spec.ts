import { randomUUID } from 'node:crypto';
import type { AuthenticatedPrincipal } from '../../../src/infrastructure/security/tokens/access-token-verifier.port';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { InvoiceRepo } from '../../../src/modules/budgets/budget/invoice.repo';
import { InvoiceYearApplicationRepo } from '../../../src/modules/budgets/invoice/invoice-year-application.repo';
import { BudgetsApi } from '../../../src/modules/budgets/public/budgets.api';
import { YearStartCommitmentsBatchService } from '../../../src/modules/requests/year-start-commitments/year-start-commitments-batch.service';
import { Barrier } from '../../support/concurrency-harness';
import { InvoiceHarness } from '../../support/invoice-harness';
import type { Unit } from '../../support/spend-harness';

const h = new InvoiceHarness();
const Y1 = 2026;
const Y2 = 2027;
const MONTHLY_PRICE = 450_000n;
const NET_ANNUAL = 5_400_000n;
const TAX_ANNUAL = 540_000n;

describe('G-2 (F-7): K1 transfer || full org 01/01 barrier race on root chain key (integration, real PostgreSQL)', () => {
  let k1AnnualPlanId: string;
  let vendorId: string;
  let counter = 0;

  const nextTag = (prefix: string) => `${prefix}-${(counter += 1)}`;
  const financePrincipal = (): AuthenticatedPrincipal => ({
    subject: h.finance.appUserId,
    appUserId: h.finance.appUserId,
    sessionId: randomUUID(),
    employeeId: h.finance.employeeId,
    directRoles: ['FINANCE'],
    roles: ['FINANCE'],
  });

  async function seedPlan(): Promise<{ planId: string; vendorId: string }> {
    const { rows: vendors } = await h.ctx.sql.query<{ id: string }>(
      `INSERT INTO vendors (id, organization_id, name, normalized_name)
       VALUES (gen_random_uuid(), $1, $2, $3) RETURNING id`,
      [h.seed.organizationId, nextTag('K1TRVendor'), nextTag('k1trvendor').toLowerCase()],
    );
    const vId = vendors[0].id;
    const { rows: apps } = await h.ctx.sql.query<{ id: string }>(
      `INSERT INTO applications (id, organization_id, vendor_id, name, normalized_name, kind, catalog_status)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'SAAS', 'APPROVED') RETURNING id`,
      [h.seed.organizationId, vId, nextTag('K1TRApp'), nextTag('k1trapp').toLowerCase()],
    );
    const { rows: plans } = await h.ctx.sql.query<{ id: string }>(
      `INSERT INTO plans
         (id, organization_id, application_id, name, normalized_name, provisioning_type, pricing_model, control_level,
          reference_price_minor, reference_price_currency, reference_commitment_months)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'K1', 'PER_SEAT', 'FULL', $5, 'VND', 12)
       RETURNING id`,
      [
        h.seed.organizationId,
        apps[0].id,
        nextTag('K1TRPlan'),
        nextTag('k1trplan').toLowerCase(),
        MONTHLY_PRICE.toString(),
      ],
    );

    return { planId: plans[0].id, vendorId: vId };
  }

  async function runFullYearStart(year: number): Promise<void> {
    const runner = h.ctx.app.get(TransactionRunner, { strict: false });
    const batch = h.ctx.app.get(YearStartCommitmentsBatchService, { strict: false });
    let afterId: string | null = null;
    for (;;) {
      const res = await runner.run((tx) =>
        batch.commitBatch(
          tx,
          {
            organizationId: h.seed.organizationId,
            year,
            now: new Date(`${year}-01-01T00:00:00Z`),
            today: `${year}-01-01`,
          },
          afterId,
        ),
      );
      if (res.lastId === null) break;
      afterId = res.lastId;
    }
  }

  async function setupTransferPair(idx: number, oldUnit: Unit, newUnit: Unit) {
    const oldReqId = randomUUID();
    const oldAsgId = randomUUID();
    const piId = randomUUID();
    const newReqId = randomUUID();
    const newAsgId = randomUUID();
    const policy = JSON.stringify({
      version: 1,
      branch: 'PAID_IN_CATALOG',
      chain: ['NEED', 'SPEND_APPROVAL'],
      slaWorkingDays: 3,
    });

    await h.ctx.sql.query(
      `INSERT INTO access_requests
         (id, organization_id, type, branch, state, plan_id, department_id, cost_center_id,
          requester_employee_id, business_reason, submitted_at, budget_year, amount_months,
          next_year_amount_minor, amount_minor, amount_currency, term_months, unit_price_minor,
          monthly_price_minor, price_kind, billing_cycle, pricing_status, expected_end_date, policy, created_by_app_user_id)
       VALUES ($1, $2, 'GRANT', 'PAID_IN_CATALOG', 'COMPLETED', $3, $4, $5, $6, 'K1 race old',
               '2026-11-05T02:00:00Z', $7, 2, '4500000', 900000, 'VND', 12, '450000', '450000', 'RECURRING', 'MONTHLY', 'PRICED',
               '2027-11-04', $8::jsonb, $9)`,
      [
        oldReqId,
        h.seed.organizationId,
        k1AnnualPlanId,
        oldUnit.department.id,
        oldUnit.department.unitId,
        oldUnit.member.employeeId,
        Y1,
        policy,
        h.finance.appUserId,
      ],
    );
    await h.ctx.sql.query(
      `INSERT INTO license_assignments
         (id, organization_id, source, kind, plan_id, subscription_id, employee_id, account_identifier,
          normalized_account_identifier, cost_center_id, owning_department_id, valid_from, valid_from_basis,
          granted_on, valid_until, expected_end_date, personal_commitment_months, billing_anchor_on, created_by_app_user_id)
       VALUES ($1, $2, 'REQUEST', 'PERSONAL', $3, NULL, $4, $5, $5, NULL, $6,
               '2026-11-05', 'ACTUAL'::"AssignmentDateBasis", '2026-11-05', '2026-12-20', '2027-11-04', 12, '2026-11-05', $7)`,
      [
        oldAsgId,
        h.seed.organizationId,
        k1AnnualPlanId,
        oldUnit.member.employeeId,
        `race-old-${idx}`,
        oldUnit.department.id,
        h.finance.appUserId,
      ],
    );
    await h.ctx.sql.query(
      `INSERT INTO provisioning_tasks
         (id, organization_id, kind, status, channel, request_id, assignment_id, claimed_by_app_user_id,
          claimed_at, completed_at, completed_by_app_user_id, evidence, max_attempts, created_by_app_user_id)
       VALUES (gen_random_uuid(), $1, 'GRANT', 'COMPLETED', 'MANUAL', $2, $3, $4,
               '2026-11-05T02:30:00Z', '2026-11-05T03:00:00Z', $4, 'Old grant', 1, $4)`,
      [h.seed.organizationId, oldReqId, oldAsgId, h.finance.appUserId],
    );
    await h.ctx.sql.query(
      `INSERT INTO purchase_invoices
         (id, organization_id, link_kind, request_id, vendor_id, number, issued_on, service_month, label,
          quantity, unit_price_original_minor, unit_price_original_currency, net_minor, deductible_tax_minor,
          non_deductible_tax_minor, match_result, payment_source, flags, charged_cost_center_id, state,
          submitted_by_employee_id, submitted_at)
       VALUES ($1, $2, 'REQUEST', $3, $4, $5, '2026-11-20', '2026-11-01', 'NEW_PURCHASE',
               1, 450000, 'VND', $6, 0, $7, 'MATCHED', 'COMPANY_CARD', ARRAY[]::text[], $8, 'SUBMITTED',
               $9, now())`,
      [
        piId,
        h.seed.organizationId,
        oldReqId,
        vendorId,
        `K1-TR-INV-${idx}`,
        NET_ANNUAL.toString(),
        TAX_ANNUAL.toString(),
        oldUnit.department.unitId,
        oldUnit.head.employeeId,
      ],
    );

    const runner = h.ctx.app.get(TransactionRunner, { strict: false });
    const budgets = h.ctx.app.get(BudgetsApi, { strict: false });
    const rec = await runner.run(async (tx) => {
      const out = await budgets.recordPurchaseInvoice(tx, financePrincipal(), {
        organizationId: h.seed.organizationId,
        purchaseInvoiceId: piId,
        requestId: oldReqId,
        subscriptionId: null,
        vendorId,
        number: `K1-TR-INV-N-${idx}`,
        issuedOn: '2026-11-01',
        serviceMonth: '2026-11-01',
        netMinor: NET_ANNUAL,
        deductibleTaxMinor: 0n,
        nonDeductibleTaxMinor: TAX_ANNUAL,
        matchResult: 'MATCHED',
        chargedCostCenterId: oldUnit.department.unitId,
        unallocated: null,
        k1Annual: { lockSubjectKey: oldAsgId },
        now: new Date(),
      });
      await tx.$executeRaw`UPDATE purchase_invoices SET state = 'CONFIRMED', invoice_id = ${out.invoiceId}::uuid, decided_by_employee_id = ${h.finance.employeeId}::uuid, decided_at = now() WHERE id = ${piId}::uuid`;
      return out;
    });

    await h.ctx.sql.query(
      `INSERT INTO access_requests
         (id, organization_id, type, branch, state, plan_id, department_id, cost_center_id,
          requester_employee_id, business_reason, submitted_at, budget_year, amount_months,
          next_year_amount_minor, amount_minor, amount_currency, term_months, unit_price_minor,
          monthly_price_minor, price_kind, billing_cycle, pricing_status, expected_end_date, replaces_assignment_id, limit_exemption,
          policy, created_by_app_user_id)
       VALUES ($1, $2, 'GRANT', 'PAID_IN_CATALOG', 'COMPLETED', $3, $4, $5, $6, 'K1 race new',
               '2026-12-20T02:00:00Z', $7, 0, '4500000', 0, 'VND', 12, '450000', '450000', 'RECURRING', 'MONTHLY', 'PRICED',
               '2027-11-04', $8, 'TRANSFER_GRACE', $9::jsonb, $10)`,
      [
        newReqId,
        h.seed.organizationId,
        k1AnnualPlanId,
        newUnit.department.id,
        newUnit.department.unitId,
        oldUnit.member.employeeId,
        Y1,
        oldAsgId,
        policy,
        h.finance.appUserId,
      ],
    );
    await h.ctx.sql.query(
      `INSERT INTO license_assignments
         (id, organization_id, source, kind, plan_id, subscription_id, employee_id, account_identifier,
          normalized_account_identifier, cost_center_id, owning_department_id, valid_from, valid_from_basis,
          granted_on, expected_end_date, personal_commitment_months, billing_anchor_on, replaces_assignment_id, created_by_app_user_id)
       VALUES ($1, $2, 'REQUEST', 'PERSONAL', $3, NULL, $4, $5, $5, NULL, $6,
               '2026-12-20', 'ACTUAL'::"AssignmentDateBasis", '2026-12-20', '2027-11-04', 12, '2026-11-05', $7, $8)`,
      [
        newAsgId,
        h.seed.organizationId,
        k1AnnualPlanId,
        oldUnit.member.employeeId,
        `race-new-${idx}`,
        newUnit.department.id,
        oldAsgId,
        h.finance.appUserId,
      ],
    );
    await h.ctx.sql.query(
      `INSERT INTO provisioning_tasks
         (id, organization_id, kind, status, channel, request_id, assignment_id, claimed_by_app_user_id,
          claimed_at, completed_at, completed_by_app_user_id, evidence, max_attempts, created_by_app_user_id)
       VALUES (gen_random_uuid(), $1, 'GRANT', 'COMPLETED', 'MANUAL', $2, $3, $4,
               '2026-12-20T02:30:00Z', '2026-12-20T03:00:00Z', $4, 'New grant', 1, $4)`,
      [h.seed.organizationId, newReqId, newAsgId, h.finance.appUserId],
    );

    return { oldReqId, oldAsgId, newReqId, invoiceId: rec.invoiceId };
  }

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    const seeded = await seedPlan();
    k1AnnualPlanId = seeded.planId;
    vendorId = seeded.vendorId;
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  it('barrier x20: transfer || full 01/01 on root chain advisory key hits 0 deadlocks (40P01) and leaves 0 HELD on old CC', async () => {
    const runner = h.ctx.app.get(TransactionRunner, { strict: false });
    const budgets = h.ctx.app.get(BudgetsApi, { strict: false });
    const appRepo = h.ctx.app.get(InvoiceYearApplicationRepo);
    const invRepo = h.ctx.app.get(InvoiceRepo);

    for (let i = 0; i < 20; i += 1) {
      const oldUnit = await h.departmentWithHead(nextTag(`K1-R-OLD-${i}`));
      const newUnit = await h.departmentWithHead(nextTag(`K1-R-NEW-${i}`));
      const pair = await setupTransferPair(i, oldUnit, newUnit);
      const barrier = new Barrier(2);

      const transferTask = (async () => {
        await barrier.wait();
        return runner.run((tx) =>
          budgets.transferK1AnnualAllocations(tx, {
            lockSubjectKey: pair.oldAsgId,
            invoiceIds: [pair.invoiceId],
            billingAnchorOn: '2026-11-05',
            endedOn: '2026-12-20',
            oldCostCenterId: oldUnit.department.unitId,
            newCostCenterId: newUnit.department.unitId,
            oldRequestIds: [pair.oldReqId],
            newRequestId: pair.newReqId,
            reference: `transfer:race:${pair.oldAsgId}`,
            now: new Date('2026-12-20T05:00:00Z'),
          }),
        );
      })();
      const yearStartTask = (async () => {
        await barrier.wait();
        await runFullYearStart(Y2);
      })();

      await Promise.all([transferTask, yearStartTask]);

      const { rows } = await h.ctx.sql.query<{ request_id: string; state: string; applied_minor: string }>(
        `SELECT request_id::text, state::text, applied_minor::text
           FROM budget_commitments WHERE request_id IN ($1, $2) AND year = $3`,
        [pair.oldReqId, pair.newReqId, Y2],
      );
      expect(rows).toEqual([{ request_id: pair.newReqId, state: 'EXPENSED', applied_minor: '4500000' }]);
      expect(await appRepo.appliedOf(pair.invoiceId, Y2, newUnit.department.unitId)).toBe(4_500_000n);
      expect(await appRepo.appliedOf(pair.invoiceId, Y2, oldUnit.department.unitId)).toBe(0n);
      const spent = await invRepo.spentOf([
        { costCenterId: oldUnit.department.unitId, year: Y2 },
        { costCenterId: newUnit.department.unitId, year: Y2 },
      ]);
      expect(spent.get(`${newUnit.department.unitId}:${Y2}`)).toBe(4_950_000n);
      expect(spent.get(`${oldUnit.department.unitId}:${Y2}`) ?? 0n).toBe(0n);
    }
  }, 120000);
});
