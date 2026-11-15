import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { ApiAccount } from '../../support/api-accounts';
import { InvoiceHarness } from '../../support/invoice-harness';
import { handOthersToSecondItAdmin } from '../../support/second-it-admin';
import type { Unit } from '../../support/spend-harness';

const h = new InvoiceHarness();
const M = 1_000_000;

interface Wire {
  id: string;
  state: string;
  label: string;
  servicePeriodMonth: string;
  periodIndex: number | null;
  periodCount: number | null;
  matchResult: string;
  flags: string[];
  netAmount: { amount: string; currency: string };
  documents: { documentId: string; position: number }[];
  resubmissionOfId: string | null;
  resubmittedAsId: string | null;
  chargedCostCenterId: string | null;
}
interface Preview {
  label: string;
  periodIndex: number | null;
  periodCount: number | null;
  matchResult: string;
  flags: string[];
  chargedCostCenter: { id: string } | null;
  commitment: { id: string; remaining: { amount: string } } | null;
}

/**
 * The invoice of a purchase the IT Admin submits (`PI-1.4`, `QĐ-111u`, `QĐ-111w`, `R-44`): read against its request, kept with its files, told to
 * Finance, submitted again after a return, and read back by the people who may. On real PostgreSQL, through the routes.
 */
describe('purchase invoices over PostgreSQL (integration; PI-1.4, T-PI)', () => {
  let plan: string;
  let subscriptionId: string;
  let vendorId: string;
  let it2: ApiAccount;
  let counter = 0;
  let numbers = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    it2 = await handOthersToSecondItAdmin(h);
    subscriptionId = await h.subscription(20, 'K2');
    plan = await h.planOf(subscriptionId);
    vendorId = (await h.vendorOf(plan)).id;
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
  /** A department the IT Admin `it1` works, with a budget, and one request approved for 20 million: the commitment it holds. */
  const approved = async (account: ApiAccount = h.it1): Promise<{ unit: Unit; requestId: string }> => {
    counter += 1;
    const unit = await h.departmentWithHead(`P-PI${counter}`);
    await h.setItAdminInCharge(unit.department, { employeeId: account.employeeId, account });
    await h.budgetFor(unit, { total: 100 * M });
    const requestId = await h.waitingForApprover(unit, plan, { amount: 20 * M });
    await h.decideSpend(requestId, { decision: 'APPROVE' }, h.boss.account).expect(200);

    return { unit, requestId };
  };
  /** A finished upload of a purchase document by `account`: what the upload and its completion leave. */
  const document = async (account: ApiAccount = h.it1, purpose = 'PURCHASE_DOCUMENT'): Promise<string> => {
    const id = randomUUID();
    numbers += 1;
    await h.ctx.sql.query(
      `INSERT INTO document_attachments (id, organization_id, purpose, status, file_name, content_type, size_bytes, object_key,
         final_object_key, uploaded_by_app_user_id)
       VALUES ($1, $2, $3::"DocumentPurpose", 'PENDING_ATTACH', 'hoa-don.pdf', 'application/pdf', 1000, $4, $5, $6)`,
      [
        id,
        h.seed.organizationId,
        purpose,
        `documents/pi/${numbers}-${id}`,
        `documents/pi/kept-${numbers}-${id}`,
        account.appUserId,
      ],
    );

    return id;
  };
  const form = (requestId: string, over: Record<string, unknown> = {}) => {
    numbers += 1;

    return {
      link: { requestId },
      vendorInvoiceNumber: `PI-${numbers}`,
      issuedOn: `${h.year}-11-02`,
      servicePeriodMonth: `${h.year}-11`,
      quantity: 1,
      unitPriceOriginal: { amount: '15', currency: 'USD' },
      netAmount: { amount: '3840000' },
      paymentSource: 'COMPANY_CARD',
      ...over,
    };
  };
  const submit = async (requestId: string, over: Record<string, unknown> = {}, account: ApiAccount = h.it1) =>
    api('post', '', account).send({ ...form(requestId, over), documentIds: [await document(account)] });
  const wire = (response: request.Response) => h.dataOf<Wire>(response);
  const rows = async (id: string) =>
    (
      await h.ctx.sql.query<{ state: string; charged: string | null; flags: string[]; match: string }>(
        `SELECT state::text, charged_cost_center_id AS charged, flags, match_result::text AS match FROM purchase_invoices WHERE id = $1`,
        [id],
      )
    ).rows[0];

  it('reads the invoice against its request before it is kept: a new purchase, the department that bears it and the commitment it goes into', async () => {
    const { unit, requestId } = await approved();
    expect(await h.state(requestId)).toBe('AWAITING_EXECUTION');

    const preview = h.dataOf<Preview>(await api('post', '/preview', h.it1).send(form(requestId)).expect(200));

    expect(preview).toMatchObject({
      label: 'NEW_PURCHASE',
      periodIndex: 1,
      matchResult: 'MATCHED',
      flags: [],
      chargedCostCenter: { id: unit.department.unitId },
      commitment: { remaining: { amount: String(20 * M) } },
    });
    const commitment = await h.ctx.sql.query<{ id: string }>(
      `SELECT id FROM budget_commitments WHERE request_id = $1`,
      [requestId],
    );
    expect(preview.commitment?.id).toBe(commitment.rows[0].id);
    expect((await h.ctx.sql.query(`SELECT 1 FROM purchase_invoices WHERE request_id = $1`, [requestId])).rowCount).toBe(
      0,
    );
  });

  it('keeps the invoice with its files, attaches them to it and tells Finance once', async () => {
    const { unit, requestId } = await approved();
    const files = [await document(), await document()];

    const kept = wire(
      await api('post', '', h.it1)
        .send({ ...form(requestId), documentIds: files })
        .expect(201),
    );

    expect(kept).toMatchObject({
      state: 'SUBMITTED',
      label: 'NEW_PURCHASE',
      servicePeriodMonth: `${h.year}-11`,
      netAmount: { amount: '3840000', currency: h.reporting },
      chargedCostCenterId: unit.department.unitId,
      documents: files.map((documentId, at) => ({ documentId, position: at + 1 })),
      resubmissionOfId: null,
    });
    const attached = await h.ctx.sql.query<{ status: string; purchase_invoice_id: string }>(
      `SELECT status::text, purchase_invoice_id FROM document_attachments WHERE id = ANY($1::uuid[])`,
      [files],
    );
    expect(attached.rows).toEqual(files.map(() => ({ status: 'READY', purchase_invoice_id: kept.id })));
    const notices = await h.ctx.sql.query(
      `SELECT 1 FROM in_app_notifications WHERE code = 'PURCHASE_INVOICE_SUBMITTED' AND subject_id = $1 AND recipient_employee_id = $2`,
      [kept.id, h.finance.employeeId],
    );
    expect(notices.rowCount).toBe(1);
    expect(
      (
        await h.ctx.sql.query(
          `SELECT 1 FROM audit_events WHERE action = 'PURCHASE_INVOICE.SUBMITTED' AND resource_id = $1`,
          [kept.id],
        )
      ).rowCount,
    ).toBe(1);
  });

  it('counts the periods of a right with an end from the first invoice and flags what is outside it, never refusing it (T-PI)', async () => {
    const { requestId } = await approved();
    await h.ctx.sql.query(`UPDATE access_requests SET term_months = 3 WHERE id = $1`, [requestId]);
    const month = (n: number) => `${h.year}-${String(n).padStart(2, '0')}`;

    const first = wire(await submit(requestId, { servicePeriodMonth: month(3), netAmount: { amount: String(M) } }));
    const second = wire(await submit(requestId, { servicePeriodMonth: month(4), netAmount: { amount: String(M) } }));
    const late = wire(await submit(requestId, { servicePeriodMonth: month(7), netAmount: { amount: String(M) } }));

    expect(first).toMatchObject({ label: 'NEW_PURCHASE', periodIndex: 1, periodCount: 3, flags: [] });
    expect(second).toMatchObject({ label: 'PERIOD', periodIndex: 2, periodCount: 3, flags: [] });
    expect(late).toMatchObject({ label: 'PERIOD', periodIndex: 5, periodCount: 3, flags: ['OUTSIDE_TERM'] });
  });

  it('counts a right with no end as "Kỳ k" with no total', async () => {
    const { requestId } = await approved();
    await h.ctx.sql.query(`UPDATE access_requests SET term_months = NULL WHERE id = $1`, [requestId]);
    wire(await submit(requestId, { servicePeriodMonth: `${h.year}-03`, netAmount: { amount: String(M) } }));

    const second = wire(
      await submit(requestId, { servicePeriodMonth: `${h.year}-04`, netAmount: { amount: String(M) } }),
    );

    expect(second).toMatchObject({ label: 'PERIOD', periodIndex: 2, periodCount: null, flags: [] });
  });

  it('flags the invoice that is more than what is left of the commitment and the one whose count or price differs, and keeps both (R-44)', async () => {
    const { requestId } = await approved();

    const over = wire(await submit(requestId, { netAmount: { amount: String(25 * M) } }));
    const more = wire(await submit(requestId, { quantity: 2, servicePeriodMonth: `${h.year}-12` }));
    const dearer = wire(
      await submit(requestId, {
        unitPriceOriginal: { amount: '18', currency: 'USD' },
        servicePeriodMonth: `${h.year}-10`,
      }),
    );

    expect(over).toMatchObject({ flags: ['OVER_APPROVED'], matchResult: 'MATCHED' });
    expect(more).toMatchObject({ matchResult: 'PRICE_QUANTITY_EXCEPTION' });
    expect(dearer).toMatchObject({ matchResult: 'PRICE_QUANTITY_EXCEPTION' });
    expect((await rows(more.id)).match).toBe('PRICE_QUANTITY_EXCEPTION');
  });

  it("refuses a number the vendor has taken, files that are not the person's purchase documents, and a request or subscription that is not theirs", async () => {
    const { requestId } = await approved();
    const taken = form(requestId, { vendorInvoiceNumber: 'DUP-1' });
    await api('post', '', h.it1)
      .send({ ...taken, documentIds: [await document()] })
      .expect(201);

    const body = async (over: Record<string, unknown>) => ({
      ...form(requestId),
      documentIds: [await document()],
      ...over,
    });
    const refused = async (status: number, over: Record<string, unknown>, account: ApiAccount = h.it1) =>
      bodyCode(
        await api('post', '', account)
          .send(await body(over))
          .expect(status),
      );
    const bodyCode = (response: request.Response) => (response.body as { error: { code: string } }).error.code;

    expect(await refused(409, { vendorInvoiceNumber: 'DUP-1' })).toBe('PURCHASE_INVOICE.NUMBER_TAKEN');
    expect(await refused(422, { documentIds: [await document(it2)] })).toBe('PURCHASE_INVOICE.DOCUMENT_INVALID');
    expect(await refused(422, { documentIds: [await document(h.it1, 'COST_STATEMENT')] })).toBe(
      'PURCHASE_INVOICE.DOCUMENT_INVALID',
    );
    expect(await refused(422, { documentIds: [randomUUID()] })).toBe('PURCHASE_INVOICE.DOCUMENT_INVALID');
    const reused = await document();
    await api('post', '', h.it1)
      .send({ ...form(requestId), documentIds: [reused] })
      .expect(201);
    expect(await refused(422, { documentIds: [reused] })).toBe('PURCHASE_INVOICE.DOCUMENT_INVALID');
    expect(await refused(404, { link: { requestId: randomUUID() } })).toBe('PURCHASE_INVOICE.LINK_NOT_FOUND');
    expect(await refused(404, {}, it2)).toBe('PURCHASE_INVOICE.LINK_NOT_FOUND');
    expect(await refused(404, { link: { subscriptionId: randomUUID() } })).toBe('PURCHASE_INVOICE.LINK_NOT_FOUND');
    // Nothing of a refused attempt stays: the files that were attached before the refusal are still unattached.
    const stray = await h.ctx.sql.query(
      `SELECT 1 FROM purchase_invoice_documents d JOIN purchase_invoices p ON p.id = d.purchase_invoice_id WHERE p.number = 'DUP-1'`,
    );
    expect(stray.rowCount).toBe(1);
  });

  it('reads an invoice of a subscription as a renewal with no period, for the IT Admin of the department that owns it', async () => {
    const unit = await h.departmentWithHead(`P-PIS${counter++}`);
    await h.setItAdminInCharge(unit.department, { employeeId: h.it1.employeeId, account: h.it1 });
    const owned = await h.subscription(10, 'K2', unit.department.id);
    await h.ctx.sql.query(
      `UPDATE subscriptions SET original_unit_price_minor = 1500, original_currency = 'USD' WHERE id = $1`,
      [owned],
    );

    const kept = wire(
      await api('post', '', h.it1)
        .send({
          ...form(randomUUID(), { link: { subscriptionId: owned }, quantity: 10 }),
          documentIds: [await document()],
        })
        .expect(201),
    );

    expect(kept).toMatchObject({
      label: 'RENEWAL',
      periodIndex: null,
      periodCount: null,
      matchResult: 'MATCHED',
      chargedCostCenterId: null,
    });
    expect(vendorId).toBeDefined();
  });

  it('submits a returned invoice again, once, with the number it had, and not one that was not returned', async () => {
    const { requestId } = await approved();
    const original = wire(await submit(requestId, { vendorInvoiceNumber: 'RET-1' }));
    const resend = async (account: ApiAccount = h.it1) => {
      const rest: Record<string, unknown> = form(requestId, { vendorInvoiceNumber: 'RET-1' });
      delete rest.link;

      return api('post', `/${original.id}/resubmission`, account).send({
        ...rest,
        documentIds: [await document(account)],
      });
    };

    expect((await resend()).status).toBe(409);
    expect(((await resend()).body as { error: { code: string } }).error.code).toBe('PURCHASE_INVOICE.NOT_RETURNED');
    await h.ctx.sql.query(
      `UPDATE purchase_invoices SET state = 'RETURNED', decided_by_employee_id = $2, decided_at = now(), return_reason = 'Thiếu thuế' WHERE id = $1`,
      [original.id, h.finance.employeeId],
    );

    expect(((await resend(it2)).body as { error: { code: string } }).error.code).toBe('PURCHASE_INVOICE.NOT_FOUND');
    const second = wire(await resend().then((response) => response));
    expect(second).toMatchObject({ state: 'SUBMITTED', resubmissionOfId: original.id });
    const taken = await resend();
    expect(taken.status).toBe(409);
    expect((taken.body as { error: { code: string } }).error.code).toBe('PURCHASE_INVOICE.ALREADY_RESUBMITTED');
    expect(wire(await api('get', `/${original.id}`, h.finance).expect(200))).toMatchObject({
      state: 'RETURNED',
      resubmittedAsId: second.id,
    });
  });

  it('lists with filters and pages, and reads one: Finance every invoice, the IT Admin their own and the ones of their departments', async () => {
    const { requestId } = await approved();
    const a = wire(await submit(requestId, { servicePeriodMonth: `${h.year}-05` }));
    const b = wire(await submit(requestId, { servicePeriodMonth: `${h.year}-06` }));

    const page = h.dataOf<{ items: Wire[]; pagination: { totalItems: number } }>(
      await api('get', `?requestId=${requestId}&pageSize=1&page=1`, h.finance).expect(200),
    );
    expect(page.pagination.totalItems).toBe(2);
    expect(page.items.map((item) => item.id)).toEqual([b.id]);
    const filtered = h.dataOf<{ items: Wire[] }>(
      await api(
        'get',
        `?requestId=${requestId}&servicePeriodMonth=${h.year}-05&state=SUBMITTED&label=NEW_PURCHASE`,
        h.it1,
      ).expect(200),
    );
    expect(filtered.items.map((item) => item.id)).toEqual([a.id]);
    expect(h.dataOf<{ items: Wire[] }>(await api('get', `?requestId=${requestId}`, it2).expect(200)).items).toEqual([]);
    expect(wire(await api('get', `/${a.id}`, h.finance).expect(200)).id).toBe(a.id);
    await api('get', `/${a.id}`, it2).expect(404);
    await api('get', `/${randomUUID()}`, h.finance).expect(404);
  });
});
