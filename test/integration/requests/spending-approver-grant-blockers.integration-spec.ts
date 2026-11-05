import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { IdentityAccessApi } from '../../../src/modules/identity-access/public/identity-access.api';
import { SpendingApproverGrantChecks } from '../../../src/modules/identity-access/public/identity-access.extension-points';
import { ReturnHarness } from '../../support/return-harness';
import type { Person } from '../../support/request-harness';
import type { Unit } from '../../support/spend-harness';

const h = new ReturnHarness();

interface Blocker {
  kind: string;
  id: string;
  label: string;
  partyRole?: string;
}
interface Refusal {
  blockers: Blocker[];
  truncated: boolean;
}

/**
 * `qd93-direct-manager-spending-approver-roles`, Task 6b (US-01-03 AC-12, AC-13; QĐ-93d(3); spec rule 10): the Super Admin cannot give
 * SPENDING_APPROVER to a person who is a party of work that is still open — a Request, a return, a BM-10 proposal, a service account.
 * The refusal lists the work (409 `APP_USER.SPENDING_APPROVER_HAS_OPEN_WORK`); a draft is not work (OD-5); once the work is over the grant
 * goes through. `lockSpendingApproverAmong` is what the creating side of a Request uses to meet the same rows (`FOR SHARE`).
 */
