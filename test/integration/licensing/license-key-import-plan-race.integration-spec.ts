import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import request from 'supertest';
import { LicenseKeyCipher } from '../../../src/modules/licensing/license-key/license-key-cipher.service';
import { waitForLockWaiters } from '../../support/lock-wait';
import { PgRelay } from '../../support/pg-relay';
import { QueryCounter, dataStatements } from '../../support/query-count';
import { SeatHarness } from '../../support/seat-baseline-harness';

const h = new SeatHarness();

/**
 * P28-10: a license-key import holds its K4 purchase — the subscription and its plan — for the transaction that stores the
 * keys, so a change of the plan's kind cannot slip between the check and the keys: whichever commits second sees the
 * other, in both orders. The order is forced with held locks and lock waits, never a sleep. The keys of a batch are
 * stored in one statement, so the work of an import does not grow with the size of the batch (the 503 of P28-13).
 */
describe('license key import and the kind of its plan, racing (integration, P28-10)', () => {
  let relay: PgRelay;
  let counter: QueryCounter;
  let holder: Client;

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
    holder = new Client({ connectionString: h.ctx.database.url });
    await holder.connect();
  }, 180000);

  afterEach(async () => {
    await holder.query('ROLLBACK').catch(() => undefined);
  });

  afterAll(async () => {
    await holder?.end();
    await h.stop();
    await relay?.stop();
  });

  const importKeys = (subscriptionId: string, keys: string[]) =>
    request(h.server()).post('/api/v1/license-keys/imports').set(h.as(h.it1)).send({ subscriptionId, keys });
  const changeToK1 = (planId: string, extra: Record<string, unknown> = {}) =>
    request(h.server())
      .patch(`/api/v1/plans/${planId}`)
      .set(h.as(h.it1))
      .send({ provisioningType: 'K1', pricingModel: 'PER_SEAT', controlLevel: 'FULL', ...extra });
  const purchase = async () => {
    const subscriptionId = await h.subscription(50, 'K4');
    const planId = (
      await h.ctx.sql.query<{ plan_id: string }>(`SELECT plan_id FROM subscriptions WHERE id = $1`, [subscriptionId])
    ).rows[0].plan_id;

    return { subscriptionId, planId };
  };
  const keysOf = async (subscriptionId: string) =>
    (await h.ctx.sql.query(`SELECT 1 FROM license_keys WHERE subscription_id = $1`, [subscriptionId])).rowCount;
  const kindOf = async (planId: string) =>
    (await h.ctx.sql.query<{ type: string }>(`SELECT provisioning_type AS type FROM plans WHERE id = $1`, [planId]))
      .rows[0].type;
  const key = (label: string) => `KEY-${label}-${randomUUID().slice(0, 8).toUpperCase()}-ABCDE`;

  it('change first (lot): real PATCH /plans waits to leave K4->K1, POST /license-lots waits behind it and refuses with LICENSE_LOT.PLAN_NOT_K4', async () => {
    const planId = await h.plan('K4');
    const appId = (
      await h.ctx.sql.query<{ application_id: string }>(`SELECT application_id FROM plans WHERE id = $1`, [planId])
    ).rows[0].application_id;
    const blockingName = `Race ${randomUUID().slice(0, 8)}`;
    await holder.query('BEGIN');
    await holder.query(
      `INSERT INTO plans (id, organization_id, application_id, name, normalized_name, provisioning_type, pricing_model, control_level)
       VALUES ($1, $2, $3, $4, $5, 'K1', 'PER_SEAT', 'FULL')`,
      [randomUUID(), h.seed.organizationId, appId, blockingName, blockingName.toLowerCase()],
    );

    const changing = changeToK1(planId, { name: blockingName }).then((response) => response);
    await waitForLockWaiters(h.ctx.sql, 1);
    const creating = request(h.server())
      .post('/api/v1/license-lots')
      .set(h.as(h.it1))
      .send({
        planId,
        purchasedOn: '2026-11-25',
        licenseCount: 2,
        unitPrice: { amount: '100000', currency: 'VND' },
        purpose: 'STOCK',
      })
      .then((response) => response);
    await waitForLockWaiters(h.ctx.sql, 2);
    await holder.query('ROLLBACK');

    expect((await changing).status).toBe(200);
    const response = await creating;
    expect(response.status).toBe(422);
    expect(h.codeOf(response)).toBe('LICENSE_LOT.PLAN_NOT_K4');
    expect((await h.ctx.sql.query(`SELECT 1 FROM license_lots WHERE plan_id = $1`, [planId])).rowCount).toBe(0);
  });

  it('lot blocks leaving K4: PATCH /plans K4->K1 on a plan that already holds a lot returns 409 PLAN.IN_USE_BLOCKS_CHANGE (LICENSE_LOTS)', async () => {
    const planId = await h.plan('K4');
    await request(h.server())
      .post('/api/v1/license-lots')
      .set(h.as(h.it1))
      .send({
        planId,
        purchasedOn: '2026-11-25',
        licenseCount: 2,
        unitPrice: { amount: '100000', currency: 'VND' },
        purpose: 'STOCK',
      })
      .expect(201);

    const refused = await changeToK1(planId).expect(409);
    expect(h.codeOf(refused)).toBe('PLAN.IN_USE_BLOCKS_CHANGE');
    expect((refused.body as { error: { details: { reason: string } } }).error.details.reason).toBe('LICENSE_LOTS');
    expect(await kindOf(planId)).toBe('K4');
  });

  it('import first: the change of kind waits for the import in flight, then is refused because the keys are kept', async () => {
    const { subscriptionId, planId } = await purchase();
    const held = key('HELD');
    const other = await purchase();
    const fingerprint = h.ctx.app.get(LicenseKeyCipher, { strict: false }).fingerprint(held);
    await holder.query('BEGIN');
    await holder.query(
      `INSERT INTO license_keys (id, organization_id, subscription_id, cost_borne, fingerprint, masked, ciphertext, cipher_key_id,
         imported_by_app_user_id)
       VALUES ($1, $2, $3, true, $4, 'HELD', decode(repeat('00', 29), 'hex'), 'k1', $5)`,
      [randomUUID(), h.seed.organizationId, other.subscriptionId, fingerprint, h.it1.appUserId],
    );

    const importing = importKeys(subscriptionId, [held, key('C')]).then((response) => response);
    await waitForLockWaiters(h.ctx.sql, 1);
    const changing = changeToK1(planId).then((response) => response);
    await waitForLockWaiters(h.ctx.sql, 2);
    await holder.query('ROLLBACK');

    expect((await importing).status).toBe(201);
    const changeRes = await changing;
    expect(changeRes.status).toBe(409);
    expect(h.codeOf(changeRes)).toBe('PLAN.IN_USE_BLOCKS_CHANGE');
    expect((changeRes.body as { error: { details: { reason: string } } }).error.details.reason).toBe('LICENSE_KEYS');
    expect(await kindOf(planId)).toBe('K4');
    expect(await keysOf(subscriptionId)).toBe(2);
  });

  it('import first (lot): real POST /license-lots/:id/keys holds shared plan lock until commit while PATCH /plans waits, then refuses with LICENSE_KEYS', async () => {
    const planId = await h.plan('K4');
    const lotRes = await request(h.server())
      .post('/api/v1/license-lots')
      .set(h.as(h.it1))
      .send({
        planId,
        purchasedOn: '2026-11-25',
        licenseCount: 2,
        unitPrice: { amount: '100000', currency: 'VND' },
        purpose: 'STOCK',
      })
      .expect(201);
    const lotId = h.dataOf<{ id: string }>(lotRes).id;

    const held = key('LHELD');
    const other = await purchase();
    const fingerprint = h.ctx.app.get(LicenseKeyCipher, { strict: false }).fingerprint(held);
    await holder.query('BEGIN');
    await holder.query(
      `INSERT INTO license_keys (id, organization_id, subscription_id, cost_borne, fingerprint, masked, ciphertext, cipher_key_id,
         imported_by_app_user_id)
       VALUES ($1, $2, $3, true, $4, 'LHELD', decode(repeat('00', 29), 'hex'), 'k1', $5)`,
      [randomUUID(), h.seed.organizationId, other.subscriptionId, fingerprint, h.it1.appUserId],
    );

    const importing = request(h.server())
      .post(`/api/v1/license-lots/${lotId}/keys`)
      .set(h.as(h.it1))
      .send({ keys: [held, key('L2')] })
      .then((response) => response);
    await waitForLockWaiters(h.ctx.sql, 1);
    const changing = changeToK1(planId).then((response) => response);
    await waitForLockWaiters(h.ctx.sql, 2);
    await holder.query('ROLLBACK');

    expect((await importing).status).toBe(201);
    const changeRes = await changing;
    expect(changeRes.status).toBe(409);
    expect(h.codeOf(changeRes)).toBe('PLAN.IN_USE_BLOCKS_CHANGE');
    expect((changeRes.body as { error: { details: { reason: string } } }).error.details.reason).toBe('LICENSE_KEYS');
    expect(await kindOf(planId)).toBe('K4');
    expect((await h.ctx.sql.query(`SELECT 1 FROM license_keys WHERE license_lot_id = $1`, [lotId])).rowCount).toBe(2);
  });

  it('stores a batch in the same number of statements whatever its size', async () => {
    const [small, large] = [(await purchase()).subscriptionId, (await purchase()).subscriptionId];

    const few = await counter.run(() =>
      importKeys(
        small,
        Array.from({ length: 3 }, (_, index) => key(`F${index}`)),
      ).expect(201),
    );
    const many = await counter.run(() =>
      importKeys(
        large,
        Array.from({ length: 30 }, (_, index) => key(`M${index}`)),
      ).expect(201),
    );

    expect(h.dataOf<{ imported: number }>(many.result).imported).toBe(30);
    expect(dataStatements(many.statements)).toHaveLength(dataStatements(few.statements).length);
  });

  it('R-1: real POST /applications/:id/retire blocks later lot creation and lot key import with 422 APPLICATION_RETIRED', async () => {
    const planId = await h.plan('K4');
    const appId = (
      await h.ctx.sql.query<{ application_id: string }>(`SELECT application_id FROM plans WHERE id = $1`, [planId])
    ).rows[0].application_id;
    const lotId = h.dataOf<{ id: string }>(
      await request(h.server())
        .post('/api/v1/license-lots')
        .set(h.as(h.it1))
        .send({
          planId,
          purchasedOn: '2026-11-25',
          licenseCount: 2,
          unitPrice: { amount: '100000', currency: 'VND' },
          purpose: 'STOCK',
        })
        .expect(201),
    ).id;

    await request(h.server()).post(`/api/v1/applications/${appId}/retire`).set(h.as(h.it1)).expect(200);

    const lotAfter = await request(h.server())
      .post('/api/v1/license-lots')
      .set(h.as(h.it1))
      .send({
        planId,
        purchasedOn: '2026-11-25',
        licenseCount: 2,
        unitPrice: { amount: '100000', currency: 'VND' },
        purpose: 'STOCK',
      })
      .expect(422);
    expect(h.codeOf(lotAfter)).toBe('LICENSE_LOT.APPLICATION_RETIRED');
    expect((await h.ctx.sql.query(`SELECT 1 FROM license_lots WHERE plan_id = $1`, [planId])).rowCount).toBe(1);

    const keysAfter = await request(h.server())
      .post(`/api/v1/license-lots/${lotId}/keys`)
      .set(h.as(h.it1))
      .send({ keys: [key('RETIRED')] })
      .expect(422);
    expect(h.codeOf(keysAfter)).toBe('LICENSE_KEY.APPLICATION_RETIRED');
  });

  it('R-1: deterministic race between POST /applications/:id/retire and POST /license-lots serializes without deadlock', async () => {
    const planId = await h.plan('K4');
    const appId = (
      await h.ctx.sql.query<{ application_id: string }>(`SELECT application_id FROM plans WHERE id = $1`, [planId])
    ).rows[0].application_id;

    await holder.query('BEGIN');
    await holder.query(`SELECT id FROM applications WHERE id = $1 FOR UPDATE`, [appId]);

    const retiring = request(h.server())
      .post(`/api/v1/applications/${appId}/retire`)
      .set(h.as(h.it1))
      .then((response) => response);
    await waitForLockWaiters(h.ctx.sql, 1);

    const creating = request(h.server())
      .post('/api/v1/license-lots')
      .set(h.as(h.it1))
      .send({
        planId,
        purchasedOn: '2026-11-25',
        licenseCount: 2,
        unitPrice: { amount: '100000', currency: 'VND' },
        purpose: 'STOCK',
      })
      .then((response) => response);
    await waitForLockWaiters(h.ctx.sql, 2);
    await holder.query('ROLLBACK');

    expect((await retiring).status).toBe(200);
    const createRes = await creating;
    expect([201, 422]).toContain(createRes.status);
    const lotCount = (await h.ctx.sql.query(`SELECT 1 FROM license_lots WHERE plan_id = $1`, [planId])).rowCount;
    if (createRes.status === 422) {
      expect(h.codeOf(createRes)).toBe('LICENSE_LOT.APPLICATION_RETIRED');
      expect(lotCount).toBe(0);
    } else {
      expect(lotCount).toBe(1);
    }

    const followUp = await request(h.server())
      .post('/api/v1/license-lots')
      .set(h.as(h.it1))
      .send({
        planId,
        purchasedOn: '2026-11-25',
        licenseCount: 2,
        unitPrice: { amount: '100000', currency: 'VND' },
        purpose: 'STOCK',
      })
      .expect(422);
    expect(h.codeOf(followUp)).toBe('LICENSE_LOT.APPLICATION_RETIRED');
  });

  it('R-1: concurrent POST /applications/:id/retire and POST /license-lots over real routes produce one consistent outcome', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const planId = await h.plan('K4');
      const appId = (
        await h.ctx.sql.query<{ application_id: string }>(`SELECT application_id FROM plans WHERE id = $1`, [planId])
      ).rows[0].application_id;

      const [retireRes, createRes] = await Promise.all([
        request(h.server()).post(`/api/v1/applications/${appId}/retire`).set(h.as(h.it1)),
        request(h.server())
          .post('/api/v1/license-lots')
          .set(h.as(h.it1))
          .send({
            planId,
            purchasedOn: '2026-11-25',
            licenseCount: 2,
            unitPrice: { amount: '100000', currency: 'VND' },
            purpose: 'STOCK',
          }),
      ]);

      expect(retireRes.status).toBe(200);
      expect([201, 422]).toContain(createRes.status);
      const lotCount = (await h.ctx.sql.query(`SELECT 1 FROM license_lots WHERE plan_id = $1`, [planId])).rowCount;
      if (createRes.status === 422) {
        expect(h.codeOf(createRes)).toBe('LICENSE_LOT.APPLICATION_RETIRED');
        expect(lotCount).toBe(0);
      } else {
        expect(lotCount).toBe(1);
      }
    }
  });

  it('R-1: deterministic race between POST /license-lots/:id/keys and POST /applications/:id/retire serializes without deadlock and blocks follow-up imports', async () => {
    const planId = await h.plan('K4');
    const appId = (
      await h.ctx.sql.query<{ application_id: string }>(`SELECT application_id FROM plans WHERE id = $1`, [planId])
    ).rows[0].application_id;
    const lotId = h.dataOf<{ id: string }>(
      await request(h.server())
        .post('/api/v1/license-lots')
        .set(h.as(h.it1))
        .send({
          planId,
          purchasedOn: '2026-11-25',
          licenseCount: 3,
          unitPrice: { amount: '100000', currency: 'VND' },
          purpose: 'STOCK',
        })
        .expect(201),
    ).id;

    const held = key('RHELD');
    const other = await purchase();
    const fingerprint = h.ctx.app.get(LicenseKeyCipher, { strict: false }).fingerprint(held);
    await holder.query('BEGIN');
    await holder.query(
      `INSERT INTO license_keys (id, organization_id, subscription_id, cost_borne, fingerprint, masked, ciphertext, cipher_key_id,
         imported_by_app_user_id)
       VALUES ($1, $2, $3, true, $4, 'RHELD', decode(repeat('00', 29), 'hex'), 'k1', $5)`,
      [randomUUID(), h.seed.organizationId, other.subscriptionId, fingerprint, h.it1.appUserId],
    );

    const importing = request(h.server())
      .post(`/api/v1/license-lots/${lotId}/keys`)
      .set(h.as(h.it1))
      .send({ keys: [held, key('R2')] })
      .then((response) => response);
    await waitForLockWaiters(h.ctx.sql, 1);

    const retiring = request(h.server())
      .post(`/api/v1/applications/${appId}/retire`)
      .set(h.as(h.it1))
      .then((response) => response);
    await waitForLockWaiters(h.ctx.sql, 2);
    await holder.query('ROLLBACK');

    expect((await importing).status).toBe(201);
    expect((await retiring).status).toBe(200);
    expect((await h.ctx.sql.query(`SELECT 1 FROM license_keys WHERE license_lot_id = $1`, [lotId])).rowCount).toBe(2);

    const followUp = await request(h.server())
      .post(`/api/v1/license-lots/${lotId}/keys`)
      .set(h.as(h.it1))
      .send({ keys: [key('RAFTER')] })
      .expect(422);
    expect(h.codeOf(followUp)).toBe('LICENSE_KEY.APPLICATION_RETIRED');
    expect((await h.ctx.sql.query(`SELECT 1 FROM license_keys WHERE license_lot_id = $1`, [lotId])).rowCount).toBe(2);
  });

  it('R-1: concurrent POST /applications/:id/retire and POST /license-lots/:id/keys serialize cleanly without 40P01 deadlock', async () => {
    const planId = await h.plan('K4');
    const appId = (
      await h.ctx.sql.query<{ application_id: string }>(`SELECT application_id FROM plans WHERE id = $1`, [planId])
    ).rows[0].application_id;
    const lotId = h.dataOf<{ id: string }>(
      await request(h.server())
        .post('/api/v1/license-lots')
        .set(h.as(h.it1))
        .send({
          planId,
          purchasedOn: '2026-11-25',
          licenseCount: 2,
          unitPrice: { amount: '100000', currency: 'VND' },
          purpose: 'STOCK',
        })
        .expect(201),
    ).id;

    const [retireRes, importRes] = await Promise.all([
      request(h.server()).post(`/api/v1/applications/${appId}/retire`).set(h.as(h.it1)),
      request(h.server())
        .post(`/api/v1/license-lots/${lotId}/keys`)
        .set(h.as(h.it1))
        .send({ keys: [key('RACE1')] }),
    ]);

    expect(retireRes.status).toBe(200);
    expect([201, 422]).toContain(importRes.status);
    if (importRes.status === 422) {
      expect(h.codeOf(importRes)).toBe('LICENSE_KEY.APPLICATION_RETIRED');
      expect((await h.ctx.sql.query(`SELECT 1 FROM license_keys WHERE license_lot_id = $1`, [lotId])).rowCount).toBe(0);
    } else {
      expect((await h.ctx.sql.query(`SELECT 1 FROM license_keys WHERE license_lot_id = $1`, [lotId])).rowCount).toBe(1);
    }
  });
});
