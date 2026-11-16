import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { prepareRoleDatabase, sessionRoleOf } from '../../support/role-database-prepare';
import { dropRoleSeparatedDatabase, type RoleSeparatedDatabase } from '../../support/role-separated-database';
import { InvoiceHarness } from '../../support/invoice-harness';
import { takeOwnerOff } from '../../support/shared-pool-subscription';

/**
 * `finance-screens-api`, `PI-1`: the write path of an invoice runs as the runtime role. The IT Admin submits a purchase invoice and Finance signs
 * it; the signature writes the invoice. The role needs the data rights the default privileges give it, and only `INSERT` and `SELECT` on
 * `invoices` (an invoice is added to and never changed): a table of the migration that the role cannot write would fail here and not at the
 * first invoice of production. Two ways in are pinned: a `K1` whose invoice takes the commitment of its request down, and a `K2` whose invoice is a line of the
 * shared pool and leaves the commitment alone (`B3B-01`, `MG-03`). One application for each file, as the other `database-runtime-role-*` suites.
 */
describe('signing a purchase invoice runs as the runtime role (integration, PostgreSQL)', () => {
  const h = new InvoiceHarness();
  let database: RoleSeparatedDatabase;

  beforeAll(async () => {
    database = await prepareRoleDatabase();
    await h.start({ database: database.bootstrapHandle, appDatabaseUrl: () => database.runtime.url });
    // The spending approver of the company is made once: a second one is refused.
    await h.withApprover();
  }, 240000);

  afterAll(async () => {
    await h.stop();
    if (database) await dropRoleSeparatedDatabase(database);
  });

  /** A finished upload of the purpose the IT Admin attaches to a purchase invoice. */
  const document = async (): Promise<string> => {
    const id = randomUUID();
    await h.ctx.sql.query(
      `INSERT INTO document_attachments (id, organization_id, purpose, status, file_name, content_type, size_bytes, object_key,
         final_object_key, uploaded_by_app_user_id)
       VALUES ($1, $2, 'PURCHASE_DOCUMENT', 'PENDING_ATTACH', 'hoa-don.pdf', 'application/pdf', 1000, $3, $4, $5)`,
      [id, h.seed.organizationId, `documents/rr/${id}`, `documents/rr/kept-${id}`, h.it1.appUserId],
    );

    return id;
  };

  /**
   * A request of the plan approved for the amount, a purchase invoice the IT Admin submits for it and Finance signs, all by HTTP: the ids the
   * checks read. The price of the plan is 15 USD and the invoice is one seat at that price, so the count and the price match.
   */
  const signed = async (
    plan: string,
    unit: Awaited<ReturnType<InvoiceHarness['departmentWithHead']>>,
    number: string,
  ): Promise<{ requestId: string; purchaseId: string; commitmentId: string; state: string }> => {
    const requestId = await h.waitingForApprover(unit, plan, { amount: 20_000_000 });
    await h.decideSpend(requestId, { decision: 'APPROVE' }, h.boss.account).expect(200);
    const commitmentId = h.dataOf<{ items: Array<{ id: string }> }>(
      await h.commitmentList(h.finance, { requestId }).expect(200),
    ).items[0].id;
    const submitted = await request(h.server())
      .post('/api/v1/purchase-invoices')
      .set(h.as(h.it1))
      .send({
        link: { requestId },
        vendorInvoiceNumber: number,
        issuedOn: `${h.year}-11-03`,
        servicePeriodMonth: `${h.year}-11`,
        quantity: 1,
        unitPriceOriginal: { amount: '15', currency: 'USD' },
        netAmount: { amount: '3840000' },
        nonDeductibleTax: { amount: '192000' },
        paymentSource: 'COMPANY_CARD',
        documentIds: [await document()],
      })
      .expect(201);
    const purchaseId = h.dataOf<{ id: string }>(submitted).id;
    const confirmed = await request(h.server())
      .post(`/api/v1/purchase-invoices/${purchaseId}/confirmation`)
      .set(h.as(h.finance))
      .expect(201);

    return { requestId, purchaseId, commitmentId, state: h.dataOf<{ state: string }>(confirmed).state };
  };

  /** A subscription of the kind with its price in USD, and the department whose head and IT Admin the request goes through. */
  const world = async (kind: 'K1' | 'K2', code: string) => {
    const subscriptionId = await h.subscription(20, kind, h.seed.departmentId);
    // A K2 plan is the shared pool of the company: no department owns it (`QĐ-104c`(3)).
    if (kind === 'K2') await takeOwnerOff(h, subscriptionId);
    await h.ctx.sql.query(
      `UPDATE subscriptions SET original_unit_price_minor = 1500, original_currency = 'USD' WHERE id = $1`,
      [subscriptionId],
    );
    const unit = await h.departmentWithHead(code);
    await h.setItAdminInCharge(unit.department, { employeeId: h.it1.employeeId, account: h.it1 });
    await h.budgetFor(unit, { total: 100_000_000 });

    return { plan: await h.planOf(subscriptionId), subscriptionId, unit };
  };

  it('writes the purchase invoice, the invoice, takes the commitment down and audits it without any right beyond data (a K1: its invoice goes into the commitment of the request)', async () => {
    const { plan, unit } = await world('K1', 'P-RR-INV');
    const { purchaseId, commitmentId, state } = await signed(plan, unit, 'RR-1');

    expect(state).toBe('CONFIRMED');
    expect(await sessionRoleOf(h.ctx.app)).toBe(database.runtime.role);
    const written = await h.ctx.sql.query<{
      applied: string;
      invoices: number;
      actual: string;
      events: number;
      signed: number;
    }>(
      `SELECT (SELECT applied_minor::text FROM budget_commitments WHERE id = $1) AS applied,
              (SELECT count(*)::int FROM invoices WHERE commitment_id = $1) AS invoices,
              (SELECT actual_cost_minor::text FROM invoices WHERE purchase_invoice_id = $3) AS actual,
              (SELECT count(*)::int FROM audit_events WHERE action = 'INVOICE.RECORDED' AND after->>'commitmentId' = $2::text) AS events,
              (SELECT count(*)::int FROM purchase_invoices WHERE id = $3 AND state = 'CONFIRMED' AND invoice_id IS NOT NULL) AS signed`,
      [commitmentId, commitmentId, purchaseId],
    );
    expect(written.rows[0]).toEqual({ applied: '3840000', invoices: 1, actual: '4032000', events: 1, signed: 1 });
  });

  it('signs the purchase invoice of a K2 request as the runtime role too: the invoice is a line of the pool, and the commitment of the request is left as it was (B3B-01, MG-03)', async () => {
    const { plan, subscriptionId, unit } = await world('K2', 'P-RR-POOL');
    const { purchaseId, commitmentId, state } = await signed(plan, unit, 'RR-2');

    expect(state).toBe('CONFIRMED');
    expect(await sessionRoleOf(h.ctx.app)).toBe(database.runtime.role);
    const written = await h.ctx.sql.query<{
      commitment: { applied_minor: string; state: string };
      invoices: Array<{
        commitment_id: string | null;
        cost_center_id: string | null;
        subscription_id: string | null;
        applied_minor: string;
        actual_cost_minor: string;
      }>;
      events: number;
      signed: number;
    }>(
      `SELECT (SELECT json_build_object('applied_minor', applied_minor::text, 'state', state::text)
                  FROM budget_commitments WHERE id = $1) AS commitment,
              (SELECT coalesce(json_agg(json_build_object('commitment_id', commitment_id, 'cost_center_id', cost_center_id,
                       'subscription_id', subscription_id, 'applied_minor', applied_minor::text,
                       'actual_cost_minor', actual_cost_minor::text)), '[]'::json)
                 FROM invoices WHERE purchase_invoice_id = $2) AS invoices,
              (SELECT count(*)::int FROM audit_events WHERE action = 'INVOICE.RECORDED' AND after->>'purchaseInvoiceId' = $2::text
                  AND after->>'booking' = 'SUBSCRIPTION') AS events,
              (SELECT count(*)::int FROM purchase_invoices WHERE id = $2 AND state = 'CONFIRMED' AND invoice_id IS NOT NULL) AS signed`,
      [commitmentId, purchaseId],
    );
    expect(written.rows[0]).toEqual({
      commitment: { applied_minor: '0', state: 'HELD' },
      invoices: [
        {
          commitment_id: null,
          cost_center_id: null,
          subscription_id: subscriptionId,
          applied_minor: '0',
          actual_cost_minor: '4032000',
        },
      ],
      events: 1,
      signed: 1,
    });
  });
});
