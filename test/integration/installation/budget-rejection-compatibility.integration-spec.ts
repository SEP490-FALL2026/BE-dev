import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { judgeLegacyReturns } from '../../../src/modules/installation/migration-preflight/migration-preflight-judgement.policy';
import { MigrationPreflightRepo } from '../../../src/modules/installation/migration-preflight/migration-preflight.repo';
import { BudgetHarness, type ProposalWire } from '../../support/budget-harness';
import type { Person } from '../../support/request-harness';

const h = new BudgetHarness();

/**
 * `g0-g6-final-business-baseline-remediation`, Task 4.7a (F63, F36, `QĐ-91a`, `QĐ-92c`, review `P03-RV-03`, spec J.2 and L.10): from the
 * compatibility release the refusal of the first version of a proposal leaves the proposal `REVIEWED` instead of giving it back to the head;
 * the withdrawal and the return of a proposal mark its drafts as detached in the same transaction; and `ops:preflight` reads the proposals that
 * `7c28e75` gave back for a refusal (R1, R2, A) only until the migration of the budgets structure has reconciled them: on the final schema it
 * reads none, so a proposal Finance gave back after a refusal does not block a deploy. The R1/R2/A classification itself is proved by the unit
 * suite of `judgeLegacyReturns`; its agreement with the migration's own expressions is the reconciliation suite of the plan's Task 1.7 (`budget-legacy-return-reconciliation`).
 */
