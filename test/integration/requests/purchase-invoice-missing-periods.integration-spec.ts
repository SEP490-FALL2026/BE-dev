import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { ApiAccount } from '../../support/api-accounts';
import { GroupHarness } from '../../support/group-harness';
import { k1Checklist } from '../../support/k1-checklist';
import { PgRelay } from '../../support/pg-relay';
import { pretendBusinessToday } from '../../support/pretend-today';
import { dataStatements, QueryCounter } from '../../support/query-count';
import { handOthersToSecondItAdmin } from '../../support/second-it-admin';
import type { Unit } from '../../support/spend-harness';

const h = new GroupHarness();
const M = 1_000_000;

interface MissingWire {
  linkKind: string;
  requestId: string | null;
  subscriptionId: string | null;
  label: string;
  servicePeriodMonth: string;
  periodIndex: number | null;
  periodCount: number | null;
  paymentDate: string;
  dueDate: string;
  plan: { planId: string; planName: string; applicationName: string; logoUrl: string | null };
  department: { id: string; name: string };
}
interface Page {
  items: MissingWire[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

/**
 * The periods of a right paid by the month or the year that have no invoice (`PI-2`, `QĐ-111x`, `R-30`, T-PI): a `K1` right that a request
 * granted on Tuesday 10/11/2026 pays on the 10th, its invoice is due the fifth working day after (Tuesday 17/11) and the period carries the mark
 * from 18/11, not on 17/11; an invoice that was returned does not count; a subscription a department owns is paid by its cycle. On real
 * PostgreSQL, through the route, with the day the organization is on pretended.
 */
describe('the periods that have no invoice over PostgreSQL (PI-2, T-PI)', () => {
  let relay: PgRelay;
  let counter: QueryCounter;
  let k1Subscription: string;
  let k1: string;
  let it2: ApiAccount;
  let serial = 0;
  let numbers = 0;

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
    k1Subscription = await h.subscription(20, 'K1');
    k1 = await h.planOf(k1Subscription);
  }, 240000);

  afterAll(async () => {
    await h.stop();
    await relay?.stop();
  });

  afterEach(() => jest.restoreAllMocks());

  const day = (date: string) => pretendBusinessToday(h.ctx.app, date);
  const missing = (account: ApiAccount, query: Record<string, string | number> = {}) =>
    request(h.server()).get('/api/v1/purchase-invoices/missing-periods').query(query).set(h.as(account));
  const periods = async (account: ApiAccount, query: Record<string, string | number> = {}) =>
    h.dataOf<Page>(await missing(account, query).expect(200));
  const ofRequest = async (account: ApiAccount, requestId: string) =>
    (await periods(account, { pageSize: 100 })).items.filter((row) => row.requestId === requestId);
  const ofSubscription = async (account: ApiAccount, subscriptionId: string) =>
    (await periods(account, { pageSize: 100 })).items.filter((row) => row.subscriptionId === subscriptionId);

  /** A department the IT Admin `it1` works, with a budget. */
  const unit = async (): Promise<Unit> => {
    serial += 1;
    const made = await h.departmentWithHead(`P-MP${serial}`);
    await h.setItAdminInCharge(made.department, { employeeId: h.it1.employeeId, account: h.it1 });
    await h.budgetFor(made, { total: 100 * M });

    return made;
  };
  /**
   * A request for a `K1` right of `months` months of use that the IT Admin granted to one person and completed: the grant is real, then the day
   * it was completed is put on `grantedAt`. The seat ends after the months of use counted from the day the suite runs, never before 2026-11-15, so
   * a day the suite pretends within `months` months of 2026-11-15 finds the seat held.
   */
  const granted = async (u: Unit, months: number, grantedAt: string): Promise<string> => {
    const id = await h.waitingForApprover(u, k1, { amount: months * M });
    await h.ctx.sql.query(`UPDATE access_requests SET term_months = $2, expected_end_date = NULL WHERE id = $1`, [
      id,
      months,
    ]);
    await h.decideSpend(id, { decision: 'APPROVE' }, h.boss.account).expect(200);
    const task = h.dataOf<{ task: { id: string } }>(
      await h.grantLine({ requestId: id, subscriptionId: k1Subscription }, h.it1).expect(201),
    ).task;
    await h.claim(task.id).expect(200);
    await h
      .complete(task.id, { evidence: 'Registered on the work email', k1Checklist: k1Checklist('GRANT') })
      .expect(200);
    await h.ctx.sql.query(`UPDATE access_requests SET grant_completed_at = $2 WHERE id = $1`, [id, grantedAt]);

    return id;
  };
  /** A finished upload of a purchase document by `it1`. */
  const document = async (): Promise<string> => {
    const id = randomUUID();
    numbers += 1;
    await h.ctx.sql.query(
      `INSERT INTO document_attachments (id, organization_id, purpose, status, file_name, content_type, size_bytes, object_key,
         final_object_key, uploaded_by_app_user_id)
       VALUES ($1, $2, 'PURCHASE_DOCUMENT'::"DocumentPurpose", 'PENDING_ATTACH', 'hoa-don.pdf', 'application/pdf', 1000, $3, $4, $5)`,
      [
        id,
        h.seed.organizationId,
        `documents/mp/${numbers}-${id}`,
        `documents/mp/kept-${numbers}-${id}`,
        h.it1.appUserId,
      ],
    );

    return id;
  };
  /** The invoice of one month that `it1` submits for a request or a subscription. */
  const submitted = async (link: { requestId: string } | { subscriptionId: string }, month: string) => {
    numbers += 1;
    const response = await request(h.server())
      .post('/api/v1/purchase-invoices')
      .set(h.as(h.it1))
      .send({
        link,
        vendorInvoiceNumber: `MP-${numbers}`,
        issuedOn: `${month}-11`,
        servicePeriodMonth: month,
        quantity: 1,
        unitPriceOriginal: { amount: '1000000', currency: 'VND' },
        netAmount: { amount: '1000000' },
        paymentSource: 'COMPANY_CARD',
        documentIds: [await document()],
      })
      .expect(201);

    return h.dataOf<{ id: string }>(response).id;
  };
  const returned = (id: string) =>
    h.ctx.sql.query(
      `UPDATE purchase_invoices SET state = 'RETURNED', decided_by_employee_id = $2, decided_at = now(), return_reason = 'Thiếu thuế' WHERE id = $1`,
      [id, h.finance.employeeId],
    );

  it('marks a payment of 10/11/2026 from 18/11, the day after its fifth working day, and not on 17/11 (T-PI)', async () => {
    const requestId = await granted(await unit(), 3, '2026-11-10T10:00:00Z');

    day('2026-11-17');
    expect(await ofRequest(h.it1, requestId)).toEqual([]);

    day('2026-11-18');
    const [row, ...rest] = await ofRequest(h.it1, requestId);
    expect(rest).toEqual([]);
    expect(row).toMatchObject({
      linkKind: 'REQUEST',
      subscriptionId: null,
      label: 'NEW_PURCHASE',
      servicePeriodMonth: '2026-11',
      periodIndex: 1,
      periodCount: 3,
      paymentDate: '2026-11-10',
      dueDate: '2026-11-17',
      plan: { planId: k1 },
    });
    expect(row.plan.applicationName).toEqual(expect.any(String));
    expect(row.department.name).toEqual(expect.any(String));
    expect(await ofRequest(h.finance, requestId)).toEqual([row]);
  });

  it('marks each month that has passed its due day with no invoice, the oldest first, and no month after the months of use', async () => {
    const requestId = await granted(await unit(), 2, '2026-11-10T10:00:00Z');

    // The payment of 10/01/2027 would be a third month of use: it is not one.
    day('2027-01-09');
    const rows = await ofRequest(h.it1, requestId);

    expect(
      rows.map((row) => [row.servicePeriodMonth, row.paymentDate, row.dueDate, row.label, row.periodIndex]),
    ).toEqual([
      ['2026-11', '2026-11-10', '2026-11-17', 'NEW_PURCHASE', 1],
      ['2026-12', '2026-12-10', '2026-12-17', 'NEW_PURCHASE', 2],
    ]);
  });

  it('takes the mark off when the invoice of the month is submitted, and puts it back when Finance returns it', async () => {
    const requestId = await granted(await unit(), 3, '2026-11-10T10:00:00Z');
    day('2026-12-20');
    expect((await ofRequest(h.it1, requestId)).map((row) => row.servicePeriodMonth)).toEqual(['2026-11', '2026-12']);

    const invoice = await submitted({ requestId }, '2026-11');
    expect((await ofRequest(h.it1, requestId)).map((row) => row.servicePeriodMonth)).toEqual(['2026-12']);

    await returned(invoice);
    expect((await ofRequest(h.it1, requestId)).map((row) => row.servicePeriodMonth)).toEqual(['2026-11', '2026-12']);
  });

  it('shows an IT Admin the periods of the departments they work and not the others, Finance every one, and counts them on the overview', async () => {
    const requestId = await granted(await unit(), 1, '2026-11-10T10:00:00Z');
    day('2026-11-20');

    expect(await ofRequest(h.it1, requestId)).toHaveLength(1);
    expect(await ofRequest(it2, requestId)).toEqual([]);
    expect(await ofRequest(h.finance, requestId)).toHaveLength(1);

    const total = (await periods(h.it1)).pagination.totalItems;
    const overview = h.dataOf<{
      sections: { missingInvoicePeriods: { state: string; count: number; sourceOperationId: string } };
    }>(await request(h.server()).get('/api/v1/dashboards/it-admin').set(h.as(h.it1)).expect(200));
    expect(overview.sections.missingInvoicePeriods).toEqual({
      state: 'COUNTED',
      count: total,
      sourceOperationId: 'purchaseInvoiceMissingPeriodList',
      reason: null,
    });
  });

  it('follows the cycle of a subscription a department owns from the day the system came to know it, and counts a submitted invoice of a month', async () => {
    const u = await unit();
    const owned = await h.subscription(10, 'K2', u.department.id);
    // Known since 01/10/2026: the payments are the 5th of each month (start 05/01, by the month); the months before are not its to answer for.
    await h.ctx.sql.query(`UPDATE subscriptions SET created_at = '2026-10-01T03:00:00Z' WHERE id = $1`, [owned]);

    day('2026-12-14');
    expect(
      (await ofSubscription(h.it1, owned)).map((row) => [
        row.servicePeriodMonth,
        row.paymentDate,
        row.dueDate,
        row.label,
      ]),
    ).toEqual([
      ['2026-10', '2026-10-05', '2026-10-12', 'RENEWAL'],
      ['2026-11', '2026-11-05', '2026-11-12', 'RENEWAL'],
      ['2026-12', '2026-12-05', '2026-12-11', 'RENEWAL'],
    ]);

    await submitted({ subscriptionId: owned }, '2026-11');
    expect((await ofSubscription(h.it1, owned)).map((row) => row.servicePeriodMonth)).toEqual(['2026-10', '2026-12']);
    expect(await ofSubscription(it2, owned)).toEqual([]);
  });

  it('pages the periods with a total that does not move and an order with no tie', async () => {
    day('2026-12-14');
    const all = (await periods(h.finance, { pageSize: 100 })).items;
    expect(all.length).toBeGreaterThan(2);

    const first = await periods(h.finance, { page: 1, pageSize: 2 });
    const second = await periods(h.finance, { page: 2, pageSize: 2 });

    expect(first.pagination).toMatchObject({ page: 1, pageSize: 2, totalItems: all.length });
    expect(first.items).toEqual(all.slice(0, 2));
    expect(second.items).toEqual(all.slice(2, 4));
    const keys = all.map((row) => `${row.dueDate}|${row.requestId ?? row.subscriptionId}|${row.servicePeriodMonth}`);
    expect(keys).toEqual([...keys].sort());
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('runs the same number of statements whatever the number of periods', async () => {
    await granted(await unit(), 3, '2026-11-02T10:00:00Z');
    await granted(await unit(), 3, '2026-11-03T10:00:00Z');
    day('2026-12-14');
    const statementsOf = async () =>
      dataStatements((await counter.run(async () => missing(h.finance, { pageSize: 100 }).expect(200))).statements)
        .length;
    const before = await statementsOf();
    const rowsBefore = (await periods(h.finance, { pageSize: 100 })).items.length;

    // Three more requests and a subscription, made on the real day and read on the pretended one: more rows, the same statements.
    jest.restoreAllMocks();
    await granted(await unit(), 3, '2026-11-04T10:00:00Z');
    await granted(await unit(), 3, '2026-11-05T10:00:00Z');
    const last = await unit();
    await granted(last, 3, '2026-11-06T10:00:00Z');
    const more = await h.subscription(10, 'K2', last.department.id);
    await h.ctx.sql.query(`UPDATE subscriptions SET created_at = '2026-10-01T03:00:00Z' WHERE id = $1`, [more]);
    day('2026-12-14');
    const rowsAfter = (await periods(h.finance, { pageSize: 100 })).items.length;

    expect(rowsAfter).toBeGreaterThan(rowsBefore + 5);
    expect(await statementsOf()).toBe(before);
  });
});
