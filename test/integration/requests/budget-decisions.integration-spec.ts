import request from 'supertest';
import { BudgetHarness, Pageable, VersionLineWire, VersionWire } from '../../support/budget-harness';
import { waitForLockWaiters } from '../../support/lock-wait';
import type { Person } from '../../support/request-harness';

const h = new BudgetHarness();

describe('budgets over HTTP: the decision of the spending approver (integration, real PostgreSQL)', () => {
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

  /** A department with a proposal that waits, and a version made from it and sent, for the year given. */
  const sent = async (year = h.next, extra: Record<string, unknown> = {}) => {
    counter += 1;
    const unit = await h.departmentWithHead(`P-D${counter}`);
    const proposal = await h.budgetProposed(unit.head, unit.department.unitId, undefined, year);
    const version = await h.built(proposal.id, extra);
    await h.sendVersion(version.id).expect(200);

    return { ...unit, proposal, version };
  };
  const stateOf = async (id: string) =>
    (await h.ctx.sql.query<{ state: string }>(`SELECT state FROM budget_versions WHERE id = $1`, [id])).rows[0].state;
  const approve = (id: string, account = boss.account) => h.decideVersion(id, { decision: 'APPROVE' }, account);
  /**
   * Sends the requests one by one behind the row of a version held in another connection. A decision locks the versions of the
   * Cost Center and the year by id first (`VersionRepo.lockAllOfYear`, `FOR UPDATE`), so each request is waiting for that lock
   * (`waitForLockWaiters`) before the next is sent, the lock goes to them in the order they queued, and each answer is the answer of
   * its place in the queue. The row is always released.
   */
  const queuedOnVersion = async (id: string, sends: (() => request.Test)[]): Promise<request.Response[]> => {
    const holder = await h.holdRow('budget_versions', id);
    const pending: Promise<request.Response>[] = [];
    try {
      for (const send of sends) {
        pending.push(send().then((response) => response));
        await waitForLockWaiters(h.ctx.sql, pending.length);
      }
    } finally {
      await holder.release();
      await Promise.allSettled(pending);
    }
    const answers: request.Response[] = [];
    for (const answer of pending) answers.push(await answer);

    return answers;
  };
  const wireOf = async (id: string, account = h.finance) =>
    h.dataOf<{ version: VersionWire }>(await h.versionOf(id, account).expect(200)).version;
  const commit = async (costCenterId: string, year: number, amount: number) =>
    (
      await h.ctx.sql.query<{ id: string }>(
        `INSERT INTO budget_commitments (id, organization_id, request_id, cost_center_id, year, amount_minor, currency, unattached_reason)
         VALUES (gen_random_uuid(), $1, $6, $2, $3, $4, $5, 'NO_BUDGET') RETURNING id`,
        [h.seed.organizationId, costCenterId, year, amount, h.reporting, await h.fixtureRequestId()],
      )
    ).rows[0].id;
  const attachedTo = async (id: string) =>
    (
      await h.ctx.sql.query<{ attached_version_id: string | null; unattached_reason: string | null }>(
        `SELECT attached_version_id, unattached_reason FROM budget_commitments WHERE id = $1`,
        [id],
      )
    ).rows[0];
  const rowOf = async (costCenterId: string, year: number) =>
    h
      .dataOf<
        Pageable<{
          costCenter: { id: string };
          total: { amount: string };
          committed: { amount: string };
          remaining: { amount: string };
          overCommitted: boolean;
        }>
      >(await h.table(h.finance, { year, pageSize: 100 }).expect(200))
      .items.find((row) => row.costCenter.id === costCenterId);

  describe('approving (US-06-11 AC-1)', () => {
    it('makes the version the current budget, and writes the record of the decision', async () => {
      const { version, head, department } = await sent();

      const response = await approve(version.id).expect(200);

      expect(h.dataOf<{ version: VersionWire }>(response).version).toMatchObject({
        state: 'APPROVED',
        decision: { decision: 'APPROVED', reason: null, by: { employeeId: boss.employeeId } },
      });
      const mine = h.dataOf<{ budget: { status: string; total: { amount: string }; version: { number: number } } }>(
        await h.mine(head.account, h.next).expect(200),
      ).budget;
      expect(mine).toMatchObject({ status: 'ACTIVE', total: { amount: '80000000' }, version: { number: 1 } });
      const record = await h.ctx.sql.query<{
        decider_role: string;
        decided_by_employee_id: string;
        total_minor: string;
        previous_total_minor: string | null;
      }>(
        `SELECT decider_role, decided_by_employee_id, total_minor, previous_total_minor FROM budget_version_decisions WHERE version_id = $1`,
        [version.id],
      );
      expect(record.rows).toEqual([
        {
          decider_role: 'SPENDING_APPROVER',
          decided_by_employee_id: boss.employeeId,
          total_minor: '80000000',
          previous_total_minor: null,
        },
      ]);
      expect((await rowOf(department.unitId, h.next))?.total.amount).toBe('80000000');
      expect((await h.auditEvents('BUDGET_VERSION', version.id)).map((event) => event.action)).toContain(
        'BUDGET_VERSION.APPROVED',
      );
    });

    it('is decided once: a second decision finds it no longer waiting', async () => {
      const { version } = await sent();
      await approve(version.id).expect(200);

      const again = await approve(version.id).expect(409);
      const reject = await h
        .decideVersion(version.id, { decision: 'REJECT', reason: 'Too late' }, boss.account)
        .expect(409);

      expect(h.codeOf(again)).toBe('BUDGET.VERSION_NOT_SENT');
      expect(h.codeOf(reject)).toBe('BUDGET.VERSION_NOT_SENT');
    });

    it('is decided by one of two who ask at once', async () => {
      const { version } = await sent();

      const [first, second] = await queuedOnVersion(version.id, [() => approve(version.id), () => approve(version.id)]);

      expect(first.status).toBe(200);
      expect(second.status).toBe(409);
      expect(h.codeOf(second)).toBe('BUDGET.VERSION_NOT_SENT');
      expect(await stateOf(version.id)).toBe('APPROVED');
      const decisions = await h.ctx.sql.query(`SELECT 1 FROM budget_version_decisions WHERE version_id = $1`, [
        version.id,
      ]);
      expect(decisions.rowCount).toBe(1);
    });

    it('does not decide a version that was not sent', async () => {
      counter += 1;
      const unit = await h.departmentWithHead(`P-D${counter}`);
      const proposal = await h.budgetProposed(unit.head, unit.department.unitId);
      const draft = await h.built(proposal.id);

      const response = await approve(draft.id).expect(409);

      expect(h.codeOf(response)).toBe('BUDGET.VERSION_NOT_SENT');
      expect(await stateOf(draft.id)).toBe('DRAFT');
    });
  });

  describe('what the approver sees of a version (AC-2; US-06-09 AC-10)', () => {
    it('reads the version with the comments and the reasons of Finance, and the proposal it comes from beside it', async () => {
      counter += 1;
      const unit = await h.departmentWithHead(`P-D${counter}`);
      const proposal = await h.budgetProposed(unit.head, unit.department.unitId);
      const version = await h.built(proposal.id);
      await h
        .updateLine(version.id, 1, {
          seats: 8,
          amount: h.money(40_000_000),
          financeComment: 'Two people moved to Miro',
          adjustmentReason: 'Two people moved to Miro',
        })
        .expect(200);
      await h.sendVersion(version.id).expect(200);

      const detail = await wireOf(version.id, boss.account);
      const lines = h.dataOf<Pageable<VersionLineWire>>(await h.versionLines(version.id, boss.account).expect(200));
      const original = h.dataOf<Pageable<{ amount: { amount: string } }>>(
        await h.proposalLines(proposal.id, boss.account).expect(200),
      );
      const queue = h.dataOf<Pageable<{ id: string }>>(
        await h.versionList(boss.account, { state: 'SENT', pageSize: 100 }).expect(200),
      );

      expect(detail).toMatchObject({
        proposalId: proposal.id,
        total: { amount: '80000000' },
        costCenter: { id: unit.department.unitId },
      });
      expect(lines.items[0]).toMatchObject({
        amount: { amount: '40000000' },
        financeComment: 'Two people moved to Miro',
        adjustmentReason: 'Two people moved to Miro',
      });
      expect(original.items[0].amount.amount).toBe('50000000');
      expect(queue.items.map((item) => item.id)).toContain(version.id);
    });

    it('is read by Finance and the approver only: not by a head, the IT Admin or an employee', async () => {
      const { version, head } = await sent();

      await h.versionOf(version.id, head.account).expect(403);
      await h.versionOf(version.id, h.it1).expect(403);
      await h.versionLines(version.id, head.account).expect(403);
      await h.versionList(head.account).expect(403);
      await h.versionOf(version.id, boss.account).expect(200);
      await h.versionOf(version.id, h.finance).expect(200);
    });
  });

  describe('refusing (AC-3)', () => {
    it.each([
      ['without a reason', {}],
      ['with a blank reason', { reason: '  ' }],
    ])('is not saved %s', async (_name, over) => {
      const { version } = await sent();

      const response = await h.decideVersion(version.id, { decision: 'REJECT', ...over }, boss.account).expect(422);

      expect(h.codeOf(response)).toBe('VALIDATION_ERROR');
      expect(await stateOf(version.id)).toBe('SENT');
    });

    it('leaves the Cost Center without a budget and tells the head why; the proposal stays reviewed, is not given back, and a new proposal follows it (F63)', async () => {
      const { version, head, department, proposal } = await sent();

      await h
        .decideVersion(version.id, { decision: 'REJECT', reason: 'The reserve is too high' }, boss.account)
        .expect(200);

      const mine = h.dataOf<{ budget: { status: string; latestRefusal: { reason: string } | null } }>(
        await h.mine(head.account, h.next).expect(200),
      ).budget;
      expect(mine).toMatchObject({ status: 'NO_ACTIVE_BUDGET', latestRefusal: { reason: 'The reserve is too high' } });
      expect(await stateOf(version.id)).toBe('REJECTED');
      expect(await rowOf(department.unitId, h.next)).toBeUndefined();
      expect((await wireOf(version.id)).decision).toMatchObject({
        decision: 'REJECTED',
        reason: 'The reserve is too high',
      });
      const kept = await h.proposalOf(proposal.id, head.account).expect(200);
      expect(h.dataOf<{ proposal: { state: string; returned: unknown } }>(kept).proposal).toMatchObject({
        state: 'REVIEWED',
        returned: null,
      });
      // The proposal was not given back, so it is not sent again; the need changed, so the head sends a new one that follows it.
      expect(h.codeOf(await h.resubmit(proposal.id, { lines: [h.line()] }, head.account).expect(409))).toBe(
        'BUDGET.PROPOSAL_CANNOT_RESUBMIT',
      );
      const successor = await h.submitProposal(h.proposalBody(department.unitId), head.account).expect(201);
      expect(
        h.dataOf<{ proposal: { state: string; successorOfProposalId: string | null } }>(successor).proposal,
      ).toMatchObject({
        state: 'SUBMITTED',
        successorOfProposalId: proposal.id,
      });
      expect(h.codeOf(await h.submitProposal(h.proposalBody(department.unitId), head.account).expect(409))).toBe(
        'BUDGET.PROPOSAL_ALREADY_OPEN',
      );
    });
  });

  describe('asking Finance to look again (AC-4)', () => {
    it('needs the reason, sends the version back to Finance, who changes it and sends it again', async () => {
      const { version } = await sent();

      const bare = await h.decideVersion(version.id, { decision: 'REQUEST_CHANGES' }, boss.account).expect(422);
      await h
        .decideVersion(version.id, { decision: 'REQUEST_CHANGES', reason: 'The reserve is too high' }, boss.account)
        .expect(200);
      const back = await wireOf(version.id);
      await h.updateVersion(version.id, { reserve: h.money(10_000_000) }).expect(200);
      await h.sendVersion(version.id).expect(200);
      await approve(version.id).expect(200);

      expect(h.codeOf(bare)).toBe('VALIDATION_ERROR');
      expect(back).toMatchObject({ state: 'CHANGES_REQUESTED', decision: { decision: 'CHANGES_REQUESTED' } });
      expect((await wireOf(version.id)).total.amount).toBe('70000000');
      const decisions = await h.ctx.sql.query<{ decision: string }>(
        `SELECT decision FROM budget_version_decisions WHERE version_id = $1 ORDER BY decided_at`,
        [version.id],
      );
      expect(decisions.rows.map((row) => row.decision)).toEqual(['CHANGES_REQUESTED', 'APPROVED']);
    });

    it('keeps the version in the list of versions, and the Cost Center still has no budget meanwhile', async () => {
      const { version, department } = await sent();

      await h
        .decideVersion(version.id, { decision: 'REQUEST_CHANGES', reason: 'Look again' }, boss.account)
        .expect(200);

      const versions = h.dataOf<Pageable<{ id: string; state: string }>>(
        await h.versionList(h.finance, { year: h.next, pageSize: 100 }).expect(200),
      );
      expect(versions.items.find((item) => item.id === version.id)?.state).toBe('CHANGES_REQUESTED');
      expect(await rowOf(department.unitId, h.next)).toBeUndefined();
    });
  });

  describe('the approver changes no figure (AC-5)', () => {
    it('has the three decisions and nothing else: no figure, no line, no send, and a figure in the decision is refused', async () => {
      const { version } = await sent();

      await h.updateVersion(version.id, { base: h.money(1) }, boss.account).expect(403);
      await h.updateLine(version.id, 1, { financeComment: 'x' }, boss.account).expect(403);
      const extra = await h
        .decideVersion(version.id, { decision: 'APPROVE', base: h.money(1) }, boss.account)
        .expect(422);

      expect(h.codeOf(extra)).toBe('VALIDATION_ERROR');
      expect(await stateOf(version.id)).toBe('SENT');
      expect((await wireOf(version.id)).base.amount).toBe('60000000');
    });
  });

  describe('who decides (AC-7, AC-8; SoD-8)', () => {
    it.each([
      ['the head of the department', (head: Person) => head.account],
      ['the IT Admin', () => h.it1],
      ['Finance, who is not the spending approver', () => h.finance],
    ])('is not %s', async (_name, who) => {
      const { version, head } = await sent();

      for (const decision of [
        { decision: 'APPROVE' },
        { decision: 'REJECT', reason: 'No' },
        { decision: 'REQUEST_CHANGES', reason: 'No' },
      ]) {
        const response = await h.decideVersion(version.id, decision, who(head)).expect(403);
        expect(h.codeOf(response)).toBe('BUDGET.NOT_SPENDING_APPROVER');
      }
      expect(await stateOf(version.id)).toBe('SENT');
    });

    it('is not the Super Admin', async () => {
      const { version } = await sent();

      const response = await request(h.server())
        .post(`/api/v1/budget-versions/${version.id}/decision`)
        .set({ Authorization: `Bearer ${h.admin}` })
        .send({ decision: 'APPROVE' });

      expect(response.status).toBe(403);
      expect(await stateOf(version.id)).toBe('SENT');
    });
  });

  describe('commitments that wait for a budget (US-06-07 AC-3, AC-4, AC-6; US-06-11 AC-9)', () => {
    it('are attached to the version when it is approved, with an event for each, and the remaining goes below nothing', async () => {
      const { version, department } = await sent(h.year, { base: h.money(20_000_000), reserve: h.money(0) });
      const waiting = await commit(department.unitId, h.year, 30_000_000);

      await approve(version.id).expect(200);

      expect(await attachedTo(waiting)).toEqual({ attached_version_id: version.id, unattached_reason: null });
      const row = await rowOf(department.unitId, h.year);
      expect(row).toMatchObject({
        total: { amount: '20000000' },
        committed: { amount: '30000000' },
        remaining: { amount: '-10000000' },
        overCommitted: true,
      });
      const events = await h.auditEvents('BUDGET_COMMITMENT', waiting);
      expect(events.map((event) => event.action)).toEqual(['BUDGET_COMMITMENT.ATTACHED']);
    });

    it('are not attached to the budget of another year', async () => {
      const { version, department } = await sent(h.next);
      const thisYear = await commit(department.unitId, h.year, 30_000_000);
      const nextYear = await commit(department.unitId, h.next, 2_400_000);

      await approve(version.id).expect(200);

      expect(await attachedTo(thisYear)).toEqual({ attached_version_id: null, unattached_reason: 'NO_BUDGET' });
      expect(await attachedTo(nextYear)).toMatchObject({ attached_version_id: version.id });
      expect((await rowOf(department.unitId, h.next))?.remaining.amount).toBe('77600000');
    });

    it('are not attached to the budget of another Cost Center', async () => {
      const { version } = await sent();
      const stranger = (await h.departmentWithUnit(`P-S${(counter += 1)}`)).unitId;
      const waiting = await commit(stranger, h.next, 1_000_000);

      await approve(version.id).expect(200);

      expect(await attachedTo(waiting)).toEqual({ attached_version_id: null, unattached_reason: 'NO_BUDGET' });
    });

    it('stay unattached while the version waits, was sent back or was refused, and the year still has no budget', async () => {
      const waiting = await sent();
      const sentBack = await sent();
      const refused = await sent();
      const first = await commit(waiting.department.unitId, h.next, 5_000_000);
      const second = await commit(sentBack.department.unitId, h.next, 5_000_000);
      const third = await commit(refused.department.unitId, h.next, 5_000_000);

      await h
        .decideVersion(sentBack.version.id, { decision: 'REQUEST_CHANGES', reason: 'Again' }, boss.account)
        .expect(200);
      await h.decideVersion(refused.version.id, { decision: 'REJECT', reason: 'No' }, boss.account).expect(200);

      for (const id of [first, second, third]) {
        expect(await attachedTo(id)).toEqual({ attached_version_id: null, unattached_reason: 'NO_BUDGET' });
      }
      // MF4-C: the table lists a Cost Center that holds commitments even with no approved version; such a row has no version and no base.
      for (const unit of [waiting, sentBack, refused]) {
        const row = (await rowOf(unit.department.unitId, h.next)) as { number?: unknown; base?: unknown } | undefined;
        expect(row === undefined ? null : { number: row.number, base: row.base }).toEqual(
          row === undefined ? null : { number: null, base: null },
        );
      }
    });

    it('make no budget of their own: nothing of limit zero is created for them', async () => {
      counter += 1;
      const unit = await h.departmentWithHead(`P-E${counter}`);
      await commit(unit.department.unitId, h.year, 30_000_000);

      const versions = await h.ctx.sql.query(`SELECT 1 FROM budget_versions WHERE cost_center_id = $1`, [
        unit.department.unitId,
      ]);

      expect(versions.rowCount).toBe(0);
    });
  });
});
