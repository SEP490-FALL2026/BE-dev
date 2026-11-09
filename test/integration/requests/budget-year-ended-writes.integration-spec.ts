import type request from 'supertest';
import { BudgetHarness } from '../../support/budget-harness';
import type { Person } from '../../support/request-harness';

const h = new BudgetHarness();

/**
 * `g0-g6-final-business-baseline-remediation`, Task 4.6 (F62, spec I): after the day the fiscal year ended, nothing of its proposals and
 * versions is written, whether or not the closure has run (`BUDGET.YEAR_ENDED`, 422). The routes keep the real clock, so a year that
 * has ended is made by moving what a Cost Center has for the year that is running to the year before it.
 */
describe('writes on a year that has ended, before the closure has run (integration, real PostgreSQL)', () => {
  const ended = h.year - 1;
  let boss: Person;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    const executive = await h.departmentWithUnit('P-EXE');
    boss = await h.staff(executive, 'EXE-C1');
    await h.makeHead(executive, await h.staff(executive, 'EXE-H1')); // the Spending Approver does not head a department (QĐ-93b)
    await h.setRole('SPENDING_APPROVER', boss);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  /** A department of its own with a proposal that waits, for the year to come. */
  const waiting = async () => {
    counter += 1;
    const u = await h.departmentWithHead(`P-YW${counter}`);

    return { ...u, proposal: await h.budgetProposed(u.head, u.department.unitId) };
  };
  /** Everything the writes below could change, as one text: the rows, the lines, the history and the audit of the budgets. */
  const fingerprint = async () =>
    JSON.stringify(
      await Promise.all(
        [
          `SELECT id, state::text, year, updated_at, detached_at FROM budget_versions ORDER BY id`,
          `SELECT id, state::text, year, updated_at, returned_at, withdrawn_at FROM budget_proposals ORDER BY id`,
          `SELECT version_id, position, description, amount_minor::text, window_from, window_to FROM budget_version_lines ORDER BY version_id, position`,
          `SELECT version_id, seq FROM budget_version_history ORDER BY version_id, seq`,
          `SELECT id, action FROM audit_events WHERE action LIKE 'BUDGET_%' ORDER BY id`,
        ].map(async (text) => (await h.ctx.sql.query<Record<string, unknown>>(text)).rows),
      ),
    );
  const refusedAsEnded = async (response: request.Response, before: string) => {
    expect({ status: response.status, code: h.codeOf(response) }).toEqual({ status: 422, code: 'BUDGET.YEAR_ENDED' });
    expect(await fingerprint()).toBe(before);
  };

  it('does not decide a version that waits for the approver', async () => {
    const w = await waiting();
    const version = await h.built(w.proposal.id);
    await h.sendVersion(version.id).expect(200);
    await h.moveYear(w.department.unitId, h.next, ended);
    const before = await fingerprint();

    await refusedAsEnded(await h.decideVersion(version.id, { decision: 'APPROVE' }, boss.account), before);
  });

  it('does not change, adjust, add to, load into or send a draft', async () => {
    const w = await waiting();
    const version = await h.built(w.proposal.id);
    await h.moveYear(w.department.unitId, h.next, ended);
    const before = await fingerprint();
    const csv = ['cost_center_code,description,amount', `${w.department.unitId},x,1`].join('\n');

    await refusedAsEnded(await h.updateVersion(version.id, { base: h.money(1) }), before);
    await refusedAsEnded(await h.updateLine(version.id, 1, { financeComment: 'late' }), before);
    await refusedAsEnded(await h.addLines(version.id, [h.line()]), before);
    await refusedAsEnded(await h.importLines(version.id, csv), before);
    await refusedAsEnded(await h.sendVersion(version.id), before);
  });

  it('does not take back, give back or send again a proposal, nor make a version from it', async () => {
    const waits = await waiting();
    const toReturn = await waiting();
    await h.giveBack(toReturn.proposal.id, { reason: 'Add the quotes' }, h.finance).expect(200);
    const toBuild = await waiting();
    for (const w of [waits, toReturn, toBuild]) await h.moveYear(w.department.unitId, h.next, ended);
    const before = await fingerprint();

    await refusedAsEnded(await h.withdraw(waits.proposal.id, waits.head.account), before);
    await refusedAsEnded(await h.giveBack(waits.proposal.id, { reason: 'Too late' }, h.finance), before);
    await refusedAsEnded(await h.resubmit(toReturn.proposal.id, { lines: [h.line()] }, toReturn.head.account), before);
    await refusedAsEnded(
      await h.createVersion({
        proposalId: toBuild.proposal.id,
        base: h.money(1),
        reserve: h.money(0),
        reserveReason: 'Test reserve',
      }),
      before,
    );
  });

  it('answers the same after the closure has run: the year has ended, whatever became of the version', async () => {
    const w = await waiting();
    const version = await h.built(w.proposal.id);
    await h.moveYear(w.department.unitId, h.next, ended);
    await h.closeYears();
    const before = await fingerprint();

    await refusedAsEnded(await h.updateVersion(version.id, { base: h.money(1) }), before);
    await refusedAsEnded(await h.sendVersion(version.id), before);
    await refusedAsEnded(await h.withdraw(w.proposal.id, w.head.account), before);
  });
});