describe('the grant of SPENDING_APPROVER and the work that is still open (integration, real PostgreSQL)', () => {
  let internalA: string;
  let internalB: string;
  let paidPlan: string;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    internalA = await h.plan('K5');
    internalB = await h.plan('K5');
    // A request for a group is only for paid software (`GROUP_REQUEST.PLAN_NOT_ELIGIBLE`), so it is on a plan that is paid.
    paidPlan = await h.planOf(await h.subscription(10));
  }, 240000);

  afterEach(async () => {
    await h.ctx.sql.query(
      `UPDATE role_grants SET revoked_at = GREATEST(now(), granted_at) WHERE role = 'SPENDING_APPROVER' AND revoked_at IS NULL`,
    );
  });

  afterAll(async () => {
    await h.stop();
  });

  const unit = async (): Promise<Unit> => {
    counter += 1;

    return h.departmentWithHead(`P-SB${counter}`);
  };
  const grant = (person: Person) =>
    request(h.server())
      .put(`/api/v1/app-users/${person.account.appUserId}/role`)
      .set('Authorization', `Bearer ${h.admin}`)
      .send({ role: 'SPENDING_APPROVER' });
  const holders = async (): Promise<number> =>
    Number(
      (
        await h.ctx.sql.query<{ n: string }>(
          `SELECT count(*) AS n FROM role_grants WHERE role = 'SPENDING_APPROVER' AND revoked_at IS NULL`,
        )
      ).rows[0].n,
    );
  const redeterminations = async (): Promise<number> =>
    Number(
      (
        await h.ctx.sql.query<{ n: string }>(
          `SELECT count(*) AS n FROM audit_events WHERE action LIKE 'ACCESS_REQUEST.STEP_%'`,
        )
      ).rows[0].n,
    );
  const refused = async (person: Person): Promise<Refusal> => {
    const response = await grant(person).expect(409);
    expect(h.codeOf(response)).toBe('APP_USER.SPENDING_APPROVER_HAS_OPEN_WORK');

    return (response.body as { error: { details: Refusal } }).error.details;
  };
  const kinds = (refusal: Refusal) =>
    refusal.blockers.map((blocker) => `${blocker.kind}:${blocker.partyRole ?? ''}`).sort();
  const hired = (person: Person) =>
    h.ctx.sql.query(`UPDATE employees SET hire_date = current_date WHERE id = $1`, [person.employeeId]);

  /** The Cost Center and the year a proposal of a test is written for. */
  const proposalOf = async (person: Person, state: string, year: number): Promise<string> => {
    const id = randomUUID();
    const { rows } = await h.ctx.sql.query<{ id: string }>(`SELECT id FROM cost_centers ORDER BY id LIMIT 1`);
    await h.ctx.sql.query(
      `INSERT INTO budget_proposals (id, organization_id, cost_center_id, year, state, total_minor, currency, submitted_by_employee_id,
                                    withdrawn_at, closed_at, returned_reason, returned_by_employee_id, returned_at)
       VALUES ($1, $2, $3, $4, $5::"BudgetProposalState", 100, 'VND', $6,
               CASE WHEN $5::text = 'WITHDRAWN' THEN now() END, CASE WHEN $5::text = 'CLOSED_FISCAL_YEAR_ENDED' THEN now() END,
               CASE WHEN $5::text = 'RETURNED' THEN 'Give the plan more detail' END, CASE WHEN $5::text = 'RETURNED' THEN $6::uuid END,
               CASE WHEN $5::text = 'RETURNED' THEN now() END)`,
      [id, h.seed.organizationId, rows[0].id, year, state, person.employeeId],
    );

    return id;
  };
  const versionOf = async (proposalId: string, person: Person, state: string, number: number): Promise<string> => {
    const id = randomUUID();
    const { rows } = await h.ctx.sql.query<{ cost_center_id: string; year: number }>(
      `SELECT cost_center_id, year FROM budget_proposals WHERE id = $1`,
      [proposalId],
    );
    await h.ctx.sql.query(
      `INSERT INTO budget_versions (id, organization_id, cost_center_id, year, number, kind, state, proposal_id, base_minor, reserve_minor,
                                    total_minor, currency, high_value_percent, created_by_employee_id, sent_by_employee_id, sent_at)
       VALUES ($1, $2, $3, $4, $5, 'INITIAL', $6::"BudgetVersionState", $7, 60, 20, 80, 'VND', 50, $8,
               CASE WHEN $6::text <> 'DRAFT' THEN $8::uuid END, CASE WHEN $6::text <> 'DRAFT' THEN now() END)`,
      [id, h.seed.organizationId, rows[0].cost_center_id, rows[0].year, number, state, proposalId, person.employeeId],
    );

    return id;
  };

  describe('Requests (US-01-03 AC-12)', () => {
    it('refuses a holder with open requests and lists them: the one they sent and the one sent for them and a colleague, nothing is redetermined', async () => {
      const u = await unit();
      const person = await h.staff(u.department, `E7-${counter}`);
      const colleague = await h.staff(u.department, `E7C-${counter}`);
      await hired(person);
      const sentByThem = await h.sent(person, internalA);
      const forGroup = await h.sentForPeople(paidPlan, [person, colleague], u.head.account);
      const audit = await redeterminations();

      const refusal = await refused(person);

      expect(refusal.truncated).toBe(false);
      expect(refusal.blockers).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: 'REQUEST', id: sentByThem.id, partyRole: 'REQUESTER' }),
          expect.objectContaining({ kind: 'REQUEST', id: forGroup, partyRole: 'BENEFICIARY' }),
        ]),
      );
      expect(refusal.blockers).toHaveLength(2);
      expect(refusal.blockers.every((blocker) => blocker.label.length > 0)).toBe(true);
      expect(await holders()).toBe(0);
      expect(await redeterminations()).toBe(audit);

      // The work ends (the requester withdraws, the head withdraws what was sent for the person and a colleague): the grant goes through.
      await h.withdrawRequest(sentByThem.id, {}, person.account).expect(200);
      await h.withdrawRequest(forGroup, {}, u.head.account).expect(200);
      await grant(person).expect(200);
      expect(await holders()).toBe(1);
    });

    it('does not count a request that has ended or a draft (OD-5)', async () => {
      const u = await unit();
      const person = await h.staff(u.department, `E7D-${counter}`);
      const ended = await h.sent(person, internalA);
      await h.withdrawRequest(ended.id, {}, person.account).expect(200);
      const draft = await h.sent(person, internalB);
      // A draft is a row of the same table that was never sent (spec: `state = 'DRAFT'` and no `submitted_at`).
      await h.ctx.sql.query(`UPDATE access_requests SET state = 'DRAFT', submitted_at = NULL WHERE id = $1`, [
        draft.id,
      ]);

      await grant(person).expect(200);

      expect(await holders()).toBe(1);
    });
  });

  describe('the return of a seat (US-01-03 AC-12)', () => {
    it('refuses the holder who asked for the return of a seat while it is awaiting revocation, and names it', async () => {
      const u = await unit();
      const assignmentId = await h.seatOf(u.member, { planId: internalA });
      const wire = await h.returned(u.member.account, { assignmentId, reason: 'The project is over' });

      const refusal = await refused(u.member);

      expect(refusal.blockers).toEqual([expect.objectContaining({ kind: 'RETURN_REQUEST', id: wire.id })]);
      expect(await holders()).toBe(0);
    });
  });

  describe('BM-10 proposals (US-01-03 AC-13, OD-6)', () => {
    it('refuses the proposer of a proposal that is submitted, given back, or reviewed into a version still being decided', async () => {
      const u = await unit();
      const person = await h.staff(u.department, `E8-${counter}`);
      const submitted = await proposalOf(person, 'SUBMITTED', 2031);
      const returned = await proposalOf(person, 'RETURNED', 2032);
      const reviewed = await proposalOf(person, 'REVIEWED', 2033);
      await versionOf(reviewed, person, 'DRAFT', 1);

      const refusal = await refused(person);

      expect(refusal.blockers.map((blocker) => blocker.id).sort()).toEqual([submitted, returned, reviewed].sort());
      expect(kinds(refusal)).toEqual(Array(3).fill('BUDGET_PROPOSAL:'));
    });

    it('does not count a withdrawn proposal, one closed with the fiscal year, or one whose version was decided', async () => {
      const u = await unit();
      const person = await h.staff(u.department, `E8D-${counter}`);
      await proposalOf(person, 'WITHDRAWN', 2034);
      await proposalOf(person, 'CLOSED_FISCAL_YEAR_ENDED', 2035);
      const decided = await proposalOf(person, 'REVIEWED', 2036);
      await versionOf(decided, person, 'REJECTED', 1);

      await grant(person).expect(200);

      expect(await holders()).toBe(1);
    });
  });

  describe('service accounts (US-01-03 AC-13)', () => {
    it('refuses the person who answers for a service account that is still in effect, and grants once it is over', async () => {
      const u = await unit();
      const person = await h.staff(u.department, `E9-${counter}`);
      const subscriptionId = await h.subscription(10, 'K2', u.department.id);
      await h.ctx.sql.query(`UPDATE employees SET hire_date = '2020-01-01' WHERE id = $1`, [person.employeeId]);
      await h.written({ subscriptionId }, [
        {
          employee_code: `E9-${counter}`,
          account_identifier: `ci-bot-${counter}`,
          kind: 'service',
          reason: 'CI pipeline',
          granted_on: '2026-01-05',
        },
      ]);
      const bot = (await h.assignmentsOf({ subscriptionId, kind: 'SERVICE' }))[0];

      const refusal = await refused(person);

      expect(refusal.blockers).toEqual([
        expect.objectContaining({ kind: 'SERVICE_ACCOUNT', id: bot.id, partyRole: 'RESPONSIBLE' }),
      ]);

      await h.ctx.sql.query(`UPDATE license_assignments SET valid_until = current_date WHERE id = $1`, [bot.id]);
      await grant(person).expect(200);
    });
  });

  describe('the answer', () => {
    it('lists at most 50 blockers and says it cut the list', async () => {
      const u = await unit();
      const person = await h.staff(u.department, `E10-${counter}`);
      for (let year = 2100; year < 2152; year += 1) await proposalOf(person, 'SUBMITTED', year);

      const refusal = await refused(person);

      expect(refusal.blockers).toHaveLength(50);
      expect(refusal.truncated).toBe(true);
    });

    it('is told by the three modules above identity-access, through one extension point of the API graph', () => {
      const checks = h.ctx.app.get(SpendingApproverGrantChecks, { strict: false });

      expect(checks.names().sort()).toEqual([
        'budgets.open-proposals',
        'licensing.service-accounts',
        'requests.open-work',
      ]);
    });
  });

  describe('lockSpendingApproverAmong (the creating side of a Request meets this grant)', () => {
    it('locks the accounts FOR SHARE in one go and says which of the people holds the role, or nobody', async () => {
      const u = await unit();
      const other = await h.staff(u.department, `E11-${counter}`);
      const api = h.ctx.app.get(IdentityAccessApi);
      const runner = h.ctx.app.get(TransactionRunner);
      const between = [u.member.employeeId, other.employeeId, randomUUID()];

      const none = await runner.run((tx) => api.lockSpendingApproverAmong(tx, between));
      expect(none).toBeNull();

      await grant(other).expect(200);
      const held = await runner.run(async (tx) => {
        const holder = await api.lockSpendingApproverAmong(tx, between);
        // The lock is held to the end of the transaction: an update of the account of either person has to wait, a share does not.
        const share = await h.ctx.sql.query(`SELECT id FROM app_users WHERE id = $1 FOR SHARE NOWAIT`, [
          other.account.appUserId,
        ]);
        const update = await h.ctx.sql
          .query(`SELECT id FROM app_users WHERE id = $1 FOR UPDATE NOWAIT`, [other.account.appUserId])
          .then(
            () => 'granted' as const,
            (error: { code?: string }) => error.code ?? 'failed',
          );

        return { holder, shared: share.rowCount, update };
      });

      expect(held).toEqual({ holder: other.employeeId, shared: 1, update: '55P03' });
      expect(await runner.run((tx) => api.lockSpendingApproverAmong(tx, []))).toBeNull();
    });
  });
});
