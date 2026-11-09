import { BudgetHarness, type VersionWire } from '../../support/budget-harness';
import { prepareRoleDatabase, sessionRoleOf } from '../../support/role-database-prepare';
import { dropRoleSeparatedDatabase, type RoleSeparatedDatabase } from '../../support/role-separated-database';

/**
 * `g0-g6-final-business-baseline-remediation`, F52 (spec Task 6.3): the write path of the budgets (G5) runs as the runtime role
 * too — it needs nothing beyond the data rights the default privileges give it (no CREATE, no ownership), so a table added by a
 * migration of G5 that the role cannot write would fail here and not at the first request of production.
 *
 * One application for each file: the configuration of the application module is read once for each Jest module registry, so a
 * second application with another database in the same file would connect through the first one's (dropped) runtime role. The
 * write path of the leave (G6) is in `database-runtime-role-leave-write.integration-spec.ts` for the same reason.
 */
describe('a write path of G5 runs as the runtime role: a budget proposal sent, built, sent on and approved (integration, PostgreSQL)', () => {
  const h = new BudgetHarness();
  let database: RoleSeparatedDatabase;

  beforeAll(async () => {
    database = await prepareRoleDatabase();
    await h.start({ database: database.bootstrapHandle, appDatabaseUrl: () => database.runtime.url });
  }, 240000);

  afterAll(async () => {
    await h.stop();
    if (database) await dropRoleSeparatedDatabase(database);
  });

  it('writes the proposal, the version, the decision and the notices without any right beyond data', async () => {
    const executive = await h.departmentWithUnit('P-RR-EXE');
    const boss = await h.staff(executive, 'RR-BOSS');
    await h.makeHead(executive, await h.staff(executive, 'EXE-H1')); // the Spending Approver does not head a department (QĐ-93b)
    await h.setRole('SPENDING_APPROVER', boss);
    const unit = await h.departmentWithHead('P-RR-D1');
    const proposal = await h.budgetProposed(unit.head, unit.department.unitId);
    const version = await h.built(proposal.id);
    // The history keeps the edits of a version, not its making: one edit is what writes a row to it.
    await h.updateVersion(version.id, { reserve: h.money(10_000_000) }).expect(200);
    await h.sendVersion(version.id).expect(200);

    const decided = await h.decideVersion(version.id, { decision: 'APPROVE' }, boss.account).expect(200);

    expect(h.dataOf<{ version: VersionWire }>(decided).version).toMatchObject({ state: 'APPROVED' });
    expect(await sessionRoleOf(h.ctx.app)).toBe(database.runtime.role);
    const written = await h.ctx.sql.query<{ proposals: number; decisions: number; history: number }>(
      `SELECT (SELECT count(*)::int FROM budget_proposals WHERE id = $1) AS proposals,
              (SELECT count(*)::int FROM budget_version_decisions WHERE version_id = $2) AS decisions,
              (SELECT count(*)::int FROM budget_version_history WHERE version_id = $2) AS history`,
      [proposal.id, version.id],
    );
    expect(written.rows[0]).toMatchObject({ proposals: 1, decisions: 1 });
    expect(written.rows[0].history).toBeGreaterThanOrEqual(1);
  });
});
