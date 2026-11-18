import request from 'supertest';
import { CatalogApi } from '../../../src/modules/catalog/public/catalog.api';
import { SeatHarness } from '../../support/seat-baseline-harness';

const h = new SeatHarness();

/**
 * A subscription has no owning department (`QĐ-113g`), over HTTP and through the catalog facade, on real PostgreSQL: a change of a
 * subscription asks no Cost Center (K1 and K2 alike), a K1 subscription is declared without a department, and the price a request is
 * made at is read from the main subscription of the plan, whichever department a legacy row names.
 */
describe('a subscription has no owning department: no finance gate on a change, no department to declare (QĐ-113g)', () => {
  let bare: { id: string; code: string };
  let k1WithoutUnit: string;
  let k2WithoutUnit: string;

  const patch = (id: string, body: object) =>
    request(h.server()).patch(`/api/v1/subscriptions/${id}`).set(h.as(h.it1)).send(body);
  const stored = async (id: string) =>
    (
      await h.ctx.sql.query<{
        purchased_quantity: number | null;
        end_date: string | null;
        auto_renew: boolean;
        unit_price_minor: string | null;
      }>(
        `SELECT purchased_quantity, to_char(end_date, 'YYYY-MM-DD') AS end_date, auto_renew, unit_price_minor::text
           FROM subscriptions WHERE id = $1`,
        [id],
      )
    ).rows[0];

  /** A subscription of the department with the seats bought, a price, a start and an end date (made by SQL when the API would not allow it). */
  const subscriptionOf = async (departmentId: string, quantity = 10, type: 'K1' | 'K2' = 'K1'): Promise<string> => {
    const id = await h.subscription(quantity, type);
    await h.ctx.sql.query(
      `UPDATE subscriptions SET end_date = '2027-12-31', renewal_date = '2026-12-31' WHERE id = $1`,
      [id],
    );

    return id;
  };

  beforeAll(async () => {
    await h.start();
    // A department that has no Cost Center in use: no subscription asks for one any more.
    bare = await h.bareDepartment();
    k1WithoutUnit = await subscriptionOf(bare.id);
    k2WithoutUnit = await subscriptionOf(bare.id, 10, 'K2');
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  describe('a change that creates, raises or extends what is owed asks no Cost Center', () => {
    it.each([
      ['more seats bought', { purchasedQuantity: 11 }],
      ['the end date later than the stored one', { endDate: '2028-12-31' }],
      ['auto renewal switched on', { autoRenew: true }],
      ['a higher unit price', { unitPrice: { amount: '1500000', currency: 'VND' } }],
    ])('is allowed for a K1 and a K2 subscription alike: %s', async (_name, body) => {
      expect((await patch(k1WithoutUnit, body)).status).toBe(200);
      expect((await patch(k2WithoutUnit, body)).status).toBe(200);
    });

    it('stores the change', async () => {
      await patch(k1WithoutUnit, { purchasedQuantity: 20, endDate: '2029-12-31' }).expect(200);

      expect(await stored(k1WithoutUnit)).toMatchObject({ purchased_quantity: 20, end_date: '2029-12-31' });
    });
  });

  describe('the price of a plan for the department of a request (F38, spec L.8)', () => {
    /** Declares an active subscription of the plan for the department and returns the unit price it stored, in minor units. */
    const declare = async (planId: string, amount: string): Promise<string> => {
      const created = h.dataOf<{ id: string }>(
        await request(h.server())
          .post('/api/v1/subscriptions')
          .set(h.as(h.it1))
          .send({
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
      const price = await declare(planId, '1000000');

      expect((await priceOf(planId))?.unitPrice.amountMinor.toString()).toBe(price);
    });

    it('is null for a plan with no priced subscription', async () => {
      const planId = await h.plan('K2');

      expect(await priceOf(planId)).toBeNull();
    });
  });
});
