import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { addDays } from '../../../src/core/business-date';
import { declareSubscription } from '../../support/builders/catalog.builder';
import { PgRelay } from '../../support/pg-relay';
import { QueryCounter, dataStatements, tablesOf } from '../../support/query-count';
import { type Department, type Person, RequestHarness } from '../../support/request-harness';

const h = new RequestHarness();

/**
 * API-LIST-DETAIL.1 §6 (SPEC D9) for the lists `IA-1` changed, `GET /grant-queue` and `GET /subscriptions`: the number of statements does not
 * grow with the number of rows, the people who hold the seats or the people who answer, and a table the list has no use for is not read. The
 * statements are counted at the wire of the database, through a relay, on two sizes of the same data.
 */
describe('requests and catalog: the statements of the queue of grants and of the subscriptions (integration, real PostgreSQL)', () => {
  let relay: PgRelay;
  let counter: QueryCounter;
  let design: Department;
  let head: Person;
  let itAdmin: Person;
  let free: string;
  let designer: string;
  let sequence = 0;

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
    design = await h.departmentWithUnit('P-QC');
    head = await h.staff(design, 'QC-H1');
    await h.makeHead(design, head);
    itAdmin = { employeeId: h.it1.employeeId, account: h.it1 };
    await h.setItAdminInCharge(design, itAdmin);
    free = await h.plan('K5');
    designer = await h.title();
  }, 240000);

  afterAll(async () => {
    await h.stop();
    await relay?.stop();
  });

  const read = (path: string) =>
    counter.run(() => request(h.server()).get(path).set(h.as(itAdmin.account)).expect(200));
  const itemsOf = (response: request.Response) => h.dataOf<{ items: unknown[] }>(response).items;
  const statementsOf = (counted: { statements: string[] }) => dataStatements(counted.statements).length;
  const tablesRead = (counted: { statements: string[] }) =>
    new Set(dataStatements(counted.statements).flatMap(tablesOf));

  /** A request of a person of the department that the head approved: it waits to be granted. */
  const waiting = async (): Promise<string> => {
    sequence += 1;
    const who = await h.staff(design, `QC-E${sequence}`);
    const sent = await h.sent(who, free);
    await h.decide(sent.id, { decision: 'APPROVE' }, head.account).expect(200);

    return sent.id;
  };
  /** The same, granted and taken: a task of the IT Admin exists for it. */
  const carriedOut = async (): Promise<void> => {
    await h.grant({ requestId: await waiting() }).expect(201);
  };

  describe('GET /grant-queue', () => {
    it('reads the same number of statements whatever the number of rows, with one read of the tasks for the page', async () => {
      await waiting();
      await carriedOut();
      const few = await read('/api/v1/grant-queue?pageSize=100');
      for (let index = 0; index < 3; index += 1) await waiting();
      for (let index = 0; index < 3; index += 1) await carriedOut();
      const many = await read('/api/v1/grant-queue?pageSize=100');

      expect(itemsOf(few.result).length).toBeGreaterThanOrEqual(2);
      expect(itemsOf(many.result)).toHaveLength(itemsOf(few.result).length + 6);
      expect(statementsOf(many)).toBe(statementsOf(few));
      for (const unused of ['audit_events', 'access_request_events', 'subscriptions']) {
        expect({ unused, read: tablesRead(many).has(unused) }).toEqual({ unused, read: false });
      }
    }, 180000);

    it('reads the same number of statements for a page that holds both kinds of rows as for all of it', async () => {
      const whole = await read('/api/v1/grant-queue?pageSize=100');
      // The waiting rows come first: a page of six holds the four waiting ones and two that have a task.
      const page = await read('/api/v1/grant-queue?pageSize=6&page=1');

      expect(itemsOf(page.result)).toHaveLength(6);
      expect(statementsOf(page)).toBe(statementsOf(whole));
    });
  });

  describe('GET /subscriptions', () => {
    /** A priced subscription of a K2 plan with some of its seats taken: the usual row of the list. */
    const subscribed = async (seats: number): Promise<void> => {
      const subscriptionId = await h.subscription(10, 'K2');
      const planId = await h.planOf(subscriptionId);
      for (let index = 0; index < seats; index += 1) {
        sequence += 1;
        const id = randomUUID();
        const employeeId = await h.member(design.code, `QS-E${sequence}`, designer);
        await h.ctx.sql.query(
          `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id,
             account_identifier, normalized_account_identifier, valid_from, valid_from_basis, created_by_app_user_id)
           VALUES ($1, $2, 'PERSONAL', 'REQUEST', $3, $4, $5, $6, $6, '2026-10-01', 'ACTUAL', $7)`,
          [id, h.seed.organizationId, planId, subscriptionId, employeeId, `${id.slice(0, 8)}@acme.vn`, randomUUID()],
        );
      }
    };
    /** A monthly subscription whose payment day is three days away: the filter by expiry finds it. */
    const soonSubscription = async (): Promise<void> => {
      await declareSubscription(h.ctx, h.it1.accessToken, {
        planId: await h.plan('K2'),
        kind: 'TERM',
        unitPrice: { amount: '1000000', currency: 'VND' },
        billingCycle: 'MONTHLY',
        startDate: '2026-01-05',
        purchasedQuantity: 5,
        renewalDate: addDays(h.today(), 3),
      });
    };
    const seatReads = (counted: { statements: string[] }) =>
      dataStatements(counted.statements).filter((statement) => /\blicense_assignments\b/i.test(statement)).length;

    it('reads the same number of statements whatever the number of rows, of seats and of people who answer', async () => {
      await subscribed(2);
      const few = await read('/api/v1/subscriptions?pageSize=100');
      for (let index = 0; index < 3; index += 1) await subscribed(index);
      const many = await read('/api/v1/subscriptions?pageSize=100');

      expect(itemsOf(many.result).length).toBeGreaterThan(itemsOf(few.result).length);
      expect(statementsOf(many)).toBe(statementsOf(few));
      for (const unused of ['audit_events', 'access_request_events']) {
        expect({ unused, read: tablesRead(many).has(unused) }).toEqual({ unused, read: false });
      }
    }, 180000);

    it('reads the seats of the whole page in one statement, for a page and for the subscriptions the caller answers for as well', async () => {
      const whole = await read('/api/v1/subscriptions?pageSize=100');
      const page = await read('/api/v1/subscriptions?pageSize=2&page=2');
      const mine = await read('/api/v1/subscriptions?mine=true&pageSize=100');

      expect(itemsOf(page.result)).toHaveLength(2);
      expect(seatReads(whole)).toBe(1);
      expect(seatReads(page)).toBe(1);
      expect(seatReads(mine)).toBe(1);
      expect(statementsOf(page)).toBe(statementsOf(whole));
      expect(statementsOf(mine)).toBe(statementsOf(whole));
    });

    it('reads the same number of statements for the filter by expiry whatever the number of subscriptions it finds', async () => {
      await soonSubscription();
      const few = await read('/api/v1/subscriptions?expiry=SOON&pageSize=100');
      for (let index = 0; index < 3; index += 1) await soonSubscription();
      const many = await read('/api/v1/subscriptions?expiry=SOON&pageSize=100');

      expect(itemsOf(few.result)).toHaveLength(1);
      expect(itemsOf(many.result)).toHaveLength(4);
      expect(statementsOf(many)).toBe(statementsOf(few));
    }, 180000);
  });
});