describe('the refusal of a first version, the detached drafts and the preflight of the proposals given back (integration, real PostgreSQL)', () => {
  let boss: Person;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    const executive = await h.departmentWithUnit('P-EXE');
    boss = await h.staff(executive, 'EXE-C1');
    await h.makeHead(executive, boss);
    await h.setRole('SPENDING_APPROVER', boss);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const sql = <T extends object = object>(text: string, values: unknown[] = []) => h.ctx.sql.query<T>(text, values);
  /** A department with a proposal that waits for Finance. */
  const waiting = async () => {
    counter += 1;
    const unit = await h.departmentWithHead(`P-RC${counter}`);
    const proposal = await h.budgetProposed(unit.head, unit.department.unitId);

    return { ...unit, proposal };
  };
  /** A proposal whose first version the spending approver refused, as the route does it. */
  const refused = async (reason = 'The reserve is too high') => {
    const made = await waiting();
    const version = await h.built(made.proposal.id);
    await h.sendVersion(version.id).expect(200);
    await h.decideVersion(version.id, { decision: 'REJECT', reason }, boss.account).expect(200);

    return { ...made, version };
  };
  const proposalRow = async (id: string) =>
    (
      await sql<{ state: string; returned_reason: string | null; returned_at: Date | null }>(
        `SELECT state::text, returned_reason, returned_at FROM budget_proposals WHERE id = $1`,
        [id],
      )
    ).rows[0];
  /**
   * A proposal given back that also has a refused version: the shape `7c28e75` left after a refusal, and the one a return of
   * Finance leaves on a proposal a refusal touched. Written the way the next test needs it on the final schema: the triggers of the
   * table are switched off for the statement (the rules of its own writes), a CHECK constraint is never bypassed.
   */
  const returnedAfterARefusal = async (proposalId: string) => {
    await sql(`ALTER TABLE budget_proposals DISABLE TRIGGER USER`);
    try {
      const done = await sql(
        `UPDATE budget_proposals p
            SET state = 'RETURNED', returned_reason = d.reason, returned_by_employee_id = d.decided_by_employee_id,
                returned_at = d.decided_at
           FROM budget_version_decisions d JOIN budget_versions v ON v.id = d.version_id
          WHERE p.id = $1 AND v.proposal_id = p.id AND d.decision = 'REJECTED'`,
        [proposalId],
      );
      expect(done.rowCount).toBe(1);
    } finally {
      await sql(`ALTER TABLE budget_proposals ENABLE TRIGGER USER`);
    }
  };

  describe('the refusal of the first version (F63)', () => {
    it('leaves the proposal reviewed, writes the refusal and its audit, and gives nothing back', async () => {
      const { proposal, version } = await refused();

      expect(await proposalRow(proposal.id)).toMatchObject({
        state: 'REVIEWED',
        returned_reason: null,
        returned_at: null,
      });
      expect(
        (
          await sql<{ decision: string }>(`SELECT decision::text FROM budget_version_decisions WHERE version_id = $1`, [
            version.id,
          ])
        ).rows,
      ).toEqual([{ decision: 'REJECTED' }]);
      const actions = (
        await sql<{ action: string }>(
          `SELECT action FROM audit_events WHERE resource_id = ANY($1::text[]) ORDER BY occurred_at, id`,
          [[proposal.id, version.id]],
        )
      ).rows.map((row) => row.action);
      expect(actions).toContain('BUDGET_VERSION.REJECTED');
      expect(actions).not.toContain('BUDGET_PROPOSAL.RETURNED');
    });

    it('still lets Finance give back a proposal that waits, and the head send it again', async () => {
      const { proposal, head } = await waiting();

      await h.giveBack(proposal.id, { reason: 'Add the quotes' }, h.finance).expect(200);
      const again = await h.resubmit(proposal.id, { lines: [h.line()] }, head.account).expect(201);

      expect(await proposalRow(proposal.id)).toMatchObject({ state: 'RETURNED', returned_reason: 'Add the quotes' });
      expect(h.dataOf<{ proposal: ProposalWire }>(again).proposal.state).toBe('SUBMITTED');
    });
  });

  describe('the drafts of a proposal that is withdrawn or given back (F36)', () => {
    /** A proposal that waits and carries a draft version, as the release after this one lets a head withdraw or Finance give back. */
    const withDraft = async () => {
      const made = await waiting();
      const draft = await h.built(made.proposal.id);
      await sql(`UPDATE budget_proposals SET state = 'SUBMITTED' WHERE id = $1`, [made.proposal.id]);

      return { ...made, draft };
    };
    const detachedOf = async (versionId: string) =>
      (
        await sql<{ state: string; detached: boolean }>(
          `SELECT state::text, detached_at IS NOT NULL AS detached FROM budget_versions WHERE id = $1`,
          [versionId],
        )
      ).rows[0];

    it('marks the draft detached when the head withdraws the proposal, and keeps it a draft; another proposal’s draft is untouched', async () => {
      const mine = await withDraft();
      const other = await withDraft();

      await h.withdraw(mine.proposal.id, mine.head.account).expect(200);

      expect(await detachedOf(mine.draft.id)).toEqual({ state: 'DRAFT', detached: true });
      expect(await detachedOf(other.draft.id)).toEqual({ state: 'DRAFT', detached: false });
    });

    it('marks the draft detached when Finance gives the proposal back', async () => {
      const made = await withDraft();

      await h.giveBack(made.proposal.id, { reason: 'Add the quotes' }, h.finance).expect(200);

      expect(await detachedOf(made.draft.id)).toEqual({ state: 'DRAFT', detached: true });
    });

    it('writes nothing when the proposal has no draft: a plain withdrawal still works', async () => {
      const { proposal, head } = await waiting();

      await h.withdraw(proposal.id, head.account).expect(200);

      expect(await proposalRow(proposal.id)).toMatchObject({ state: 'WITHDRAWN' });
      expect((await sql(`SELECT 1 FROM budget_versions WHERE proposal_id = $1`, [proposal.id])).rowCount).toBe(0);
    });
  });

  describe('ops:preflight on the final schema (spec J.2): the migration reconciled the old rows, so the old path is not read', () => {
    it('lists no proposal given back after a refusal and reports nothing to reconcile: it is an ordinary one, and no ambiguous case blocks a deploy', async () => {
      const returned = await refused();
      await returnedAfterARefusal(returned.proposal.id);
      // A proposal a refusal never touched, given back by Finance, is no candidate either.
      const given = await waiting();
      await h.giveBack(given.proposal.id, { reason: 'Add the quotes' }, h.finance).expect(200);

      const facts = await h.ctx.app
        .get(TransactionRunner)
        .run((tx) => new MigrationPreflightRepo().contractGateFacts(tx));
      const judged = judgeLegacyReturns(facts.legacyReturns);

      expect(facts.legacyReturns).toEqual({ candidates: [], neighbours: [] });
      expect(judged).toEqual({ blockers: [], information: [] });
      expect(await proposalRow(returned.proposal.id)).toMatchObject({ state: 'RETURNED' });
    });
  });
});
