import request from 'supertest';
import { PgRelay } from '../../support/pg-relay';
import { QueryCounter, dataStatements, tablesOf } from '../../support/query-count';
import { type AccessRequestWire, type Department, type Person, RequestHarness } from '../../support/request-harness';

const h = new RequestHarness();

/**
 * API-LIST-DETAIL.1 §6 (SPEC D9) for the two collections IN-1.3 added, `GET /assessment-queue/departments` and `GET /assessment-decisions`: the number
 * of statements does not grow with the number of rows or of departments, and no table the list has no use for is read. The statements are counted at the
 * wire of the database, through a relay, on two sizes of the same data.
 */
describe('requests: the statements of the assessment queue by department and of the assessments decided (integration, real PostgreSQL)', () => {
  let relay: PgRelay;
  let counter: QueryCounter;
  let design: Department;
  let sales: Department;
  let designHead: Person;
  let salesHead: Person;
  let itAdmin: Person;
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
    design = await h.departmentWithUnit('P-DES');
    sales = await h.departmentWithUnit('P-SAL');
    designHead = await h.staff(design, 'DES-H1');
    salesHead = await h.staff(sales, 'SAL-H1');
    itAdmin = { employeeId: h.it1.employeeId, account: h.it1 };
    await h.makeHead(design, designHead);
    await h.makeHead(sales, salesHead);
    await h.setItAdminInCharge(design, itAdmin);
    await h.setItAdminInCharge(sales, itAdmin);
  }, 240000);

  afterAll(async () => {
    await h.stop();
    await relay?.stop();
  });

  /** A proposal of a person of the department whose need the head has approved: it waits for the IT Admin. */
  const waiting = async (department: Department, head: Person): Promise<AccessRequestWire> => {
    sequence += 1;
    const requester = await h.staff(department, `${department.code}-Q${sequence}`);
    const proposed = await h.proposed(requester, { softwareName: `Counted ${sequence}` });
    await h.decide(proposed.id, { decision: 'APPROVE' }, head.account).expect(200);

    return proposed;
  };
  const refused = async (department: Department, head: Person): Promise<void> => {
    const proposed = await waiting(department, head);
    await h
      .rejectAssessment(proposed.id, { kind: 'NOT_ELIGIBLE', reason: 'Counted refusal' }, itAdmin.account)
      .expect(200);
  };
  const read = (path: string) =>
    counter.run(() => request(h.server()).get(path).set(h.as(itAdmin.account)).expect(200));
  const itemsOf = (response: request.Response) => h.dataOf<{ items: unknown[] }>(response).items;
  /** The tables a list has no use for: the steps and events of a request, its lines, the audit trail, seats and subscriptions. */
  const UNUSED_TABLES = [
    'access_request_events',
    'access_request_lines',
    'audit_events',
    'license_assignments',
    'subscriptions',
    'plans',
    'applications',
  ];

  it('counts the proposals waiting by department in a fixed number of statements, however many departments and proposals there are', async () => {
    await waiting(design, designHead);
    const few = await read('/api/v1/assessment-queue/departments?pageSize=100');
    for (let index = 0; index < 3; index += 1) await waiting(design, designHead);
    for (let index = 0; index < 4; index += 1) await waiting(sales, salesHead);
    const many = await read('/api/v1/assessment-queue/departments?pageSize=100');

    expect(itemsOf(few.result)).toHaveLength(1);
    expect(itemsOf(many.result)).toHaveLength(2);
    expect(dataStatements(many.statements)).toHaveLength(dataStatements(few.statements).length);
    const tables = new Set(dataStatements(many.statements).flatMap(tablesOf));
    for (const unused of UNUSED_TABLES) expect({ unused, read: tables.has(unused) }).toEqual({ unused, read: false });
  }, 180000);

  it('lists the decided assessments in a fixed number of statements, however many there are, with the person and department lookups one read each', async () => {
    await refused(design, designHead);
    await refused(sales, salesHead);
    const few = await read('/api/v1/assessment-decisions?pageSize=100');
    for (let index = 0; index < 3; index += 1) await refused(design, designHead);
    for (let index = 0; index < 3; index += 1) await refused(sales, salesHead);
    const many = await read('/api/v1/assessment-decisions?pageSize=100');

    expect(itemsOf(few.result)).toHaveLength(2);
    expect(itemsOf(many.result)).toHaveLength(8);
    expect(dataStatements(many.statements)).toHaveLength(dataStatements(few.statements).length);
    const tables = new Set(dataStatements(many.statements).flatMap(tablesOf));
    for (const unused of UNUSED_TABLES) expect({ unused, read: tables.has(unused) }).toEqual({ unused, read: false });
  }, 180000);

  it('reads the same number of statements for a page of the decisions as for all of them', async () => {
    const whole = await read('/api/v1/assessment-decisions?pageSize=100');
    const page = await read('/api/v1/assessment-decisions?pageSize=2&page=2');

    expect(itemsOf(page.result)).toHaveLength(2);
    expect(dataStatements(page.statements)).toHaveLength(dataStatements(whole.statements).length);
  });

  it('reads the same number of statements for the departments filtered as for all of them', async () => {
    const all = await read('/api/v1/assessment-queue');
    const one = await read(`/api/v1/assessment-queue?departmentId=${sales.id}`);

    expect(itemsOf(one.result).length).toBeGreaterThan(0);
    expect(dataStatements(one.statements)).toHaveLength(dataStatements(all.statements).length);
  });
});
