import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { businessDateAt } from '../../../src/core/business-date';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { SharedPoolLineFactsService } from '../../../src/modules/budgets/shared-pool-line/shared-pool-line-facts.service';
import { SharedPoolLineRepo } from '../../../src/modules/budgets/shared-pool-line/shared-pool-line.repo';
import type { ApiAccount } from '../../support/api-accounts';
import { InvoiceHarness } from '../../support/invoice-harness';
import { handOthersToSecondItAdmin } from '../../support/second-it-admin';
import { takeOwnerOff } from '../../support/shared-pool-subscription';
import type { Unit } from '../../support/spend-harness';

const h = new InvoiceHarness();
const M = 1_000_000;

interface PurchaseWire {
  id: string;
  flags: string[];
  poolExpected: { amount: string; currency: string } | null;
  poolVariance: { amount: string; currency: string } | null;
  invoiceId: string | null;
}

interface DiscrepancyWire {
  id: string;
  state: 'OPEN' | 'CLOSED';
  mismatches: string[];
  outcome: string | null;
}

interface InvoicePoolDbRow {
  pool_expected_minor: string | null;
  pool_variance_minor: string | null;
  pool_variance_month: string | null;
  pool_variance_in_review: boolean;
}

/**
 * End-to-end PostgreSQL verification for K2 expected invoice figures, `SBF-11a` pool variance threshold,
 * merged mismatches on a single `invoice_discrepancy_cases` row, closure resolution into
 * `invoice_pool_variance_resolutions`, and `SUBSCRIPTION_PRICE_REVIEW` notifications (`QĐ-118`, `W3-05`).
 */
