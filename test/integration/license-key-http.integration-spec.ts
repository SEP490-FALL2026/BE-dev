import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { ApiAccount } from '../support/api-accounts';
import { ProvisioningHarness } from '../support/provisioning-harness';

const h = new ProvisioningHarness();

interface Summary {
  purchased: number | null;
  usableKeys: number;
  capacity: number;
  warning: string | null;
}
interface ImportData {
  imported: number;
  errors: { line: number; code: string }[];
  summary: Summary;
}
interface ListData {
  items: { id: string; subscriptionId: string; masked: string; status: string; importedAt: string }[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
  summary: Summary;
}

describe('the vault of license keys over HTTP (integration, real PostgreSQL)', () => {
  let head: ApiAccount;
  let superAdmin: ApiAccount;
  let batch = 0;

  /** Keys that no other test uses: a key is kept once in the whole vault, so each test names its own. */
  const keys = (count: number, tag = 'T'): string[] => {
    batch += 1;

    return Array.from(
      { length: count },
      (_, index) => `KEY-${tag}${batch}-${String(index + 1).padStart(4, '0')}-ABCDE-12345`,
    );
  };
  const importKeys = (subscriptionId: string, list: string[], account: ApiAccount = h.it1) =>
    request(h.server()).post('/api/v1/license-keys/imports').set(h.as(account)).send({ subscriptionId, keys: list });
  const listKeys = (query: string, account: ApiAccount = h.it1) =>
    request(h.server()).get(`/api/v1/license-keys?${query}`).set(h.as(account));
  const reveal = (id: string, account: ApiAccount = h.it1) =>
    request(h.server()).post(`/api/v1/license-keys/${id}/reveal`).set(h.as(account));
  const imported = async (subscriptionId: string, list: string[]): Promise<ImportData> =>
    h.dataOf<ImportData>(await importKeys(subscriptionId, list).expect(201));
  const listed = async (subscriptionId: string, extra = ''): Promise<ListData> =>
    h.dataOf<ListData>(await listKeys(`subscriptionId=${subscriptionId}&pageSize=100${extra}`).expect(200));
  const keyCount = async (subscriptionId?: string): Promise<number> =>
    Number(
      (
        await h.ctx.sql.query<{ n: string }>(
          `SELECT count(*) AS n FROM license_keys WHERE $1::uuid IS NULL OR subscription_id = $1`,
          [subscriptionId ?? null],
        )
      ).rows[0].n,
    );
  const auditCount = async (action: string): Promise<number> =>
    Number(
      (await h.ctx.sql.query<{ n: string }>(`SELECT count(*) AS n FROM audit_events WHERE action = $1`, [action]))
        .rows[0].n,
    );
  const idOfLine = async (subscriptionId: string, masked: string): Promise<string> =>
    (
      await h.ctx.sql.query<{ id: string }>(`SELECT id FROM license_keys WHERE subscription_id = $1 AND masked = $2`, [
        subscriptionId,
        masked,
      ])
    ).rows[0].id;

  beforeAll(async () => {
    await h.start();
    const designer = await h.jobTitle('Designer');
    const department = await h.department('P-DES');
    const headId = await h.member('P-DES', 'E-HEAD', designer);
    head = await h.account('E-HEAD', headId, []);
    await request(h.server())
      .post(`/api/v1/departments/${department.id}/head-assignments`)
      .set(h.as(h.it1))
      .send({ employeeId: headId, effectiveFrom: h.today() })
      .expect(200);
    superAdmin = { ...h.it1, accessToken: h.admin };
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  it('US-04-12 AC-1: keeps the 50 keys of a purchase of 50, in the store, with a capacity of 50 and no warning', async () => {
    const subscriptionId = await h.subscription(50, 'K4');

    const result = await imported(subscriptionId, keys(50));

    expect(result).toEqual({
      imported: 50,
      errors: [],
      summary: { purchased: 50, usableKeys: 50, capacity: 50, warning: null },
    });
    const page = await listed(subscriptionId);
    expect(page.items).toHaveLength(50);
    expect(page.items.every((item) => item.status === 'IN_STORE')).toBe(true);
    expect(page.summary).toEqual(result.summary);
    expect(await auditCount('LICENSE_KEY.IMPORTED')).toBeGreaterThanOrEqual(1);
  });

  it('US-04-12 AC-1: reports a line of the wrong shape by its number and keeps the others', async () => {
    const subscriptionId = await h.subscription(50, 'K4');
    const [first, second, third] = keys(3);

    const result = await imported(subscriptionId, [first, 'short', second, 'has a space inside', '', third]);

    expect(result.imported).toBe(3);
    expect(result.errors).toEqual([
      { line: 2, code: 'INVALID_FORMAT' },
      { line: 4, code: 'INVALID_FORMAT' },
      { line: 5, code: 'INVALID_FORMAT' },
    ]);
    expect(await keyCount(subscriptionId)).toBe(3);
  });

  it('US-04-12 AC-1: keeps a batch of the most keys it takes, each of a usual length, in one request', async () => {
    const subscriptionId = await h.subscription(1000, 'K4');

    const result = await imported(subscriptionId, keys(1000, 'BIG'));

    expect(result).toMatchObject({ imported: 1000, errors: [] });
    expect(await keyCount(subscriptionId)).toBe(1000);
  }, 120000);

  it('US-04-12 AC-1: refuses an empty batch, more than 1000 keys, a missing or malformed purchase, and a field it does not know', async () => {
    const subscriptionId = await h.subscription(5, 'K4');
    const before = await keyCount();
    const post = (body: object) =>
      request(h.server()).post('/api/v1/license-keys/imports').set(h.as(h.it1)).send(body).expect(422);

    for (const body of [
      { subscriptionId, keys: [] },
      { subscriptionId, keys: Array.from({ length: 1001 }, (_, index) => `K${index}`) },
      { keys: keys(1) },
      { subscriptionId: 'not-a-uuid', keys: keys(1) },
      { subscriptionId, keys: keys(1), extra: true },
      { subscriptionId, keys: 'KEY-ONE' },
      { subscriptionId, keys: [123] },
    ]) {
      expect(h.codeOf(await post(body))).toBe('VALIDATION_ERROR');
    }
    expect(await keyCount()).toBe(before);
  });

  it('US-04-12 AC-2: shows a key masked, and keeps it only as ciphertext with a fingerprint, never in the clear', async () => {
    const subscriptionId = await h.subscription(5, 'K4');
    const [secret] = keys(1, 'SECRET');
    await imported(subscriptionId, [secret]);

    const response = await listKeys(`subscriptionId=${subscriptionId}`).expect(200);
    const row = (
      await h.ctx.sql.query<{ masked: string; ciphertext: Buffer; fingerprint: string; cipher_key_id: string }>(
        `SELECT masked, ciphertext, fingerprint, cipher_key_id FROM license_keys WHERE subscription_id = $1`,
        [subscriptionId],
      )
    ).rows[0];

    expect(h.dataOf<ListData>(response).items[0].masked).toBe(`••••${secret.slice(-4)}`);
    expect(JSON.stringify(response.body)).not.toContain(secret);
    expect(JSON.stringify(response.body)).not.toContain(row.fingerprint);
    expect(Object.keys(h.dataOf<ListData>(response).items[0]).sort()).toEqual([
      'id',
      'importedAt',
      'masked',
      'status',
      'subscriptionId',
    ]);
    expect(row.ciphertext.includes(Buffer.from(secret))).toBe(false);
    expect(row.ciphertext.length).toBeGreaterThan(28 + secret.length - 1);
    expect(row.cipher_key_id).toBe('test');
    const everything = (await h.ctx.sql.query(`SELECT to_jsonb(k)::text AS text FROM license_keys k`)).rows
      .map((r: { text: string }) => r.text)
      .join('');
    expect(everything).not.toContain(secret);
  });

  it('US-04-12 AC-2: leaves no key, fingerprint or secret in the audit trail of an import', async () => {
    const subscriptionId = await h.subscription(5, 'K4');
    const [secret] = keys(1, 'AUD');
    await imported(subscriptionId, [secret, 'short', secret]);

    const events = await h.auditOf('Subscription', subscriptionId);
    const event = events.find((e) => e.action === 'LICENSE_KEY.IMPORTED');

    expect(event?.after).toEqual({ subscriptionId, imported: 1, rejected: 2 });
    expect(JSON.stringify(events)).not.toContain(secret);
  });

  it('US-04-12 AC-3: gives the key in full to the IT Admin, with a trace of the viewer and the key each time, and no cache', async () => {
    const subscriptionId = await h.subscription(5, 'K4');
    const [secret] = keys(1, 'REV');
    await imported(subscriptionId, [`  ${secret}  `]);
    const id = await idOfLine(subscriptionId, `••••${secret.slice(-4)}`);

    const first = await reveal(id).expect(200);
    const second = await reveal(id, await h.account('E-IT2', await h.person('E-IT2'), ['IT_ADMIN'])).expect(200);

    expect(h.dataOf<{ id: string; value: string }>(first)).toEqual({ id, value: secret });
    expect(first.headers['cache-control']).toBe('no-store');
    expect(second.headers['cache-control']).toBe('no-store');
    const events = (await h.auditOf('LicenseKey', id)).filter((e) => e.action === 'LICENSE_KEY.REVEALED');
    expect(events).toHaveLength(2);
    expect(events[0].after).toEqual({ licenseKeyId: id, subscriptionId, assignmentId: null });
    expect(events[0].actor_roles).toEqual(['IT_ADMIN']);
    expect(JSON.stringify(events)).not.toContain(secret);
    const actors = (
      await h.ctx.sql.query<{ actor_app_user_id: string }>(
        `SELECT actor_app_user_id FROM audit_events WHERE action = 'LICENSE_KEY.REVEALED' AND resource_id = $1
          ORDER BY occurred_at, id`,
        [id],
      )
    ).rows.map((r) => r.actor_app_user_id);
    expect(new Set(actors).size).toBe(2);
  });

  it('US-04-12 AC-3: a key that does not exist is not found, and an id that is not an id is refused', async () => {
    expect(h.codeOf(await reveal(randomUUID()).expect(404))).toBe('LICENSE_KEY.NOT_FOUND');
    expect(h.codeOf(await reveal('not-a-uuid').expect(422))).toBe('VALIDATION_ERROR');
  });

  it('US-04-12 AC-3: a key that cannot be opened is a server error that names nothing, and leaves no trace of a reveal', async () => {
    const subscriptionId = await h.subscription(5, 'K4');
    const [secret] = keys(1, 'BAD');
    await imported(subscriptionId, [secret]);
    const id = await idOfLine(subscriptionId, `••••${secret.slice(-4)}`);
    await h.ctx.sql.query(`UPDATE license_keys SET ciphertext = $2 WHERE id = $1`, [id, Buffer.alloc(40, 7)]);
    const before = await auditCount('LICENSE_KEY.REVEALED');
    const written: string[] = [];
    const stdout = jest.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
      written.push(String(chunk));

      return true;
    });
    const stderr = jest.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      written.push(String(chunk));

      return true;
    });

    try {
      const response = await reveal(id).expect(500);

      expect(JSON.stringify(response.body)).not.toContain(secret);
    } finally {
      stdout.mockRestore();
      stderr.mockRestore();
    }

    expect(written.join('')).not.toContain(secret);
    expect(await auditCount('LICENSE_KEY.REVEALED')).toBe(before);
  });

