import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import request from 'supertest';
import { budgetYearLockKey } from '../../../src/modules/budgets/public/budget-year-lock-key.policy';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { BudgetNotFinanceError } from '../../../src/modules/budgets/budget/budget.errors';
import { ProposalService } from '../../../src/modules/budgets/proposal/proposal.service';
import { VersionRepo } from '../../../src/modules/budgets/budget/version.repo';
import { VersionService } from '../../../src/modules/budgets/version/version.service';
import { BudgetsApi } from '../../../src/modules/budgets/public/budgets.api';
import { BudgetHarness, type ProposalWire, type VersionWire } from '../../support/budget-harness';
import { waitForLockWaiters } from '../../support/lock-wait';
import type { Person } from '../../support/request-harness';

const h = new BudgetHarness();

/**
 * `g0-g6-final-business-baseline-remediation`, Tasks 4.1, 4.4 and 4.5 on the budgets side: the Cost Center that is not in use (F27), the
 * lock of the budget of a Cost Center and a year (F31), the draft left behind by a withdrawn or given-back proposal (F36), the answers
 * that were a 500 (F37, F39) and what only Finance does whichever way it is reached (F13).
 */
describe('the guards of the budget lifecycle (integration, real PostgreSQL)', () => {
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

  const waiting = async (lines?: object[]) => {
    counter += 1;
    const u = await h.departmentWithHead(`P-LG${counter}`);

    return { ...u, proposal: await h.budgetProposed(u.head, u.department.unitId, lines) };
  };
  const deactivate = (costCenterId: string) =>
    request(h.server()).post(`/api/v1/cost-centers/${costCenterId}/deactivate`).set(h.as(h.finance)).expect(200);
  const count = (table: string) => h.budgetRows(table);

  describe('a department without a Cost Center in use (F27, T-3)', () => {
    it('cannot send a proposal: 409 FINANCE.SETUP_INCOMPLETE before anything else, and nothing is written', async () => {
      counter += 1;
      const u = await h.departmentWithHead(`P-LG${counter}`);
      await deactivate(u.department.unitId);
      const before = await count('budget_proposals');

      const bare = await h.submitProposal(
        h.proposalBody(u.department.unitId, [{ description: 'incomplete', amount: h.money(1) }]),
        u.head.account,
      );
      const unknown = await h.submitProposal(h.proposalBody(randomUUID()), u.head.account);

      expect([bare.status, unknown.status]).toEqual([409, 409]);
      expect([h.codeOf(bare), h.codeOf(unknown)]).toEqual(['FINANCE.SETUP_INCOMPLETE', 'FINANCE.SETUP_INCOMPLETE']);
      expect(await count('budget_proposals')).toBe(before);
    });

    it('has no version made by Finance for a Cost Center that was retired: 409 FINANCE.SETUP_INCOMPLETE and nothing is written', async () => {
      const w = await waiting();
      await deactivate(w.department.unitId);
      const before = await count('budget_versions');

      const first = await h.createVersion({
        proposalId: w.proposal.id,
        base: h.money(1),
        reserve: h.money(0),
        reserveReason: 'Test reserve',
      });

      expect(first.status).toBe(409);
      expect(h.codeOf(first)).toBe('FINANCE.SETUP_INCOMPLETE');
      expect(await count('budget_versions')).toBe(before);
    });

    // R4 D-5: the resubmission goes through the same send as a proposal, so the head who still owns the proposal Finance gave back finds
    // the 409 when the Cost Center was retired meanwhile. The code is documented on `budgetProposalResubmit` and in its route codes.
    it('cannot send again the proposal Finance gave back after the Cost Center was retired: 409 FINANCE.SETUP_INCOMPLETE, nothing is written', async () => {
      const w = await waiting();
      await h.giveBack(w.proposal.id, { reason: 'Add the quotes' }, h.finance).expect(200);
      await deactivate(w.department.unitId);
      const before = await count('budget_proposals');

      const again = await h.resubmit(w.proposal.id, { lines: [h.line()] }, w.head.account);

      expect(again.status).toBe(409);
      expect(h.codeOf(again)).toBe('FINANCE.SETUP_INCOMPLETE');
      expect(await count('budget_proposals')).toBe(before);
    });
  });

  describe('the lock of the budget of a Cost Center and a year (F31)', () => {
    /** A request that exists and the check it was held on, which the database keeps the key of. */
    const heldFor = async (costCenterId: string) => {
      const requestId = await h.fixtureRequestId();
      // A check with nothing out of the ordinary goes to the spending approver: `BLOCKED` needs a problem in the data of the request.
      const trigger = 'SUBMISSION';
      const route = 'SPEND_APPROVAL';
      const check = await h.ctx.sql.query<{ id: string }>(
        `INSERT INTO request_budget_checks (id, organization_id, request_id, number, trigger, route, stale_cost_evidence, plan_line_overdue,
                                            period_closed, off_plan, currency, binding_total_minor, outcome)
         VALUES (gen_random_uuid(), $1, $2, 1, $3::"BudgetCheckTrigger", $4::"BudgetCheckRoute", false, false, false, false, $5, 1, 'WITHIN_BASE') RETURNING id`,
        [h.seed.organizationId, requestId, trigger, route, h.reporting],
      );

      return {
        organizationId: h.seed.organizationId,
        requestId,
        costCenterId,
        snapshotCheckId: check.rows[0].id,
        currency: h.reporting,
        now: new Date(),
        items: [{ year: h.next, amountMinor: 1_000_000n }],
      };
    };
    const attachedTo = async (requestId: string) =>
      (
        await h.ctx.sql.query<{ attached_version_id: string | null; unattached_reason: string | null }>(
          `SELECT attached_version_id, unattached_reason FROM budget_commitments WHERE request_id = $1`,
          [requestId],
        )
      ).rows;
    /**
     * The hold of a commitment and the decision of `versionId` meet at the lock of the Cost Center and year, and run in the order they
     * arrived: the holder keeps the lock, the two queue one by one, and both must finish (no deadlock, both answered).
     */
    const queueBoth = async (first: 'HOLD' | 'DECISION', costCenterId: string, versionId: string) => {
      const input = await heldFor(costCenterId);
      const runner = h.ctx.app.get(TransactionRunner, { strict: false });
      const budgets = h.ctx.app.get(BudgetsApi, { strict: false });
      const hold = () => runner.run((tx) => budgets.holdForRequest(tx, h.principalOf(h.finance, ['FINANCE']), input));
      const decide = () =>
        h.decideVersion(versionId, { decision: 'APPROVE' }, boss.account).then((response) => response);
      const holder = new Client({ connectionString: h.ctx.database.url });
      await holder.connect();
      await holder.query('BEGIN');
      await holder.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        budgetYearLockKey(costCenterId, h.next),
      ]);
      const started: Partial<Record<'HOLD' | 'DECISION', Promise<unknown>>> = {};
      const second = first === 'HOLD' ? 'DECISION' : 'HOLD';
      try {
        started[first] = first === 'HOLD' ? hold() : decide();
        await waitForLockWaiters(h.ctx.sql, 1);
        started[second] = second === 'HOLD' ? hold() : decide();
        await waitForLockWaiters(h.ctx.sql, 2);
      } finally {
        await holder.query('COMMIT');
        await holder.end();
      }
      await Promise.all(Object.values(started));

      return { requestId: input.requestId, decisionStatus: ((await started.DECISION) as { status: number }).status };
    };
    /** The hold and the decision of a FIRST version meet at the lock of the Cost Center and year. */
    const meet = async (first: 'HOLD' | 'DECISION') => {
      const w = await waiting();
      const version = await h.built(w.proposal.id);
      await h.sendVersion(version.id).expect(200);

      return { version, requestId: (await queueBoth(first, w.department.unitId, version.id)).requestId };
    };

    it('holds the commitment first and the decision then attaches it: no commitment waits for a budget that was approved', async () => {
      const { version, requestId } = await meet('HOLD');

      expect(await attachedTo(requestId)).toEqual([{ attached_version_id: version.id, unattached_reason: null }]);
    });

    it('decides first and the commitment is attached at once', async () => {
      const { version, requestId } = await meet('DECISION');

      expect(await attachedTo(requestId)).toEqual([{ attached_version_id: version.id, unattached_reason: null }]);
    });
  });

  describe('a revision that an older release left (B-M2, QĐ-97b)', () => {
    /** A version of the older kind: the revision is gone from the API, but the row may still be in a database. */
    const asRevision = (versionId: string) =>
      h.ctx.sql.query(
        `UPDATE budget_versions SET kind = 'REVISION', reason = 'Left by an older release', based_on_version_id = id, proposal_id = NULL WHERE id = $1`,
        [versionId],
      );

    it('is not sent: 409 BUDGET.VERSION_NOT_EDITABLE', async () => {
      const w = await waiting();
      const draft = await h.built(w.proposal.id);
      await asRevision(draft.id);

      const refused = await h.sendVersion(draft.id).expect(409);

      expect(h.codeOf(refused)).toBe('BUDGET.VERSION_NOT_EDITABLE');
      expect(await count(`budget_versions WHERE id = '${draft.id}' AND state = 'DRAFT'`)).toBe(1);
    });

    it('is not decided: 409 BUDGET.VERSION_NOT_EDITABLE, and the version stays sent', async () => {
      const w = await waiting();
      const draft = await h.built(w.proposal.id);
      await h.sendVersion(draft.id).expect(200);
      await asRevision(draft.id);

      const refused = await h.decideVersion(draft.id, { decision: 'APPROVE' }, boss.account).expect(409);

      expect(h.codeOf(refused)).toBe('BUDGET.VERSION_NOT_EDITABLE');
      expect(await count(`budget_versions WHERE id = '${draft.id}' AND state = 'SENT'`)).toBe(1);
    });
  });

  describe('the draft of a proposal that was withdrawn or given back (F36, QĐ-91a)', () => {
    it('is detached and stays a draft: it is neither changed nor sent nor deleted, and a new version can be made', async () => {
      const w = await waiting();
      const draft = await h.built(w.proposal.id);
      const csv = ['cost_center_code,description,amount', `${draft.costCenter.code},Imported,1000`].join('\n');

      await h.withdraw(w.proposal.id, w.head.account).expect(200);

      const wire = h.dataOf<{ version: VersionWire }>(await h.versionOf(draft.id).expect(200)).version;
      expect(wire).toMatchObject({ state: 'DRAFT' });
      expect(wire.detachedAt).not.toBeNull();
      const refused = [
        await h.updateVersion(draft.id, { base: h.money(1) }),
        await h.updateLine(draft.id, 1, { financeComment: 'late' }),
        await h.addLines(draft.id, [h.line()]),
        await h.importLines(draft.id, csv),
        await h.sendVersion(draft.id),
      ];
      expect(refused.map((response) => [response.status, h.codeOf(response)])).toEqual(
        Array.from({ length: 5 }, () => [409, 'BUDGET.VERSION_NOT_EDITABLE']),
      );
      expect(await count(`budget_versions WHERE id = '${draft.id}'`)).toBe(1);
      // The head sends a new proposal, and Finance makes a version from it: the detached draft does not count as the one in progress.
      const next = h.dataOf<{ proposal: ProposalWire }>(
        await h.submitProposal(h.proposalBody(w.department.unitId), w.head.account).expect(201),
      ).proposal;
      const made = await h.createVersion({
        proposalId: next.id,
        base: h.money(1),
        reserve: h.money(0),
        reserveReason: 'Test reserve',
      });
      expect(made.status).toBe(201);
    });

    it('is detached too when Finance gives the proposal back, and the head sends it again', async () => {
      const w = await waiting();
      const draft = await h.built(w.proposal.id);

      await h.giveBack(w.proposal.id, { reason: 'Add the quotes' }, h.finance).expect(200);
      const again = h.dataOf<{ proposal: ProposalWire }>(
        await h.resubmit(w.proposal.id, { lines: [h.line()] }, w.head.account).expect(201),
      ).proposal;

      expect(h.codeOf(await h.sendVersion(draft.id).expect(409))).toBe('BUDGET.VERSION_NOT_EDITABLE');
      await h
        .createVersion({ proposalId: again.id, base: h.money(1), reserve: h.money(0), reserveReason: 'Test reserve' })
        .expect(201);
    });
  });

  describe('the answers that were a 500 (F37, F39)', () => {
    it('refuses a plan that does not exist, on a proposal and on a line: 422 BUDGET.PLAN_NOT_FOUND', async () => {
      const w = await waiting();
      const draft = await h.built(w.proposal.id);
      const stranger = randomUUID();
      const before = await count('budget_proposals');

      const proposal = await h.submitProposal(
        h.proposalBody(w.department.unitId, [h.line({ planId: stranger })], h.next + 1),
        w.head.account,
      );
      const added = await h.addLines(draft.id, [h.line({ planId: stranger })]);
      const adjusted = await h.updateLine(draft.id, 1, { planId: stranger, adjustmentReason: 'Another plan' });

      expect([proposal.status, added.status, adjusted.status]).toEqual([422, 422, 422]);
      expect([proposal, added, adjusted].map((response) => h.codeOf(response))).toEqual(
        Array(3).fill('BUDGET.PLAN_NOT_FOUND'),
      );
      expect(await count('budget_proposals')).toBe(before);
    });

    it('takes a plan the catalog has', async () => {
      const w = await waiting();

      await h
        .submitProposal(
          h.proposalBody(w.department.unitId, [h.line({ planId: await h.plan('K5') })], h.next + 1),
          w.head.account,
        )
        .expect(201);
    });

    it('answers a collision of the number of the next version with 409 BUDGET.VERSION_NUMBER_TAKEN, not a version in progress', async () => {
      const w = await waiting();
      const first = await h.built(w.proposal.id);
      await h.sendVersion(first.id).expect(200);
      await h.decideVersion(first.id, { decision: 'REJECT', reason: 'Too high' }, boss.account).expect(200);
      // Another writer took number 2 first: this one reads the number the version it follows has.
      const numbers = jest
        .spyOn(h.ctx.app.get(VersionRepo, { strict: false }), 'nextNumber')
        .mockResolvedValueOnce(first.number);

      const lost = await h.createVersion({
        proposalId: w.proposal.id,
        base: h.money(1),
        reserve: h.money(0),
        reserveReason: 'Test reserve',
      });
      numbers.mockRestore();

      expect(lost.status).toBe(409);
      expect(h.codeOf(lost)).toBe('BUDGET.VERSION_NUMBER_TAKEN');
    });
  });

  describe('what only Finance does, whichever way it is reached (F13)', () => {
    it('is refused by the service itself to a caller that does not hold the role', async () => {
      const w = await waiting();
      const version = await h.built(w.proposal.id);
      const head = h.principalOf(w.head.account, ['MANAGER']);
      const proposals = h.ctx.app.get(ProposalService, { strict: false });
      const versions = h.ctx.app.get(VersionService, { strict: false });

      await expect(proposals.giveBack(head, w.proposal.id, 'No')).rejects.toBeInstanceOf(BudgetNotFinanceError);
      await expect(versions.update(head, version.id, { quarters: null })).rejects.toBeInstanceOf(BudgetNotFinanceError);
      await expect(versions.send(head, version.id)).rejects.toBeInstanceOf(BudgetNotFinanceError);
      expect(await count(`budget_proposals WHERE id = '${w.proposal.id}' AND state = 'SUBMITTED'`)).toBe(1);
    });
  });
});
