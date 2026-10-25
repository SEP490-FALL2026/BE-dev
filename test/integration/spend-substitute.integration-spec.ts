import request from 'supertest';
import { SpendHarness, Unit } from '../support/spend-harness';
import type { Person } from '../support/request-harness';

const h = new SpendHarness();
const M = 1_000_000;

describe('the substitute for a conflict of interest over PostgreSQL (US-06-08)', () => {
  let plan: string;
  let executive: Unit;
  let fallback: Person;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    plan = await h.planOf(await h.subscription(10));
    await h
      .declareTaxProfile((await h.vendorOf(plan)).id, [{ taxType: 'GTGT', ratePercent: '10', deductible: true }])
      .expect(200);
    fallback = await h.staff(await h.departmentWithUnit('P-FB'), 'FB-R0');
    await h.setRole('FALLBACK_APPROVER', fallback);
    const row = await h.ctx.sql.query<{ id: string; cost_center_id: string }>(
      `SELECT id, cost_center_id FROM departments WHERE code = 'P-EXE'`,
    );
    const department = { id: row.rows[0].id, code: 'P-EXE', unitId: row.rows[0].cost_center_id };
    executive = { department, head: h.boss, member: await h.staff(department, 'EXE-E1') };
    await h.budgetFor(executive, { total: 100 * M });
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  /** The approver sends a request for themselves: their need goes to the fallback approver and the check runs at once. */
  const askedByTheApprover = async () => {
    const sent = await h.sent(h.boss, plan, { termMonths: 1 });
    await h.decide(sent.id, { decision: 'APPROVE' }, fallback.account).expect(200);

    return sent.id;
  };

  describe('the spend step (AC-1, AC-3 to AC-7)', () => {
    it('is made for the substitute when the approver is the one who asked, with the reason in the Audit Trail (AC-1, AC-7)', async () => {
      const id = await askedByTheApprover();

      expect(await h.steps(id, 'SPEND_APPROVAL')).toEqual([
        expect.objectContaining({ state: 'PENDING', assignee_employee_id: h.substitute.employeeId }),
      ]);
      const events = await h.ctx.sql.query<{ after: { conflictOfInterest: boolean } }>(
        `SELECT after FROM audit_events WHERE resource_id = $1 AND action = 'ACCESS_REQUEST.BUDGET_CHECKED'`,
        [id],
      );
      expect(events.rows[0].after.conflictOfInterest).toBe(true);
    });

    it('has one person it is given to: the approver has no operation on it, and does not even read it (AC-5)', async () => {
      const id = await askedByTheApprover();

      await h.decideSpend(id, { decision: 'APPROVE' }, h.boss.account).expect(403);
      await h.approvalOf(id, h.boss.account).expect(404);
      await h.approvalOf(id, h.substitute.account).expect(200);
      await h.decideSpend(id, { decision: 'APPROVE' }, h.substitute.account).expect(200);

      const role = await h.ctx.sql.query<{ decider_role: string }>(
        `SELECT r.decider_role FROM approval_records r JOIN access_request_steps s ON s.id = r.step_id WHERE r.request_id = $1 AND s.kind = 'SPEND_APPROVAL'`,
        [id],
      );
      expect(role.rows).toEqual([{ decider_role: 'CONFLICT_SUBSTITUTE' }]);
      const view = h.dataOf<{ spendApproval: { decision: { bySubstitute: boolean } } }>(
        await h.approvalOf(id, h.substitute.account).expect(200),
      ).spendApproval;
      expect(view.decision.bySubstitute).toBe(true);
    });

    it('is not given to the substitute when the approver is not a party, whoever is away (AC-4)', async () => {
      const other = await h.departmentWithHead('P-OTH');
      await h.budgetFor(other, { total: 100 * M });

      const id = await h.waitingForApprover(other, plan, { amount: 10 * M });

      expect(await h.steps(id, 'SPEND_APPROVAL')).toEqual([
        expect.objectContaining({ assignee_employee_id: h.boss.employeeId }),
      ]);
    });

    it('waits under control when the substitute is a party too (AC-6)', async () => {
      const id = (await h.sent(h.boss, plan, { termMonths: 1 })).id;
      await h.ctx.sql.query(`UPDATE access_request_beneficiaries SET employee_id = $2 WHERE request_id = $1`, [
        id,
        h.substitute.employeeId,
      ]);
      await h.decide(id, { decision: 'APPROVE' }, fallback.account).expect(200);

      expect(await h.steps(id, 'SPEND_APPROVAL')).toEqual([
        expect.objectContaining({
          state: 'WAITING',
          waiting_reason: 'NO_CONFLICT_SUBSTITUTE',
          assignee_employee_id: null,
        }),
      ]);
      expect(await h.state(id)).toBe('WAITING_CONTROLLED');
    });

    it('waits under control when nobody is named the substitute, and is given to nobody else (AC-3)', async () => {
      await h.clearRole('CONFLICT_SUBSTITUTE');
      try {
        const id = (await h.sent(h.boss, plan, { termMonths: 1 })).id;
        await h.decide(id, { decision: 'APPROVE' }, fallback.account).expect(200);

        expect(await h.steps(id, 'SPEND_APPROVAL')).toEqual([
          expect.objectContaining({
            state: 'WAITING',
            waiting_reason: 'NO_CONFLICT_SUBSTITUTE',
            assignee_employee_id: null,
          }),
        ]);
        expect(await h.state(id)).toBe('WAITING_CONTROLLED');
      } finally {
        await h.setRole('CONFLICT_SUBSTITUTE', h.substitute);
      }
    });
  });

  describe('the configuration (AC-8)', () => {
    it('does not take the approver as their own substitute', async () => {
      const response = await request(h.server())
        .put('/api/v1/approval-roles/CONFLICT_SUBSTITUTE')
        .set({ Authorization: `Bearer ${h.admin}` })
        .send({ employeeId: h.boss.employeeId })
        .expect(422);

      expect(h.codeOf(response)).toBe('APPROVAL_ROLE.SUBSTITUTE_MUST_DIFFER');
    });
  });

  describe('a version of the budget the approver proposed (AC-11)', () => {
    /** The approver, as head of their department, sends the proposal; Finance builds the version and sends it. */
    const proposedByTheApprover = async (year: number) => {
      const proposal = await h.budgetProposed(h.boss, executive.department.unitId, undefined, year);
      const version = await h.built(proposal.id);
      await h.sendVersion(version.id).expect(200);

      return version.id;
    };

    it('is decided by the substitute and not by the approver, and the record says who', async () => {
      const id = await proposedByTheApprover(h.next);

      const refused = await h.decideVersion(id, { decision: 'APPROVE' }, h.boss.account).expect(403);
      await h.versionOf(id, h.substitute.account).expect(200);
      const decided = await h.decideVersion(id, { decision: 'APPROVE' }, h.substitute.account).expect(200);

      expect(h.codeOf(refused)).toBe('BUDGET.CONFLICT_OF_INTEREST');
      expect(h.dataOf<{ version: { state: string } }>(decided).version.state).toBe('APPROVED');
      const record = await h.ctx.sql.query<{ decider_role: string; decided_by_employee_id: string }>(
        `SELECT decider_role, decided_by_employee_id FROM budget_version_decisions WHERE version_id = $1`,
        [id],
      );
      expect(record.rows).toEqual([
        { decider_role: 'CONFLICT_SUBSTITUTE', decided_by_employee_id: h.substitute.employeeId },
      ]);
    });

    it('is decided by the approver when somebody else proposed it, and not by the substitute', async () => {
      const other = await h.departmentWithHead('P-VER');
      const proposal = await h.budgetProposed(other.head, other.department.unitId, undefined, h.next);
      const version = await h.built(proposal.id);
      await h.sendVersion(version.id).expect(200);

      await h.decideVersion(version.id, { decision: 'APPROVE' }, h.substitute.account).expect(403);
      await h.decideVersion(version.id, { decision: 'APPROVE' }, h.boss.account).expect(200);
    });

    it('waits for somebody when the approver proposed it and there is no substitute', async () => {
      await h.clearRole('CONFLICT_SUBSTITUTE');
      try {
        const proposal = await h.budgetProposed(h.boss, executive.department.unitId, undefined, h.next + 1);
        const version = await h.built(proposal.id);
        await h.sendVersion(version.id).expect(200);

        const response = await h.decideVersion(version.id, { decision: 'APPROVE' }, h.boss.account).expect(403);

        expect(h.codeOf(response)).toBe('BUDGET.CONFLICT_OF_INTEREST');
        expect(
          (await h.ctx.sql.query<{ state: string }>(`SELECT state FROM budget_versions WHERE id = $1`, [version.id]))
            .rows[0].state,
        ).toBe('SENT');
      } finally {
        await h.setRole('CONFLICT_SUBSTITUTE', h.substitute);
      }
    });
  });
});
