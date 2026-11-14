import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { addDays } from '../../../src/core/business-date';
import { LicensingPoolStockApi } from '../../../src/modules/licensing/public/licensing-pool-stock.api';
import type { ApiAccount } from '../../support/api-accounts';
import { RevocationHarness } from '../../support/revocation-harness';

const h = new RevocationHarness();

type Stock =
  | { kind: 'SEATS'; purchased: number | null; assigned: number; free: number | null; revoking: number }
  | { kind: 'KEYS'; inStore: number; assigned: number; withdrawn: number }
  | { kind: 'HOLDERS'; holders: number };
interface Row {
  plan: {
    planId: string;
    planName: string;
    provisioningType: string;
    applicationId: string;
    applicationName: string;
    logoUrl: string | null;
  };
  stock: Stock;
}
interface Page {
  items: Row[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

/**
 * What the plans hold, by what they give out (`stockSummaryList`, `QĐ-111n`), on real PostgreSQL: the seats of a K2 plan, the keys of a K4 plan
 * and the rights of a K1 plan, one row for each plan and none for each subscription record. The figures agree with the lists they sum up: the
 * seats with `GET /subscriptions` and with the stock the queue of grants shows, the keys with `GET /license-keys`.
 */
describe('the stock of the plans by what they give out, over HTTP (integration, real PostgreSQL)', () => {
  let itTwo: string;
  let itTwoAccount: ApiAccount;
  let counter = 0;
  const subs: Record<'seats' | 'flat' | 'others' | 'keys' | 'rights', string> = {
    seats: '',
    flat: '',
    others: '',
    keys: '',
    rights: '',
  };
  const plans: Record<keyof typeof subs, string> = { seats: '', flat: '', others: '', keys: '', rights: '' };
  const code = () => `E-STK-${(counter += 1)}`;

  const get = (query: Record<string, string | number> = { pageSize: 100 }, account: ApiAccount = h.it1) =>
    request(h.server()).get('/api/v1/stock-summary').query(query).set(h.as(account));
  const pageOf = async (query: Record<string, string | number> = { pageSize: 100 }, account: ApiAccount = h.it1) =>
    h.dataOf<Page>(await get(query, account).expect(200));
  const rowOf = async (planId: string, query: Record<string, string | number> = {}, account: ApiAccount = h.it1) =>
    (await pageOf({ pageSize: 100, ...query }, account)).items.find((row) => row.plan.planId === planId);

  /** An assignment the baseline import cannot make: it starts on a given day, or ended on one. */
  const insertAssignment = async (
    subscriptionId: string,
    validFrom: string,
    validUntil: string | null,
  ): Promise<void> => {
    const id = randomUUID();
    await h.ctx.sql.query(
      `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id,
         account_identifier, normalized_account_identifier, valid_from, valid_until, valid_from_basis, created_by_app_user_id)
       VALUES ($1, $2, 'PERSONAL', 'REQUEST', $3, $4, $5, $6, $6, $7, $8, 'ACTUAL', $9)`,
      [
        id,
        h.seed.organizationId,
        await h.planOf(subscriptionId),
        subscriptionId,
        await h.person(code()),
        `${id.slice(0, 8)}@acme.vn`,
        validFrom,
        validUntil,
        randomUUID(),
      ],
    );
  };
  const importKeys = async (subscriptionId: string, count: number): Promise<void> => {
    const keys = Array.from({ length: count }, (_, i) => `STK-${String(i + 1).padStart(3, '0')}-ABCDE-12345`);
    await request(h.server())
      .post('/api/v1/license-keys/imports')
      .set(h.as(h.it1))
      .send({ subscriptionId, keys })
      .expect(201);
  };
  const keyRows = async (subscriptionId: string) =>
    (
      await h.ctx.sql.query<{ id: string }>(
        `SELECT id FROM license_keys WHERE subscription_id = $1 AND status = 'IN_STORE' ORDER BY imported_at, id`,
        [subscriptionId],
      )
    ).rows;
  /** A K4 seat granted from the pool and completed with the key given to it. */
  const grantKey = async (subscriptionId: string, keyId: string): Promise<void> => {
    const task = await h.granted(await h.person(code()), plans.keys, { subscriptionId });
    await h.claim(task.id).expect(200);
    await h.complete(task.id, { evidence: 'Key activated', licenseKeyId: keyId }).expect(200);
  };

  beforeAll(async () => {
    await h.start();
    itTwo = await h.person('E-STK-A1');
    itTwoAccount = await h.account('E-STK-A1', itTwo, 'IT_ADMIN');

    // K2 with its seats bought: three held (one being taken back), one that begins tomorrow, and one that has ended.
    subs.seats = await h.subscription(10, 'K2');
    const held = [
      await h.seat({ subscriptionId: subs.seats }, code()),
      await h.seat({ subscriptionId: subs.seats }, code()),
    ];
    await h.seat({ subscriptionId: subs.seats }, code());
    await h.open(held[0], 'RETURN');
    await insertAssignment(subs.seats, addDays(h.today(), 1), null);
    await insertAssignment(subs.seats, '2026-02-01', '2026-03-01');
    // K2 with no quantity (a flat rate): the seats bought and free are not known, and none can be held (INV-01).
    subs.flat = await h.subscription(null, 'K2');
    // K2 that the other IT Admin answers for.
    subs.others = await h.subscription(5, 'K2');
    await request(h.server())
      .patch(`/api/v1/subscriptions/${subs.others}`)
      .set(h.as(h.it1))
      .send({ responsibleItAdminEmployeeId: itTwo })
      .expect(200);
    await h.seat({ subscriptionId: subs.others }, code());
    // K4: four keys imported, two given to a seat and one of the others taken out of the store.
    subs.keys = await h.subscription(5, 'K4');
    plans.keys = await h.planOf(subs.keys);
    await importKeys(subs.keys, 4);
    const [first, second, third] = await keyRows(subs.keys);
    await grantKey(subs.keys, first.id);
    await grantKey(subs.keys, second.id);
    await request(h.server())
      .post(`/api/v1/license-keys/${third.id}/withdrawal`)
      .set(h.as(h.it1))
      .send({ reason: 'Broken' })
      .expect(200);
    // K1: two people hold the personal account.
    subs.rights = await h.subscription(10, 'K1');
    await h.seat({ subscriptionId: subs.rights }, code());
    await h.seat({ subscriptionId: subs.rights }, code());

    for (const name of ['seats', 'flat', 'others', 'rights'] as const) plans[name] = await h.planOf(subs[name]);
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  describe('what each kind of plan holds', () => {
    it('counts the seats of a K2 plan: bought, held from today on (a seat that begins tomorrow too, one that ended not), free and being taken back', async () => {
      expect((await rowOf(plans.seats))?.stock).toEqual({
        kind: 'SEATS',
        purchased: 10,
        assigned: 4,
        free: 6,
        revoking: 1,
      });
    });

    it('says the seats bought and free are not known for a flat rate', async () => {
      expect((await rowOf(plans.flat))?.stock).toEqual({
        kind: 'SEATS',
        purchased: null,
        assigned: 0,
        free: null,
        revoking: 0,
      });
    });

    it('counts the keys of a K4 plan: in the store (not withdrawn), given to a seat and withdrawn', async () => {
      expect((await rowOf(plans.keys))?.stock).toEqual({ kind: 'KEYS', inStore: 1, assigned: 2, withdrawn: 1 });
    });

    it('counts the people who hold the personal account of a K1 plan, with no figure of a free seat', async () => {
      expect((await rowOf(plans.rights))?.stock).toEqual({ kind: 'HOLDERS', holders: 2 });
    });

    it('names the plan, its application and the logo of it on each row', async () => {
      const row = await rowOf(plans.seats);

      expect(row?.plan).toMatchObject({ planId: plans.seats, provisioningType: 'K2', logoUrl: null });
      expect(row?.plan.applicationName).toEqual(expect.any(String));
      expect(row?.plan.applicationId).toEqual(expect.any(String));
    });
  });

  describe('which plans are listed', () => {
    it('lists one row for each plan that gives out seats, keys or accounts and has a subscription to give from, none for a draft, an ended subscription or an internal plan', async () => {
      const draft = await h.draftSubscription('K2');
      const ended = await h.subscription(3, 'K2');
      await h.ctx.sql.query(`UPDATE subscriptions SET end_date = $2 WHERE id = $1`, [ended, addDays(h.today(), -1)]);
      const internal = await h.plan('K5');

      const listed = (await pageOf()).items.map((row) => row.plan.planId);

      expect([...listed].sort()).toEqual(Object.values(plans).sort());
      for (const absent of [await h.planOf(draft), await h.planOf(ended), internal]) {
        expect(listed).not.toContain(absent);
      }
    });

    it('lists the plans by application and plan, and pages them with a total that agrees on every page', async () => {
      const whole = await pageOf();
      const names = whole.items.map((row) =>
        `${row.plan.applicationName}/${row.plan.planName}`.replace(/\s/g, '').toLowerCase(),
      );
      const pages = [
        await pageOf({ pageSize: 2, page: 1 }),
        await pageOf({ pageSize: 2, page: 2 }),
        await pageOf({ pageSize: 2, page: 3 }),
      ];

      expect(names).toEqual([...names].sort());
      expect(pages.map((page) => page.items.length)).toEqual([2, 2, 1]);
      for (const page of pages) {
        expect(page.pagination).toMatchObject({ totalItems: 5, totalPages: 3, pageSize: 2 });
      }
      expect(pages.flatMap((page) => page.items.map((row) => row.plan.planId))).toEqual(
        whole.items.map((row) => row.plan.planId),
      );
    });

    it('lists the one plan asked for, and none for a plan with nothing to count or that does not exist', async () => {
      expect((await pageOf({ planId: plans.keys })).items.map((row) => row.plan.planId)).toEqual([plans.keys]);
      expect((await pageOf({ planId: randomUUID() })).items).toEqual([]);
      expect((await pageOf({ planId: randomUUID() })).pagination.totalItems).toBe(0);
    });
  });

  describe('mine', () => {
    it('keeps the plans whose subscriptions the caller answers for, and counts only those', async () => {
      const ofOther = await pageOf({ mine: 'true' }, itTwoAccount);
      const ofFirst = await pageOf({ mine: 'true' });

      expect(ofOther.items.map((row) => row.plan.planId)).toEqual([plans.others]);
      expect(ofOther.items[0].stock).toEqual({ kind: 'SEATS', purchased: 5, assigned: 1, free: 4, revoking: 0 });
      expect(ofFirst.items.map((row) => row.plan.planId)).not.toContain(plans.others);
      expect(ofFirst.items.map((row) => row.plan.planId).sort()).toEqual(
        Object.values(plans)
          .filter((planId) => planId !== plans.others)
          .sort(),
      );
      expect(ofFirst.pagination.totalItems).toBe(4);
    });

    it('lists every plan for false, absent, and for another IT Admin without mine', async () => {
      expect((await pageOf({ mine: 'false' })).pagination.totalItems).toBe(5);
      expect((await pageOf({}, itTwoAccount)).pagination.totalItems).toBe(5);
    });
  });

  describe('the figures agree with the lists they sum up', () => {
    it('K2: the seats of the plan are those of its subscription in GET /subscriptions, and the free and being taken back are what the queue of grants reads', async () => {
      const subscriptions = h.dataOf<{
        items: { id: string; seats: { purchased: number; assigned: number; free: number; inRevocation: number } }[];
      }>(
        await request(h.server())
          .get('/api/v1/subscriptions')
          .query({ planId: plans.seats })
          .set(h.as(h.it1))
          .expect(200),
      );
      const seats = subscriptions.items.find((row) => row.id === subs.seats)?.seats;
      const pool = (await h.ctx.app.get(LicensingPoolStockApi).getStockOfPlans([plans.seats])).get(plans.seats);

      expect((await rowOf(plans.seats))?.stock).toEqual({
        kind: 'SEATS',
        purchased: seats?.purchased,
        assigned: seats?.assigned,
        free: seats?.free,
        revoking: seats?.inRevocation,
      });
      expect(pool).toMatchObject({ kind: 'SEATS', free: 6, inRevocation: 1 });
    });

    it('K4: the keys are the totals of GET /license-keys by state', async () => {
      const total = async (query: Record<string, string>): Promise<number> =>
        h.dataOf<{ pagination: { totalItems: number } }>(
          await request(h.server())
            .get('/api/v1/license-keys')
            .query({ subscriptionId: subs.keys, ...query })
            .set(h.as(h.it1))
            .expect(200),
        ).pagination.totalItems;

      expect((await rowOf(plans.keys))?.stock).toEqual({
        kind: 'KEYS',
        inStore: await total({ status: 'IN_STORE', withdrawn: 'false' }),
        assigned: await total({ status: 'ASSIGNED' }),
        withdrawn: await total({ withdrawn: 'true' }),
      });
    });
  });
});
