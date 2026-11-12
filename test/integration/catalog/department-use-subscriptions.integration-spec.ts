import request from 'supertest';
import { OrganizationApi } from '../../../src/modules/organization/public/organization.api';
import { OrganizationReadApi } from '../../../src/modules/organization/public/organization-read.api';
import { SeatHarness } from '../../support/seat-baseline-harness';

const h = new SeatHarness();

/**
 * F15 (`QĐ-90e`, spec B): the catalog tells the organization which subscriptions and purchases a department owns that still owe a
 * future payment, so that it cannot be retired while they do. A term is over when its end date has passed and it does not renew
 * itself; a perpetual purchase blocks only while a seat of it is held. Read through `OrganizationApi.getDepartmentUse`, the way
 * retiring a department reads it, on real PostgreSQL.
 */
describe('what keeps a department in use: its subscriptions and purchases (integration, F15)', () => {
  let today: string;
  let owner: { id: string; code: string };
  let nothing: { id: string; code: string };
  const live: string[] = [];

  const use = (departmentId: string, limit = 50) =>
    h.ctx.app.get(OrganizationApi, { strict: false }).getDepartmentUse(departmentId, today, limit);
  const days = (offset: number): string => {
    const date = new Date(`${today}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + offset);

    return date.toISOString().slice(0, 10);
  };
  const set = (id: string, columns: string) =>
    h.ctx.sql.query(`UPDATE subscriptions SET ${columns} WHERE id = $1`, [id]);

  /** A perpetual purchase of licensed software owned by the department (the plan is a K4 one, which the purchase does not need granted). */
  const perpetual = async (departmentId: string): Promise<string> => {
    const application = h.dataOf<{ id: string }>(
      await request(h.server())
        .post('/api/v1/applications')
        .set(h.as(h.it1))
        .send({
          name: h.unique('Office'),
          kind: 'LICENSED',
          vendorName: h.unique('Vendor'),
          dataSensitivity: 'LOW',
          communication: { personToPersonMessaging: false, callsOrMeetings: false, mailbox: false },
        })
        .expect(201),
    );
    const planId = h.dataOf<{ id: string }>(
      await request(h.server())
        .post('/api/v1/plans')
        .set(h.as(h.it1))
        .send({
          applicationId: application.id,
          name: h.unique('Plan'),
          provisioningType: 'K4',
          pricingModel: 'PER_SEAT',
          controlLevel: 'FULL',
        })
        .expect(201),
    ).id;

    return h.dataOf<{ id: string }>(
      await request(h.server())
        .post('/api/v1/subscriptions')
        .set(h.as(h.it1))
        .send({
          ownerDepartmentId: departmentId,
          planId,
          kind: 'PERPETUAL',
          purchasedQuantity: 3,
          unitPrice: { amount: '5000000', currency: 'VND' },
          startDate: '2026-01-05',
          responsibleItAdminEmployeeId: h.it1.employeeId,
        })
        .expect(201),
    ).id;
  };
  /** A personal seat on the purchase, written by SQL as the queue would leave it, over the given days. */
  const seat = async (subscriptionId: string, person: string, validFrom: string, validUntil: string | null) => {
    await h.ctx.sql.query(
      `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id, account_identifier,
         normalized_account_identifier, valid_from, valid_from_basis, valid_until, created_by_app_user_id)
       SELECT gen_random_uuid(), s.organization_id, 'PERSONAL', 'REQUEST', s.plan_id, s.id, $2, $3, $3, $4::date, 'ACTUAL', $5::date,
              gen_random_uuid()
         FROM subscriptions s WHERE s.id = $1`,
      [subscriptionId, await h.person(person), `${person.toLowerCase()}@acme.vn`, validFrom, validUntil],
    );
  };

  beforeAll(async () => {
    await h.start();
    today = await h.ctx.app.get(OrganizationReadApi, { strict: false }).businessToday();
    owner = await h.bareDepartment();
    nothing = await h.bareDepartment();

    // What keeps it in use: a term with no end date, one whose end has not come, one past its end that renews itself, and a purchase that holds a seat.
    live.push(await h.subscription(5, 'K2', owner.id));
    const later = await h.subscription(5, 'K2', owner.id);
    await set(later, `end_date = '${days(30)}'`);
    live.push(later);
    const renewing = await h.subscription(5, 'K2', owner.id);
    await set(renewing, `start_date = '2019-01-01', end_date = '2020-01-01', auto_renew = true`);
    live.push(renewing);
    const held = await perpetual(owner.id);
    await seat(held, 'E-USE1', '2026-01-05', null);
    live.push(held);

    // What does not: a term that is over, a purchase with no seat, and one whose only seat ended.
    const over = await h.subscription(5, 'K2', owner.id);
    await set(over, `start_date = '2019-01-01', end_date = '2020-01-01'`);
    await perpetual(owner.id);
    const ended = await perpetual(owner.id);
    await seat(ended, 'E-USE2', '2026-01-05', '2026-02-01');
    // And a term that is over in a department that owns nothing else.
    const elsewhere = await h.subscription(5, 'K2', nothing.id);
    await set(elsewhere, `start_date = '2019-01-01', end_date = '2020-01-01'`);
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  it('lists the subscriptions and purchases that still owe a payment, by id, with a label that holds no figure and no person', async () => {
    const { subscriptions } = await use(owner.id);

    expect(subscriptions.total).toBe(4);
    expect(subscriptions.items.map((item) => item.id)).toEqual([...live].sort());
    for (const item of subscriptions.items) {
      expect(item.kind).toBe('SUBSCRIPTION');
      expect(item.label).toMatch(/ \/ /);
      expect(item.label).not.toMatch(/\d{4,}|@/);
    }
  });

  it('does not count a term that is over, a purchase with no seat left, or one whose seat has ended', async () => {
    const ids = (await use(owner.id)).subscriptions.items.map((item) => item.id);

    const stored = await h.ctx.sql.query<{ id: string }>(
      `SELECT id FROM subscriptions WHERE owner_department_id = $1 AND id <> ALL($2::uuid[])`,
      [owner.id, live],
    );
    expect(stored.rows).toHaveLength(3);
    for (const row of stored.rows) expect(ids).not.toContain(row.id);
  });

  it('answers nothing for a department that owns nothing that is owed, even when it owns a term that is over', async () => {
    expect((await use(nothing.id)).subscriptions).toEqual({ items: [], total: 0 });
  });

  it('is bounded: a page shorter than the total names the first by id and still counts them all', async () => {
    const { subscriptions } = await use(owner.id, 2);

    expect(subscriptions.total).toBe(4);
    expect(subscriptions.items.map((item) => item.id)).toEqual([...live].sort().slice(0, 2));
    expect((await use(owner.id, 0)).subscriptions).toMatchObject({ items: [], total: 4 });
  });

  it('lets a term go once its end has passed and it no longer renews itself: switching the renewal off ends the obligation', async () => {
    await h.ctx.sql.query(`UPDATE subscriptions SET auto_renew = false WHERE id = $1`, [live[2]]);

    const { subscriptions } = await use(owner.id);

    expect(subscriptions.total).toBe(3);
    expect(subscriptions.items.map((item) => item.id)).not.toContain(live[2]);
  });
});
