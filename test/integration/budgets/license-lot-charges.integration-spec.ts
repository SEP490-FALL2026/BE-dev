import { randomBytes, randomUUID } from 'node:crypto';
import type { AuthenticatedPrincipal } from '../../../src/infrastructure/security/tokens/access-token-verifier.port';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { InvoiceRepo } from '../../../src/modules/budgets/budget/invoice.repo';
import { BudgetsApi } from '../../../src/modules/budgets/public/budgets.api';
import { PurchaseInvoiceRecordRefusedError } from '../../../src/modules/budgets/public/budgets.errors';
import { SeatMonthRepo } from '../../../src/modules/budgets/seat-month/seat-month.repo';
import { SharedPoolLineAlertService } from '../../../src/modules/budgets/shared-pool-line/shared-pool-line-alert.service';
import { SharedPoolLineFactsService } from '../../../src/modules/budgets/shared-pool-line/shared-pool-line-facts.service';
import { InvoiceHarness } from '../../support/invoice-harness';
import type { Unit } from '../../support/spend-harness';

const h = new InvoiceHarness();
const M = 1_000_000n;

describe('W3-25 P20: license-lot charges, 3-order allocation invariant (= A), and F10-F14 (real PostgreSQL)', () => {
  let k4AccountPlanId: string;
  let k4DevicePlanId: string;
  let vendorId: string;
  let workspaceId: string;
  let tagSeq = 0;

  const nextTag = (prefix: string) => `${prefix}-${(tagSeq += 1)}`;
  const financePrincipal = (): AuthenticatedPrincipal => ({
    subject: h.finance.appUserId,
    appUserId: h.finance.appUserId,
    sessionId: randomUUID(),
    employeeId: h.finance.employeeId,
    directRoles: ['FINANCE'],
    roles: ['FINANCE'],
  });

  async function seedK4Plans(): Promise<{
    accountPlanId: string;
    devicePlanId: string;
    vendorId: string;
    workspaceId: string;
  }> {
    const { rows: vendors } = await h.ctx.sql.query<{ id: string }>(
      `INSERT INTO vendors (id, organization_id, name, normalized_name)
       VALUES (gen_random_uuid(), $1, $2, $3) RETURNING id`,
      [h.seed.organizationId, nextTag('CADVendor'), nextTag('cadvendor').toLowerCase()],
    );
    const vId = vendors[0].id;
    const { rows: workspaces } = await h.ctx.sql.query<{ id: string }>(
      `INSERT INTO workspaces (id, organization_id, vendor_id, name, normalized_name)
       VALUES (gen_random_uuid(), $1, $2, $3, $4) RETURNING id`,
      [h.seed.organizationId, vId, nextTag('CADWorkspace'), nextTag('cadworkspace').toLowerCase()],
    );
    const wsId = workspaces[0].id;
    const { rows: apps } = await h.ctx.sql.query<{ id: string }>(
      `INSERT INTO applications (id, organization_id, vendor_id, name, normalized_name, kind, catalog_status)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'LICENSED', 'APPROVED') RETURNING id`,
      [h.seed.organizationId, vId, nextTag('CADApp'), nextTag('cadapp').toLowerCase()],
    );
    const { rows: accPlans } = await h.ctx.sql.query<{ id: string }>(
      `INSERT INTO plans
         (id, organization_id, application_id, name, normalized_name, provisioning_type, pricing_model, key_binding, control_level)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'K4', 'PER_SEAT', 'ACCOUNT', 'FULL')
       RETURNING id`,
      [h.seed.organizationId, apps[0].id, nextTag('CADAccount'), nextTag('cadaccount').toLowerCase()],
    );
    const { rows: devPlans } = await h.ctx.sql.query<{ id: string }>(
      `INSERT INTO plans
         (id, organization_id, application_id, name, normalized_name, provisioning_type, pricing_model, key_binding, control_level)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'K4', 'PER_SEAT', 'DEVICE_KEY', 'FULL')
       RETURNING id`,
      [h.seed.organizationId, apps[0].id, nextTag('CADDevice'), nextTag('caddevice').toLowerCase()],
    );

    return { accountPlanId: accPlans[0].id, devicePlanId: devPlans[0].id, vendorId: vId, workspaceId: wsId };
  }

  async function seedRequest(opts: {
    unit: Unit;
    year: number;
    amountMinor: bigint;
    planId: string;
    type?: 'GRANT' | 'GROUP_GRANT';
    members?: readonly string[];
  }): Promise<{ requestId: string; purchaseInvoiceId: string }> {
    const requestId = randomUUID();
    const purchaseInvoiceId = randomUUID();
    const members = opts.members ?? [opts.unit.member.employeeId];
    await h.ctx.sql.query(
      `INSERT INTO access_requests
         (id, organization_id, type, branch, state, plan_id, department_id, cost_center_id,
          requester_employee_id, requested_by_employee_id, submitted_at, budget_year, amount_months,
          amount_currency, unit_price_minor)
       VALUES ($1, $2, $3, 'PAID_IN_CATALOG', 'AWAITING_EXECUTION', $4, $5, $6, $7, $7, now(), $8, 1, 'VND', $9)`,
      [
        requestId,
        h.seed.organizationId,
        opts.type ?? 'GRANT',
        opts.planId,
        opts.unit.department.id,
        opts.unit.department.unitId,
        members[0],
        opts.year,
        opts.amountMinor.toString(),
      ],
    );
    for (const empId of members) {
      await h.ctx.sql.query(`INSERT INTO access_request_beneficiaries (request_id, employee_id) VALUES ($1, $2)`, [
        requestId,
        empId,
      ]);
    }
    await h.ctx.sql.query(
      `INSERT INTO budget_commitments
         (id, organization_id, request_id, cost_center_id, year, amount_minor, currency, state, origin, unattached_reason)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'VND', 'HELD', 'APPROVAL', 'NO_BUDGET')`,
      [h.seed.organizationId, requestId, opts.unit.department.unitId, opts.year, opts.amountMinor.toString()],
    );
    await h.ctx.sql.query(
      `INSERT INTO purchase_invoices
         (id, organization_id, link_kind, request_id, vendor_id, number, issued_on, service_month, label,
          quantity, unit_price_original_minor, unit_price_original_currency, net_minor, deductible_tax_minor,
          non_deductible_tax_minor, match_result, payment_source, flags, charged_cost_center_id, state,
          submitted_by_employee_id, submitted_at)
       VALUES ($1, $2, 'REQUEST', $3, $4, $5, '2027-04-25', '2027-04-01', 'NEW_PURCHASE',
               1, $6, 'VND', $6, 0, 0, 'MATCHED', 'COMPANY_CARD', ARRAY[]::text[], $7, 'SUBMITTED',
               $8, now())`,
      [
        purchaseInvoiceId,
        h.seed.organizationId,
        requestId,
        vendorId,
        nextTag('LOT-PI'),
        opts.amountMinor.toString(),
        opts.unit.department.unitId,
        opts.unit.head.employeeId,
      ],
    );

    return { requestId, purchaseInvoiceId };
  }

  async function seedLot(opts: {
    planId: string;
    purpose: 'REQUEST' | 'STOCK' | 'REPLACEMENT';
    requestId?: string | null;
    licenseCount: number;
    unitPriceMinor: bigint;
    purchasedOn?: string;
    keysCount?: number;
  }): Promise<{ lotId: string; keyIds: string[] }> {
    const lotId = randomUUID();
    await h.ctx.sql.query(
      `INSERT INTO license_lots
         (id, organization_id, plan_id, workspace_id, purchased_on, license_count, unit_price_minor, purpose, request_id,
          responsible_it_admin_employee_id, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())`,
      [
        lotId,
        h.seed.organizationId,
        opts.planId,
        workspaceId,
        opts.purchasedOn ?? '2027-04-01',
        opts.licenseCount,
        opts.unitPriceMinor.toString(),
        opts.purpose,
        opts.requestId ?? null,
        h.finance.employeeId,
      ],
    );
    const keyIds: string[] = [];
    for (let i = 0; i < (opts.keysCount ?? opts.licenseCount); i += 1) {
      const keyId = randomUUID();
      await h.ctx.sql.query(
        `INSERT INTO license_keys
           (id, organization_id, license_lot_id, cost_borne, fingerprint, masked, ciphertext, cipher_key_id, imported_by_app_user_id)
         VALUES ($1, $2, $3, false, $4, '....1234', decode(repeat('ab', 40), 'hex'), 'k1', $5)`,
        [keyId, h.seed.organizationId, lotId, randomBytes(32).toString('hex'), h.finance.appUserId],
      );
      keyIds.push(keyId);
    }

    return { lotId, keyIds };
  }

  async function confirmLotInvoice(opts: {
    lotId: string;
    requestId: string | null;
    purchaseInvoiceId: string;
    costCenterId: string | null;
    netMinor: bigint;
    nonDeductibleTaxMinor: bigint;
    allocationMonth: string;
    beneficiaryCount: number;
    now: Date;
  }): Promise<string> {
    const runner = h.ctx.app.get(TransactionRunner, { strict: false });
    const budgets = h.ctx.app.get(BudgetsApi, { strict: false });
    const rec = await runner.run((tx) =>
      budgets.recordPurchaseInvoice(tx, financePrincipal(), {
        organizationId: h.seed.organizationId,
        purchaseInvoiceId: opts.purchaseInvoiceId,
        requestId: opts.requestId,
        subscriptionId: null,
        licenseLotId: opts.lotId,
        allocationMonth: opts.allocationMonth,
        lotBeneficiaryCount: opts.beneficiaryCount,
        vendorId,
        number: nextTag('FIN-INV'),
        issuedOn: opts.allocationMonth,
        serviceMonth: opts.allocationMonth,
        netMinor: opts.netMinor,
        deductibleTaxMinor: 0n,
        nonDeductibleTaxMinor: opts.nonDeductibleTaxMinor,
        matchResult: 'MATCHED',
        chargedCostCenterId: opts.costCenterId,
        unallocated: null,
        now: opts.now,
      }),
    );

    return rec.invoiceId;
  }

  async function grantLotKey(opts: {
    lotId: string;
    keyId: string;
    requestId: string;
    costCenterId: string;
    keyCostBorneBeforeGrant?: boolean;
    grantMonth: string;
    effectiveM: number;
    now: Date;
  }) {
    const runner = h.ctx.app.get(TransactionRunner, { strict: false });
    const budgets = h.ctx.app.get(BudgetsApi, { strict: false });

    return runner.run(async (tx) => {
      const res = await budgets.recordExcessLotLicenseGrant(tx, {
        organizationId: h.seed.organizationId,
        licenseLotId: opts.lotId,
        licenseKeyId: opts.keyId,
        grantRequestId: opts.requestId,
        costCenterId: opts.costCenterId,
        keyCostBorneBeforeGrant: opts.keyCostBorneBeforeGrant ?? false,
        grantMonth: opts.grantMonth,
        effectiveBeneficiaryCount: opts.effectiveM,
        reference: `grant:${opts.keyId}`,
        now: opts.now,
      });
      if (res.markCostBorne) {
        await tx.$executeRaw`UPDATE license_keys SET cost_borne = true WHERE id = ${opts.keyId}::uuid AND NOT cost_borne`;
      }

      return res;
    });
  }

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    const seeded = await seedK4Plans();
    k4AccountPlanId = seeded.accountPlanId;
    k4DevicePlanId = seeded.devicePlanId;
    vendorId = seeded.vendorId;
    workspaceId = seeded.workspaceId;
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  it('keeps 3-party sum = A across pre-invoice excess (K-A4), post-invoice excess (K-A9), F10 hold, and F14a overwrite block', async () => {
    const ccDuc = await h.departmentWithHead(nextTag('Tech'));
    const ccQuan = await h.departmentWithHead(nextTag('Marketing'));
    const ccHa = await h.departmentWithHead(nextTag('Sales'));
    const ducReq = await seedRequest({ unit: ccDuc, year: 2027, amountMinor: 12n * M, planId: k4AccountPlanId });
    const quanReq = await seedRequest({ unit: ccQuan, year: 2027, amountMinor: 12n * M, planId: k4AccountPlanId });
    const haReq = await seedRequest({ unit: ccHa, year: 2027, amountMinor: 12n * M, planId: k4AccountPlanId });
    const { lotId, keyIds } = await seedLot({
      planId: k4AccountPlanId,
      purpose: 'REQUEST',
      requestId: ducReq.requestId,
      licenseCount: 3,
      unitPriceMinor: 12n * M,
    });

    // F10: Duc (own request) granted key before invoice -> commitment stays HELD, 0 charges
    const ownGrant = await grantLotKey({
      lotId,
      keyId: keyIds[0],
      requestId: ducReq.requestId,
      costCenterId: ccDuc.department.unitId,
      grantMonth: '2027-04-01',
      effectiveM: 1,
      now: new Date('2027-04-10T00:00:00Z'),
    });
    expect(ownGrant.kind).toBe('OWN_REQUEST');
    const heldBefore = await h.ctx.app.get(BudgetsApi, { strict: false }).heldByRequests([ducReq.requestId]);
    expect(heldBefore[0].heldMinor).toBe(12n * M);

    // K-A4: Quan takes pre-invoice excess -> 12M unitPrice
    const quanGrant = await grantLotKey({
      lotId,
      keyId: keyIds[1],
      requestId: quanReq.requestId,
      costCenterId: ccQuan.department.unitId,
      grantMonth: '2027-04-01',
      effectiveM: 1,
      now: new Date('2027-04-20T00:00:00Z'),
    });
    expect(quanGrant.chargeMinor).toBe(12n * M);

    // Invoice confirmed on 25/04 with 10% non-deductible VAT (39.6M)
    await confirmLotInvoice({
      lotId,
      requestId: ducReq.requestId,
      purchaseInvoiceId: ducReq.purchaseInvoiceId,
      costCenterId: ccDuc.department.unitId,
      netMinor: 36n * M,
      nonDeductibleTaxMinor: 3_600_000n,
      allocationMonth: '2027-04-01',
      beneficiaryCount: 1,
      now: new Date('2027-04-25T00:00:00Z'),
    });

    // F14a: second invoice for the same lot fails with LOT_ALREADY_INVOICED
    const dupPi = randomUUID();
    await h.ctx.sql.query(
      `INSERT INTO purchase_invoices
         (id, organization_id, link_kind, license_lot_id, vendor_id, number, issued_on, service_month, label,
          quantity, unit_price_original_minor, unit_price_original_currency, net_minor, deductible_tax_minor,
          non_deductible_tax_minor, match_result, payment_source, flags, state, submitted_by_employee_id, submitted_at)
       VALUES ($1, $2, 'LICENSE_LOT', $3, $4, $5, '2027-04-26', '2027-04-01', 'NEW_PURCHASE',
               3, 12000000, 'VND', 36000000, 0, 0, 'MATCHED', 'COMPANY_CARD', ARRAY[]::text[], 'SUBMITTED', $6, now())`,
      [dupPi, h.seed.organizationId, lotId, vendorId, nextTag('DUP-PI'), h.finance.employeeId],
    );
    await expect(
      confirmLotInvoice({
        lotId,
        requestId: null,
        purchaseInvoiceId: dupPi,
        costCenterId: ccDuc.department.unitId,
        netMinor: 36n * M,
        nonDeductibleTaxMinor: 0n,
        allocationMonth: '2027-04-01',
        beneficiaryCount: 1,
        now: new Date('2027-04-26T00:00:00Z'),
      }),
    ).rejects.toMatchObject({ constructor: PurchaseInvoiceRecordRefusedError, reason: 'LOT_ALREADY_INVOICED' });

    // Ha receives last excess in 09/2027 -> absorbs 14.4M remainder -> pool net goes to 0
    const haGrant = await grantLotKey({
      lotId,
      keyId: keyIds[2],
      requestId: haReq.requestId,
      costCenterId: ccHa.department.unitId,
      grantMonth: '2027-09-01',
      effectiveM: 1,
      now: new Date('2027-09-01T00:00:00Z'),
    });
    expect(haGrant.chargeMinor).toBe(14_400_000n);

    const spent = await h.ctx.app.get(InvoiceRepo, { strict: false }).spentOf([
      { costCenterId: ccDuc.department.unitId, year: 2027 },
      { costCenterId: ccQuan.department.unitId, year: 2027 },
      { costCenterId: ccHa.department.unitId, year: 2027 },
    ]);
    const ducSpent = spent.get(`${ccDuc.department.unitId}:2027`) ?? 0n;
    const quanSpent = spent.get(`${ccQuan.department.unitId}:2027`) ?? 0n;
    const haSpent = spent.get(`${ccHa.department.unitId}:2027`) ?? 0n;
    expect([ducSpent, quanSpent, haSpent]).toEqual([13_200_000n, 12n * M, 14_400_000n]);
    expect(ducSpent + quanSpent + haSpent).toBe(39_600_000n);
    const { companyMinor } = await h.ctx.app.get(SeatMonthRepo, { strict: false }).yearTotals(2027);
    expect(companyMinor).toBe(39_600_000n);
  });

  it('verifies F12a (+2.4M), F13a (10,000,001 full CC), F13c+D-16 withdrawal, STOCK/REPLACEMENT & 33.3% alert', async () => {
    const ccA = await h.departmentWithHead(nextTag('DeptA'));
    const ccB = await h.departmentWithHead(nextTag('DeptB'));

    // F13a: m = n = 3, A = 10,000,001 -> CC 10,000,001, pool = 0
    const req13a = await seedRequest({ unit: ccA, year: 2027, amountMinor: 10_000_000n, planId: k4AccountPlanId });
    const lot13a = await seedLot({
      planId: k4AccountPlanId,
      purpose: 'REQUEST',
      requestId: req13a.requestId,
      licenseCount: 3,
      unitPriceMinor: 3_333_333n,
      keysCount: 0,
    });
    const inv13a = await confirmLotInvoice({
      lotId: lot13a.lotId,
      requestId: req13a.requestId,
      purchaseInvoiceId: req13a.purchaseInvoiceId,
      costCenterId: ccA.department.unitId,
      netMinor: 10_000_001n,
      nonDeductibleTaxMinor: 0n,
      allocationMonth: '2027-05-01',
      beneficiaryCount: 3,
      now: new Date('2027-05-10T00:00:00Z'),
    });
    const { rows: alloc13a } = await h.ctx.sql.query<{ bucket: string; amount_minor: string }>(
      `SELECT bucket, amount_minor::text FROM invoice_allocations WHERE invoice_id = $1`,
      [inv13a],
    );
    expect(alloc13a).toEqual([{ bucket: 'COST_CENTER', amount_minor: '10000001' }]);

    // F13c + D-16: n=3, m=2 (36M) confirmed (commitment EXPENSED) -> withdrawal (-12M CC, +12M POOL_IDLE) -> Ha receives 12M
    const req13c = await seedRequest({
      unit: ccB,
      year: 2027,
      amountMinor: 24n * M,
      planId: k4AccountPlanId,
      type: 'GROUP_GRANT',
      members: [ccB.member.employeeId, ccB.head.employeeId],
    });
    const lot13c = await seedLot({
      planId: k4AccountPlanId,
      purpose: 'REQUEST',
      requestId: req13c.requestId,
      licenseCount: 3,
      unitPriceMinor: 12n * M,
      keysCount: 3,
    });
    await confirmLotInvoice({
      lotId: lot13c.lotId,
      requestId: req13c.requestId,
      purchaseInvoiceId: req13c.purchaseInvoiceId,
      costCenterId: ccB.department.unitId,
      netMinor: 36n * M,
      nonDeductibleTaxMinor: 0n,
      allocationMonth: '2027-05-01',
      beneficiaryCount: 2,
      now: new Date('2027-05-15T00:00:00Z'),
    });
    const runner = h.ctx.app.get(TransactionRunner, { strict: false });
    const budgets = h.ctx.app.get(BudgetsApi, { strict: false });
    await runner.run((tx) =>
      budgets.recordLotWithdrawalAfterInvoice(tx, {
        licenseLotId: lot13c.lotId,
        requestId: req13c.requestId,
        costCenterId: ccB.department.unitId,
        withdrawalMonth: '2027-06-01',
        reference: 'withdraw:an',
        now: new Date('2027-06-01T00:00:00Z'),
      }),
    );
    const ha13c = await grantLotKey({
      lotId: lot13c.lotId,
      keyId: lot13c.keyIds[2],
      requestId: req13a.requestId,
      costCenterId: ccA.department.unitId,
      grantMonth: '2027-06-01',
      effectiveM: 1,
      now: new Date('2027-06-02T00:00:00Z'),
    });
    expect(ha13c.chargeMinor).toBe(12n * M);

    // STOCK DEVICE_KEY (20M -> POOL_DEVICE_LOT) + STOCK ACCOUNT (18M -> POOL_IDLE) + REPLACEMENT (6M -> POOL_REPLACEMENT) in 2027-05
    const piStock = randomUUID();
    const piStockAccount = randomUUID();
    const piRepl = randomUUID();
    const stockLot = await seedLot({
      planId: k4DevicePlanId,
      purpose: 'STOCK',
      licenseCount: 10,
      unitPriceMinor: 2n * M,
      keysCount: 0,
    });
    const stockAccountLot = await seedLot({
      planId: k4AccountPlanId,
      purpose: 'STOCK',
      licenseCount: 3,
      unitPriceMinor: 6n * M,
      keysCount: 0,
    });
    const replLot = await seedLot({
      planId: k4AccountPlanId,
      purpose: 'REPLACEMENT',
      licenseCount: 1,
      unitPriceMinor: 6n * M,
      keysCount: 0,
    });
    for (const [piId, lId, net] of [
      [piStock, stockLot.lotId, 20n * M],
      [piStockAccount, stockAccountLot.lotId, 18n * M],
      [piRepl, replLot.lotId, 6n * M],
    ] as const) {
      await h.ctx.sql.query(
        `INSERT INTO purchase_invoices
           (id, organization_id, link_kind, license_lot_id, vendor_id, number, issued_on, service_month, label,
            quantity, unit_price_original_minor, unit_price_original_currency, net_minor, deductible_tax_minor,
            non_deductible_tax_minor, match_result, payment_source, flags, state, submitted_by_employee_id, submitted_at)
         VALUES ($1, $2, 'LICENSE_LOT', $3, $4, $5, '2027-05-20', '2027-05-01', 'NEW_PURCHASE',
                 1, $6, 'VND', $6, 0, 0, 'MATCHED', 'COMPANY_CARD', ARRAY[]::text[], 'SUBMITTED', $7, now())`,
        [piId, h.seed.organizationId, lId, vendorId, nextTag('POOL-PI'), net.toString(), h.finance.employeeId],
      );
      await confirmLotInvoice({
        lotId: lId,
        requestId: null,
        purchaseInvoiceId: piId,
        costCenterId: null,
        netMinor: net,
        nonDeductibleTaxMinor: 0n,
        allocationMonth: '2027-05-01',
        beneficiaryCount: 0,
        now: new Date('2027-05-20T00:00:00Z'),
      });
    }

    const alerts = await h.ctx.app
      .get(SharedPoolLineAlertService, { strict: false })
      .warnIdleRatioForMonth('2027-05-01');
    expect(alerts).toBeGreaterThanOrEqual(1);
    const { rows: notices } = await h.ctx.sql.query<{ code: string }>(
      `SELECT code FROM in_app_notifications WHERE code = 'LICENSE_LOT_IDLE_COST_HIGH'`,
    );
    expect(notices.length).toBeGreaterThanOrEqual(1);

    const figures = await h.ctx.app.get(SharedPoolLineFactsService, { strict: false }).yearFigures(2027, 12);
    expect(figures.deviceLotPurchasesMinor).toBe(20n * M);
    expect(figures.replacementKeysMinor).toBe(6n * M);
    const { rows: stockAccAllocs } = await h.ctx.sql.query<{ bucket: string; amount_minor: string }>(
      `SELECT a.bucket, a.amount_minor::text
         FROM invoice_allocations a
         JOIN invoices i ON i.id = a.invoice_id
        WHERE i.subscription_id = $1`,
      [stockAccountLot.lotId],
    );
    expect(stockAccAllocs).toEqual([{ bucket: 'POOL_IDLE', amount_minor: (18n * M).toString() }]);

    // F12(a): 2 excess pre-invoice (24M), then confirm 39.6M -> Duc 13.2M, POOL_LOT_DIFFERENCE +2.4M
    const req12a = await seedRequest({ unit: ccA, year: 2027, amountMinor: 12n * M, planId: k4AccountPlanId });
    const lot12a = await seedLot({
      planId: k4AccountPlanId,
      purpose: 'REQUEST',
      requestId: req12a.requestId,
      licenseCount: 3,
      unitPriceMinor: 12n * M,
      keysCount: 3,
    });
    for (const keyId of [lot12a.keyIds[1], lot12a.keyIds[2]]) {
      await grantLotKey({
        lotId: lot12a.lotId,
        keyId,
        requestId: req13a.requestId,
        costCenterId: ccA.department.unitId,
        grantMonth: '2027-05-01',
        effectiveM: 1,
        now: new Date('2027-05-18T00:00:00Z'),
      });
    }
    const inv12a = await confirmLotInvoice({
      lotId: lot12a.lotId,
      requestId: req12a.requestId,
      purchaseInvoiceId: req12a.purchaseInvoiceId,
      costCenterId: ccA.department.unitId,
      netMinor: 36n * M,
      nonDeductibleTaxMinor: 3_600_000n,
      allocationMonth: '2027-05-01',
      beneficiaryCount: 1,
      now: new Date('2027-05-19T00:00:00Z'),
    });
    const { rows: alloc12a } = await h.ctx.sql.query<{ bucket: string; kind: string; amount_minor: string }>(
      `SELECT bucket, kind, amount_minor::text FROM invoice_allocations WHERE invoice_id = $1 ORDER BY bucket`,
      [inv12a],
    );
    expect(alloc12a).toEqual([
      { bucket: 'COST_CENTER', kind: 'ORIGINAL', amount_minor: '13200000' },
      { bucket: 'POOL_LOT_DIFFERENCE', kind: 'LOT_DIFFERENCE', amount_minor: '2400000' },
    ]);
  });
});
