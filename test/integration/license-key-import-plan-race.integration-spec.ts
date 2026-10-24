import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import request from 'supertest';
import { LicenseKeyCipher } from '../../src/modules/licensing/license-key/license-key-cipher';
import { waitForLockWaiters } from '../support/lock-wait';
import { PgRelay } from '../support/pg-relay';
import { QueryCounter, dataStatements } from '../support/query-count';
import { SeatHarness } from '../support/seat-baseline-harness';

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
  let changer: Client;

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
    changer = new Client({ connectionString: h.ctx.database.url });
    await Promise.all([holder.connect(), changer.connect()]);
  }, 180000);

  afterEach(async () => {
    await holder.query('ROLLBACK').catch(() => undefined);
  });

  afterAll(async () => {
    await holder?.end();
    await changer?.end();
    await h.stop();
    await relay?.stop();
  });

  const importKeys = (subscriptionId: string, keys: string[]) =>
    request(h.server()).post('/api/v1/license-keys/imports').set(h.as(h.it1)).send({ subscriptionId, keys });
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

  it('change first: the import waits for the change of kind in flight, then refuses with nothing kept', async () => {
    const { subscriptionId, planId } = await purchase();
    await holder.query('BEGIN');
    await holder.query(`UPDATE plans SET provisioning_type = 'K1' WHERE id = $1`, [planId]);

    const importing = importKeys(subscriptionId, [key('A'), key('B')]).then((response) => response);
    await waitForLockWaiters(h.ctx.sql, 1);
    await holder.query('COMMIT');
    const response = await importing;

    expect(response.status).toBe(422);
    expect(h.codeOf(response)).toBe('LICENSE_KEY.PLAN_NOT_K4');
    expect(await keysOf(subscriptionId)).toBe(0);
  });

  it('import first: the change of kind waits for the import in flight, then is refused because the keys are kept', async () => {
    const { subscriptionId, planId } = await purchase();
    const held = key('HELD');
    // A key with the same fingerprint, written and not committed elsewhere, makes the import wait inside its own
    // transaction — after it has taken its purchase — until this transaction ends. It is kept for another purchase, so
    // its foreign key holds that subscription, not the one the import locks (the fingerprint is unique per organization).
    const other = await purchase();
    const fingerprint = h.ctx.app.get(LicenseKeyCipher, { strict: false }).fingerprint(held);
    await holder.query('BEGIN');
    await holder.query(
      `INSERT INTO license_keys (id, organization_id, subscription_id, fingerprint, masked, ciphertext, cipher_key_id,
         imported_by_app_user_id)
       VALUES ($1, $2, $3, $4, 'HELD', decode(repeat('00', 29), 'hex'), 'k1', $5)`,
      [randomUUID(), h.seed.organizationId, other.subscriptionId, fingerprint, h.it1.appUserId],
    );

    const importing = importKeys(subscriptionId, [held, key('C')]).then((response) => response);
    await waitForLockWaiters(h.ctx.sql, 1);
    const changing = changer.query(`UPDATE plans SET provisioning_type = 'K1' WHERE id = $1`, [planId]).then(
      () => null,
      (error: unknown) => error,
    );
    await waitForLockWaiters(h.ctx.sql, 2);
    await holder.query('ROLLBACK');

    expect((await importing).status).toBe(201);
    expect(((await changing) as { code?: string } | null)?.code).toBe('23514');
    expect(await kindOf(planId)).toBe('K4');
    expect(await keysOf(subscriptionId)).toBe(2);
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
});
