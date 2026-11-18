import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { ApiAccount } from '../../support/api-accounts';
import {
  InvoiceDiscrepancyReferralListeners,
  type InvoiceDiscrepancyReferral,
} from '../../../src/modules/requests/public/requests.extension-points';
import { InvoiceHarness } from '../../support/invoice-harness';
import { PgRelay } from '../../support/pg-relay';
import { dataStatements, QueryCounter } from '../../support/query-count';
import { handOthersToSecondItAdmin } from '../../support/second-it-admin';
import { takeOwnerOff } from '../../support/shared-pool-subscription';
import type { Unit } from '../../support/spend-harness';

const h = new InvoiceHarness();
const M = 1_000_000;

interface Money {
  amount: string;
  currency: string;
}
interface Wire {
  id: string;
  state: 'OPEN' | 'CLOSED';
  mismatches: string[];
  openedAt: string;
  purchaseInvoice: { id: string; vendorInvoiceNumber: string; servicePeriodMonth: string };
  quantity: { invoice: number; expected: number | null };
  unitPrice: { invoice: Money; expected: Money | null };
  outcome: string | null;
  closure: null | {
    outcome: string;
    reason: string;
    differenceAmount: Money;
    closedBy: { employeeId: string };
    closedAt: string;
  };
}
interface PurchaseWire {
  id: string;
}
interface Page {
  items: Wire[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

/**
 * The case Finance works from an invoice whose count of seats or price of one differs from what was approved or bought (`RC-1`, `QĐ-111y`, `R-29`,
 * `R-44`, T-PI): signing such an invoice opens one, a difference of dong only opens none, and the case is closed once with a reason. On real
 * PostgreSQL, through the routes.
 */
describe('cases of invoices that differ over PostgreSQL (integration; RC-1.1, T-PI)', () => {
  let relay: PgRelay;
  let counter: QueryCounter;
  let it2: ApiAccount;
  let serial = 0;
  let numbers = 0;
  let plan: string;
  // What the extension point of a suspicion was told, and whether the listener refuses: the stand-in for the review of the accounts at the vendor.
  const heard: InvoiceDiscrepancyReferral[] = [];
  let refuse = false;

  beforeAll(async () => {
    await h.start({
      appDatabaseUrl: async (directUrl) => {
        const url = new URL(directUrl);
        relay = await PgRelay.start(url.hostname, Number(url.port || 5432));
        url.port = String(relay.port);

        return url.toString();
      },
    });
    counter = QueryCounter.on(relay);
    await h.withApprover();
    it2 = await handOthersToSecondItAdmin(h);
    plan = await h.planOf(await h.subscription(20, 'K2'));
    h.ctx.app.get(InvoiceDiscrepancyReferralListeners, { strict: false }).add('test-heard', (_tx, event) => {
      if (refuse) return Promise.reject(new Error('The review of the accounts refused the case.'));
      heard.push(event);

      return Promise.resolve();
    });
  }, 240000);

  afterAll(async () => {
    await h.stop();
    await relay?.stop();
  });

  const purchases = (method: 'get' | 'post', path: string, account: ApiAccount) =>
    request(h.server())[method](`/api/v1/purchase-invoices${path}`).set(h.as(account));
  const cases = (method: 'get' | 'post', path: string, account: ApiAccount) =>
    request(h.server())[method](`/api/v1/invoice-discrepancies${path}`).set(h.as(account));
  const code = (response: request.Response) => (response.body as { error: { code: string } }).error.code;

  /** A subscription of 10 seats at 15 USD that `it1` works: owned by a department they are in charge of, or of the shared pool. */
  const subscription = async (pooled = false): Promise<string> => {
    serial += 1;
    const unit = await h.departmentWithHead(`P-RC${serial}`);
    await h.setItAdminInCharge(unit.department, { employeeId: h.it1.employeeId, account: h.it1 });
    const id = await h.subscription(10, 'K2');
    await h.ctx.sql.query(
      `UPDATE subscriptions SET original_unit_price_minor = 1500, original_currency = 'USD' WHERE id = $1`,
      [id],
    );

    return pooled ? takeOwnerOff(h, id) : id;
  };
  const approved = async (): Promise<{ unit: Unit; requestId: string }> => {
    serial += 1;
    const unit = await h.departmentWithHead(`P-RCR${serial}`);
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
        `documents/rc/${numbers}-${id}`,
        `documents/rc/kept-${numbers}-${id}`,
        h.it1.appUserId,
      ],
    );

    return id;
  };
  /** The invoice `it1` submits for a subscription or a request: 15 USD a seat, 3.840.000 đ taken out, unless `over` says otherwise. */
  const submitted = async (
    link: { subscriptionId: string } | { requestId: string },
    over: Record<string, unknown> = {},
  ): Promise<string> => {
    numbers += 1;
    const response = await purchases('post', '', h.it1)
      .send({
        link,
        vendorInvoiceNumber: `RC-${numbers}`,
        issuedOn: `${h.year}-11-02`,
        servicePeriodMonth: `${h.year}-11`,
        quantity: 10,
        unitPriceOriginal: { amount: '15', currency: 'USD' },
        netAmount: { amount: '3840000' },
        paymentSource: 'COMPANY_CARD',
        documentIds: [await document()],
        ...over,
      })
      .expect(201);

    return h.dataOf<PurchaseWire>(response).id;
  };
  const signed = async (id: string): Promise<string> => {
    await purchases('post', `/${id}/confirmation`, h.finance).expect(201);

    return id;
  };
  const caseRows = async (purchaseId: string) =>
    (
      await h.ctx.sql.query<{ id: string; state: string; mismatches: string[] }>(
        `SELECT id, state::text, mismatches FROM invoice_discrepancy_cases WHERE purchase_invoice_id = $1`,
        [purchaseId],
      )
    ).rows;
  const wireOf = async (purchaseId: string, account: ApiAccount = h.finance): Promise<Wire> => {
    const [row] = await caseRows(purchaseId);

    return h.dataOf<Wire>(await cases('get', `/${row.id}`, account).expect(200));
  };
  /** An open case for 12 seats against 10, signed by Finance. */
  const opened = async (over: Record<string, unknown> = {}): Promise<{ purchaseId: string; wire: Wire }> => {
    const purchaseId = await signed(
      await submitted({ subscriptionId: await subscription() }, { quantity: 12, ...over }),
    );

    return { purchaseId, wire: await wireOf(purchaseId) };
  };
  const close = (id: string, body: object, account: ApiAccount = h.finance) =>
    cases('post', `/${id}/closure`, account).send(body);

  describe('opening (signing an invoice that differs)', () => {
    it('opens none for an invoice that matches, though the dong taken out is not the dong committed: 10 seats at 15 USD, 3.840.000 đ against 3.750.000 đ (T-PI)', async () => {
      const subscriptionId = await subscription();
      const purchaseId = await signed(await submitted({ subscriptionId }, { netAmount: { amount: '3840000' } }));

      expect(await caseRows(purchaseId)).toEqual([]);
      expect(
        (await h.ctx.sql.query(`SELECT match_result::text FROM invoices WHERE purchase_invoice_id = $1`, [purchaseId]))
          .rows,
      ).toEqual([{ match_result: 'MATCHED' }]);
    });

    it('opens one for 12 seats against 10, in the transaction that signs, and keeps both sides: what the invoice says and what it was read against (T-PI)', async () => {
      const purchaseId = await signed(await submitted({ subscriptionId: await subscription() }, { quantity: 12 }));

      const rows = await caseRows(purchaseId);
      expect(rows.map((row) => [row.state, row.mismatches])).toEqual([['OPEN', ['QUANTITY']]]);
      const wire = await wireOf(purchaseId);
      expect(wire).toMatchObject({
        state: 'OPEN',
        mismatches: ['QUANTITY'],
        purchaseInvoice: { id: purchaseId },
        quantity: { invoice: 12, expected: 10 },
        unitPrice: { invoice: { amount: '15.00', currency: 'USD' }, expected: { amount: '15.00', currency: 'USD' } },
        outcome: null,
        closure: null,
      });
      expect(
        (
          await h.ctx.sql.query(
            `SELECT 1 FROM audit_events WHERE action = 'INVOICE_DISCREPANCY.OPENED' AND resource_id = $1`,
            [rows[0].id],
          )
        ).rowCount,
      ).toBe(1);
    });

    it('names what differs: the price of one, or the count and the price together', async () => {
      const dearer = await signed(
        await submitted(
          { subscriptionId: await subscription() },
          { unitPriceOriginal: { amount: '16', currency: 'USD' } },
        ),
      );
      const both = await signed(
        await submitted(
          { subscriptionId: await subscription() },
          { quantity: 9, unitPriceOriginal: { amount: '16', currency: 'USD' } },
        ),
      );

      expect((await caseRows(dearer))[0].mismatches).toEqual(['UNIT_PRICE']);
      expect((await caseRows(both))[0].mismatches).toEqual(['QUANTITY', 'UNIT_PRICE']);
    });

    it('opens one for the invoice of a request that is for more seats than were approved, and for a subscription of the shared pool', async () => {
      const { requestId } = await approved();
      const ofRequest = await signed(await submitted({ requestId }, { quantity: 2 }));
      const ofPool = await signed(await submitted({ subscriptionId: await subscription(true) }, { quantity: 11 }));

      expect((await wireOf(ofRequest)).quantity).toEqual({ invoice: 2, expected: 1 });
      expect((await wireOf(ofPool)).quantity).toEqual({ invoice: 11, expected: 10 });
    });

    it('opens none for an invoice that is returned, and none is written when the signature is refused', async () => {
      const returned = await submitted({ subscriptionId: await subscription() }, { quantity: 12 });
      await purchases('post', `/${returned}/return`, h.finance).send({ reason: 'Thiếu thuế' }).expect(201);
      const own = await submitted({ subscriptionId: await subscription() }, { quantity: 12 });
      await purchases('post', `/${own}/confirmation`, h.it1).expect(403);

      expect(await caseRows(returned)).toEqual([]);
      expect(await caseRows(own)).toEqual([]);
    });
  });

  describe('reading', () => {
    it('lists the cases newest first, filters by state and outcome, and pages with a total that does not move', async () => {
      const first = await opened();
      const second = await opened();
      await close(second.wire.id, {
        outcome: 'EXPLAINED',
        reason: 'Mua thêm hợp lệ',
        differenceAmount: { amount: '0' },
      }).expect(201);

      const all = h.dataOf<Page>(await cases('get', '?pageSize=100', h.finance).expect(200));
      const open = h.dataOf<Page>(await cases('get', '?state=OPEN&pageSize=100', h.finance).expect(200));
      const explained = h.dataOf<Page>(await cases('get', '?outcome=EXPLAINED&pageSize=100', h.finance).expect(200));
      const ids = all.items.map((item) => item.id);

      expect(ids.indexOf(second.wire.id)).toBeLessThan(ids.indexOf(first.wire.id));
      expect(open.items.map((item) => item.id)).toContain(first.wire.id);
      expect(open.items.map((item) => item.id)).not.toContain(second.wire.id);
      expect(explained.items.map((item) => item.id)).toContain(second.wire.id);
      expect(explained.items.every((item) => item.outcome === 'EXPLAINED')).toBe(true);
      const page = h.dataOf<Page>(await cases('get', '?pageSize=1&page=2', h.finance).expect(200));
      expect(page.items).toHaveLength(1);
      expect(page.pagination).toMatchObject({ page: 2, pageSize: 1, totalItems: all.pagination.totalItems });
      await cases('get', '?pageSize=101', h.finance).expect(422);
    });

    it('shows an IT Admin the cases of the invoices they submitted and of the requests of their departments, and not the others (D8)', async () => {
      const { wire } = await opened();

      const mine = h.dataOf<Page>(await cases('get', '?pageSize=100', h.it1).expect(200));
      const theirs = h.dataOf<Page>(await cases('get', '?pageSize=100', it2).expect(200));

      expect(mine.items.map((item) => item.id)).toContain(wire.id);
      expect(theirs.items.map((item) => item.id)).not.toContain(wire.id);
      await cases('get', `/${wire.id}`, h.it1).expect(200);
      expect(code(await cases('get', `/${wire.id}`, it2).expect(404))).toBe('INVOICE_DISCREPANCY.NOT_FOUND');
      expect(code(await cases('get', `/${randomUUID()}`, h.finance).expect(404))).toBe('INVOICE_DISCREPANCY.NOT_FOUND');
      await cases('get', '', h.boss.account).expect(403);
    });

    it('runs the same number of statements whatever the number of cases', async () => {
      await opened();
      const statementsOf = async () =>
        dataStatements((await counter.run(async () => cases('get', '?pageSize=100', h.finance).expect(200))).statements)
          .length;
      const before = await statementsOf();
      const rowsBefore = h.dataOf<Page>(await cases('get', '?pageSize=100', h.finance).expect(200)).items.length;

      await opened();
      await opened({ unitPriceOriginal: { amount: '16', currency: 'USD' } });

      const rowsAfter = h.dataOf<Page>(await cases('get', '?pageSize=100', h.finance).expect(200)).items.length;
      expect(rowsAfter).toBe(rowsBefore + 2);
      expect(await statementsOf()).toBe(before);
    });
  });

  describe('closing', () => {
    it('closes with an explanation, a reason and the difference, keeps who and when, and leaves the money of the invoice where it was', async () => {
      const { purchaseId, wire } = await opened();
      const before = await h.ctx.sql.query(
        `SELECT actual_cost_minor::text FROM invoices WHERE purchase_invoice_id = $1`,
        [purchaseId],
      );

      const closed = h.dataOf<Wire>(
        await close(wire.id, {
          outcome: 'EXPLAINED',
          reason: '  Hai chỗ mua thêm cho nhóm mới  ',
          differenceAmount: { amount: '640000' },
        }).expect(201),
      );

      expect(closed).toMatchObject({
        id: wire.id,
        state: 'CLOSED',
        outcome: 'EXPLAINED',
        closure: {
          outcome: 'EXPLAINED',
          reason: 'Hai chỗ mua thêm cho nhóm mới',
          differenceAmount: { amount: '640000', currency: 'VND' },
          closedBy: { employeeId: h.finance.employeeId },
        },
      });
      expect(
        (
          await h.ctx.sql.query(`SELECT actual_cost_minor::text FROM invoices WHERE purchase_invoice_id = $1`, [
            purchaseId,
          ])
        ).rows,
      ).toEqual(before.rows);
      expect(
        (
          await h.ctx.sql.query(
            `SELECT 1 FROM audit_events WHERE action = 'INVOICE_DISCREPANCY.CLOSED' AND resource_id = $1`,
            [wire.id],
          )
        ).rowCount,
      ).toBe(1);
    });

    it('closes a suspicion that the software was paid for outside the process, with the difference above nothing', async () => {
      const { wire } = await opened();

      const closed = h.dataOf<Wire>(
        await close(wire.id, {
          outcome: 'OUT_OF_PROCESS_SUSPECTED',
          reason: 'Hai chỗ không có đề nghị nào',
          differenceAmount: { amount: '640000' },
        }).expect(201),
      );

      expect(closed).toMatchObject({ state: 'CLOSED', outcome: 'OUT_OF_PROCESS_SUSPECTED' });
    });

    it('closes once: a second closing is refused, and two at once close it once', async () => {
      const { wire } = await opened();
      const body = { outcome: 'EXPLAINED', reason: 'Mua thêm hợp lệ', differenceAmount: { amount: '0' } };

      const answers = await Promise.all([close(wire.id, body), close(wire.id, body)]);

      expect(answers.map((answer) => answer.status).sort()).toEqual([201, 409]);
      expect(code(answers.find((answer) => answer.status === 409) as request.Response)).toBe(
        'INVOICE_DISCREPANCY.ALREADY_CLOSED',
      );
      expect(code(await close(wire.id, body).expect(409))).toBe('INVOICE_DISCREPANCY.ALREADY_CLOSED');
      expect(
        (
          await h.ctx.sql.query(
            `SELECT 1 FROM audit_events WHERE action = 'INVOICE_DISCREPANCY.CLOSED' AND resource_id = $1`,
            [wire.id],
          )
        ).rowCount,
      ).toBe(1);
    });

    it('refuses a closing with no reason, a difference below nothing, a suspicion with none, and what Finance alone may do', async () => {
      const { wire } = await opened();
      const body = { outcome: 'EXPLAINED', reason: 'ok', differenceAmount: { amount: '0' } };

      await close(wire.id, { ...body, reason: '   ' }).expect(422);
      await close(wire.id, { ...body, reason: undefined }).expect(422);
      await close(wire.id, { ...body, outcome: 'FALSE_ALARM' }).expect(422);
      await close(wire.id, { ...body, differenceAmount: undefined }).expect(422);
      await close(wire.id, { ...body, differenceAmount: { amount: 'abc' } }).expect(422);
      expect(code(await close(wire.id, { ...body, differenceAmount: { amount: '-1' } }).expect(422))).toBe(
        'INVOICE_DISCREPANCY.DIFFERENCE_INVALID',
      );
      expect(code(await close(wire.id, { ...body, outcome: 'OUT_OF_PROCESS_SUSPECTED' }).expect(422))).toBe(
        'INVOICE_DISCREPANCY.DIFFERENCE_INVALID',
      );
      await close(wire.id, body, h.it1).expect(403);
      expect(code(await close(randomUUID(), body).expect(404))).toBe('INVOICE_DISCREPANCY.NOT_FOUND');
      expect(
        (
          await wireOf(
            (
              await h.ctx.sql.query<{ id: string }>(
                `SELECT purchase_invoice_id AS id FROM invoice_discrepancy_cases WHERE id = $1`,
                [wire.id],
              )
            ).rows[0].id,
          )
        ).state,
      ).toBe('OPEN');
    });
  });

  describe('sending a suspicion on (RC-1.2, R-29)', () => {
    const suspicion = {
      outcome: 'OUT_OF_PROCESS_SUSPECTED',
      reason: 'Hai chỗ không có đề nghị nào',
      differenceAmount: { amount: '640000' },
    };
    const heardOf = (caseId: string) => heard.filter((event) => event.caseId === caseId);

    it('tells the extension point once, in the closing, with both sides of what differs and the money Finance could not account for', async () => {
      const { purchaseId, wire } = await opened({ quantity: 12 });

      await close(wire.id, suspicion).expect(201);

      const [event, ...rest] = heardOf(wire.id);
      expect(rest).toEqual([]);
      expect(event).toMatchObject({
        caseId: wire.id,
        purchaseInvoiceId: purchaseId,
        requestId: null,
        mismatches: ['QUANTITY'],
        quantity: { invoice: 12, expected: 10 },
        unitPrice: {
          invoice: { amountMinor: 1500n, currency: 'USD' },
          expected: { amountMinor: 1500n, currency: 'USD' },
        },
        differenceMinor: 640000n,
        reason: suspicion.reason,
        closedByEmployeeId: h.finance.employeeId,
      });
      expect(typeof event.vendorId).toBe('string');
      expect(typeof event.subscriptionId).toBe('string');
    });

    it('tells it nothing for an explanation', async () => {
      const { wire } = await opened();

      await close(wire.id, {
        outcome: 'EXPLAINED',
        reason: 'Mua thêm hợp lệ',
        differenceAmount: { amount: '0' },
      }).expect(201);

      expect(heardOf(wire.id)).toEqual([]);
    });

    it('is undone with the closing when the listener refuses: the case stays open and nothing is audited, and it closes once the listener agrees', async () => {
      const { wire } = await opened();
      refuse = true;
      try {
        await close(wire.id, suspicion).expect(500);
      } finally {
        refuse = false;
      }

      expect(h.dataOf<Wire>(await cases('get', `/${wire.id}`, h.finance).expect(200))).toMatchObject({
        state: 'OPEN',
        closure: null,
      });
      expect(
        (
          await h.ctx.sql.query(
            `SELECT 1 FROM audit_events WHERE action = 'INVOICE_DISCREPANCY.CLOSED' AND resource_id = $1`,
            [wire.id],
          )
        ).rowCount,
      ).toBe(0);
      expect(heardOf(wire.id)).toEqual([]);
      await close(wire.id, suspicion).expect(201);
      expect(heardOf(wire.id)).toHaveLength(1);
    });
  });
});
