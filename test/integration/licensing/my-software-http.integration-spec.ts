import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { LicensingRenewalApi } from '../../../src/modules/licensing/public/licensing-renewal.api';
import type { ApiAccount } from '../../support/api-accounts';
import { PgRelay } from '../../support/pg-relay';
import { dataStatements, QueryCounter, tablesOf } from '../../support/query-count';
import { RevocationHarness } from '../../support/revocation-harness';

const h = new RevocationHarness();

interface RightWire {
  assignmentId: string;
  application: { id: string; name: string };
  plan: { id: string; name: string };
  provisioningType: string;
  status: string;
  effectiveFrom: string;
  grantedOn: string | null;
  effectiveFromLabel: string | null;
  expectedEndDate: string | null;
  expiringSoon: boolean;
  validUntil: string | null;
  successorAssignmentId: string | null;
}
interface PageWire {
  asOf: string;
  view: string;
  items: RightWire[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

/** A key of the K4 purchase the caller holds a right on: neither it nor its masked form may appear in an answer. */
const KEY = 'OFC21-SECRT-KEY42-ABCDE-98765';

/**
 * `US-12-15` AC-2, `US-16-01` AC-1: "my software" over HTTP on real PostgreSQL. The Employee reads every right they hold on the
 * business day across the kinds of provisioning (K1, K2, K4, K5) with its status and end day, the rights that start later and those
 * that ended; never the rights of another person, a price, an account identifier or the key of a K4 purchase; and only the Employee
 * role reads it.
 */
describe('my software rights (integration, real PostgreSQL)', () => {
  let relay: PgRelay;
  let counter: QueryCounter;
  let e1: ApiAccount;
  let e2: ApiAccount;
  let e3: ApiAccount;
  const seats: Record<string, string> = {};
  let renewedTo: string;
  let failedGrant: string;
  let keyMask: string;

  const read = (account: ApiAccount | null, query: Record<string, string | number> = {}) => {
    const call = request(h.server()).get('/api/v1/me/software-rights').query(query);

    return account ? call.set(h.as(account)) : call;
  };
  const pageOf = async (account: ApiAccount, query: Record<string, string | number> = {}): Promise<PageWire> =>
    h.dataOf<PageWire>(await read(account, { pageSize: 100, ...query }).expect(200));
  const rightOf = async (account: ApiAccount, assignmentId: string, view = 'current') =>
    (await pageOf(account, { view })).items.find((item) => item.assignmentId === assignmentId);

  /** A seat of the person on the target from long ago, as a baseline records it; returns its assignment. */
  const seat = async (code: string, target: { subscriptionId?: string; planId?: string }, end?: string) => {
    const employeeId = await h.person(code);
    await h.written(target, [
      {
        employee_code: code,
        account_identifier: `${code.toLowerCase()}@acme.vn`,
        granted_on: '2026-01-05',
        ...(end ? { expected_end_date: end } : {}),
      },
    ]);
    const found = (
      await h.assignmentsOf(
        target.subscriptionId ? { subscriptionId: target.subscriptionId } : { planId: target.planId ?? '' },
      )
    ).find((assignment) => assignment.employeeId === employeeId);
    if (!found) throw new Error(`no seat of ${code}`);

    return found.id;
  };

  /**
   * A K4 right: no route grants one yet (the key goes with a company device, which waits for the device registry), so the row is
   * written as a grant would write it, and a key of the purchase is put in the vault beside it.
   */
  const k4Right = async (employeeId: string, subscriptionId: string): Promise<string> => {
    const planId = await h.planOf(subscriptionId);
    const { rows } = await h.ctx.sql.query<{ id: string }>(
      `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id,
              account_identifier, normalized_account_identifier, valid_from, valid_from_basis, created_by_app_user_id)
       VALUES (gen_random_uuid(), $1, 'PERSONAL', 'REQUEST', $2, $3, $4, $6, $6, '2026-02-01', 'ACTUAL', $5)
       RETURNING id`,
      [h.seed.organizationId, planId, subscriptionId, employeeId, h.it1.appUserId, `device-${employeeId.slice(0, 8)}`],
    );

    return rows[0].id;
  };

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
    e1 = await h.account('MS-E1', await h.person('MS-E1'), ['EMPLOYEE']);
    e2 = await h.account('MS-E2', await h.person('MS-E2'), ['EMPLOYEE']);
    e3 = await h.account('MS-E3', await h.person('MS-E3'), ['IT_ADMIN']);

    const figma = await h.subscription(10, 'K2');
    const office = await h.subscription(10, 'K4');
    seats.figma = await seat('MS-E1', { subscriptionId: figma });
    seats.office = await k4Right(e1.employeeId, office);
    seats.notion = await seat('MS-E1', { subscriptionId: await h.subscription(10, 'K1') }, h.inDays(5));
    seats.portal = await seat('MS-E1', { planId: await h.plan('K5') });
    seats.expired = await seat('MS-E1', { subscriptionId: await h.subscription(10, 'K1') }, h.inDays(-3));
    seats.renewed = await seat('MS-E1', { subscriptionId: await h.subscription(10, 'K2') }, h.inDays(4));
    seats.revoking = await seat('MS-E1', { subscriptionId: await h.subscription(10, 'K2') });
    seats.ending = await seat('MS-E1', { subscriptionId: await h.subscription(10, 'K1') });
    seats.gone = await seat('MS-E1', { subscriptionId: await h.subscription(10, 'K2') });
    // The other person holds seats of the same purchases; the third holds one internal right.
    seats.e2Figma = await seat('MS-E2', { subscriptionId: figma });
    seats.e2Office = await k4Right(e2.employeeId, office);
    seats.e3Portal = await seat('MS-E3', { planId: await h.plan('K5') });
    // The vault of the K4 purchase holds a key; the IT Admin imports it the way the route does it.
    await request(h.server())
      .post('/api/v1/license-keys/imports')
      .set(h.as(h.it1))
      .send({ subscriptionId: office, keys: [KEY] })
      .expect(201);
    keyMask = (
      await h.ctx.sql.query<{ masked: string }>(`SELECT masked FROM license_keys WHERE subscription_id = $1`, [office])
    ).rows[0].masked;

    // A grant that is not done; a grant that failed and was closed, which never held anything.
    const grantTarget = await h.subscription(10, 'K2');
    seats.provisioning = (
      await h.granted(e1.employeeId, await h.planOf(grantTarget), { subscriptionId: grantTarget })
    ).assignmentId;
    const failTarget = await h.subscription(10, 'K2');
    const doomed = await h.granted(e1.employeeId, await h.planOf(failTarget), { subscriptionId: failTarget });
    failedGrant = doomed.assignmentId;
    await h.claim(doomed.id).expect(200);
    await h.fail(doomed.id, { reason: 'could not be done' }).expect(200);
    await h.closeFailed(doomed.id, { reason: 'nhà cung cấp không tạo được tài khoản' }).expect(200);

    // A renewal decided before the end: the old record runs to its end and the new one takes over that day.
    const renewal = await h.ctx.app.get(TransactionRunner).run((tx) =>
      h.ctx.app.get(LicensingRenewalApi).renewAssignment(tx, h.actorOf(h.it1), {
        assignmentId: seats.renewed,
        requestId: randomUUID(),
        previousExpectedEndDate: h.inDays(4),
        newExpectedEndDate: h.inDays(95),
        now: new Date(),
      }),
    );
    renewedTo = renewal.successorAssignmentId;

    // A revocation still open; a K1 renewal cancelled with access to the end of the paid period; a seat removed today.
    await h.open(seats.revoking, 'ABRUPT_DEPARTURE');
    const ending = await h.open(seats.ending, 'ABRUPT_DEPARTURE');
    await h.claim(ending.taskId).expect(200);
    await h
      .revoked(ending.taskId, {
        completion: 'RENEWAL_CANCELLED',
        evidence: 'đã hủy gia hạn',
        paidThroughOn: h.inDays(10),
        accessState: 'UNTIL_PAID_END',
      })
      .expect(200);
    const gone = await h.open(seats.gone, 'ABRUPT_DEPARTURE');
    await h.claim(gone.taskId).expect(200);
    await h.revoked(gone.taskId, { completion: 'ACCOUNT_REMOVED', evidence: 'đã xóa tài khoản' }).expect(200);
  }, 300000);

  afterAll(async () => {
    await h.stop();
    await relay?.stop();
  });

  // US-12-15 AC-2, US-16-01 AC-1: the software granted, K4 included.
  it('lists every right the Employee holds today or later, across K1, K2, K4 and K5, and nothing else', async () => {
    const page = await pageOf(e1);

    expect(page.asOf).toBe(h.today());
    expect(page.view).toBe('current');
    expect(page.items.map((item) => item.assignmentId).sort()).toEqual(
      [
        seats.figma,
        seats.office,
        seats.notion,
        seats.portal,
        seats.expired,
        seats.renewed,
        renewedTo,
        seats.revoking,
        seats.ending,
        seats.provisioning,
      ].sort(),
    );
    expect(page.pagination.totalItems).toBe(10);
    expect(new Set(page.items.map((item) => item.provisioningType))).toEqual(new Set(['K1', 'K2', 'K4', 'K5']));
    expect(page.items.find((item) => item.assignmentId === seats.figma)).toMatchObject({
      provisioningType: 'K2',
      status: 'ACTIVE',
      effectiveFrom: '2026-01-05',
      grantedOn: '2026-01-05',
      expectedEndDate: null,
      expiringSoon: false,
      validUntil: null,
    });
    expect(page.items.find((item) => item.assignmentId === seats.portal)).toMatchObject({
      provisioningType: 'K5',
      status: 'ACTIVE',
    });
  });

  it('shows a K4 right as granted and never the key of its purchase, an account identifier or a price', async () => {
    const page = await pageOf(e1);
    const office = page.items.find((item) => item.assignmentId === seats.office);

    expect(office).toMatchObject({ provisioningType: 'K4', status: 'ACTIVE', effectiveFrom: '2026-02-01' });
    const wire = JSON.stringify(page);
    for (const secret of [
      KEY,
      keyMask,
      'ABCDE',
      '98765',
      'fingerprint',
      'ciphertext',
      'device-',
      '@acme.vn',
      '1000000',
      'costCenter',
    ]) {
      expect(wire).not.toContain(secret);
    }
  });

  // US-16-01 AC-1: the end day of the time-limited right; US-03-05 AC-2: expired from the day after it.
  it('tells the end day of a time-limited right and that it is about to end, and an end that passed as expired', async () => {
    expect(await rightOf(e1, seats.notion)).toMatchObject({
      provisioningType: 'K1',
      status: 'ACTIVE',
      expectedEndDate: h.inDays(5),
      expiringSoon: true,
    });
    expect(await rightOf(e1, seats.expired)).toMatchObject({
      status: 'EXPIRED',
      expectedEndDate: h.inDays(-3),
      expiringSoon: false,
      validUntil: null,
    });
  });

  it('reads the status at the business day: a renewal that takes over later is upcoming and the old record is not about to end', async () => {
    expect(await rightOf(e1, seats.renewed)).toMatchObject({
      status: 'ACTIVE',
      validUntil: h.inDays(4),
      expiringSoon: false,
      successorAssignmentId: renewedTo,
    });
    expect(await rightOf(e1, renewedTo)).toMatchObject({
      status: 'UPCOMING',
      effectiveFrom: h.inDays(4),
      expectedEndDate: h.inDays(95),
      successorAssignmentId: null,
    });
  });

  it('tells a grant not done yet, an open revocation and a K1 access running to the end of the paid period', async () => {
    expect(await rightOf(e1, seats.provisioning)).toMatchObject({ status: 'PROVISIONING', validUntil: null });
    expect(await rightOf(e1, seats.revoking)).toMatchObject({ status: 'REVOKING', validUntil: null });
    expect(await rightOf(e1, seats.ending)).toMatchObject({
      provisioningType: 'K1',
      status: 'ENDING',
      validUntil: h.inDays(10),
    });
  });

  it('keeps a right that ended out of the current list and shows it among the ended ones; a failed grant is in neither', async () => {
    expect(await rightOf(e1, seats.gone)).toBeUndefined();

    const ended = await pageOf(e1, { view: 'ended' });

    expect(ended.view).toBe('ended');
    expect(ended.items.map((item) => item.assignmentId)).toEqual([seats.gone]);
    expect(ended.items[0]).toMatchObject({ status: 'ENDED', validUntil: h.today() });
    const everywhere = [...(await pageOf(e1)).items, ...ended.items].map((item) => item.assignmentId);
    expect(everywhere).not.toContain(failedGrant);
  });

  // US-16-01 AC-1, US-12-15 AC-2: no data of anyone else.
  it('never shows the rights of another person, even of the same purchases', async () => {
    const mine = (await pageOf(e1)).items.map((item) => item.assignmentId);
    const theirs = (await pageOf(e2)).items.map((item) => item.assignmentId);

    expect(theirs.sort()).toEqual([seats.e2Figma, seats.e2Office].sort());
    expect(mine).not.toContain(seats.e2Figma);
    expect(mine).not.toContain(seats.e2Office);
    expect(theirs).not.toContain(seats.figma);
    expect((await pageOf(e2, { view: 'ended' })).items).toEqual([]);
  });

  it('lets a person who holds the Employee role besides another role read their own list only', async () => {
    expect((await pageOf(e3)).items.map((item) => item.assignmentId)).toEqual([seats.e3Portal]);
  });

  it('reads the own list for every role and refuses an anonymous call', async () => {
    for (const headers of [h.as(h.it1), h.as(h.finance), h.as(h.employee), { Authorization: `Bearer ${h.admin}` }]) {
      const response = await request(h.server()).get('/api/v1/me/software-rights').set(headers).expect(200);
      expect(h.dataOf<{ items: unknown[] }>(response).items).toEqual([]);
    }
    expect(h.codeOf(await read(null).expect(401))).toBe('AUTHENTICATION_REQUIRED');
  });

  it('pages in a stable order, oldest start first then by id, with the same total on every page', async () => {
    const all = (await pageOf(e1)).items;
    const pages: PageWire[] = [];
    for (let page = 1; page <= 4; page += 1) pages.push(await pageOf(e1, { page, pageSize: 3 }));

    expect(pages.map((page) => page.pagination.totalItems)).toEqual([10, 10, 10, 10]);
    expect(pages.map((page) => page.items.length)).toEqual([3, 3, 3, 1]);
    expect(pages.flatMap((page) => page.items.map((item) => item.assignmentId))).toEqual(
      all.map((item) => item.assignmentId),
    );
    const keys = all.map((item) => `${item.effectiveFrom} ${item.assignmentId}`);
    expect(keys).toEqual([...keys].sort());
    expect(h.codeOf(await read(e1, { pageSize: 101 }).expect(422))).toBe('VALIDATION_ERROR');
    expect(h.codeOf(await read(e1, { employeeId: e2.employeeId }).expect(422))).toBe('VALIDATION_ERROR');
  });

  it('reads a page in a fixed number of statements however many rights it holds, and never the key vault', async () => {
    const statements = async (account: ApiAccount) => {
      const run = await counter.run(() => read(account, { pageSize: 100 }).expect(200));

      return dataStatements(run.statements);
    };
    const small = await statements(e3);
    const large = await statements(e1);

    expect(large.length).toBe(small.length);
    const tables = new Set(large.flatMap(tablesOf));
    for (const table of ['license_keys', 'cost_centers', 'subscriptions']) expect(tables.has(table)).toBe(false);
  });
});
