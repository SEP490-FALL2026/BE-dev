import request from 'supertest';
import { addDays } from '../../../src/core/business-date';
import type { ApiAccount } from '../../support/api-accounts';
import { declareSubscription } from '../../support/builders/catalog.builder';
import { ProvisioningHarness } from '../../support/provisioning-harness';

const h = new ProvisioningHarness();

interface Row {
  id: string;
  applicationName: string;
  logoUrl: string | null;
  kind: string;
  expiry: 'SOON' | 'EXPIRED' | null;
  daysLeft: number | null;
  deadlineKind: string | null;
  seats: { purchased: number | null; assigned: number; free: number | null; inRevocation: number } | null;
  responsibleItAdmin: { employeeId: string; employeeCode: string; fullName: string } | null;
  createdAt: string;
}
interface Page {
  items: Row[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

/**
 * The subscriptions an IT Admin has to adjust (`QĐ-111o`) over HTTP on real PostgreSQL: the list that is near or past the point of
 * adjustment (a plan by the month 7 days before its payment day, a plan by the year 30 days before the deadline to cancel), the ones the
 * IT Admin answers for, and on each row the days left, the seats of a shared pool and who answers. A purchase made once never enters.
 */
describe('the subscriptions near or past their adjustment point, over HTTP (integration, real PostgreSQL)', () => {
  let designer: string;
  let itTwo: string;
  let itTwoAccount: ApiAccount;
  let counter = 0;
  let today = '';
  const ids: Record<string, string> = {};

  const get = (query: Record<string, string | number> = { pageSize: 100 }, account: ApiAccount = h.it1) =>
    request(h.server()).get('/api/v1/subscriptions').query(query).set(h.as(account));
  const pageOf = async (query: Record<string, string | number> = { pageSize: 100 }, account: ApiAccount = h.it1) =>
    h.dataOf<Page>(await get(query, account).expect(200));
  const idsOf = async (query: Record<string, string | number>, account: ApiAccount = h.it1) =>
    (await pageOf({ pageSize: 100, ...query }, account)).items.map((row) => row.id);
  const rowOf = async (id: string, query: Record<string, string | number> = {}) =>
    (await pageOf({ pageSize: 100, ...query })).items.find((row) => row.id === id);

  const declare = async (body: Record<string, unknown>): Promise<string> =>
    declareSubscription(h.ctx, h.it1.accessToken, {
      planId: await h.plan('K2'),
      kind: 'TERM',
      unitPrice: { amount: '1000000', currency: 'VND' },
      startDate: '2026-01-05',
      purchasedQuantity: 5,
      ...body,
    });
  const byTheMonth = (body: Record<string, unknown> = {}) => declare({ billingCycle: 'MONTHLY', ...body });
  const byTheYear = (body: Record<string, unknown> = {}) => declare({ billingCycle: 'ANNUAL', ...body });
  const holdSeats = async (subscriptionId: string, count: number): Promise<void> => {
    const planId = await h.planOf(subscriptionId);
    for (let index = 0; index < count; index += 1) {
      counter += 1;
      await h.granted(await h.member('P-DES', `E-X${counter}`, designer), planId, { subscriptionId });
    }
  };

  beforeAll(async () => {
    await h.start();
    today = h.today();
    designer = await h.jobTitle('Designer');
    itTwo = await h.person('E-A1');
    itTwoAccount = await h.account('E-A1', itTwo, 'IT_ADMIN');
    await h.department('P-DES', itTwo);

    ids.paymentSoon = await byTheMonth({ renewalDate: addDays(today, 5) });
    ids.paymentFar = await byTheMonth({ renewalDate: addDays(today, 20) });
    ids.paymentUnknown = await byTheMonth();
    ids.noticeSoon = await byTheYear({ noticeDeadline: addDays(today, 25), renewalDate: addDays(today, 40) });
    ids.noticeFar = await byTheYear({ noticeDeadline: addDays(today, 90), renewalDate: addDays(today, 120) });
    ids.pastWithSeat = await byTheMonth({ renewalDate: addDays(today, -3) });
    ids.pastNoSeat = await byTheMonth({ renewalDate: addDays(today, -3) });
    ids.once = await h.subscription(3, 'K4');
    await holdSeats(ids.paymentSoon, 2);
    await holdSeats(ids.pastWithSeat, 1);
    await request(h.server())
      .patch(`/api/v1/subscriptions/${ids.noticeSoon}`)
      .set(h.as(h.it1))
      .send({ responsibleItAdminEmployeeId: itTwo })
      .expect(200);
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  describe('expiry=SOON', () => {
    it('lists from the point of adjustment to the day of the deadline, with the days left and what they count to', async () => {
      const soon = await pageOf({ expiry: 'SOON', pageSize: 100 });

      expect(soon.items.map((row) => row.id).sort()).toEqual([ids.paymentSoon, ids.noticeSoon].sort());
      expect(await rowOf(ids.paymentSoon, { expiry: 'SOON' })).toMatchObject({
        expiry: 'SOON',
        daysLeft: 5,
        deadlineKind: 'PAYMENT_DATE',
      });
      expect(await rowOf(ids.noticeSoon, { expiry: 'SOON' })).toMatchObject({
        expiry: 'SOON',
        daysLeft: 25,
        deadlineKind: 'NOTICE_DEADLINE',
      });
    });

    it('leaves out what is still far, what has no date to count from and a purchase made once', async () => {
      const soon = await idsOf({ expiry: 'SOON' });

      expect(soon).not.toContain(ids.paymentFar);
      expect(soon).not.toContain(ids.paymentUnknown);
      expect(soon).not.toContain(ids.noticeFar);
      expect(soon).not.toContain(ids.once);
    });
  });

  describe('expiry=EXPIRED', () => {
    it('lists what is past its deadline while seats are still held, with the days past as negative days left', async () => {
      const expired = await idsOf({ expiry: 'EXPIRED' });

      expect(expired).toEqual([ids.pastWithSeat]);
      expect(await rowOf(ids.pastWithSeat, { expiry: 'EXPIRED' })).toMatchObject({
        expiry: 'EXPIRED',
        daysLeft: -3,
        deadlineKind: 'PAYMENT_DATE',
      });
    });

    it('does not list what is past its deadline when nobody holds a seat any more: nothing is left to adjust', async () => {
      expect(await idsOf({ expiry: 'EXPIRED' })).not.toContain(ids.pastNoSeat);
      expect(await rowOf(ids.pastNoSeat)).toMatchObject({ expiry: null, daysLeft: -3 });
    });
  });

  describe('the rows', () => {
    it('say nothing of expiry when no filter is asked and a row is not near its point', async () => {
      expect(await rowOf(ids.paymentFar)).toMatchObject({ expiry: null, daysLeft: 20 });
      expect(await rowOf(ids.once)).toMatchObject({ expiry: null, daysLeft: null, deadlineKind: null });
    });

    it('carry the seats of a shared pool: bought, held, free, and under revocation; none for a purchase made once', async () => {
      expect((await rowOf(ids.paymentSoon))?.seats).toEqual({ purchased: 5, assigned: 2, free: 3, inRevocation: 0 });
      expect((await rowOf(ids.once))?.seats).toBeNull();
    });

    it('name who answers for the subscription and when it was created', async () => {
      const row = await rowOf(ids.noticeSoon);

      expect(row?.responsibleItAdmin).toEqual({
        employeeId: itTwo,
        employeeCode: 'E-A1',
        fullName: expect.any(String) as string,
      });
      expect(Number.isNaN(Date.parse(row?.createdAt ?? ''))).toBe(false);
    });

    it('carry the logo of the application, null when none is set', async () => {
      expect((await rowOf(ids.paymentSoon))?.logoUrl).toBeNull();

      await h.ctx.sql.query(
        `UPDATE applications SET logo_url = 'https://cdn.example.com/soon.png'
          WHERE id = (SELECT p.application_id FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.id = $1)`,
        [ids.paymentSoon],
      );

      expect((await rowOf(ids.paymentSoon))?.logoUrl).toBe('https://cdn.example.com/soon.png');
    });
  });

  describe('mine=true', () => {
    it('lists only the subscriptions the caller answers for, and all of them when it is not asked', async () => {
      const mineOfTwo = await idsOf({ mine: 'true' }, itTwoAccount);
      const mineOfOne = await idsOf({ mine: 'true' });

      expect(mineOfTwo).toEqual([ids.noticeSoon]);
      expect(mineOfOne).not.toContain(ids.noticeSoon);
      expect(mineOfOne).toContain(ids.paymentSoon);
      expect(await idsOf({}, itTwoAccount)).toContain(ids.paymentSoon);
      expect(await idsOf({ mine: 'false' }, itTwoAccount)).toContain(ids.paymentSoon);
    });

    it('goes with the expiry filter: the near ones of the caller', async () => {
      expect(await idsOf({ mine: 'true', expiry: 'SOON' })).toEqual([ids.paymentSoon]);
      expect(await idsOf({ mine: 'true', expiry: 'SOON' }, itTwoAccount)).toEqual([ids.noticeSoon]);
    });
  });

  describe('the page', () => {
    it('counts the total of the expiry filter, not of the whole list, and pages it', async () => {
      const first = await pageOf({ expiry: 'SOON', page: 1, pageSize: 1 });
      const second = await pageOf({ expiry: 'SOON', page: 2, pageSize: 1 });

      expect(first.pagination).toMatchObject({ page: 1, pageSize: 1, totalItems: 2, totalPages: 2 });
      expect(first.items).toHaveLength(1);
      expect(second.items).toHaveLength(1);
      expect(new Set([first.items[0].id, second.items[0].id]).size).toBe(2);
    });

    it('refuses a value of the filters it does not know', async () => {
      expect(h.codeOf(await get({ expiry: 'LATER' }).expect(422))).toBe('VALIDATION_ERROR');
      expect(h.codeOf(await get({ mine: 'yes' }).expect(422))).toBe('VALIDATION_ERROR');
    });
  });
});
