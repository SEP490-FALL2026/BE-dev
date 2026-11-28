import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { ApiAccount } from '../../support/api-accounts';
import { InvoiceHarness } from '../../support/invoice-harness';
import { handOthersToSecondItAdmin } from '../../support/second-it-admin';
import { takeOwnerOff } from '../../support/shared-pool-subscription';
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
    subscriptionId = await h.subscription(20, 'K1');
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

  it('compares the number of the vendor by its lower case without white space, keeps the number as written, and lets a returned invoice free its number', async () => {
    const { requestId } = await approved();
    const submit = async (number: string) =>
      api('post', '', h.it1).send({
        ...form(requestId, { vendorInvoiceNumber: number }),
        documentIds: [await document()],
      });
    const code = (response: request.Response) => (response.body as { error: { code: string } }).error.code;
    const stored = (key: string) =>
      h.ctx.sql.query<{ id: string; number: string }>(
        `SELECT id, number FROM purchase_invoices WHERE lower(regexp_replace(number, '[[:space:]]', '', 'g')) = $1`,
        [key],
      );

    // INV-001 then inv - 001: both are inv-001.
    expect((await submit('NRM-INV-001')).status).toBe(201);
    const refusedDashes = await submit('nrm - inv - 001');
    expect([refusedDashes.status, code(refusedDashes)]).toEqual([409, 'PURCHASE_INVOICE.NUMBER_TAKEN']);
    // INV 001 then inv001: white space is not part of the number.
    expect((await submit('NRM SP 001')).status).toBe(201);
    const refusedSpaces = await submit('nrmsp001');
    expect([refusedSpaces.status, code(refusedSpaces)]).toEqual([409, 'PURCHASE_INVOICE.NUMBER_TAKEN']);
    // A dash is not white space: INV-001 and INV001 are two numbers.
    expect((await submit('NRM-INV001')).status).toBe(201);

    // The first one was stored exactly as it was written.
    const first = await stored('nrm-inv-001');
    expect(first.rows.map((row) => row.number)).toEqual(['NRM-INV-001']);

    // A returned invoice is outside the index: its number may come back.
    await h.ctx.sql.query(
      `UPDATE purchase_invoices SET state = 'RETURNED', decided_by_employee_id = $2, decided_at = now(), return_reason = 'Sai' WHERE id = $1`,
      [first.rows[0].id, h.finance.employeeId],
    );
    expect((await submit('nrm inv-001')).status).toBe(201);
  });

  it('the database itself refuses a second open invoice whose number has the same lower case without white space, and lets the number back once the first is returned', async () => {
    const { requestId } = await approved();
    const first = wire(
      await api('post', '', h.it1)
        .send({ ...form(requestId, { vendorInvoiceNumber: 'IDX 001' }), documentIds: [await document()] })
        .expect(201),
    );
    const { rows: columns } = await h.ctx.sql.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns WHERE table_name = 'purchase_invoices' AND column_name <> 'id' ORDER BY ordinal_position`,
    );
    // The same row again under another number, written straight into the table, so only the index can refuse it (the route checks the number first).
    const copyAs = async (id: string, number: string): Promise<{ code?: string; constraint?: string } | null> => {
      const list = columns.map((column) => `"${column.column_name}"`).join(', ');
      const values = columns
        .map((column) => (column.column_name === 'number' ? '$2' : `"${column.column_name}"`))
        .join(', ');
      try {
        await h.ctx.sql.query(
          `INSERT INTO purchase_invoices (id, ${list}) SELECT gen_random_uuid(), ${values} FROM purchase_invoices WHERE id = $1`,
          [id, number],
        );

        return null;
      } catch (error) {
        return error as { code?: string; constraint?: string };
      }
    };

    expect(await copyAs(first.id, 'idx001')).toMatchObject({
      code: '23505',
      constraint: 'purchase_invoices_number_open_normalized_key',
    });
    expect(await copyAs(first.id, 'IDX-001')).toBeNull();

    await h.ctx.sql.query(
      `UPDATE purchase_invoices SET state = 'RETURNED', decided_by_employee_id = $2, decided_at = now(), return_reason = 'Sai' WHERE id = $1`,
      [first.id, h.finance.employeeId],
    );
    // The copy of an invoice that is still open: its number is the key of the one returned, which is outside the index.
    const open = (await h.ctx.sql.query<{ id: string }>(`SELECT id FROM purchase_invoices WHERE number = 'IDX-001'`))
      .rows[0];
    expect(await copyAs(open.id, 'idx 001')).toBeNull();
  });

  it('refuses an invoice for a request whose software is internal and has no vendor, without guessing one, and keeps nothing', async () => {
    const { requestId } = await approved();
    const internal = await h.plan('K5');
    await h.ctx.sql.query(`UPDATE access_requests SET plan_id = $2 WHERE id = $1`, [requestId, internal]);

    const response = await api('post', '', h.it1)
      .send({ ...form(requestId, { vendorInvoiceNumber: 'NOVENDOR-1' }), documentIds: [await document()] })
      .expect(422);

    expect((response.body as { error: { code: string } }).error.code).toBe('PURCHASE_INVOICE.NO_VENDOR');
    expect((await h.ctx.sql.query(`SELECT 1 FROM purchase_invoices WHERE number = 'NOVENDOR-1'`)).rowCount).toBe(0);
  });

  it('reads an invoice of a subscription as a renewal with no period, for the IT Admin of the department that owns it', async () => {
    const unit = await h.departmentWithHead(`P-PIS${counter++}`);
    await h.setItAdminInCharge(unit.department, { employeeId: h.it1.employeeId, account: h.it1 });
    const owned = await h.subscription(10, 'K2');
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

  it('takes the invoice of a subscription, K2 or K4, only from the IT Admin who answers for it, never from another IT Admin or from nobody who is not one, in the three forms of its link (QĐ-118d, QĐ-118f, Owner 28/11/2026)', async () => {
    const pool = async (type: 'K2' | 'K4'): Promise<string> => {
      const id = await takeOwnerOff(h, await h.subscription(10, type));
      await h.ctx.sql.query(
        `UPDATE subscriptions SET original_unit_price_minor = 1500, original_currency = 'USD' WHERE id = $1`,
        [id],
      );

      return id;
    };
    const submitFor = async (
      subscription: string,
      account: ApiAccount,
      status: number,
      over: Record<string, unknown> = {},
      link: Record<string, unknown> = {},
    ): Promise<request.Response> =>
      api('post', '', account)
        .send({
          ...form(randomUUID(), { link: { subscriptionId: subscription, ...link }, quantity: 10, ...over }),
          documentIds: [await document(account)],
        })
        .expect(status);
    const codeOf = (response: request.Response) => (response.body as { error: { code: string } }).error.code;
    const k2 = await pool('K2');
    const k4 = await pool('K4');

    const byResponsible = wire(await submitFor(k2, h.it1, 201));
    const ofKey = wire(await submitFor(k4, h.it1, 201));
    for (const kept of [byResponsible, ofKey]) {
      expect(kept).toMatchObject({ label: 'RENEWAL', matchResult: 'MATCHED', chargedCostCenterId: null });
    }
    // Another IT Admin is refused for a period, a seat purchase and the lines of a period, and the preview reads it the same way.
    const forms: Record<string, unknown>[] = [
      {},
      { seatPurchaseId: randomUUID() },
      { subscriptionLineIds: [randomUUID()] },
    ];
    for (const link of forms) {
      expect(codeOf(await submitFor(k2, it2, 403, { servicePeriodMonth: `${h.year}-12` }, link))).toBe(
        'PURCHASE_INVOICE.NOT_RESPONSIBLE',
      );
    }
    expect(codeOf(await submitFor(k4, it2, 403))).toBe('PURCHASE_INVOICE.NOT_RESPONSIBLE');
    const previewOf = (account: ApiAccount) =>
      api('post', '/preview', account).send(form(randomUUID(), { link: { subscriptionId: k2 }, quantity: 10 }));
    expect(codeOf(await previewOf(it2).expect(403))).toBe('PURCHASE_INVOICE.NOT_RESPONSIBLE');
    expect(h.dataOf<Preview>(await previewOf(h.it1).expect(200))).toMatchObject({
      label: 'RENEWAL',
      matchResult: 'MATCHED',
    });
    // A subscription that names no IT Admin is refused to everyone.
    const nobody = await pool('K2');
    await h.ctx.sql.query(`UPDATE subscriptions SET responsible_it_admin_employee_id = NULL WHERE id = $1`, [nobody]);
    expect(codeOf(await submitFor(nobody, h.it1, 403))).toBe('PURCHASE_INVOICE.NOT_RESPONSIBLE');
    await submitFor(k2, h.finance, 403);
    await submitFor(k2, h.boss.account, 403);
  });

  it('takes the invoice of a license lot that is not for a request only from the IT Admin who answers for it (QĐ-118d, Owner 28/11/2026)', async () => {
    const plan4 = await h.plan('K4');
    const lot = randomUUID();
    await h.ctx.sql.query(
      `INSERT INTO license_lots (id, organization_id, plan_id, purchased_on, license_count, unit_price_minor, purpose,
         responsible_it_admin_employee_id, updated_at)
       VALUES ($1, $2, $3, '2026-11-01', 3, 1000000, 'STOCK', $4, now())`,
      [lot, h.seed.organizationId, plan4, h.it1.employeeId],
    );
    const send = async (account: ApiAccount) =>
      api('post', '', account).send({
        ...form(randomUUID(), { link: { licenseLotId: lot }, quantity: 3 }),
        documentIds: [await document(account)],
      });

    const refused = await send(it2);
    expect(refused.status).toBe(403);
    expect((refused.body as { error: { code: string } }).error.code).toBe('PURCHASE_INVOICE.NOT_RESPONSIBLE');
    const kept = await send(h.it1);
    expect(kept.status).toBe(201);
  });

  it('lets the IT Admin who answers now submit a returned invoice of a subscription again after the Super Admin changed who answers, and refuses the one before (QĐ-118f, Owner 28/11/2026)', async () => {
    const owned = await h.subscription(10, 'K2');
    await h.ctx.sql.query(
      `UPDATE subscriptions SET original_unit_price_minor = 1500, original_currency = 'USD' WHERE id = $1`,
      [owned],
    );
    const first = wire(
      await api('post', '', h.it1)
        .send({
          ...form(randomUUID(), { link: { subscriptionId: owned }, quantity: 10, vendorInvoiceNumber: 'RESP-1' }),
          documentIds: [await document()],
        })
        .expect(201),
    );
    await h.ctx.sql.query(
      `UPDATE purchase_invoices SET state = 'RETURNED', decided_by_employee_id = $2, decided_at = now(), return_reason = 'Sai' WHERE id = $1`,
      [first.id, h.finance.employeeId],
    );
    await request(h.server())
      .post(`/api/v1/subscriptions/${owned}/responsible-it-admin`)
      .set('Authorization', `Bearer ${h.admin}`)
      .send({ employeeId: it2.employeeId, reason: 'IT 1 is moving to another team' })
      .expect(200);
    const resend = async (account: ApiAccount) => {
      const rest: Record<string, unknown> = form(randomUUID(), { quantity: 10, vendorInvoiceNumber: 'RESP-1' });
      delete rest.link;

      return api('post', `/${first.id}/resubmission`, account).send({
        ...rest,
        documentIds: [await document(account)],
      });
    };

    const before = await resend(h.it1);
    expect(before.status).toBe(403);
    expect((before.body as { error: { code: string } }).error.code).toBe('PURCHASE_INVOICE.NOT_RESPONSIBLE');
    const after = await resend(it2);
    expect(after.status).toBe(201);
    expect(wire(after)).toMatchObject({ state: 'SUBMITTED', resubmissionOfId: first.id });
  });

  it('marks over an invoice of the shared pool, linked to the pool or to a K2 request, and the invoice of a renewal, by the seats bought times the price of a month times the months to the renewal day, and never refuses it (B3B-06, QĐ-103w(3), QĐ-104c(3), QĐ-104d)', async () => {
    const pool = await takeOwnerOff(h, await h.subscription(10, 'K2'));
    // 10 seats at 1.000.000 đ a month (the harness price); the renewal day is 05/12, so September has three months to it.
    await h.ctx.sql.query(
      `UPDATE subscriptions SET renewal_date = $2, original_unit_price_minor = 1500, original_currency = 'USD' WHERE id = $1`,
      [pool, `${h.year}-12-05`],
    );
    const flagsOf = async (link: object, month: string, net: string, quantity = 10) =>
      h.dataOf<Preview>(
        await api('post', '/preview', h.it1)
          .send(
            form(randomUUID(), {
              link,
              quantity,
              servicePeriodMonth: `${h.year}-${month}`,
              netAmount: { amount: net },
            }),
          )
          .expect(200),
      );
    const onPool = { subscriptionId: pool };

    expect(await flagsOf(onPool, '09', '45000000')).toMatchObject({ flags: ['OVER_APPROVED'], matchResult: 'MATCHED' });
    expect(await flagsOf(onPool, '09', '30000000')).toMatchObject({ flags: [] });
    // The renewal pays for the month of the renewal day: ten seats for one month.
    expect(await flagsOf(onPool, '12', '10000001')).toMatchObject({ flags: ['OVER_APPROVED'] });
    expect(await flagsOf(onPool, '12', '10000000')).toMatchObject({ flags: [] });

    // A request of a K2 plan: one seat, three months to the renewal day is 3.000.000 đ.
    const unit = await h.departmentWithHead(`P-PIK2${counter++}`);
    await h.setItAdminInCharge(unit.department, { employeeId: h.it1.employeeId, account: h.it1 });
    await h.budgetFor(unit, { total: 100 * M });
    const k2Request = await h.waitingForApprover(unit, await h.planOf(pool), { amount: 3 * M });
    await h.decideSpend(k2Request, { decision: 'APPROVE' }, h.boss.account).expect(200);

    // Before a K2 top-up grant records its purchase date, `W3-05` flags NO_EXPECTED_AMOUNT on the request invoice.
    expect(await flagsOf({ requestId: k2Request }, '09', '3000000', 1)).toMatchObject({
      flags: ['NO_EXPECTED_AMOUNT'],
    });
    // Record the completed K2 pool top-up task for `01/09`: expected amount is known and `NO_EXPECTED_AMOUNT` clears.
    const k2AssignmentId = randomUUID();
    await h.ctx.sql.query(
      `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id,
         account_identifier, normalized_account_identifier, valid_from, valid_from_basis, granted_on, created_by_app_user_id)
       VALUES ($1, $2, 'PERSONAL'::"AssignmentKind", 'REQUEST'::"AssignmentSource", $3, $4, $5,
         $6, $6, $7::date, 'ACTUAL'::"AssignmentDateBasis", $7::date, $8)`,
      [
        k2AssignmentId,
        h.seed.organizationId,
        await h.planOf(pool),
        pool,
        unit.member.employeeId,
        `pi-k2-${counter}@acme.vn`,
        `${h.year}-09-01`,
        h.it1.appUserId,
      ],
    );
    await h.ctx.sql.query(
      `INSERT INTO provisioning_tasks (id, organization_id, assignment_id, kind, channel, status, request_id,
         max_attempts, purchase_kind, purchased_at, claimed_by_app_user_id, claimed_at,
         completed_by_app_user_id, completed_at, evidence, created_by_system)
       VALUES ($1, $2, $3, 'GRANT'::"ProvisioningTaskKind", 'MANUAL'::"ProvisioningChannel",
         'COMPLETED'::"ProvisioningTaskStatus", $4, 3, 'POOL_TOP_UP'::"ProvisioningPurchaseKind",
         $5::timestamptz, $6, $5::timestamptz, $6, $5::timestamptz, 'Granted K2 top-up', true)`,
      [
        randomUUID(),
        h.seed.organizationId,
        k2AssignmentId,
        k2Request,
        `${h.year}-09-01T02:00:00.000Z`,
        h.it1.appUserId,
      ],
    );

    expect(await flagsOf({ requestId: k2Request }, '09', '4800000', 1)).toMatchObject({ flags: ['OVER_APPROVED'] });
    expect(await flagsOf({ requestId: k2Request }, '09', '3000000', 1)).toMatchObject({ flags: [] });
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

  it.each([
    ['a net amount that is not a number', { netAmount: { amount: 'abc' } }, 'VALIDATION_ERROR'],
    ['a net amount with cents of a dong', { netAmount: { amount: '3840000.5' } }, 'MONEY_SCALE_EXCEEDED'],
    ['a net amount beyond what money may hold', { netAmount: { amount: '1000000000000001' } }, 'MONEY_OUT_OF_RANGE'],
    ['a negative net amount', { netAmount: { amount: '-3840000' } }, 'MONEY_OUT_OF_RANGE'],
    ['a net amount of nothing', { netAmount: { amount: '0' } }, 'MONEY_OUT_OF_RANGE'],
    ['a negative deductible tax', { deductibleTax: { amount: '-1' } }, 'MONEY_OUT_OF_RANGE'],
    ['a non-deductible tax that is not a number', { nonDeductibleTax: { amount: '1,5' } }, 'VALIDATION_ERROR'],
    [
      'a price of one with more decimals than its currency',
      { unitPriceOriginal: { amount: '15.123', currency: 'USD' } },
      'MONEY_SCALE_EXCEEDED',
    ],
    ['a price of one of nothing', { unitPriceOriginal: { amount: '0', currency: 'USD' } }, 'MONEY_OUT_OF_RANGE'],
    ['a negative price of one', { unitPriceOriginal: { amount: '-15', currency: 'USD' } }, 'MONEY_OUT_OF_RANGE'],
    [
      'a currency the system does not price in',
      { unitPriceOriginal: { amount: '15', currency: 'ZZZ' } },
      'CURRENCY_NOT_SUPPORTED',
    ],
  ])('answers %s with 422 and its code, never 500, and keeps nothing (RC-1-O2)', async (_name, over, code) => {
    const { requestId } = await approved();
    const field = Object.keys(over)[0];
    const answered = (response: request.Response): void => {
      expect(response.status).toBe(422);
      const { error } = response.body as { error: { code: string; details: Record<string, unknown> } };
      expect(error.code).toBe(code);
      // B2: the answer names the money object of the body that was refused, or the issue of its amount text.
      if (code === 'VALIDATION_ERROR') {
        expect(error.details).toEqual({ issues: [{ code: 'invalid_format', path: `${field}.amount` }] });
      } else {
        expect(error.details).toMatchObject({ path: field });
      }
    };

    answered(await api('post', '/preview', h.it1).send(form(requestId, over)));
    answered(await submit(requestId, over));
    const sent = await submit(requestId, { vendorInvoiceNumber: `ONCE-${requestId}` });
    expect(sent.status).toBe(201);
    const kept = wire(sent);
    await h.ctx.sql.query(
      `UPDATE purchase_invoices SET state = 'RETURNED', decided_by_employee_id = $2, decided_at = now(), return_reason = 'Sai' WHERE id = $1`,
      [kept.id, h.finance.employeeId],
    );
    const rest: Record<string, unknown> = form(requestId, { vendorInvoiceNumber: `ONCE-${requestId}`, ...over });
    delete rest.link;
    answered(
      await api('post', `/${kept.id}/resubmission`, h.it1).send({ ...rest, documentIds: [await document(h.it1)] }),
    );

    const count = await h.ctx.sql.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM purchase_invoices WHERE request_id = $1`,
      [requestId],
    );
    expect(count.rows[0].n).toBe('1');
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
