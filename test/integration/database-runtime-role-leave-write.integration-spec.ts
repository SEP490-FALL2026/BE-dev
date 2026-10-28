import { LeaveHarness } from '../support/leave-harness';
import { prepareRoleDatabase, sessionRoleOf } from '../support/role-database-prepare';
import { dropRoleSeparatedDatabase, type RoleSeparatedDatabase } from '../support/role-separated-database';

/**
 * `g0-g6-final-business-baseline-remediation`, F52 (spec Task 6.3): the write path of the personnel events (G6) runs as the
 * runtime role too — it needs nothing beyond the data rights the default privileges give it (no CREATE, no ownership), so a table
 * added by a migration of G6 that the role cannot write would fail here and not at the first request of production.
 *
 * One application for each file (see `database-runtime-role-budget-write.integration-spec.ts`).
 */
describe('a write path of G6 runs as the runtime role: a long leave recorded by the Super Admin (integration, PostgreSQL)', () => {
  const h = new LeaveHarness();
  let database: RoleSeparatedDatabase;

  beforeAll(async () => {
    database = await prepareRoleDatabase();
    await h.start({ database: database.bootstrapHandle, appDatabaseUrl: () => database.runtime.url });
  }, 240000);

  afterAll(async () => {
    await h.stop();
    if (database) await dropRoleSeparatedDatabase(database);
  });

  it('writes the leave, its log, the work state and the Audit Trail without any right beyond data', async () => {
    const department = await h.departmentWithUnit('P-RR-HR');
    const person = await h.worker(department, 'RR-W1');

    const leave = await h.started({
      employeeId: person.employeeId,
      startedOn: h.day(-30),
      approvedReturnOn: h.day(60),
      grounds: h.approval,
    });

    expect(leave).toMatchObject({ status: 'ACTIVE', employee: { id: person.employeeId } });
    expect(await sessionRoleOf(h.ctx.app)).toBe(database.runtime.role);
    expect(await h.workState(person.employeeId)).toBe('ON_LONG_LEAVE');
    expect(await h.changeRows(leave.id)).toEqual([{ kind: 'STARTED' }]);
    expect(await h.auditEventsOf('LONG_LEAVE.STARTED', leave.id)).toHaveLength(1);
  });
});
