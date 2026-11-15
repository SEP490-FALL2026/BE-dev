import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { BudgetsApi } from '../../../src/modules/budgets/public/budgets.api';
import type { ApiAccount } from '../../support/api-accounts';
import { InvoiceHarness } from '../../support/invoice-harness';
import type { Unit } from '../../support/spend-harness';

const h = new InvoiceHarness();
const M = 1_000_000;

interface Wire {
  id: string;
  state: string;
  matchResult: string;
  invoiceId: string | null;
  returnReason: string | null;
  decidedBy: { employeeId: string } | null;
}
interface InvoiceRow {
  commitment_id: string | null;
  cost_center_id: string | null;
  service_month: string;
  applied_minor: string;
  actual_cost_minor: string;
  match_result: string;
  recorded_by_employee_id: string;
}

/**
 * What Finance decides on a purchase invoice (`PI-1.6`, `QĐ-111u`, `QĐ-111v`): signing the money out writes the one invoice, booked to the month
 * and the year of the period, never by the person who submitted it, and returning it needs a reason and writes nothing. On real PostgreSQL.
 */
describe('Finance signs or returns a purchase invoice over PostgreSQL (integration; PI-1.6, T-PI)', () => {
  let plan: string;
  let subscriptionId: string;
  let counter = 0;
  let numbers = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    subscriptionId = await h.subscription(20, 'K2');
    plan = await h.planOf(subscriptionId);
    await h.ctx.sql.query(
      `UPDATE subscriptions SET original_unit_price_minor = 1500, original_currency = 'USD' WHERE id = $1`,
      [subscriptionId],
    );
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const api = (method: 'get' | 'post', path: string, account: ApiAccount) =>
    request(h.server())[method](`/api/v1/purchase-invoices${path}`).set(h.as(account));
  const approved = async (): Promise<{ unit: Unit; requestId: string }> => {
    counter += 1;
    const unit = await h.departmentWithHead(`P-PD${counter}`);
    await h.setItAdminInCharge(unit.department, { employeeId: h.it1.employeeId, account: h.it1 });
    await h.budgetFor(unit, { total: 100 * M });
    const requestId = await h.waitingForApprover(unit, plan, { amount: 20 * M });
    await h.decideSpend(requestId, { decision: 'APPROVE' }, h.boss.account).expect(200);

    return { unit, requestId };
  };
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
        `documents/pd/${numbers}-${id}`,
        `documents/pd/kept-${numbers}-${id}`,
        h.it1.appUserId,
      ],
    );

    return id;
  };
  /** An invoice the IT Admin submitted for the request: 3.840.000 đ, one seat at 15 USD, for month 11 of the year of the commitments. */
  const submitted = async (requestId: string, over: Record<string, unknown> = {}): Promise<Wire> => {
    numbers += 1;
    const response = await api('post', '', h.it1)
      .send({
        link: { requestId },
        vendorInvoiceNumber: `PD-${numbers}`,
        issuedOn: `${h.year}-11-02`,
        servicePeriodMonth: `${h.year}-11`,
        quantity: 1,
        unitPriceOriginal: { amount: '15', currency: 'USD' },
        netAmount: { amount: '3840000' },
        paymentSource: 'COMPANY_CARD',
        documentIds: [await document()],
        ...over,
      })
      .expect(201);

    return h.dataOf<Wire>(response);
  };
  const confirm = (id: string, account: ApiAccount = h.finance) => api('post', `/${id}/confirmation`, account);
  const giveBack = (id: string, body: object = { reason: 'Thiếu hóa đơn thuế' }, account: ApiAccount = h.finance) =>
    api('post', `/${id}/return`, account).send(body);
  const invoiceOf = async (purchaseId: string) =>
    (
      await h.ctx.sql.query<InvoiceRow>(
        `SELECT commitment_id, cost_center_id, to_char(service_month, 'YYYY-MM-DD') AS service_month, applied_minor::text,
                actual_cost_minor::text, match_result::text, recorded_by_employee_id
           FROM invoices WHERE purchase_invoice_id = $1`,
        [purchaseId],
      )
    ).rows;
  const commitmentOf = async (requestId: string) =>
    (
      await h.ctx.sql.query<{ applied_minor: string; state: string }>(
        `SELECT applied_minor::text, state::text FROM budget_commitments WHERE request_id = $1`,
        [requestId],
      )
    ).rows[0];
  const code = (response: request.Response) => (response.body as { error: { code: string } }).error.code;
  const notices = async (purchaseId: string, kind: string, to: string) =>
    (
      await h.ctx.sql.query(
        `SELECT 1 FROM in_app_notifications WHERE code = $1 AND subject_id = $2 AND recipient_employee_id = $3`,
        [kind, purchaseId, to],
      )
    ).rowCount;

  it('signs the money out: one invoice booked to the month of the period and into the commitment, the signer and the time kept, the IT Admin told', async () => {
    const { unit, requestId } = await approved();
    const purchase = await submitted(requestId);

    const signed = h.dataOf<Wire>(await confirm(purchase.id).expect(201));

    expect(signed).toMatchObject({
      state: 'CONFIRMED',
      decidedBy: { employeeId: h.finance.employeeId },
    });
    expect(signed.invoiceId).not.toBeNull();
    const [invoice, ...rest] = await invoiceOf(purchase.id);
    expect(rest).toEqual([]);
    expect(invoice).toMatchObject({
      service_month: `${h.year}-11-01`,
      applied_minor: '3840000',
      actual_cost_minor: '3840000',
      match_result: 'MATCHED',
      recorded_by_employee_id: h.finance.employeeId,
      cost_center_id: null,
    });
    expect(invoice.commitment_id).not.toBeNull();
    expect(await commitmentOf(requestId)).toMatchObject({ applied_minor: '3840000', state: 'HELD' });
    expect(
      (await h.ctx.app.get(BudgetsApi, { strict: false }).yearFacts(unit.department.unitId, [h.year])).get(h.year),
    ).toMatchObject({ spentMinor: 3_840_000n });
    expect(await notices(purchase.id, 'PURCHASE_INVOICE_CONFIRMED', h.it1.employeeId)).toBe(1);
    expect(
      (
        await h.ctx.sql.query(
          `SELECT 1 FROM audit_events WHERE action = 'PURCHASE_INVOICE.CONFIRMED' AND resource_id = $1`,
          [purchase.id],
        )
      ).rowCount,
    ).toBe(1);
  });

  it('shows each signed invoice on the invoices of its commitment with the month it pays for, its label and how it was paid (PI-1.7)', async () => {
    const { requestId } = await approved();
    const first = await submitted(requestId);
    const second = await submitted(requestId, { servicePeriodMonth: `${h.year}-12`, paymentSource: 'IT_ADVANCE' });
    await confirm(first.id).expect(201);
    await confirm(second.id).expect(201);
    const commitmentId = h.dataOf<{ items: Array<{ id: string }> }>(
      await h.commitmentList(h.finance, { requestId }).expect(200),
    ).items[0].id;

    const listed = h.dataOf<{
      items: Array<{
        id: string;
        servicePeriodMonth: string | null;
        label: string | null;
        paymentSource: string | null;
      }>;
    }>(await h.invoicesOf(commitmentId).expect(200)).items;

    const stored = await h.ctx.sql.query<{ invoice_id: string; label: string; payment_source: string }>(
      `SELECT invoice_id, label::text, payment_source::text FROM purchase_invoices WHERE id = ANY($1::uuid[])`,
      [[first.id, second.id]],
    );
    expect(listed).toHaveLength(2);
    expect(stored.rows.map((row) => row.payment_source).sort()).toEqual(['COMPANY_CARD', 'IT_ADVANCE']);
    for (const row of stored.rows) {
      expect(listed.find((item) => item.id === row.invoice_id)).toMatchObject({
        label: row.label,
        paymentSource: row.payment_source,
      });
    }
    expect(listed.map((item) => item.servicePeriodMonth).sort()).toEqual([`${h.year}-11`, `${h.year}-12`]);
  });

  it('books the invoice of December paid in January to the year of December (T-PI)', async () => {
    const { unit, requestId } = await approved();
    const purchase = await submitted(requestId, {
      issuedOn: `${h.year + 1}-01-02`,
      servicePeriodMonth: `${h.year}-12`,
    });

    await confirm(purchase.id).expect(201);

    const [invoice] = await invoiceOf(purchase.id);
    expect(invoice.service_month).toBe(`${h.year}-12-01`);
    expect(
      (await h.ctx.app.get(BudgetsApi, { strict: false }).yearFacts(unit.department.unitId, [h.year])).get(h.year),
    ).toMatchObject({ spentMinor: 3_840_000n });
  });

  it('books an expense of the department that bears the period, with no commitment, when it is not the department of the commitment (R-51)', async () => {
    const { requestId } = await approved();
    const other = await h.departmentWithHead(`P-PD-OTHER${counter}`);
    const purchase = await submitted(requestId);
    // The right moved: the commitment still stands in the old Cost Center, the purchase was read against the new one.
    // (A test of the database owner: the table refuses this change from everyone else.)
    await h.ctx.sql.query(`ALTER TABLE budget_commitments DISABLE TRIGGER USER`);
    await h.ctx.sql.query(`UPDATE budget_commitments SET cost_center_id = $2 WHERE request_id = $1`, [
      requestId,
      other.department.unitId,
    ]);
    await h.ctx.sql.query(`ALTER TABLE budget_commitments ENABLE TRIGGER USER`);

    await confirm(purchase.id).expect(201);

    const [invoice] = await invoiceOf(purchase.id);
    expect(invoice.commitment_id).toBeNull();
    expect(invoice.cost_center_id).not.toBeNull();
    expect(invoice.applied_minor).toBe('0');
    expect(await commitmentOf(requestId)).toMatchObject({ applied_minor: '0', state: 'HELD' });
  });

  it('keeps the exception of a purchase invoice whose count or price differs on the invoice it writes, and never refuses it', async () => {
    const { requestId } = await approved();
    const purchase = await submitted(requestId, { quantity: 2 });
    expect(purchase.matchResult).toBe('PRICE_QUANTITY_EXCEPTION');

    await confirm(purchase.id).expect(201);

    expect((await invoiceOf(purchase.id))[0].match_result).toBe('PRICE_QUANTITY_EXCEPTION');
  });

  it('is never signed by the person who submitted it, and the refusal writes nothing', async () => {
    const { requestId } = await approved();
    const purchase = await submitted(requestId);
    // The same person holds both roles: the submission is copied under the Finance account.
    numbers += 1;
    const own = randomUUID();
    await h.ctx.sql.query(
      `INSERT INTO purchase_invoices (id, organization_id, link_kind, request_id, vendor_id, number, issued_on, service_month, label,
         quantity, unit_price_original_minor, unit_price_original_currency, net_minor, match_result, payment_source,
         charged_cost_center_id, submitted_by_employee_id, submitted_at)
       SELECT $1, organization_id, link_kind, request_id, vendor_id, $2, issued_on, service_month, label, quantity,
              unit_price_original_minor, unit_price_original_currency, net_minor, match_result, payment_source,
              charged_cost_center_id, $3, submitted_at
         FROM purchase_invoices WHERE id = $4`,
      [own, `OWN-${numbers}`, h.finance.employeeId, purchase.id],
    );

    expect(code(await confirm(own).expect(409))).toBe('PURCHASE_INVOICE.SAME_PERSON');
    expect(await invoiceOf(own)).toEqual([]);
    expect((await h.ctx.sql.query(`SELECT state::text FROM purchase_invoices WHERE id = $1`, [own])).rows[0]).toEqual({
      state: 'SUBMITTED',
    });
  });

  it('decides an invoice once: a second signature or a return after it is refused, and one invoice is written when two sign at once', async () => {
    const { requestId } = await approved();
    const purchase = await submitted(requestId);

    const answers = await Promise.all([confirm(purchase.id), confirm(purchase.id)]);

    expect(answers.map((answer) => answer.status).sort()).toEqual([201, 409]);
    expect(code(answers.find((answer) => answer.status === 409) as request.Response)).toBe(
      'PURCHASE_INVOICE.NOT_SUBMITTED',
    );
    expect(await invoiceOf(purchase.id)).toHaveLength(1);
    expect(code(await giveBack(purchase.id).expect(409))).toBe('PURCHASE_INVOICE.NOT_SUBMITTED');
    expect((await commitmentOf(requestId)).applied_minor).toBe('3840000');
  });

  it('returns an invoice with a reason, writes nothing, tells the IT Admin and lets them submit it again', async () => {
    const { requestId } = await approved();
    const purchase = await submitted(requestId);

    const returned = h.dataOf<Wire>(await giveBack(purchase.id, { reason: '  Thiếu hóa đơn thuế  ' }).expect(201));

    expect(returned).toMatchObject({
      state: 'RETURNED',
      returnReason: 'Thiếu hóa đơn thuế',
      invoiceId: null,
      decidedBy: { employeeId: h.finance.employeeId },
    });
    expect(await invoiceOf(purchase.id)).toEqual([]);
    expect((await commitmentOf(requestId)).applied_minor).toBe('0');
    expect(await notices(purchase.id, 'PURCHASE_INVOICE_RETURNED', h.it1.employeeId)).toBe(1);
    expect(code(await confirm(purchase.id).expect(409))).toBe('PURCHASE_INVOICE.NOT_SUBMITTED');
    expect(code(await giveBack(purchase.id).expect(409))).toBe('PURCHASE_INVOICE.NOT_SUBMITTED');
    await api('post', `/${purchase.id}/resubmission`, h.it1)
      .send({
        vendorInvoiceNumber: 'AGAIN-1',
        issuedOn: `${h.year}-11-04`,
        servicePeriodMonth: `${h.year}-11`,
        quantity: 1,
        unitPriceOriginal: { amount: '15', currency: 'USD' },
        netAmount: { amount: '3840000' },
        paymentSource: 'COMPANY_CARD',
        documentIds: [await document()],
      })
      .expect(201);
  });

  it('refuses a return with no reason, and what Finance may not do, and an invoice that is not there', async () => {
    const { requestId } = await approved();
    const purchase = await submitted(requestId);

    await giveBack(purchase.id, { reason: '   ' }).expect(422);
    await giveBack(purchase.id, {}).expect(422);
    await confirm(purchase.id, h.it1).expect(403);
    await giveBack(purchase.id, { reason: 'x' }, h.it1).expect(403);
    expect(code(await confirm(randomUUID()).expect(404))).toBe('PURCHASE_INVOICE.NOT_FOUND');
    expect(code(await giveBack(randomUUID()).expect(404))).toBe('PURCHASE_INVOICE.NOT_FOUND');
    expect(
      (await h.ctx.sql.query(`SELECT state::text FROM purchase_invoices WHERE id = $1`, [purchase.id])).rows[0],
    ).toEqual({
      state: 'SUBMITTED',
    });
  });

  it('writes the one invoice of a subscription as a line of the subscription, with no commitment', async () => {
    const unit = await h.departmentWithHead(`P-PDS${counter++}`);
    await h.setItAdminInCharge(unit.department, { employeeId: h.it1.employeeId, account: h.it1 });
    const owned = await h.subscription(10, 'K2', unit.department.id);
    await h.ctx.sql.query(
      `UPDATE subscriptions SET original_unit_price_minor = 1500, original_currency = 'USD' WHERE id = $1`,
      [owned],
    );
    numbers += 1;
    const purchase = h.dataOf<Wire>(
      await api('post', '', h.it1)
        .send({
          link: { subscriptionId: owned },
          vendorInvoiceNumber: `PDS-${numbers}`,
          issuedOn: `${h.year}-11-02`,
          servicePeriodMonth: `${h.year}-11`,
          quantity: 10,
          unitPriceOriginal: { amount: '15', currency: 'USD' },
          netAmount: { amount: '3840000' },
          paymentSource: 'IT_ADVANCE',
          documentIds: [await document()],
        })
        .expect(201),
    );

    await confirm(purchase.id).expect(201);

    const rows = await h.ctx.sql.query<{
      commitment_id: string | null;
      cost_center_id: string | null;
      subscription_id: string;
    }>(`SELECT commitment_id, cost_center_id, subscription_id FROM invoices WHERE purchase_invoice_id = $1`, [
      purchase.id,
    ]);
    expect(rows.rows).toEqual([{ commitment_id: null, cost_center_id: null, subscription_id: owned }]);
  });
});
