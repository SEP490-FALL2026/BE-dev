import request from 'supertest';
import { CatalogApi } from '../../../src/modules/catalog/public/catalog.api';
import { SeatHarness } from '../../support/seat-baseline-harness';

const h = new SeatHarness();

/**
 * F26 (spec L.7) and F38 (spec L.8), over HTTP and through the catalog facade, on real PostgreSQL: a change of a subscription that
 * creates, raises or extends what is owed needs the department that owns it to have a Cost Center in use, and the price a request
 * is made at is read only from a subscription of the department of the request.
 *
 * Rewritten for `BR-MF1-09` / DA4-21 (spec `qd103-grant-from-shared-pool` §4): the finance gate stays for a K1 or K5 subscription that a department owns
 * and is dropped for K2 and K4 (the seats of a pool are charged by the request of the person who takes one, to that person's department). The cases
 * that asked for the gate now run on a K1 subscription; the same changes on a K2 subscription are allowed, with the Cost Center missing.
 */
describe('the owner department of a subscription: the finance gate of a change and the price of a department (F26, F38)', () => {
  let bare: { id: string; code: string };
  let withoutUnit: string;
  let k2WithoutUnit: string;
  let ownerWithUnit: string;

  const patch = (id: string, body: object) =>
    request(h.server()).patch(`/api/v1/subscriptions/${id}`).set(h.as(h.it1)).send(body);
  const stored = async (id: string) =>
    (
      await h.ctx.sql.query<{
        purchased_quantity: number | null;
        end_date: string | null;
        renewal_date: string | null;
        auto_renew: boolean;
        unit_price_minor: string | null;
        updated_at: Date;
      }>(
        `SELECT purchased_quantity, to_char(end_date, 'YYYY-MM-DD') AS end_date, to_char(renewal_date, 'YYYY-MM-DD') AS renewal_date,
                auto_renew, unit_price_minor::text, updated_at
           FROM subscriptions WHERE id = $1`,
        [id],
      )
    ).rows[0];
  const audits = async (id: string): Promise<number> =>
    (await h.ctx.sql.query<{ n: number }>(`SELECT count(*)::int AS n FROM audit_events WHERE resource_id = $1`, [id]))
      .rows[0].n;

  /** A subscription of the department with the seats bought, a price, a start and an end date (made by SQL when the API would not allow it). */
  const subscriptionOf = async (departmentId: string, quantity = 10, type: 'K1' | 'K2' = 'K1'): Promise<string> => {
    const id = await h.subscription(quantity, type, departmentId);
    await h.ctx.sql.query(
      `UPDATE subscriptions SET end_date = '2027-12-31', renewal_date = '2026-12-31' WHERE id = $1`,
      [id],
    );

    return id;
  };

  beforeAll(async () => {
    await h.start();
    // A department that has no Cost Center in use yet: Finance creates it later (`QĐ-87d(1)`).
    bare = await h.bareDepartment();
    withoutUnit = await subscriptionOf(bare.id);
    k2WithoutUnit = await subscriptionOf(bare.id, 10, 'K2');
    ownerWithUnit = await subscriptionOf(h.seed.departmentId);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  describe('a change that creates, raises or extends what is owed (F26, P03-D09 = A)', () => {
    it.each([
      ['more seats bought', { purchasedQuantity: 11 }],
      ['the end date later than the stored one', { endDate: '2028-12-31' }],
      ['the renewal date later than the stored one', { renewalDate: '2027-06-30' }],
      ['auto renewal switched on', { autoRenew: true }],
      ['a higher unit price', { unitPrice: { amount: '1500000', currency: 'VND' } }],
    ])(
      'is refused for a department with no Cost Center: %s ⟹ 409 FINANCE.SETUP_INCOMPLETE and nothing is written',
      async (_name, body) => {
        const before = { row: await stored(withoutUnit), audit: await audits(withoutUnit) };

        const response = await patch(withoutUnit, body).expect(409);

        expect(h.codeOf(response)).toBe('FINANCE.SETUP_INCOMPLETE');
        expect({ row: await stored(withoutUnit), audit: await audits(withoutUnit) }).toEqual(before);
      },
    );

    it('is refused when it sets an end or a renewal date where there was none (a date where there was none is a term that begins)', async () => {
      const open = await h.subscription(10, 'K1', bare.id);

      expect(h.codeOf(await patch(open, { endDate: '2027-01-31' }).expect(409))).toBe('FINANCE.SETUP_INCOMPLETE');
      expect(h.codeOf(await patch(open, { renewalDate: '2027-01-31' }).expect(409))).toBe('FINANCE.SETUP_INCOMPLETE');
    });

    it.each([
      ['fewer seats bought', { purchasedQuantity: 5 }],
      ['the end date earlier than the stored one', { endDate: '2027-06-30' }],
      ['auto renewal left off', { autoRenew: false }],
      ['a lower unit price', { unitPrice: { amount: '900000', currency: 'VND' } }],
      ['a description of the notice', { noticePeriodDays: 30 }],
      ['the right to reduce in the middle of the term', { allowsMidTermReduction: true }],
    ])('is still allowed for a department with no Cost Center when it only %s', async (_name, body) => {
      const response = await patch(withoutUnit, body);

      expect(response.status).toBe(200);
    });

    it('is allowed for a department that has a Cost Center in use, whatever the change', async () => {
      const raised = await patch(ownerWithUnit, {
        purchasedQuantity: 20,
        endDate: '2028-12-31',
        autoRenew: true,
        unitPrice: { amount: '1500000', currency: 'VND' },
      });

      expect(raised.status).toBe(200);
      expect(await stored(ownerWithUnit)).toMatchObject({
        purchased_quantity: 20,
        end_date: '2028-12-31',
        auto_renew: true,
      });
    });

    it('is allowed once Finance has created the Cost Center of the department, with the stored state compared under the lock', async () => {
      const waiting = await subscriptionOf(bare.id, 4);
      expect(h.codeOf(await patch(waiting, { purchasedQuantity: 6 }).expect(409))).toBe('FINANCE.SETUP_INCOMPLETE');

      await h.costCenterFor(bare.id);

      expect((await patch(waiting, { purchasedQuantity: 6 })).status).toBe(200);
      expect((await stored(waiting)).purchased_quantity).toBe(6);
    });
  });

  describe('a K2 subscription has no finance gate (DA4-21, QĐ-103d)', () => {
    it.each([
      ['more seats bought', { purchasedQuantity: 11 }],
      ['the end date later than the stored one', { endDate: '2028-12-31' }],
      ['auto renewal switched on', { autoRenew: true }],
      ['a higher unit price', { unitPrice: { amount: '1500000', currency: 'VND' } }],
    ])('is allowed for a department with no Cost Center: %s', async (_name, body) => {
      expect((await patch(k2WithoutUnit, body)).status).toBe(200);
    });
  });

  describe('the price of a plan for the department of a request (F38, spec L.8)', () => {
    /** Declares an active subscription of the plan for the department and returns the unit price it stored, in minor units. */
    const declare = async (planId: string, ownerDepartmentId: string, amount: string): Promise<string> => {
      const created = h.dataOf<{ id: string }>(
        await request(h.server())
          .post('/api/v1/subscriptions')
          .set(h.as(h.it1))
          .send({
            ownerDepartmentId,
            planId,
            kind: 'TERM',
            purchasedQuantity: 5,
            unitPrice: { amount, currency: 'VND' },
            billingCycle: 'MONTHLY',
            commitmentTermMonths: 1,
            responsibleItAdminEmployeeId: h.it1.employeeId,
            startDate: '2026-01-05',
          })
          .expect(201),
      );

      return (await stored(created.id)).unit_price_minor ?? '';
    };
    const priceOf = (planId: string) => h.ctx.app.get(CatalogApi, { strict: false }).getPlanPrice(planId);

    it('BR-MF1-07: is the price of the main subscription of the plan, whichever department owns it (S1-02)', async () => {
      const planId = await h.plan('K2');
      const price = await declare(planId, h.seed.departmentId, '1000000');

      expect((await priceOf(planId))?.unitPrice.amountMinor.toString()).toBe(price);
    });

    it('is null for a plan with no priced subscription', async () => {
      const planId = await h.plan('K2');

      expect(await priceOf(planId)).toBeNull();
    });
  });

  describe('AF-05 QĐ-103d: a purchase of the shared pool names no department', () => {
    const declareWithout = (planId: string) =>
      request(h.server())
        .post('/api/v1/subscriptions')
        .set(h.as(h.it1))
        .send({
          planId,
          kind: 'TERM',
          purchasedQuantity: 10,
          unitPrice: { amount: '1000000', currency: 'VND' },
          billingCycle: 'MONTHLY',
          commitmentTermMonths: 1,
          responsibleItAdminEmployeeId: h.it1.employeeId,
          startDate: '2026-01-05',
        });

    it('declares a K2 subscription without ownerDepartmentId: it owns none', async () => {
      const planId = await h.plan('K2');

      const created = h.dataOf<{ id: string }>(await declareWithout(planId).expect(201));

      const { rows } = await h.ctx.sql.query<{ owner_department_id: string | null }>(
        `SELECT owner_department_id FROM subscriptions WHERE id = $1`,
        [created.id],
      );
      expect(rows[0].owner_department_id).toBeNull();
    });

    it('still asks a K1 subscription for the department that owns it (QĐ-89a)', async () => {
      const planId = await h.plan('K1');

      const refused = await declareWithout(planId).expect(422);

      expect(h.codeOf(refused)).toBe('SUBSCRIPTION.OWNER_DEPARTMENT_INACTIVE');
    });
  });
});