describe('K2 pool expected figures & SBF-11a variance over PostgreSQL (integration; W3-05)', () => {
  let it2: ApiAccount;
  let numbers = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    it2 = await handOthersToSecondItAdmin(h);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const api = (method: 'get' | 'post', path: string, account: ApiAccount) =>
    request(h.server())[method](`/api/v1/purchase-invoices${path}`).set(h.as(account));
  const cases = (method: 'get' | 'post', path: string, account: ApiAccount) =>
    request(h.server())[method](`/api/v1/invoice-discrepancies${path}`).set(h.as(account));

  const document = async (): Promise<string> => {
    const id = randomUUID();
    numbers += 1;
    await h.ctx.sql.query(
      `INSERT INTO document_attachments (id, organization_id, purpose, status, file_name, content_type, size_bytes, object_key,
         final_object_key, uploaded_by_app_user_id)
       VALUES ($1, $2, 'PURCHASE_DOCUMENT', 'PENDING_ATTACH', 'hoa-don.pdf', 'application/pdf', 1000, $3, $4, $5)`,
      [
        id,
        h.seed.organizationId,
        `documents/w305/${numbers}-${id}`,
        `documents/w305/kept-${numbers}-${id}`,
        h.it1.appUserId,
      ],
    );

    return id;
  };

  const approvedRequest = async (planId: string, name: string): Promise<{ unit: Unit; requestId: string }> => {
    const unit = await h.departmentWithHead(name);
    await h.setItAdminInCharge(unit.department, { employeeId: h.it1.employeeId, account: h.it1 });
    await h.budgetFor(unit, { total: 100 * M });
    const requestId = await h.waitingForApprover(unit, planId, { amount: 20 * M });
    await h.decideSpend(requestId, { decision: 'APPROVE' }, h.boss.account).expect(200);

    return { unit, requestId };
  };

  const insertPoolTopUpTask = async (input: {
    planId: string;
    subscriptionId: string;
    requestId: string;
    employeeId: string;
    purchasedAt: string;
  }): Promise<void> => {
    const assignmentId = randomUUID();
    numbers += 1;
    await h.ctx.sql.query(
      `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id,
         account_identifier, normalized_account_identifier, valid_from, valid_from_basis, granted_on, created_by_app_user_id)
       VALUES ($1, $2, 'PERSONAL'::"AssignmentKind", 'REQUEST'::"AssignmentSource", $3, $4, $5,
         $6, $6, $7::date, 'ACTUAL'::"AssignmentDateBasis", $7::date, $8)`,
      [
        assignmentId,
        h.seed.organizationId,
        input.planId,
        input.subscriptionId,
        input.employeeId,
        `w305-user-${numbers}@acme.vn`,
        `${h.year}-11-10`,
        h.it1.appUserId,
      ],
    );
    await h.ctx.sql.query(
      `INSERT INTO provisioning_tasks (id, organization_id, assignment_id, kind, channel, status, request_id,
         max_attempts, purchase_kind, purchased_at, claimed_by_app_user_id, claimed_at,
         completed_by_app_user_id, completed_at, evidence, created_by_system)
       VALUES ($1, $2, $3, 'GRANT'::"ProvisioningTaskKind", 'MANUAL'::"ProvisioningChannel",
         'COMPLETED'::"ProvisioningTaskStatus", $4, 3, 'POOL_TOP_UP'::"ProvisioningPurchaseKind",
         $5::timestamptz, $6, $5::timestamptz, $6, $5::timestamptz, 'Granted top-up seat', true)`,
      [randomUUID(), h.seed.organizationId, assignmentId, input.requestId, input.purchasedAt, h.it1.appUserId],
    );
  };

  it('enforces invoices_pool_figures CHECK constraint for invalid and valid tuples', async () => {
    const subId = await takeOwnerOff(h, await h.subscription(10, 'K2'));
    const planId = await h.planOf(subId);
    const vendorId = (await h.vendorOf(planId)).id;
    const insertBadPoolInvoice = (cols: string, values: string) =>
      h.ctx.sql.query(
        `INSERT INTO invoices (id, organization_id, vendor_id, number, issued_on, currency, net_minor,
           deductible_tax_minor, non_deductible_tax_minor, actual_cost_minor, applied_minor, match_result,
           recorded_by_employee_id, recorded_at, subscription_id, service_month, ${cols})
         VALUES (gen_random_uuid(), $1, $2, $3, $4::date, 'VND', 100, 0, 0, 100, 0, 'MATCHED',
           $5, now(), $6, $7::date, ${values})`,
        [
          h.seed.organizationId,
          vendorId,
          `CHK-BAD-${++numbers}`,
          `${h.year}-11-02`,
          h.finance.employeeId,
          subId,
          `${h.year}-11-01`,
        ],
      );

    await expect(
      insertBadPoolInvoice('pool_expected_minor, pool_variance_minor, pool_variance_month', '100, NULL, NULL'),
    ).rejects.toThrow(/invoices_pool_figures/);

    await expect(
      insertBadPoolInvoice(
        'pool_expected_minor, pool_variance_minor, pool_variance_month, pool_variance_in_review',
        `NULL, 100, '${h.year}-11-01'::date, true`,
      ),
    ).rejects.toThrow(/invoices_pool_figures/);

    await expect(
      insertBadPoolInvoice(
        'pool_expected_minor, pool_variance_minor, pool_variance_month, pool_variance_in_review',
        `100, 50, '${h.year}-11-02'::date, false`,
      ),
    ).rejects.toThrow(/invoices_pool_figures/);
  });

  it('opens SBF-11a with merged mismatches, resolves pool variance into invoiceVariance on closure, and notifies only R1', async () => {
    const subId = await takeOwnerOff(h, await h.subscription(10, 'K2'));
    const planId = await h.planOf(subId);
    // 10 seats * 1,000,000 VND/month = 10,000,000 VND expected for MONTHLY period invoice
    await h.ctx.sql.query(
      `UPDATE subscriptions SET original_unit_price_minor = 1500, original_currency = 'USD',
         responsible_it_admin_employee_id = $2 WHERE id = $1`,
      [subId, h.it1.employeeId],
    );
    const { unit, requestId } = await approvedRequest(planId, 'P-W305-M1');
    await insertPoolTopUpTask({
      planId,
      subscriptionId: subId,
      requestId,
      employeeId: unit.member.employeeId,
      purchasedAt: `${h.year}-11-10T02:00:00.000Z`,
    });

    // Period invoice with quantity=11 (triggers QUANTITY mismatch) and net=12,000,000 (20% > 5% triggers EXPECTED_AMOUNT)
    const periodPurchase = h.dataOf<PurchaseWire>(
      await api('post', '', h.it1)
        .send({
          link: { subscriptionId: subId, label: 'PERIOD' },
          vendorInvoiceNumber: `W305-MERGED-${++numbers}`,
          issuedOn: `${h.year}-11-05`,
          servicePeriodMonth: `${h.year}-11`,
          quantity: 11,
          unitPriceOriginal: { amount: '15', currency: 'USD' },
          netAmount: { amount: '12000000' },
          nonDeductibleTax: { amount: '200000' },
          paymentSource: 'COMPANY_CARD',
          documentIds: [await document()],
        })
        .expect(201),
    );
    const confirmed = h.dataOf<PurchaseWire>(
      await api('post', `/${periodPurchase.id}/confirmation`, h.finance).expect(201),
    );
    expect(confirmed.poolExpected).toEqual({ amount: '10000000', currency: 'VND' });
    expect(confirmed.poolVariance).toEqual({ amount: '2200000', currency: 'VND' });

    const confirmMonth = `${businessDateAt(new Date(), 'Asia/Ho_Chi_Minh').slice(0, 7)}-01`;
    const [invRow] = (
      await h.ctx.sql.query<InvoicePoolDbRow>(
        `SELECT pool_expected_minor::text, pool_variance_minor::text,
                to_char(pool_variance_month, 'YYYY-MM-DD') AS pool_variance_month,
                pool_variance_in_review
           FROM invoices WHERE id = $1`,
        [confirmed.invoiceId],
      )
    ).rows;
    expect(invRow).toEqual({
      pool_expected_minor: '10000000',
      pool_variance_minor: '2200000',
      pool_variance_month: confirmMonth,
      pool_variance_in_review: true,
    });

    // Single discrepancy case holds merged QUANTITY + EXPECTED_AMOUNT mismatches
    const page = h.dataOf<{ items: DiscrepancyWire[] }>(
      await cases('get', '?state=OPEN&pageSize=50', h.finance).expect(200),
    );
    const opened = page.items.filter((item) => item.mismatches.includes('EXPECTED_AMOUNT'));
    expect(opened.length).toBeGreaterThanOrEqual(1);
    const targetCase = opened[opened.length - 1];
    expect(targetCase.mismatches).toEqual(expect.arrayContaining(['QUANTITY', 'EXPECTED_AMOUNT']));

    // Before closure: shared pool facts report variance in invoiceVarianceInReviewMinor
    const poolRepo = h.ctx.app.get(SharedPoolLineRepo);
    const beforeRepo = await poolRepo.invoiceVariancesBySubscriptionMonth(h.seed.organizationId, confirmMonth);
    expect(beforeRepo.find((r) => r.subscriptionId === subId)).toMatchObject({
      varianceMinor: 0n,
      varianceInReviewMinor: 2_200_000n,
    });

    // Finance closes SBF-11a with EXCHANGE_RATE_LINE_PRICE_UPDATED and 0 VND difference
    const closed = h.dataOf<DiscrepancyWire>(
      await cases('post', `/${targetCase.id}/closure`, h.finance)
        .send({
          outcome: 'EXCHANGE_RATE_LINE_PRICE_UPDATED',
          reason: 'Vendor updated billing rate and FX',
          differenceAmount: { amount: '0', currency: 'VND' },
        })
        .expect(201),
    );
    expect(closed.state).toBe('CLOSED');
    expect(closed.outcome).toBe('EXCHANGE_RATE_LINE_PRICE_UPDATED');

    // Resolution table recorded and warehouse line moved from inReview -> invoiceVariance in same confirmation month
    const resCount = await h.ctx.sql.query(`SELECT 1 FROM invoice_pool_variance_resolutions WHERE invoice_id = $1`, [
      confirmed.invoiceId,
    ]);
    expect(resCount.rowCount).toBe(1);

    const txRunner = h.ctx.app.get(TransactionRunner);
    const afterFacts = await txRunner.run((tx) =>
      h.ctx.app.get(SharedPoolLineFactsService).linesOfMonth(confirmMonth, subId, 10, tx),
    );
    const afterRepo = await poolRepo.invoiceVariancesBySubscriptionMonth(h.seed.organizationId, confirmMonth);
    expect(afterRepo.find((r) => r.subscriptionId === subId)).toMatchObject({
      varianceMinor: 2_200_000n,
      varianceInReviewMinor: 0n,
    });
    expect(Array.isArray(afterFacts)).toBe(true);

    // R1 notification: responsible IT Admin (it1) receives SUBSCRIPTION_PRICE_REVIEW; second IT Admin (it2) does NOT (QĐ-118)
    const r1Notices = await h.ctx.sql.query(
      `SELECT recipient_employee_id FROM in_app_notifications WHERE code = 'SUBSCRIPTION_PRICE_REVIEW' AND subject_id = $1`,
      [subId],
    );
    expect(r1Notices.rows.map((r: { recipient_employee_id: string }) => r.recipient_employee_id)).toEqual([
      h.it1.employeeId,
    ]);
    const it2Notices = r1Notices.rows.filter(
      (r: { recipient_employee_id: string }) => r.recipient_employee_id === it2.employeeId,
    );
    expect(it2Notices).toHaveLength(0);
  });

  it('computes POOL_TOP_UP expected figures for REQUEST invoices and leaves K1/K4 poolFigures as null', async () => {
    const k2SubId = await takeOwnerOff(h, await h.subscription(10, 'K2'));
    const k2PlanId = await h.planOf(k2SubId);
    await h.ctx.sql.query(`UPDATE subscriptions SET renewal_date = $2::date, end_date = $3::date WHERE id = $1`, [
      k2SubId,
      `${h.year}-12-01`,
      `${h.year}-11-30`,
    ]);
    const { unit, requestId } = await approvedRequest(k2PlanId, 'P-W305-TOPUP');
    await insertPoolTopUpTask({
      planId: k2PlanId,
      subscriptionId: k2SubId,
      requestId,
      employeeId: unit.member.employeeId,
      purchasedAt: `${h.year}-11-21T03:00:00.000Z`,
    });
    // 1 seat bought 21/11 -> renewal 01/12 -> 10/30 of 1,000,000 = 333,333 VND
    const reqPurchase = h.dataOf<PurchaseWire>(
      await api('post', '', h.it1)
        .send({
          link: { requestId },
          vendorInvoiceNumber: `W305-TOPUP-${++numbers}`,
          issuedOn: `${h.year}-11-22`,
          servicePeriodMonth: `${h.year}-11`,
          quantity: 1,
          unitPriceOriginal: { amount: '333333', currency: 'VND' },
          netAmount: { amount: '333333' },
          paymentSource: 'COMPANY_CARD',
          documentIds: [await document()],
        })
        .expect(201),
    );
    const confirmedK2 = h.dataOf<PurchaseWire>(
      await api('post', `/${reqPurchase.id}/confirmation`, h.finance).expect(201),
    );
    expect(confirmedK2.poolExpected).toEqual({ amount: '333333', currency: 'VND' });
    expect(confirmedK2.poolVariance).toEqual({ amount: '0', currency: 'VND' });

    const k1SubId = await h.subscription(5, 'K1');
    const k1PlanId = await h.planOf(k1SubId);
    const k1Req = await approvedRequest(k1PlanId, 'P-W305-K1');
    const k1Purchase = h.dataOf<PurchaseWire>(
      await api('post', '', h.it1)
        .send({
          link: { requestId: k1Req.requestId },
          vendorInvoiceNumber: `W305-K1-${++numbers}`,
          issuedOn: `${h.year}-11-05`,
          servicePeriodMonth: `${h.year}-11`,
          quantity: 1,
          unitPriceOriginal: { amount: '1000000', currency: 'VND' },
          netAmount: { amount: '1000000' },
          paymentSource: 'COMPANY_CARD',
          documentIds: [await document()],
        })
        .expect(201),
    );
    const confirmedK1 = h.dataOf<PurchaseWire>(
      await api('post', `/${k1Purchase.id}/confirmation`, h.finance).expect(201),
    );
    expect(confirmedK1.poolExpected).toBeNull();
    expect(confirmedK1.poolVariance).toBeNull();
  });
});