  it('US-04-12 AC-4, AC-11: refuses every route to Finance, the department head, an employee and the Super Admin, and the vault does not change', async () => {
    const subscriptionId = await h.subscription(5, 'K4');
    const [secret] = keys(1, 'ROLE');
    await imported(subscriptionId, [secret]);
    const id = await idOfLine(subscriptionId, `••••${secret.slice(-4)}`);
    const [stranger] = keys(1, 'ROLE2');
    const keysBefore = await keyCount();
    const revealsBefore = await auditCount('LICENSE_KEY.REVEALED');
    const importsBefore = await auditCount('LICENSE_KEY.IMPORTED');

    for (const account of [h.finance, head, h.employee, superAdmin]) {
      const responses = [
        await reveal(id, account).expect(403),
        await listKeys(`subscriptionId=${subscriptionId}`, account).expect(403),
        await importKeys(subscriptionId, [stranger], account).expect(403),
      ];
      for (const response of responses) {
        expect(h.codeOf(response)).toBe('AUTHORIZATION.FORBIDDEN');
        expect(JSON.stringify(response.body)).not.toContain(secret);
      }
    }
    expect(await keyCount()).toBe(keysBefore);
    expect(await auditCount('LICENSE_KEY.REVEALED')).toBe(revealsBefore);
    expect(await auditCount('LICENSE_KEY.IMPORTED')).toBe(importsBefore);
    await request(h.server()).post(`/api/v1/license-keys/${id}/reveal`).expect(401);
    await request(h.server()).get(`/api/v1/license-keys?subscriptionId=${subscriptionId}`).expect(401);
  });

