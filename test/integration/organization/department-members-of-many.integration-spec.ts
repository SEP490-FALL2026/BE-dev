import { randomUUID } from 'node:crypto';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { OrganizationApi } from '../../../src/modules/organization/public/organization.api';
import { OrganizationReadApi } from '../../../src/modules/organization/public/organization-read.api';
import { PgRelay } from '../../support/pg-relay';
import { QueryCounter, dataStatements, tablesOf } from '../../support/query-count';
import { SeatHarness } from '../../support/seat-baseline-harness';

const h = new SeatHarness();

/**
 * AL.2: `OrganizationReadApi.getMemberIdsOfDepartments` reads the people of MANY departments in ONE statement. It is the same test of the dates
 * as `getDepartmentMemberIds` (which costs two statements for each department: the department, then its placements), a department that
 * does not exist adds nobody, and an employee appears once.
 */
describe('the members of many departments in one statement (integration, real PostgreSQL)', () => {
  let relay: PgRelay;
  let counter: QueryCounter;
  let reads: OrganizationReadApi;
  let a: string;
  let b: string;
  let c: string;
  let d: string;
  let e: string;
  const inA: string[] = [];
  const inB: string[] = [];
  let mover: string;

  const placed = async (code: string, departmentId: string): Promise<string> => {
    const employee = await h.ctx.app.get(TransactionRunner).run((tx) =>
      h.ctx.app.get(OrganizationApi).createEmployeeWithPlacement(tx, {
        organizationId: h.seed.organizationId,
        employeeCode: code,
        fullName: `Person ${code}`,
        workEmail: `${code.toLowerCase()}@acme.vn`,
        employmentType: 'STAFF',
        hireDate: '2026-01-05',
        departmentId,
        jobTitle: 'Administrator',
      }),
    );

    return employee.id;
  };

  /** The one the old way gives: the members of each department read one department at a time, merged without duplicates. */
  const oneByOne = async (departmentIds: readonly string[], onDate: string): Promise<string[]> => [
    ...new Set(
      (await Promise.all(departmentIds.map((id) => reads.getDepartmentMemberIds(id, onDate)))).flatMap(
        (ids) => ids ?? [],
      ),
    ),
  ];
  const sorted = (ids: readonly string[]): string[] => [...ids].sort();

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
    reads = h.ctx.app.get(OrganizationReadApi);
    [a, b, c, d, e] = await Promise.all([1, 2, 3, 4, 5].map(async () => (await h.bareDepartment()).id));
    inA.push(await placed('AL2-A1', a), await placed('AL2-A2', a));
    inB.push(await placed('AL2-B1', b));
    // A person who moves from A to B on 2026-06-01: on A until that day, on B from it.
    mover = await placed('AL2-MOVER', a);
    await h.ctx.sql.query(
      `WITH closed AS (
         UPDATE employee_placements SET valid_to = DATE '2026-06-01' WHERE employee_id = $1 AND valid_to IS NULL
         RETURNING organization_id, employee_id)
       INSERT INTO employee_placements (id, organization_id, employee_id, department_id, valid_from)
       SELECT gen_random_uuid(), organization_id, employee_id, $2, DATE '2026-06-01' FROM closed`,
      [mover, b],
    );
  }, 120000);

  afterAll(async () => {
    await h.stop();
    await relay?.stop();
  });

  it('merges the people of the departments asked for and only theirs, each once, a department with nobody adding none', async () => {
    const people = await reads.getMemberIdsOfDepartments([a, b, c], '2026-12-01');

    // On 2026-12-01 the mover is already on B.
    expect(sorted(people)).toEqual(sorted([...inA, ...inB, mover]));
    expect(sorted(await reads.getMemberIdsOfDepartments([a], '2026-12-01'))).toEqual(sorted(inA));
    expect(await reads.getMemberIdsOfDepartments([c], '2026-12-01')).toEqual([]);
    expect(await reads.getMemberIdsOfDepartments([d, e], '2026-12-01')).toEqual([]);
  });

  it('counts an employee once, whether the list names a department twice or the person was in two departments in turn', async () => {
    const people = await reads.getMemberIdsOfDepartments([a, b, a, b, a], '2026-12-01');

    expect(people).toHaveLength(new Set(people).size);
    expect(sorted(people)).toEqual(sorted([...inA, ...inB, mover]));
  });

  it('applies the dates of the placements as getDepartmentMemberIds does: the day a placement ends is no longer a member, the day the next begins is', async () => {
    for (const day of ['2026-05-31', '2026-06-01', '2026-12-01']) {
      expect(sorted(await reads.getMemberIdsOfDepartments([a, b, c], day))).toEqual(
        sorted(await oneByOne([a, b, c], day)),
      );
    }
    expect(await reads.getMemberIdsOfDepartments([a], '2026-05-31')).toContain(mover);
    expect(await reads.getMemberIdsOfDepartments([a], '2026-06-01')).not.toContain(mover);
    expect(await reads.getMemberIdsOfDepartments([b], '2026-06-01')).toContain(mover);
    expect(await reads.getMemberIdsOfDepartments([a, b], '2026-01-04')).toEqual([]);
  });

  it('adds nobody and raises nothing for a department that does not exist, and reads nothing for an empty list', async () => {
    const missing = randomUUID();

    expect(sorted(await reads.getMemberIdsOfDepartments([missing, a], '2026-12-01'))).toEqual(sorted(inA));
    expect(await reads.getMemberIdsOfDepartments([missing], '2026-12-01')).toEqual([]);

    const { result, statements } = await counter.run(() => reads.getMemberIdsOfDepartments([], '2026-12-01'));
    expect(result).toEqual([]);
    expect(dataStatements(statements)).toEqual([]);
  });

  it('reads every department it is given with one statement on the placements: the number of statements does not grow with the departments', async () => {
    const statementsFor = async (departmentIds: readonly string[]): Promise<string[]> =>
      dataStatements(
        (await counter.run(() => reads.getMemberIdsOfDepartments(departmentIds, '2026-12-01'))).statements,
      );

    const one = await statementsFor([a]);
    const five = await statementsFor([a, b, c, d, e]);

    expect(one).toHaveLength(1);
    expect(five).toHaveLength(1);
    expect(tablesOf(five[0])).toEqual(['employee_placements']);

    // What it replaces: the same five departments one at a time cost two statements each (the department, then its placements).
    const oldWay = dataStatements(
      (
        await counter.run(() =>
          Promise.all([a, b, c, d, e].map((id) => reads.getDepartmentMemberIds(id, '2026-12-01'))),
        )
      ).statements,
    );
    expect(oldWay).toHaveLength(10);
  });
});
