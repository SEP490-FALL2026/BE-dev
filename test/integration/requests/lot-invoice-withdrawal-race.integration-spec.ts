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
    await h.roomFor(unit);
  }, 300000);

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await h.stop();
  });

  async function seedGroupLotAndSubmittedInvoice() {
    seq += 1;
    const people = await h.colleagues(unit, 3);
    const reqId = await h.groupApproved(unit, k4PlanId, people);
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