  it('US-04-12 AC-9: reports a key repeated in the batch on its later line, and one already in the vault, and keeps one copy', async () => {
    const subscriptionId = await h.subscription(10, 'K4');
    const [one, two, three] = keys(3, 'DUP');
    await imported(subscriptionId, [one]);

    const result = await imported(subscriptionId, [two, `  ${two}  `, one, three, two]);

    expect(result.imported).toBe(2);
    expect(result.errors).toEqual([
      { line: 2, code: 'DUPLICATE_IN_BATCH' },
      { line: 3, code: 'ALREADY_IN_STORE' },
      { line: 5, code: 'DUPLICATE_IN_BATCH' },
    ]);
    expect(await keyCount(subscriptionId)).toBe(3);
    expect(JSON.stringify(result)).not.toContain(one);
  });

  it('US-04-12 AC-9: a key is one key for the whole vault, whichever purchase it was imported for, and a key that differs in case is another', async () => {
    const first = await h.subscription(10, 'K4');
    const second = await h.subscription(10, 'K4');
    const [one] = keys(1, 'ORG');
    await imported(first, [one]);

    const result = await imported(second, [one, one.toLowerCase()]);

    expect(result.imported).toBe(1);
    expect(result.errors).toEqual([{ line: 1, code: 'ALREADY_IN_STORE' }]);
    expect(await keyCount(second)).toBe(1);
  });

