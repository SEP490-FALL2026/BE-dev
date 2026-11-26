import { randomUUID } from 'node:crypto';
import type { AuthenticatedPrincipal } from '../../../src/infrastructure/security/tokens/access-token-verifier.port';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { InvoiceRepo } from '../../../src/modules/budgets/budget/invoice.repo';
import { InvoiceAllocationRepo } from '../../../src/modules/budgets/invoice/invoice-allocation.repo';
import { InvoiceYearApplicationRepo } from '../../../src/modules/budgets/invoice/invoice-year-application.repo';
import { BudgetsApi } from '../../../src/modules/budgets/public/budgets.api';
import { SeatMonthRepo } from '../../../src/modules/budgets/seat-month/seat-month.repo';
import { YearStartCommitmentsBatchService } from '../../../src/modules/requests/year-start-commitments/year-start-commitments-batch.service';
import { InvoiceHarness } from '../../support/invoice-harness';
import type { Unit } from '../../support/spend-harness';

const h = new InvoiceHarness();
const Y1 = 2026;
const Y2 = 2027;
const MONTHLY_PRICE = 450_000n;
const NET_ANNUAL = 5_400_000n;
const TAX_ANNUAL = 540_000n;

describe('W3-23 P13b: K1 annual allocations, 01/01 pairing, F8 transfer (D-16), and F9 concurrency (real PostgreSQL)', () => {
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

  async function seedK1AnnualPlan(): Promise<{ planId: string; vendorId: string }> {
    const { rows: vendors } = await h.ctx.sql.query<{ id: string }>(
      `INSERT INTO vendors (id, organization_id, name, normalized_name)
       VALUES (gen_random_uuid(), $1, $2, $3) RETURNING id`,
      [h.seed.organizationId, nextTag('K1Vendor'), nextTag('k1vendor').toLowerCase()],
    );
    const vId = vendors[0].id;
    const { rows: apps } = await h.ctx.sql.query<{ id: string }>(
      `INSERT INTO applications (id, organization_id, vendor_id, name, normalized_name, kind, catalog_status)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'SAAS', 'APPROVED') RETURNING id`,
      [h.seed.organizationId, vId, nextTag('K1App'), nextTag('k1app').toLowerCase()],
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
        nextTag('K1AnnualPlan'),
        nextTag('k1annualplan').toLowerCase(),
        MONTHLY_PRICE.toString(),
      ],
    );

    return { planId: plans[0].id, vendorId: vId };
  }

  async function createApprovedK1AnnualScenario(opts: {
    unit: Unit;
    validUntil?: string | null;
    revoked?: boolean;
    commit2026?: boolean;
    commit2027?: boolean;
  }): Promise<{ requestId: string; assignmentId: string; purchaseInvoiceId: string }> {
    const requestId = randomUUID();
    const assignmentId = randomUUID();
    const purchaseInvoiceId = randomUUID();

    await h.ctx.sql.query(
      `INSERT INTO access_requests
         (id, organization_id, type, branch, state, plan_id, department_id, cost_center_id,
          requester_employee_id, submitted_at, budget_year, amount_months,
          next_year_amount_minor, amount_currency, term_months, unit_price_minor, billing_cycle, expected_end_date)
       VALUES ($1, $2, 'GRANT', 'PAID_IN_CATALOG', 'COMPLETED', $3, $4, $5, $6,
               '2026-11-05T02:00:00Z', $7, 2, $8, 'VND', 12, $9, 'MONTHLY', '2027-11-04')`,
      [
        requestId,
        h.seed.organizationId,
        k1AnnualPlanId,
        opts.unit.department.id,
        opts.unit.department.unitId,
        opts.unit.member.employeeId,
        Y1,
        '4500000',
        MONTHLY_PRICE.toString(),
      ],
    );

    await h.ctx.sql.query(
      `INSERT INTO license_assignments
         (id, organization_id, source, kind, plan_id, subscription_id, employee_id, account_identifier,
          normalized_account_identifier, cost_center_id, owning_department_id, valid_from, granted_on,
          valid_until, expected_end_date, personal_commitment_months, billing_anchor_on, created_by_app_user_id)
       VALUES ($1, $2, 'REQUEST', 'PERSONAL', $3, NULL, $4, $5, $5, $6, $7,
               '2026-11-05', '2026-11-05', $8, '2027-11-04', 12, '2026-11-05', $9)`,
      [
        assignmentId,
        h.seed.organizationId,
        k1AnnualPlanId,
        opts.unit.member.employeeId,
        nextTag('acct'),
        opts.unit.department.unitId,
        opts.unit.department.id,
        opts.validUntil ?? null,
        h.finance.appUserId,
      ],
    );

    await h.ctx.sql.query(
      `INSERT INTO provisioning_tasks
         (id, organization_id, kind, status, channel, request_id, assignment_id, completed_at, completed_by_app_user_id)
       VALUES (gen_random_uuid(), $1, 'GRANT', 'COMPLETED', 'MANUAL', $2, $3, '2026-11-05T03:00:00Z', $4)`,
      [h.seed.organizationId, requestId, assignmentId, h.finance.appUserId],
    );

    if (opts.commit2026 !== false) {
      await h.ctx.sql.query(
        `INSERT INTO budget_commitments
           (id, organization_id, request_id, cost_center_id, year, amount_minor, currency, state, origin, seat_monthly_minor, unattached_reason)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, 900000, 'VND', 'HELD', 'APPROVAL', 450000, 'NO_BUDGET')`,
        [h.seed.organizationId, requestId, opts.unit.department.unitId, Y1],
      );
    }
    if (opts.commit2027) {
      await h.ctx.sql.query(
        `INSERT INTO budget_commitments
           (id, organization_id, request_id, cost_center_id, year, amount_minor, currency, state, origin, seat_monthly_minor, unattached_reason)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, 4500000, 'VND', 'HELD', 'YEAR_START', 450000, 'NO_BUDGET')`,
        [h.seed.organizationId, requestId, opts.unit.department.unitId, Y2],
      );
    }

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
        purchaseInvoiceId,
        h.seed.organizationId,
        requestId,
        vendorId,
        nextTag('K1-INV'),
        NET_ANNUAL.toString(),
        TAX_ANNUAL.toString(),
        opts.unit.department.unitId,
        opts.unit.head.employeeId,
      ],
    );

    return { requestId, assignmentId, purchaseInvoiceId };
  }

  async function confirmK1Invoice(
    requestId: string,
    assignmentId: string,
    purchaseInvoiceId: string,
    costCenterId: string,
    serviceMonth = '2026-11-01',
    netMinor = NET_ANNUAL,
    nonDeductibleTaxMinor = TAX_ANNUAL,
  ): Promise<string> {
    const runner = h.ctx.app.get(TransactionRunner, { strict: false });
    const budgets = h.ctx.app.get(BudgetsApi, { strict: false });

    const recorded = await runner.run(async (tx) => {
      const rec = await budgets.recordPurchaseInvoice(tx, financePrincipal(), {
        organizationId: h.seed.organizationId,
        purchaseInvoiceId,
        requestId,
        subscriptionId: null,
        vendorId,
        number: nextTag('K1-INV-NUM'),
        issuedOn: serviceMonth,
        serviceMonth,
        netMinor,
        deductibleTaxMinor: 0n,
        nonDeductibleTaxMinor,
        matchResult: 'MATCHED',
        chargedCostCenterId: costCenterId,
        unallocated: null,
        k1Annual: { lockSubjectKey: assignmentId },
        now: new Date(),
      });
      await tx.$executeRaw`UPDATE purchase_invoices SET state = 'CONFIRMED', invoice_id = ${rec.invoiceId}::uuid WHERE id = ${purchaseInvoiceId}::uuid`;

      return rec;
    });

    return recorded.invoiceId;
  }

  async function runYearStartFor(requestId: string, year = Y2): Promise<void> {
    const runner = h.ctx.app.get(TransactionRunner, { strict: false });
    const batch = h.ctx.app.get(YearStartCommitmentsBatchService, { strict: false });

    await runner.run(async (tx) => {
      // Iterate batches starting just before or scan until requestId is passed.
      let afterId: string | null = null;
      for (;;) {
        const res = await batch.commitBatch(
          tx,
          {
            organizationId: h.seed.organizationId,
            year,
            now: new Date(`${year}-01-01T00:00:00Z`),
            today: `${year}-01-01`,
          },
          afterId,
        );
        if (res.lastId === null || res.lastId >= requestId) break;
        afterId = res.lastId;
      }
    });
  }

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    const seeded = await seedK1AnnualPlan();
    k1AnnualPlanId = seeded.planId;
    vendorId = seeded.vendorId;
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  it('produces identical allocations, year applications, EXPENSED state, and spent totals regardless of confirmation before vs after 01/01 (K-A1, F9(a))', async () => {
    const uBefore = await h.departmentWithHead(nextTag('K1-ORD1'));
    const uAfter = await h.departmentWithHead(nextTag('K1-ORD2'));

    // Order 1: Confirm invoice first -> then 01/01 pass
    const s1 = await createApprovedK1AnnualScenario({ unit: uBefore });
    const inv1 = await confirmK1Invoice(s1.requestId, s1.assignmentId, s1.purchaseInvoiceId, uBefore.department.unitId);
    await runYearStartFor(s1.requestId, Y2);

    // Order 2: 01/01 pass first -> then confirm invoice
    const s2 = await createApprovedK1AnnualScenario({ unit: uAfter });
    await runYearStartFor(s2.requestId, Y2);
    const inv2 = await confirmK1Invoice(s2.requestId, s2.assignmentId, s2.purchaseInvoiceId, uAfter.department.unitId);

    const allocRepo = h.ctx.app.get(InvoiceAllocationRepo);
    const appRepo = h.ctx.app.get(InvoiceYearApplicationRepo);
    const invRepo = h.ctx.app.get(InvoiceRepo);

    expect(await allocRepo.ofInvoice(inv1)).toHaveLength(12);
    expect(await allocRepo.ofInvoice(inv2)).toHaveLength(12);
    expect(await appRepo.appliedOf(inv1, Y1, uBefore.department.unitId)).toBe(900_000n);
    expect(await appRepo.appliedOf(inv1, Y2, uBefore.department.unitId)).toBe(4_500_000n);
    expect(await appRepo.appliedOf(inv2, Y1, uAfter.department.unitId)).toBe(900_000n);
    expect(await appRepo.appliedOf(inv2, Y2, uAfter.department.unitId)).toBe(4_500_000n);

    const spent = await invRepo.spentOf([
      { costCenterId: uBefore.department.unitId, year: Y1 },
      { costCenterId: uBefore.department.unitId, year: Y2 },
      { costCenterId: uAfter.department.unitId, year: Y1 },
      { costCenterId: uAfter.department.unitId, year: Y2 },
    ]);
    expect(spent.get(`${uBefore.department.unitId}:${Y1}`)).toBe(990_000n);
    expect(spent.get(`${uBefore.department.unitId}:${Y2}`)).toBe(4_950_000n);
    expect(spent.get(`${uAfter.department.unitId}:${Y1}`)).toBe(990_000n);
    expect(spent.get(`${uAfter.department.unitId}:${Y2}`)).toBe(4_950_000n);

    const { rows: states } = await h.ctx.sql.query<{ state: string; applied_minor: string }>(
      `SELECT state::text, applied_minor::text FROM budget_commitments WHERE request_id IN ($1, $2) AND year = $3`,
      [s1.requestId, s2.requestId, Y2],
    );
    expect(states).toEqual([
      { state: 'EXPENSED', applied_minor: '4500000' },
      { state: 'EXPENSED', applied_minor: '4500000' },
    ]);
  });

  it('N3 + F9(b) + F9(c): applies (invoice, year) sequentially, runs year 2 11/2027..10/2028, and commits revoked seat after invoice confirmation', async () => {
    const unit = await h.departmentWithHead(nextTag('K1-F9C'));
    const s = await createApprovedK1AnnualScenario({ unit, validUntil: '2026-12-10', revoked: true });
    const invId = await confirmK1Invoice(s.requestId, s.assignmentId, s.purchaseInvoiceId, unit.department.unitId);

    // Year 2 (11/2027..10/2028) serviceMonth allocation (also exercises N3 overlapping 11..12/2027)
    const pi2 = randomUUID();
    await h.ctx.sql.query(
      `INSERT INTO purchase_invoices
         (id, organization_id, link_kind, request_id, vendor_id, number, issued_on, service_month, label,
          quantity, unit_price_original_minor, unit_price_original_currency, net_minor, deductible_tax_minor,
          non_deductible_tax_minor, match_result, payment_source, flags, charged_cost_center_id, state,
          submitted_by_employee_id, submitted_at)
       VALUES ($1, $2, 'REQUEST', $3, $4, $5, '2027-11-01', '2027-11-01', 'RENEWAL',
               1, 450000, 'VND', $6, 0, $7, 'MATCHED', 'COMPANY_CARD', ARRAY[]::text[], $8, 'SUBMITTED',
               $9, now())`,
      [
        pi2,
        h.seed.organizationId,
        s.requestId,
        vendorId,
        nextTag('K1-Y2'),
        NET_ANNUAL.toString(),
        TAX_ANNUAL.toString(),
        unit.department.unitId,
        unit.head.employeeId,
      ],
    );
    const inv2Id = await confirmK1Invoice(s.requestId, s.assignmentId, pi2, unit.department.unitId, '2027-11-01');

    await runYearStartFor(s.requestId, Y2);

    const allocs2 = await h.ctx.app.get(InvoiceAllocationRepo).ofInvoice(inv2Id);
    expect(allocs2).toHaveLength(12);
    expect(allocs2[0]?.month).toBe('2027-11-01');
    expect(allocs2[11]?.month).toBe('2028-10-01');

    // F9(c) + N3: revoked seat still receives 2027 commitment (4.500k); inv1 takes 4.500k -> EXPENSED; inv2 takes 0 + taxVar 90k
    const appRepo = h.ctx.app.get(InvoiceYearApplicationRepo);
    expect(await appRepo.appliedOf(invId, Y2, unit.department.unitId)).toBe(4_500_000n);
    const { rows: cRows } = await h.ctx.sql.query<{ state: string; applied_minor: string }>(
      `SELECT state::text, applied_minor::text FROM budget_commitments WHERE request_id = $1 AND year = $2`,
      [s.requestId, Y2],
    );
    expect(cRows).toEqual([{ state: 'EXPENSED', applied_minor: '4500000' }]);
    const company2027 = await h.ctx.app.get(SeatMonthRepo).yearTotals(Y2);
    expect(company2027.companyMinor).toBeGreaterThanOrEqual(4_950_000n);
  });

  it('F8 transfer after invoice confirmation writes TRANSFER_OUT/TRANSFER_IN, invoice_year_applications, applies CC mới, and preserves D-16 on EXPENSED old commitment', async () => {
    const oldUnit = await h.departmentWithHead(nextTag('K1-OLD'));
    const newUnit = await h.departmentWithHead(nextTag('K1-NEW'));
    const s = await createApprovedK1AnnualScenario({ unit: oldUnit, commit2027: true });
    const invId = await confirmK1Invoice(s.requestId, s.assignmentId, s.purchaseInvoiceId, oldUnit.department.unitId);

    // New request on new CC holding 7m * 450k = 3.150.000 in 2027
    const newRequestId = randomUUID();
    await h.ctx.sql.query(
      `INSERT INTO access_requests
         (id, organization_id, type, branch, state, plan_id, department_id, cost_center_id,
          requester_employee_id, submitted_at, budget_year, amount_months,
          term_months, unit_price_minor, billing_cycle)
       VALUES ($1, $2, 'GRANT', 'PAID_IN_CATALOG', 'COMPLETED', $3, $4, $5, $6,
               '2027-03-20T02:00:00Z', $7, 7, 12, '450000', 'MONTHLY')`,
      [
        newRequestId,
        h.seed.organizationId,
        k1AnnualPlanId,
        newUnit.department.id,
        newUnit.department.unitId,
        oldUnit.member.employeeId,
        Y2,
      ],
    );
    await h.ctx.sql.query(
      `INSERT INTO budget_commitments
         (id, organization_id, request_id, cost_center_id, year, amount_minor, currency, state, origin, seat_monthly_minor, unattached_reason)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 3150000, 'VND', 'HELD', 'APPROVAL', 450000, 'NO_BUDGET')`,
      [h.seed.organizationId, newRequestId, newUnit.department.unitId, Y2],
    );

    const runner = h.ctx.app.get(TransactionRunner, { strict: false });
    const budgets = h.ctx.app.get(BudgetsApi, { strict: false });
    await runner.run((tx) =>
      budgets.transferK1AnnualAllocations(tx, {
        lockSubjectKey: s.assignmentId,
        invoiceIds: [invId],
        billingAnchorOn: '2026-11-05',
        endedOn: '2027-03-20',
        oldCostCenterId: oldUnit.department.unitId,
        newCostCenterId: newUnit.department.unitId,
        oldRequestIds: [s.requestId],
        newRequestId,
        reference: `transfer:regrant:assignment:${s.assignmentId}`,
        now: new Date('2027-03-20T05:00:00Z'),
      }),
    );

    const allocs = await h.ctx.app.get(InvoiceAllocationRepo).ofInvoice(invId);
    expect(allocs.filter((a) => a.kind === 'TRANSFER_OUT')).toHaveLength(7);
    expect(allocs.filter((a) => a.kind === 'TRANSFER_IN')).toHaveLength(7);
    const appRepo = h.ctx.app.get(InvoiceYearApplicationRepo);
    expect(await appRepo.appliedOf(invId, Y2, oldUnit.department.unitId)).toBe(1_350_000n);
    expect(await appRepo.appliedOf(invId, Y2, newUnit.department.unitId)).toBe(3_150_000n);

    const invRepo = h.ctx.app.get(InvoiceRepo);
    const spent = await invRepo.spentOf([
      { costCenterId: oldUnit.department.unitId, year: Y2 },
      { costCenterId: newUnit.department.unitId, year: Y2 },
    ]);
    expect(spent.get(`${oldUnit.department.unitId}:${Y2}`)).toBe(1_485_000n);
    expect(spent.get(`${newUnit.department.unitId}:${Y2}`)).toBe(3_465_000n);

    const { rows: commitStates } = await h.ctx.sql.query<{
      request_id: string;
      state: string;
      applied_minor: string;
      released_minor: string;
      transfer_returned_minor: string;
    }>(
      `SELECT request_id::text, state::text, applied_minor::text, released_minor::text, transfer_returned_minor::text
         FROM budget_commitments WHERE request_id IN ($1, $2) AND year = $3 ORDER BY request_id`,
      [s.requestId, newRequestId, Y2],
    );
    const byReq = new Map(commitStates.map((r) => [r.request_id, r]));
    // D-16: EXPENSED old commitment reflects transferred delta (3.150.000) -> applied 1.350.000, released 3.150.000
    expect(byReq.get(s.requestId)).toEqual({
      request_id: s.requestId,
      state: 'EXPENSED',
      applied_minor: '1350000',
      released_minor: '3150000',
      transfer_returned_minor: '3150000',
    });
    expect(byReq.get(newRequestId)).toEqual({
      request_id: newRequestId,
      state: 'EXPENSED',
      applied_minor: '3150000',
      released_minor: '0',
      transfer_returned_minor: '0',
    });

    const { rows: releases } = await h.ctx.sql.query<{ reason: string; amount_minor: string }>(
      `SELECT r.reason::text, r.amount_minor::text
         FROM budget_commitment_releases r
         JOIN budget_commitments c ON c.id = r.commitment_id
        WHERE c.request_id = $1 AND c.year = $2`,
      [s.requestId, Y2],
    );
    expect(releases).toEqual([{ reason: 'TRANSFER_EFFECTIVE', amount_minor: '3150000' }]);
  });

  it('F-21/D-16 trigger guard: rejects decreasing applied_minor on EXPENSED commitment with wrong transfer_returned_minor (23001)', async () => {
    const unit = await h.departmentWithHead(nextTag('K1-D16-GUARD'));
    const s = await createApprovedK1AnnualScenario({ unit, commit2027: true });
    await confirmK1Invoice(s.requestId, s.assignmentId, s.purchaseInvoiceId, unit.department.unitId);

    let sqlState: string | undefined;
    try {
      await h.ctx.sql.query(
        `UPDATE budget_commitments
            SET applied_minor = applied_minor - 100000,
                released_minor = released_minor + 100000,
                transfer_returned_minor = transfer_returned_minor + 100000
          WHERE request_id = $1 AND year = $2`,
        [s.requestId, Y2],
      );
    } catch (err) {
      sqlState = (err as { code?: string }).code;
    }
    expect(sqlState).toBe('23001');
  });

  it('F-7: K1 annual transfer on 20/12/2026 then 01/01/2027 applies transferred invoice to new department with 0 leftover HELD and 2027 spent = 4.950.000', async () => {
    const oldUnit = await h.departmentWithHead(nextTag('K1-F7-OLD'));
    const newUnit = await h.departmentWithHead(nextTag('K1-F7-NEW'));
    const s = await createApprovedK1AnnualScenario({ unit: oldUnit });
    const invId = await confirmK1Invoice(s.requestId, s.assignmentId, s.purchaseInvoiceId, oldUnit.department.unitId);

    const newRequestId = randomUUID();
    const newAsgId = randomUUID();
    await h.ctx.sql.query(`UPDATE license_assignments SET valid_until = '2026-12-20' WHERE id = $1`, [s.assignmentId]);
    await h.ctx.sql.query(
      `INSERT INTO access_requests
         (id, organization_id, type, branch, state, plan_id, department_id, cost_center_id,
          requester_employee_id, submitted_at, budget_year, amount_months, next_year_amount_minor,
          amount_currency, term_months, unit_price_minor, billing_cycle, expected_end_date, replaces_assignment_id)
       VALUES ($1, $2, 'GRANT', 'PAID_IN_CATALOG', 'COMPLETED', $3, $4, $5, $6,
               '2026-12-20T02:00:00Z', $7, 0, '4500000', 'VND', 12, '450000', 'MONTHLY', '2027-11-04', $8)`,
      [
        newRequestId,
        h.seed.organizationId,
        k1AnnualPlanId,
        newUnit.department.id,
        newUnit.department.unitId,
        oldUnit.member.employeeId,
        Y1,
        s.assignmentId,
      ],
    );
    await h.ctx.sql.query(
      `INSERT INTO license_assignments
         (id, organization_id, source, kind, plan_id, subscription_id, employee_id, account_identifier,
          normalized_account_identifier, cost_center_id, owning_department_id, valid_from, granted_on,
          expected_end_date, personal_commitment_months, billing_anchor_on, replaces_assignment_id, created_by_app_user_id)
       VALUES ($1, $2, 'REQUEST', 'PERSONAL', $3, NULL, $4, $5, $5, $6, $7,
               '2026-12-20', '2026-12-20', '2027-11-04', 12, '2026-11-05', $8, $9)`,
      [
        newAsgId,
        h.seed.organizationId,
        k1AnnualPlanId,
        oldUnit.member.employeeId,
        nextTag('acct-new'),
        newUnit.department.unitId,
        newUnit.department.id,
        s.assignmentId,
        h.finance.appUserId,
      ],
    );
    await h.ctx.sql.query(
      `INSERT INTO provisioning_tasks
         (id, organization_id, kind, status, channel, request_id, assignment_id, completed_at, completed_by_app_user_id)
       VALUES (gen_random_uuid(), $1, 'GRANT', 'COMPLETED', 'MANUAL', $2, $3, '2026-12-20T03:00:00Z', $4)`,
      [h.seed.organizationId, newRequestId, newAsgId, h.finance.appUserId],
    );

    const runner = h.ctx.app.get(TransactionRunner, { strict: false });
    const budgets = h.ctx.app.get(BudgetsApi, { strict: false });
    await runner.run((tx) =>
      budgets.transferK1AnnualAllocations(tx, {
        lockSubjectKey: s.assignmentId,
        invoiceIds: [invId],
        billingAnchorOn: '2026-11-05',
        endedOn: '2026-12-20',
        oldCostCenterId: oldUnit.department.unitId,
        newCostCenterId: newUnit.department.unitId,
        oldRequestIds: [s.requestId],
        newRequestId,
        reference: `transfer:regrant:assignment:${s.assignmentId}`,
        now: new Date('2026-12-20T05:00:00Z'),
      }),
    );

    await runYearStartFor(newRequestId, Y2);

    const { rows: commitStates } = await h.ctx.sql.query<{ request_id: string; state: string; applied_minor: string }>(
      `SELECT request_id::text, state::text, applied_minor::text
         FROM budget_commitments WHERE request_id IN ($1, $2) AND year = $3`,
      [s.requestId, newRequestId, Y2],
    );
    expect(commitStates).toEqual([{ request_id: newRequestId, state: 'EXPENSED', applied_minor: '4500000' }]);

    const invRepo = h.ctx.app.get(InvoiceRepo);
    const spent2027 = await invRepo.spentOf([
      { costCenterId: oldUnit.department.unitId, year: Y2 },
      { costCenterId: newUnit.department.unitId, year: Y2 },
    ]);
    expect(spent2027.get(`${newUnit.department.unitId}:${Y2}`)).toBe(4_950_000n);
    expect(spent2027.get(`${oldUnit.department.unitId}:${Y2}`) ?? 0n).toBe(0n);
  });

  it('F9(a) concurrency barrier ×20: simultaneous confirm || 01/01 hits 0 SQL deadlocks (40P01) and yields exact applied 4.500.000', async () => {
    const appRepo = h.ctx.app.get(InvoiceYearApplicationRepo);
    for (let i = 0; i < 20; i += 1) {
      const unit = await h.departmentWithHead(nextTag(`K1-CONC-${i}`));
      const s = await createApprovedK1AnnualScenario({ unit });
      const [invId] = await Promise.all([
        confirmK1Invoice(s.requestId, s.assignmentId, s.purchaseInvoiceId, unit.department.unitId),
        runYearStartFor(s.requestId, Y2).then(() => 'ok'),
      ]);

      expect(await appRepo.appliedOf(invId, Y2, unit.department.unitId)).toBe(4_500_000n);
      const { rows } = await h.ctx.sql.query<{ state: string; applied_minor: string }>(
        `SELECT state::text, applied_minor::text FROM budget_commitments WHERE request_id = $1 AND year = $2`,
        [s.requestId, Y2],
      );
      expect(rows).toEqual([{ state: 'EXPENSED', applied_minor: '4500000' }]);
    }
  }, 120000);
});
