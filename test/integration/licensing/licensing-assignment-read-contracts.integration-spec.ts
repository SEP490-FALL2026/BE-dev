import request from 'supertest';
import { pretendBusinessToday } from '../../support/pretend-today';
import { PgRelay } from '../../support/pg-relay';
import { QueryCounter, dataStatements, tablesOf } from '../../support/query-count';
import { AssignmentWire, SeatHarness } from '../../support/seat-baseline-harness';
import { legacyServiceAccount } from '../../support/legacy-service-account';

const h = new SeatHarness();

interface ListedAssignment extends AssignmentWire {
  employee: { employeeId: string; employeeCode: string; fullName: string };
  plan: { planId: string; planName: string; applicationName: string };
  costCenter: { id: string; code: string; name: string } | null;
}

/** LD-10 and LD-11 of the post-merge review: the assignment list names what it points at in a fixed number of statements. */
describe('assignment and license key read contracts (integration, real PostgreSQL)', () => {
  let relay: PgRelay;
  let counter: QueryCounter;

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
    pretendBusinessToday(h.ctx.app, '2026-12-01');
  }, 120000);

  afterAll(async () => {
    jest.restoreAllMocks();
    await h.stop();
    await relay?.stop();
  });

  const list = (query: object) =>
    counter.run(() => request(h.server()).get('/api/v1/license-assignments').query(query).set(h.as(h.it1)).expect(200));
  const row = (code: string) => ({ employee_code: code, account_identifier: `${code.toLowerCase()}@acme.vn` });

  it('names the person, the plan and the Cost Center of every row, and takes the same statements for 5 rows as for 40', async () => {
    const subscriptionId = await h.subscription(100);
    await h.crowd('LD10A', 4);
    await h.written({ subscriptionId }, [row('LD10A0'), row('LD10A1'), row('LD10A2'), row('E-OWN')]);
    // A service account of the earlier releases, written by SQL: the list still names the department that owns it and its Cost Center.
    await legacyServiceAccount(h.ctx.sql, {
      subscriptionId,
      employeeId: (await h.ctx.sql.query<{ id: string }>(`SELECT id FROM employees WHERE employee_code = 'LD10A3'`))
        .rows[0].id,
      identifier: 'ld10-bot',
    });
    const few = await list({ subscriptionId, pageSize: 100 });
    await h.crowd('LD10B', 35);
    await h.written(
      { subscriptionId },
      Array.from({ length: 35 }, (_, index) => row(`LD10B${index}`)),
    );
    const many = await list({ subscriptionId, pageSize: 100 });

    const items = h.dataOf<{ items: ListedAssignment[] }>(many.result).items;
    expect(items).toHaveLength(40);
    expect(dataStatements(many.statements)).toHaveLength(dataStatements(few.statements).length);
    const reads = dataStatements(many.statements);
    // After the guard's reads: the page and its count, then the people, the plans (with their applications) and the Cost Centers.
    expect(
      reads.slice(reads.findIndex((statement) => tablesOf(statement).includes('license_assignments'))),
    ).toHaveLength(6);
    const service = items.find((item) => item.kind === 'SERVICE');
    expect(service).toMatchObject({
      employee: { employeeCode: 'LD10A3', fullName: 'LD10A3' },
      costCenter: {
        id: service?.costCenterId,
        code: expect.any(String) as unknown,
        name: expect.any(String) as unknown,
      },
    });
    expect(service?.plan).toMatchObject({ planId: service?.planId });
    expect(items.find((item) => item.kind === 'PERSONAL')?.costCenter).toBeNull();
  }, 300_000);

  it('LD-09: lists the tools a department uses in the same statements for 3 seats as for 33, paging in SQL', async () => {
    // The registry entry `departmentToolsInUse#query` was closed by the checkpoint without this proof (P28-06).
    const tools = () =>
      counter.run(() =>
        request(h.server())
          .get(`/api/v1/departments/${h.seed.departmentId}/tools-in-use`)
          .query({ pageSize: 100 })
          .set(h.as(h.it1))
          .expect(200),
      );
    const subscriptionId = await h.subscription(100);
    await h.crowd('LD09A', 3);
    await h.written({ subscriptionId }, [row('LD09A0'), row('LD09A1'), row('LD09A2')]);
    const few = await tools();
    await h.crowd('LD09B', 30);
    await h.written(
      { subscriptionId },
      Array.from({ length: 30 }, (_, index) => row(`LD09B${index}`)),
    );
    const many = await tools();

    const listed = h.dataOf<{ items: unknown[] }>(many.result).items.length;
    expect(listed).toBeGreaterThanOrEqual(33);
    expect(dataStatements(many.statements)).toHaveLength(dataStatements(few.statements).length);
    const assignmentReads = dataStatements(many.statements).filter((statement) =>
      tablesOf(statement).includes('license_assignments'),
    );
    expect(assignmentReads.some((statement) => /\bLIMIT\b/i.test(statement))).toBe(true);
  }, 300_000);

  it('reads only the columns of the item from license_assignments', async () => {
    const subscriptionId = await h.subscription(5);
    await h.crowd('LD10C', 1);
    await h.written({ subscriptionId }, [row('LD10C0')]);

    const { statements } = await list({ subscriptionId });

    const assignmentReads = dataStatements(statements).filter((statement) =>
      tablesOf(statement).includes('license_assignments'),
    );
    expect(assignmentReads.length).toBeGreaterThan(0);
    for (const statement of assignmentReads) {
      expect(statement).not.toMatch(/"normalized_account_identifier"|"baseline_import_id"|"created_by_app_user_id"/);
    }
  }, 120_000);

  it('cuts the page of license keys, counts them and counts the usable ones in one repeatable-read transaction', async () => {
    const subscriptionId = await h.subscription(5, 'K4');
    await request(h.server())
      .post('/api/v1/license-keys/imports')
      .set(h.as(h.it1))
      .send({ subscriptionId, keys: ['KEY-LD11-0001-ABCDE-12345', 'KEY-LD11-0002-ABCDE-12345'] })
      .expect(201);

    const { result, statements } = await counter.run(() =>
      request(h.server())
        .get('/api/v1/license-keys')
        .query({ subscriptionId, pageSize: 1 })
        .set(h.as(h.it1))
        .expect(200),
    );

    const data = h.dataOf<{ items: unknown[]; pagination: { totalItems: number }; summary: { usableKeys: number } }>(
      result,
    );
    expect(data.items).toHaveLength(1);
    expect(data.pagination.totalItems).toBe(2);
    expect(data.summary.usableKeys).toBe(2);
    const keyReads = statements
      .map((statement, index) => ({ statement, index }))
      .filter(({ statement }) => tablesOf(statement).includes('license_keys'));
    const begin = statements.findIndex((statement, index) => /^\s*BEGIN/i.test(statement) && index < keyReads[0].index);
    const commit = statements.findIndex(
      (statement, index) => /^\s*COMMIT/i.test(statement) && index > keyReads[keyReads.length - 1].index,
    );
    expect(keyReads).toHaveLength(3);
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(commit).toBeGreaterThan(keyReads[keyReads.length - 1].index);
    expect(statements.slice(begin, commit).some((statement) => /REPEATABLE\s+READ/i.test(statement))).toBe(true);
    expect(
      statements.slice(begin, commit).filter((statement) => tablesOf(statement).includes('license_keys')),
    ).toHaveLength(3);
  }, 120_000);
});