  it('US-04-12 AC-9: two batches that add the same keys at the same time keep each key once, and every line of the loser is reported', async () => {
    const subscriptionId = await h.subscription(50, 'K4');
    const list = keys(20, 'RACE');

    const [a, b] = await Promise.all([
      importKeys(subscriptionId, list),
      importKeys(subscriptionId, [...list].reverse()),
    ]);
    expect([a.status, b.status]).toEqual([201, 201]);
    const results = [h.dataOf<ImportData>(a), h.dataOf<ImportData>(b)];

    expect(results[0].imported + results[1].imported).toBe(20);
    expect(results[0].errors.length + results[1].errors.length).toBe(20);
    expect(results.flatMap((r) => r.errors).every((error) => error.code === 'ALREADY_IN_STORE')).toBe(true);
    expect(await keyCount(subscriptionId)).toBe(20);
  }, 60000);

  it('US-04-12 AC-10: refuses a purchase of another kind of plan and keeps nothing, and keeps the keys of a perpetual purchase of a K4 plan', async () => {
    const k2 = await h.subscription(5, 'K2');
    const k1 = await h.subscription(5, 'K1');
    const before = await keyCount();
    const [one] = keys(1, 'PLAN');

    for (const subscriptionId of [k2, k1]) {
      const response = await importKeys(subscriptionId, [one]).expect(422);
      expect(h.codeOf(response)).toBe('LICENSE_KEY.PLAN_NOT_K4');
    }
    expect(await keyCount()).toBe(before);

    const application = h.dataOf<{ id: string }>(
      await request(h.server())
        .post('/api/v1/applications')
        .set(h.as(h.it1))
        .send({
          name: h.unique('Office'),
          kind: 'LICENSED',
          vendorName: h.unique('Vendor'),
          dataSensitivity: 'LOW',
          businessOwnerEmployeeId: h.businessOwner,
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
    const perpetual = h.dataOf<{ id: string }>(
      await request(h.server())
        .post('/api/v1/subscriptions')
        .set(h.as(h.it1))
        .send({
          ownerDepartmentId: h.seed.departmentId,
          planId,
          kind: 'PERPETUAL',
          purchasedQuantity: 3,
          unitPrice: { amount: '5000000', currency: 'VND' },
          startDate: '2026-01-05',
        })
        .expect(201),
    ).id;
    expect(await imported(perpetual, keys(3, 'PERP'))).toMatchObject({
      imported: 3,
      summary: { purchased: 3, usableKeys: 3, capacity: 3, warning: null },
    });
  });

  it('F23, US-04-01 AC-9: refuses to enter a key for a purchase whose application is retired: 422 LICENSE_KEY.APPLICATION_RETIRED, nothing is kept', async () => {
    const subscriptionId = await h.subscription(5, 'K4');
    await imported(subscriptionId, keys(2, 'LIVE'));
    await h.ctx.sql.query(
      `UPDATE applications SET catalog_status = 'RETIRED', retired_at = now()
        WHERE id = (SELECT p.application_id FROM plans p JOIN subscriptions s ON s.plan_id = p.id WHERE s.id = $1)`,
      [subscriptionId],
    );
    const before = await keyCount();

    const refused = await importKeys(subscriptionId, keys(3, 'GONE')).expect(422);

    expect(h.codeOf(refused)).toBe('LICENSE_KEY.APPLICATION_RETIRED');
    expect(await keyCount()).toBe(before);
  });

  it('US-04-12 AC-10: a purchase that does not exist is not found, for an import and for a list', async () => {
    const missing = randomUUID();
    const before = await keyCount();

    expect(h.codeOf(await importKeys(missing, keys(1, 'NF')).expect(404))).toBe('SUBSCRIPTION.NOT_FOUND');
    expect(h.codeOf(await listKeys(`subscriptionId=${missing}`).expect(404))).toBe('SUBSCRIPTION.NOT_FOUND');
    expect(await keyCount()).toBe(before);
  });

  it('US-04-12 AC-12: the capacity is the smaller of the seats bought and the keys, with a warning when they differ', async () => {
    const subscriptionId = await h.subscription(50, 'K4');

    expect((await imported(subscriptionId, keys(48, 'CAP'))).summary).toEqual({
      purchased: 50,
      usableKeys: 48,
      capacity: 48,
      warning: 'KEY_COUNT_DIFFERS',
    });
    expect((await imported(subscriptionId, keys(4, 'CAP'))).summary).toEqual({
      purchased: 50,
      usableKeys: 52,
      capacity: 50,
      warning: 'KEY_COUNT_DIFFERS',
    });
    expect((await listed(subscriptionId)).summary).toEqual({
      purchased: 50,
      usableKeys: 52,
      capacity: 50,
      warning: 'KEY_COUNT_DIFFERS',
    });
  });

  it('US-04-12 AC-12: a retired key is not counted, and an assigned one is', async () => {
    const subscriptionId = await h.subscription(50, 'K4');
    await imported(subscriptionId, keys(50, 'RET'));
    await h.ctx.sql.query(
      `UPDATE license_keys SET status = 'RETIRED'
        WHERE id IN (SELECT id FROM license_keys WHERE subscription_id = $1 ORDER BY id LIMIT 2)`,
      [subscriptionId],
    );
    await h.ctx.sql.query(
      `UPDATE license_keys SET status = 'ASSIGNED'
        WHERE id IN (SELECT id FROM license_keys WHERE subscription_id = $1 AND status = 'IN_STORE' ORDER BY id LIMIT 3)`,
      [subscriptionId],
    );

    const page = await listed(subscriptionId);

    expect(page.summary).toEqual({ purchased: 50, usableKeys: 48, capacity: 48, warning: 'KEY_COUNT_DIFFERS' });
    expect((await listed(subscriptionId, '&status=RETIRED')).items).toHaveLength(2);
    expect((await listed(subscriptionId, '&status=ASSIGNED')).items).toHaveLength(3);
    expect((await listed(subscriptionId, '&status=IN_STORE')).items).toHaveLength(45);
  });

  it('US-04-12 AC-12: while the seats bought are not known the capacity is 0 and the warning says so', async () => {
    const subscriptionId = await h.subscription(null, 'K4');

    const result = await imported(subscriptionId, keys(5, 'UNK'));

    expect(result.imported).toBe(5);
    expect(result.summary).toEqual({ purchased: null, usableKeys: 5, capacity: 0, warning: 'QUANTITY_UNKNOWN' });
  });

  it('lists the keys of a purchase page by page, the oldest first, and refuses a page that is not a page', async () => {
    const subscriptionId = await h.subscription(10, 'K4');
    await imported(subscriptionId, keys(7, 'PAGE'));

    const first = h.dataOf<ListData>(await listKeys(`subscriptionId=${subscriptionId}&pageSize=3`).expect(200));
    const last = h.dataOf<ListData>(await listKeys(`subscriptionId=${subscriptionId}&pageSize=3&page=3`).expect(200));

    expect(first.items).toHaveLength(3);
    expect(first.pagination).toEqual({ page: 1, pageSize: 3, totalItems: 7, totalPages: 3 });
    expect(last.items).toHaveLength(1);
    const everyId = new Set([
      ...first.items.map((i) => i.id),
      ...h
        .dataOf<ListData>(await listKeys(`subscriptionId=${subscriptionId}&pageSize=3&page=2`))
        .items.map((i) => i.id),
      ...last.items.map((i) => i.id),
    ]);
    expect(everyId.size).toBe(7);
    for (const query of ['pageSize=0', 'pageSize=101', 'page=0', 'status=LOST', 'unknown=1']) {
      expect(h.codeOf(await listKeys(`subscriptionId=${subscriptionId}&${query}`).expect(422))).toBe(
        'VALIDATION_ERROR',
      );
    }
    expect(h.codeOf(await listKeys('').expect(422))).toBe('VALIDATION_ERROR');
  });
});
