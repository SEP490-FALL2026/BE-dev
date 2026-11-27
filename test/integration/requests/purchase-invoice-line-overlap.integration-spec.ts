import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { declareApplication, declarePlan, declareSubscription } from '../../support/builders/catalog.builder';
import { InvoiceHarness } from '../../support/invoice-harness';

const h = new InvoiceHarness();

/**
 * F-9: Two-way `LINE_ALREADY_INVOICED` enforcement (`[Standard]` <-> whole period) and Tier 6 subscription period lock
 * under concurrent HTTP submissions over real PostgreSQL.
 */
describe('purchase invoice line-overlap & concurrency lock (integration; F-9)', () => {
  let seq = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const nextNum = (prefix: string) => `${prefix}-${(seq += 1)}-${randomUUID().slice(0, 6)}`;

  async function docId(): Promise<string> {
    const id = randomUUID();
    const key = nextNum('doc');
    await h.ctx.sql.query(
      `INSERT INTO document_attachments
         (id, organization_id, purpose, status, file_name, content_type, size_bytes, object_key, final_object_key, uploaded_by_app_user_id)
       VALUES ($1, $2, 'PURCHASE_DOCUMENT'::"DocumentPurpose", 'PENDING_ATTACH', 'inv.pdf', 'application/pdf', 1024, $3, $4, $5)`,
      [id, h.seed.organizationId, `documents/pi/${key}`, `documents/pi/kept-${key}`, h.it1.appUserId],
    );

    return id;
  }

  async function multiLineK2Subscription(): Promise<{
    subscriptionId: string;
    standardLineId: string;
    premiumLineId: string;
  }> {
    const appId = await declareApplication(h.ctx, h.it1.accessToken, {
      name: nextNum('MultiApp'),
      kind: 'SAAS',
      vendorName: nextNum('MultiVendor'),
      dataSensitivity: 'LOW',
      communication: { personToPersonMessaging: false, callsOrMeetings: false, mailbox: false },
    });
    const standardPlanId = await declarePlan(h.ctx, h.it1.accessToken, {
      applicationId: appId,
      name: 'Standard',
      provisioningType: 'K2',
      pricingModel: 'PER_SEAT',
      controlLevel: 'FULL',
    });
    const premiumPlanId = await declarePlan(h.ctx, h.it1.accessToken, {
      applicationId: appId,
      name: 'Premium',
      provisioningType: 'K2',
      pricingModel: 'PER_SEAT',
      controlLevel: 'FULL',
    });

    const subscriptionId = await declareSubscription(h.ctx, h.it1.accessToken, {
      kind: 'TERM',
      billingCycle: 'MONTHLY',
      commitmentTermMonths: 12,
      startDate: '2026-01-05',
      endDate: '2027-01-04',
      lines: [
        { planId: standardPlanId, monthlyUnitPrice: { amount: '500000', currency: 'VND' }, quantity: 5 },
        { planId: premiumPlanId, monthlyUnitPrice: { amount: '800000', currency: 'VND' }, quantity: 5 },
      ],
    });

    const { rows } = await h.ctx.sql.query<{ id: string; plan_id: string }>(
      `SELECT id::text, plan_id::text FROM subscription_lines WHERE subscription_id = $1::uuid`,
      [subscriptionId],
    );
    const byPlan = new Map(rows.map((r) => [r.plan_id, r.id]));

    return {
      subscriptionId,
      standardLineId: byPlan.get(standardPlanId) ?? '',
      premiumLineId: byPlan.get(premiumPlanId) ?? '',
    };
  }

  async function submitPeriodInvoice(subscriptionId: string, subscriptionLineIds?: string[], preparedDoc?: string) {
    const d = preparedDoc ?? (await docId());
    return request(h.server())
      .post('/api/v1/purchase-invoices')
      .set(h.as(h.it1))
      .send({
        link: {
          subscriptionId,
          ...(subscriptionLineIds ? { subscriptionLineIds } : {}),
        },
        vendorInvoiceNumber: nextNum('F9'),
        issuedOn: `${h.year}-11-05`,
        servicePeriodMonth: `${h.year}-11`,
        quantity: subscriptionLineIds ? 5 : 10,
        unitPriceOriginal: { amount: '500000', currency: 'VND' },
        netAmount: { amount: subscriptionLineIds ? '2500000' : '6500000' },
        paymentSource: 'COMPANY_CARD',
        documentIds: [d],
      });
  }

  const errorOf = (res: request.Response) =>
    (res.body as { error: { code: string; details?: { lineIds?: string[] } } }).error;

  it('[Standard] then whole-period returns 422 PURCHASE_INVOICE.LINE_ALREADY_INVOICED with details.lineIds=[Standard]', async () => {
    const sub = await multiLineK2Subscription();
    expect((await submitPeriodInvoice(sub.subscriptionId, [sub.standardLineId])).status).toBe(201);

    const whole = await submitPeriodInvoice(sub.subscriptionId);
    expect(whole.status).toBe(422);
    expect(errorOf(whole)).toMatchObject({
      code: 'PURCHASE_INVOICE.LINE_ALREADY_INVOICED',
      details: { lineIds: [sub.standardLineId] },
    });
  });

  it('whole-period then [Standard] returns 422 PURCHASE_INVOICE.LINE_ALREADY_INVOICED with details.lineIds=[Standard]', async () => {
    const sub = await multiLineK2Subscription();
    expect((await submitPeriodInvoice(sub.subscriptionId)).status).toBe(201);

    const line = await submitPeriodInvoice(sub.subscriptionId, [sub.standardLineId]);
    expect(line.status).toBe(422);
    expect(errorOf(line)).toMatchObject({
      code: 'PURCHASE_INVOICE.LINE_ALREADY_INVOICED',
      details: { lineIds: [sub.standardLineId] },
    });
  });

  it('barrier x20: concurrent [Standard] || whole-period submissions yield exactly one 201 and one 422 LINE_ALREADY_INVOICED', async () => {
    for (let i = 0; i < 20; i += 1) {
      const sub = await multiLineK2Subscription();
      const [d1, d2] = await Promise.all([docId(), docId()]);
      const [rLine, rWhole] = await Promise.all([
        submitPeriodInvoice(sub.subscriptionId, [sub.standardLineId], d1),
        submitPeriodInvoice(sub.subscriptionId, undefined, d2),
      ]);
      const statuses = [rLine.status, rWhole.status].sort((a, b) => a - b);
      expect(statuses).toEqual([201, 422]);
      const rejected = rLine.status === 422 ? rLine : rWhole;
      expect(errorOf(rejected)).toMatchObject({
        code: 'PURCHASE_INVOICE.LINE_ALREADY_INVOICED',
        details: { lineIds: [sub.standardLineId] },
      });
    }
  }, 120000);
});
