import { BudgetHarness, Pageable } from '../../support/budget-harness';
import { waitForLockWaiters } from '../../support/lock-wait';
import type { Person } from '../../support/request-harness';

const h = new BudgetHarness();

/**
 * `g0-g6-final-business-baseline-remediation`, Task 4.6 (F62, `QĐ-91c`, `QĐ-91e`, spec I): the closure of the fiscal year of the budgets.
 * The year that has ended is made by giving the closure a `now` two years ahead (the routes keep the real clock), and the writes that
 * a year that has ended refuses before the closure has run are in `budget-year-ended-writes.integration-spec.ts`.
 */
describe('the closure of the fiscal year of the budgets (integration, real PostgreSQL)', () => {
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

  const unit = async () => {
    counter += 1;

    return h.departmentWithHead(`P-YE${counter}`);
  };
  const approve = (id: string) => h.decideVersion(id, { decision: 'APPROVE' }, boss.account);
  /** A department with a proposal that waits, a version made from it and sent. */
  const sentVersion = async () => {
    const u = await unit();
    const proposal = await h.budgetProposed(u.head, u.department.unitId);
    const version = await h.built(proposal.id);
    await h.sendVersion(version.id).expect(200);

    return { ...u, proposal, version };
  };
  const versionRow = async (id: string) =>
    (
      await h.ctx.sql.query<{ state: string; never_current: boolean; expired_at: Date | null; sent_at: Date | null }>(
        `SELECT state::text, never_current, expired_at, sent_at FROM budget_versions WHERE id = $1`,
        [id],
      )
    ).rows[0];
  const proposalRow = async (id: string) =>
    (
      await h.ctx.sql.query<{ state: string; closed_at: Date | null; returned_reason: string | null }>(
        `SELECT state::text, closed_at, returned_reason FROM budget_proposals WHERE id = $1`,
        [id],
      )
    ).rows[0];
  const snapshot = async () =>
    (
      await h.ctx.sql.query<Record<string, string>>(
        `SELECT 'V' AS t, id::text, state::text, never_current::text, expired_at::text, updated_at::text FROM budget_versions
         UNION ALL SELECT 'P', id::text, state::text, closed_at::text, '', updated_at::text FROM budget_proposals ORDER BY 1, 2`,
      )
    ).rows;
  const actorsOf = async (type: string, id: string, action: string) =>
    (await h.auditEvents(type, id)).filter((event) => event.action === action).map((event) => event.actor_app_user_id);

  describe('what it closes (US-06-09 AC-21, US-06-10 AC-12, US-06-11 AC-10)', () => {
    it('keeps the current version as the reference budget, closes what never became current and what was never used, and leaves the rest', async () => {
      const a = await sentVersion();
      await approve(a.version.id).expect(200);
      const b = await sentVersion();
      const waiting = await unit();
      const submitted = await h.budgetProposed(waiting.head, waiting.department.unitId);
      const givenBack = await unit();
      const returned = await h.budgetProposed(givenBack.head, givenBack.department.unitId);
      await h.giveBack(returned.id, { reason: 'Add the quotes' }, h.finance).expect(200);
      const refused = await sentVersion();
      await h.decideVersion(refused.version.id, { decision: 'REJECT', reason: 'Too high' }, boss.account).expect(200);

      const done = await h.closeYears(h.inTwoYears());

      expect(done).toEqual({ years: 4, expired: 1, closedUnapproved: 1, proposalsClosed: 2 });
      expect(await versionRow(a.version.id)).toMatchObject({ state: 'EXPIRED', never_current: false });
      expect((await versionRow(a.version.id)).expired_at).not.toBeNull();
      expect(await versionRow(b.version.id)).toMatchObject({ state: 'EXPIRED', never_current: true });
      // What was sent keeps its sending; the decision that was open on it ends with no record of a decision.
      expect((await versionRow(b.version.id)).sent_at).not.toBeNull();
      expect(await h.budgetRows(`budget_version_decisions WHERE version_id = '${b.version.id}'`)).toBe(0);
      expect(await proposalRow(submitted.id)).toMatchObject({ state: 'CLOSED_FISCAL_YEAR_ENDED' });
      expect((await proposalRow(submitted.id)).closed_at).not.toBeNull();
      // A proposal that was given back keeps the reason it was given back with.
      expect(await proposalRow(returned.id)).toMatchObject({
        state: 'CLOSED_FISCAL_YEAR_ENDED',
        returned_reason: 'Add the quotes',
      });
      // A proposal a version was made from, and a refused version, are not closed.
      expect(await proposalRow(a.proposal.id)).toMatchObject({ state: 'REVIEWED', closed_at: null });
      expect(await proposalRow(refused.proposal.id)).toMatchObject({ state: 'REVIEWED', closed_at: null });
      expect(await versionRow(refused.version.id)).toMatchObject({ state: 'REJECTED', never_current: false });
    });

    it('writes the Audit Trail of the system for each closing, and none for what it left', async () => {
      const a = await sentVersion();
      await approve(a.version.id).expect(200);
      const b = await sentVersion();
      const waiting = await unit();
      const submitted = await h.budgetProposed(waiting.head, waiting.department.unitId);

      await h.closeYears(h.inTwoYears());

      expect(await actorsOf('BUDGET_VERSION', a.version.id, 'BUDGET_VERSION.EXPIRED')).toEqual([null]);
      expect(await actorsOf('BUDGET_VERSION', b.version.id, 'BUDGET_VERSION.CLOSED_UNAPPROVED')).toEqual([null]);
      expect(await actorsOf('BUDGET_PROPOSAL', submitted.id, 'BUDGET_PROPOSAL.CLOSED_YEAR_END')).toEqual([null]);
      const closing = (await h.auditEvents('BUDGET_VERSION', b.version.id)).find(
        (event) => event.action === 'BUDGET_VERSION.CLOSED_UNAPPROVED',
      );
      expect(closing).toMatchObject({ before: { state: 'SENT' }, after: { state: 'EXPIRED', neverCurrent: true } });
      expect(await actorsOf('BUDGET_PROPOSAL', a.proposal.id, 'BUDGET_PROPOSAL.CLOSED_YEAR_END')).toEqual([]);
    });

    it('changes nothing when it runs again, and a year that has not ended is not touched', async () => {
      const a = await sentVersion();
      await approve(a.version.id).expect(200);
      const still = await sentVersion();

      const early = await h.closeYears();
      const before = await snapshot();
      const first = await h.closeYears(h.inTwoYears());
      const closed = await snapshot();
      const again = await h.closeYears(h.inTwoYears());

      expect(early).toEqual({ years: 0, expired: 0, closedUnapproved: 0, proposalsClosed: 0 });
      expect(before).not.toEqual(closed);
      expect(first.years).toBeGreaterThan(0);
      expect(again).toEqual({ years: 0, expired: 0, closedUnapproved: 0, proposalsClosed: 0 });
      expect(await snapshot()).toEqual(closed);
      expect(await versionRow(still.version.id)).toMatchObject({ state: 'EXPIRED', never_current: true });
    });
  });

  describe('what is read of a year that has ended (F62)', () => {
    it('reads the reference budget in the table and in the budget of the head, and never a version that did not become current', async () => {
      const a = await sentVersion();
      await approve(a.version.id).expect(200);
      const b = await sentVersion();
      await h.closeYears(h.inTwoYears());

      const table = h.dataOf<Pageable<{ costCenter: { id: string }; total: { amount: string }; versionId: string }>>(
        await h.table(h.finance, { year: h.next, pageSize: 100 }).expect(200),
      );
      const ofA = table.items.find((row) => row.costCenter.id === a.department.unitId);
      const mineA = h.dataOf<{ budget: { status: string; total: { amount: string } | null } }>(
        await h.mine(a.head.account, h.next).expect(200),
      ).budget;
      const mineB = h.dataOf<{ budget: { status: string; total: unknown; latestRefusal: unknown } }>(
        await h.mine(b.head.account, h.next).expect(200),
      ).budget;

      expect(ofA).toMatchObject({ versionId: a.version.id, total: { amount: '80000000' } });
      expect(table.items.find((row) => row.costCenter.id === b.department.unitId)).toBeUndefined();
      expect(mineA).toMatchObject({ status: 'ACTIVE', total: { amount: '80000000' } });
      expect(mineB).toMatchObject({ status: 'NO_ACTIVE_BUDGET', total: null, latestRefusal: null });
      const lines = h.dataOf<Pageable<unknown>>(await h.mineLines(b.head.account, h.next).expect(200));
      expect(lines.pagination.totalItems).toBe(0);
    });
  });

  describe('the notices of the closure (F67 rows 52 and 53, `US-12-15` AC-24)', () => {
    it('tells Finance and the person who held the open decision of a version that never became current, and the head of a proposal that is closed', async () => {
      const b = await sentVersion();
      const draft = await unit();
      const draftProposal = await h.budgetProposed(draft.head, draft.department.unitId);
      const draftVersion = await h.built(draftProposal.id);
      const waiting = await unit();
      const submitted = await h.budgetProposed(waiting.head, waiting.department.unitId);

      await h.closeYears(h.inTwoYears());

      // A version that waited for a decision: Finance and the approver. A draft: Finance only.
      expect(
        (await h.budgetNoticesOf('BUDGET_VERSION_CLOSED_UNAPPROVED', b.version.id))
          .map((n) => n.recipient_employee_id)
          .sort(),
      ).toEqual([h.finance.employeeId, boss.employeeId].sort());
      expect(
        (await h.budgetNoticesOf('BUDGET_VERSION_CLOSED_UNAPPROVED', draftVersion.id)).map(
          (n) => n.recipient_employee_id,
        ),
      ).toEqual([h.finance.employeeId]);
      const forHead = await h.budgetNoticesOf('BUDGET_PROPOSAL_CLOSED_YEAR_END', submitted.id);
      expect(forHead.map((n) => n.recipient_employee_id)).toEqual([waiting.head.employeeId]);
      // Ids, the cost center and the year: no figure.
      expect(Object.keys(forHead[0].params).sort()).toEqual(['costCenterId', 'proposalId', 'year']);
    });

    it('keeps the notice of a proposal whose department has no head for the first head to be named, and tells nobody else', async () => {
      const u = await unit();
      const proposal = await h.budgetProposed(u.head, u.department.unitId);
      await h.withoutHead(u.department);

      await h.closeYears(h.inTwoYears());

      expect(await h.budgetNoticesOf('BUDGET_PROPOSAL_CLOSED_YEAR_END', proposal.id)).toEqual([]);
      const held = await h.ctx.sql.query<{
        department_id: string;
        delivered_at: Date | null;
        params: Record<string, unknown>;
      }>(
        `SELECT department_id, delivered_at, params FROM held_department_notifications WHERE code = 'BUDGET_PROPOSAL_CLOSED_YEAR_END' AND subject_id = $1`,
        [proposal.id],
      );
      expect(held.rows).toHaveLength(1);
      expect(held.rows[0]).toMatchObject({ department_id: u.department.id, delivered_at: null });
    });
  });

  describe('the closure and the decision of one version at the same moment (barrier)', () => {
    /** The decision and the closure both queue behind the row of the version, one by one, and run in the order they arrived. */
    const meet = async (first: 'DECISION' | 'CLOSURE') => {
      const s = await sentVersion();
      const holder = await h.holdRow('budget_versions', s.version.id);
      const decide = () => approve(s.version.id).then((response) => response);
      const close = () => h.closeYears(h.inTwoYears());
      const queued: Array<Promise<unknown>> = [];
      try {
        queued.push(first === 'DECISION' ? decide() : close());
        await waitForLockWaiters(h.ctx.sql, 1);
        queued.push(first === 'DECISION' ? close() : decide());
        await waitForLockWaiters(h.ctx.sql, 2);
      } finally {
        await holder.release();
      }
      const [one, two] = await Promise.all(queued);

      return { s, answers: first === 'DECISION' ? { decision: one, closure: two } : { closure: one, decision: two } };
    };

    it('approves first: the version is current and then stays as the reference budget, never both current and expired as a version that never was', async () => {
      const { s, answers } = await meet('DECISION');

      expect((answers.decision as { status: number }).status).toBe(200);
      expect(await versionRow(s.version.id)).toMatchObject({ state: 'EXPIRED', never_current: false });
    });

    it('closes first: the version that never became current is closed and the decision finds it no longer waiting', async () => {
      const { s, answers } = await meet('CLOSURE');
      const decision = answers.decision as { status: number; body: { error: { code: string } } };

      expect(decision.status).toBe(409);
      expect(decision.body.error.code).toBe('BUDGET.VERSION_NOT_SENT');
      expect(await versionRow(s.version.id)).toMatchObject({ state: 'EXPIRED', never_current: true });
      expect(await h.budgetRows(`budget_version_decisions WHERE version_id = '${s.version.id}'`)).toBe(0);
    });
  });
});
