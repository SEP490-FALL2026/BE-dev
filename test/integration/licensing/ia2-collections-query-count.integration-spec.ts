import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { PgRelay } from '../../support/pg-relay';
import { QueryCounter, dataStatements, tablesOf } from '../../support/query-count';
import { RevocationHarness } from '../../support/revocation-harness';

const h = new RevocationHarness();

/**
 * API-LIST-DETAIL.1 §6 (SPEC D9) for the two lists `IA-2` made, `GET /stock-summary` and `GET /license-assignments`: the number of statements does
 * not grow with the number of plans or of rows, each kind of count is one statement for the whole page, and a table the list has no use for is not
 * read. The statements are counted at the wire of the database, through a relay, on two sizes of the same data.
 */
describe('licensing: the statements of the stock summary and of the list of assignments (integration, real PostgreSQL)', () => {
  let relay: PgRelay;
  let counter: QueryCounter;
  let sequence = 0;
  let keyBatch = 0;
  const code = () => `E-QC-${(sequence += 1)}`;

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
  }, 240000);

  afterAll(async () => {
    await h.stop();
    await relay?.stop();
  });

  const read = (path: string) => counter.run(() => request(h.server()).get(path).set(h.as(h.it1)).expect(200));
  const itemsOf = (response: request.Response) => h.dataOf<{ items: { id?: string }[] }>(response).items;
  const statementsOf = (counted: { statements: string[] }) => dataStatements(counted.statements).length;
  const tablesRead = (counted: { statements: string[] }) =>
    new Set(dataStatements(counted.statements).flatMap(tablesOf));
  const readsOf = (counted: { statements: string[] }, table: string) =>
    dataStatements(counted.statements).filter((statement) => tablesOf(statement).includes(table)).length;

  /** An assignment that began long ago, by SQL: a seat of a subscription, held by a new person. */
  const insertSeat = async (subscriptionId: string): Promise<string> => {
    const id = randomUUID();
    await h.ctx.sql.query(
      `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id,
         account_identifier, normalized_account_identifier, valid_from, valid_from_basis, created_by_app_user_id)
       VALUES ($1, $2, 'PERSONAL', 'REQUEST', $3, $4, $5, $6, $6, '2026-02-01', 'ACTUAL', $7)`,
      [
        id,
        h.seed.organizationId,
        await h.planOf(subscriptionId),
        subscriptionId,
        await h.person(code()),
        `${id.slice(0, 8)}@acme.vn`,
        randomUUID(),
      ],
    );

    return id;
  };

  /** One plan of each of the three kinds, each with something to count: a seat being taken back, keys in the store and given, a right. */
  const plansOfEachKind = async (): Promise<void> => {
    const k2 = await h.subscription(10, 'K2');
    await h.open(await insertSeat(k2), 'RETURN');
    await insertSeat(k2);
    const k4 = await h.subscription(4, 'K4');
    keyBatch += 1;
    await request(h.server())
      .post('/api/v1/license-keys/imports')
      .set(h.as(h.it1))
      .send({ subscriptionId: k4, keys: [`QC${keyBatch}-001-ABCDE-12345`, `QC${keyBatch}-002-ABCDE-12345`] })
      .expect(201);
    const k1 = await h.subscription(10, 'K1');
    await insertSeat(k1);
  };

  describe('GET /stock-summary', () => {
    it('reads the same number of statements whatever the number of plans, one for each kind of count, and nothing it has no use for', async () => {
      await plansOfEachKind();
      const few = await read('/api/v1/stock-summary?pageSize=100');
      for (let index = 0; index < 3; index += 1) await plansOfEachKind();
      const many = await read('/api/v1/stock-summary?pageSize=100');

      expect(itemsOf(few.result)).toHaveLength(2);
      expect(itemsOf(many.result)).toHaveLength(8);
      expect(statementsOf(many)).toBe(statementsOf(few));
      expect(readsOf(many, 'license_keys')).toBe(1);
      expect(readsOf(many, 'license_assignments')).toBe(1);
      for (const unused of ['audit_events', 'access_requests', 'access_request_events']) {
        expect({ unused, read: tablesRead(many).has(unused) }).toEqual({ unused, read: false });
      }
    }, 240000);

    it('reads the same number of statements for a page, for the plans of the caller and for one plan as for all of them', async () => {
      const whole = await read('/api/v1/stock-summary?pageSize=100');
      const page = await read('/api/v1/stock-summary?pageSize=3&page=2');
      const mine = await read('/api/v1/stock-summary?mine=true&pageSize=100');

      expect(itemsOf(page.result)).toHaveLength(3);
      expect(statementsOf(page)).toBe(statementsOf(whole));
      expect(statementsOf(mine)).toBe(statementsOf(whole));
    });
  });

  describe('GET /license-assignments', () => {
    /** A subscription with `seats` seats held, `revoking` of them with a task that takes them back. */
    const held = async (seats: number, revoking: number): Promise<string> => {
      const subscriptionId = await h.subscription(100, 'K2');
      for (let index = 0; index < seats; index += 1) {
        const assignmentId = await insertSeat(subscriptionId);
        if (index < revoking) await h.open(assignmentId, 'RETURN');
      }

      return subscriptionId;
    };

    it('reads the same number of statements whatever the number of rows and of revocations, the tasks of the page in one', async () => {
      const fewOf = await held(3, 1);
      const manyOf = await held(30, 20);
      const few = await read(`/api/v1/license-assignments?subscriptionId=${fewOf}&activeOnly=true&pageSize=100`);
      const many = await read(`/api/v1/license-assignments?subscriptionId=${manyOf}&activeOnly=true&pageSize=100`);

      expect(itemsOf(few.result)).toHaveLength(3);
      expect(itemsOf(many.result)).toHaveLength(30);
      expect(statementsOf(many)).toBe(statementsOf(few));
      expect(readsOf(many, 'provisioning_tasks')).toBe(1);
      for (const unused of ['audit_events', 'access_requests', 'license_keys']) {
        expect({ unused, read: tablesRead(many).has(unused) }).toEqual({ unused, read: false });
      }
    }, 300000);

    it('reads the same number of statements for a page of the rows as for all of them, and with the filter as without it', async () => {
      const subscriptionId = await held(12, 4);
      const whole = await read(`/api/v1/license-assignments?subscriptionId=${subscriptionId}&pageSize=100`);
      const page = await read(`/api/v1/license-assignments?subscriptionId=${subscriptionId}&pageSize=5&page=2`);
      const active = await read(
        `/api/v1/license-assignments?subscriptionId=${subscriptionId}&activeOnly=true&pageSize=100`,
      );

      expect(itemsOf(page.result)).toHaveLength(5);
      expect(statementsOf(page)).toBe(statementsOf(whole));
      expect(statementsOf(active)).toBe(statementsOf(whole));
    }, 300000);
  });
});
