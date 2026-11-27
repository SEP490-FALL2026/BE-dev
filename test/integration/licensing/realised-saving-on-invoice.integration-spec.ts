import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { ApiAccount } from '../../support/api-accounts';
import { RenewalHarness } from '../../support/renewal-harness';

const h = new RenewalHarness();

interface PurchaseWire {
  id: string;
  invoiceId: string | null;
}

interface DiscrepancySummaryWire {
  id: string;
  state: string;
  purchaseInvoice: { id: string };
}

interface SavingsRow {
  realised_savings_minor: string | null;
  realised_savings_currency: string | null;
  realised_savings_recorded_at: Date | null;
  realised_savings_invoice_id: string | null;
}

describe('Realised renewal saving on first confirmed invoice (integration, PostgreSQL, W3-09)', () => {
  let seq = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  const postInvoice = (path: string, account: ApiAccount = h.it1) =>
    request(h.server()).post(`/api/v1/purchase-invoices${path}`).set(h.as(account));

  const discrepancyCases = (method: 'get' | 'post', path: string, account: ApiAccount = h.finance) =>
    request(h.server())[method](`/api/v1/invoice-discrepancies${path}`).set(h.as(account));

  const createDocument = async (): Promise<string> => {
    const id = randomUUID();
    seq += 1;
    await h.ctx.sql.query(
      `INSERT INTO document_attachments (id, organization_id, purpose, status, file_name, content_type, size_bytes, object_key,
         final_object_key, uploaded_by_app_user_id)
       VALUES ($1, $2, 'PURCHASE_DOCUMENT', 'PENDING_ATTACH', 'inv.pdf', 'application/pdf', 1000, $3, $4, $5)`,
      [id, h.seed.organizationId, `documents/w309/${seq}-${id}`, `documents/w309/kept-${seq}-${id}`, h.it1.appUserId],
    );

    return id;
  };

  const readSavings = async (renewalId: string): Promise<SavingsRow> => {
    const { rows } = await h.ctx.sql.query<SavingsRow>(
      `SELECT realised_savings_minor::text, realised_savings_currency, realised_savings_recorded_at, realised_savings_invoice_id
         FROM subscription_renewals WHERE id = $1`,
      [renewalId],
    );

    return rows[0];
  };

  const submitAndConfirm = async (input: {
    subscriptionId: string;
    servicePeriodMonth: string;
    issuedOn: string;
    quantity: number;
    unitAmount: string;
    netAmount: string;
  }): Promise<PurchaseWire> => {
    seq += 1;
    const sub = h.dataOf<PurchaseWire>(
      await postInvoice('', h.it1)
        .send({
          link: { subscriptionId: input.subscriptionId },
          vendorInvoiceNumber: `W309-${seq}`,
          issuedOn: input.issuedOn,
          servicePeriodMonth: input.servicePeriodMonth,
          quantity: input.quantity,
          unitPriceOriginal: { amount: input.unitAmount, currency: 'VND' },
          netAmount: { amount: input.netAmount },
          paymentSource: 'COMPANY_CARD',
          documentIds: [await createDocument()],
        })
        .expect(201),
    );

    return h.dataOf<PurchaseWire>(await postInvoice(`/${sub.id}/confirmation`, h.finance).expect(201));
  };

  it('defers realised saving at IT outcome and records T=12 saving once on first-month invoice (not on second month)', async () => {
    const unit = await h.unit(11);
    const { subscriptionId } = await h.termWithSeats(unit, 20, {
      quantity: 12,
      unitPrice: '500000',
      billingCycle: 'MONTHLY',
      startDate: h.inDays(-300),
      endDate: h.inDays(64),
    });
    await h.ctx.sql.query(`UPDATE subscriptions SET commitment_term_months = 12 WHERE id = $1`, [subscriptionId]);

    const nextStart = h.inDays(65);
    const firstMonth = nextStart.slice(0, 7);
    const secondMonth = new Date(Date.parse(`${firstMonth}-01T00:00:00Z`) + 32 * 86_400_000).toISOString().slice(0, 7);
    const { id: renewalId, nextSubscriptionId } = await h.recordedRenewal({
      subscriptionId,
      choice: 'REDUCE',
      proposedQuantity: 11,
      outcome: 'AS_DECIDED',
      nextPeriod: {
        purchasedQuantity: 11,
        unitPrice: { amount: '500000', currency: 'VND' },
        billingCycle: 'MONTHLY',
        startDate: nextStart,
        endDate: h.inDays(429),
        noticeDeadline: h.inDays(400),
        autoRenew: true,
        allowsMidTermReduction: false,
      },
    });
    expect(nextSubscriptionId).not.toBeNull();
    const newId = nextSubscriptionId as string;
    await h.ctx.sql.query(`UPDATE subscriptions SET commitment_term_months = 12 WHERE id = $1`, [newId]);

    expect((await readSavings(renewalId)).realised_savings_minor).toBeNull();

    const julyConfirmed = await submitAndConfirm({
      subscriptionId: newId,
      servicePeriodMonth: firstMonth,
      issuedOn: nextStart,
      quantity: 11,
      unitAmount: '500000',
      netAmount: '5500000',
    });
    expect(await readSavings(renewalId)).toMatchObject({
      realised_savings_minor: '6000000',
      realised_savings_currency: 'VND',
      realised_savings_invoice_id: julyConfirmed.invoiceId,
    });

    await submitAndConfirm({
      subscriptionId: newId,
      servicePeriodMonth: secondMonth,
      issuedOn: `${secondMonth}-02`,
      quantity: 11,
      unitAmount: '500000',
      netAmount: '5500000',
    });
    expect((await readSavings(renewalId)).realised_savings_invoice_id).toBe(julyConfirmed.invoiceId);
  });

  it('defers realised saving when first invoice opens SBF-11a, then records it on discrepancy closure', async () => {
    const unit = await h.unit(11);
    const { subscriptionId } = await h.termWithSeats(unit, 20, {
      quantity: 12,
      unitPrice: '6000000',
      billingCycle: 'ANNUAL',
      startDate: h.inDays(-300),
      endDate: h.inDays(64),
    });
    const nextStart = h.inDays(65);
    const { id: renewalId, nextSubscriptionId } = await h.recordedRenewal({
      subscriptionId,
      choice: 'REDUCE',
      proposedQuantity: 11,
      outcome: 'AS_DECIDED',
      nextPeriod: {
        purchasedQuantity: 11,
        unitPrice: { amount: '6000000', currency: 'VND' },
        billingCycle: 'ANNUAL',
        startDate: nextStart,
        endDate: h.inDays(429),
        noticeDeadline: h.inDays(400),
        autoRenew: true,
        allowsMidTermReduction: false,
      },
    });
    const newId = nextSubscriptionId as string;

    const confirmed = await submitAndConfirm({
      subscriptionId: newId,
      servicePeriodMonth: nextStart.slice(0, 7),
      issuedOn: nextStart,
      quantity: 11,
      unitAmount: '6000000',
      netAmount: '72000000',
    });
    expect((await readSavings(renewalId)).realised_savings_minor).toBeNull();

    const list = h.dataOf<{ items: DiscrepancySummaryWire[] }>(
      await discrepancyCases('get', '?state=OPEN', h.finance).expect(200),
    ).items;
    const openCase = list.find((c) => c.purchaseInvoice.id === confirmed.id);
    expect(openCase).toBeDefined();

    await discrepancyCases('post', `/${openCase?.id}/closure`, h.finance)
      .send({ outcome: 'EXPLAINED', reason: 'Vendor FX fee', differenceAmount: { amount: '6000000' } })
      .expect(201);

    expect(await readSavings(renewalId)).toMatchObject({
      realised_savings_minor: '6000000',
      realised_savings_currency: 'VND',
      realised_savings_invoice_id: confirmed.invoiceId,
    });
  });

  it('clamps higher-unit-price seat reduction to 0 via max(0, baseline - compared)', async () => {
    const unit = await h.unit(8);
    const { subscriptionId } = await h.termWithSeats(unit, 20, {
      quantity: 10,
      unitPrice: '1800000',
      billingCycle: 'ANNUAL',
      startDate: h.inDays(-300),
      endDate: h.inDays(64),
    });
    const nextStart = h.inDays(65);
    const { id: renewalId, nextSubscriptionId } = await h.recordedRenewal({
      subscriptionId,
      choice: 'REDUCE',
      proposedQuantity: 8,
      outcome: 'AS_DECIDED',
      nextPeriod: {
        purchasedQuantity: 8,
        unitPrice: { amount: '2400000', currency: 'VND' },
        billingCycle: 'ANNUAL',
        startDate: nextStart,
        endDate: h.inDays(429),
        noticeDeadline: h.inDays(400),
        autoRenew: true,
        allowsMidTermReduction: false,
      },
    });
    const newId = nextSubscriptionId as string;

    await submitAndConfirm({
      subscriptionId: newId,
      servicePeriodMonth: nextStart.slice(0, 7),
      issuedOn: nextStart,
      quantity: 8,
      unitAmount: '2400000',
      netAmount: '19200000',
    });

    expect((await readSavings(renewalId)).realised_savings_minor).toBe('0');
  });
});
