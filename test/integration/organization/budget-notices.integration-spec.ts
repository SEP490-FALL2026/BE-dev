import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { FIGURE_WORDS } from '../../../src/modules/notifications/inbox/inbox.policy';
import { OrganizationApi } from '../../../src/modules/organization/public/organization.api';
import { BudgetHarness, type ProposalWire } from '../../support/budget-harness';
import { waitForLockWaiters } from '../../support/lock-wait';
import type { Person } from '../../support/request-harness';

const h = new BudgetHarness();

/**
 * `g0-g6-final-business-baseline-remediation`, Task 4.9 (F67, `QĐ-92b`, `US-12-15` rows 18, 40, 54, 55 and AC-24), the budget side: the notices of
 * the loop of a proposal and of a version, written in the transaction of the change to the people the role holders are at that moment.
 * The year-end rows (52, 53) are in `budget-year-end.integration-spec.ts`, those of the requests are the work of their context.
 */
describe('the notices of the budget loops (integration, real PostgreSQL)', () => {
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

    return h.departmentWithHead(`P-NO${counter}`);
  };
  const recipients = async (code: string, subjectId: string) =>
    (await h.budgetNoticesOf(code, subjectId)).map((notice) => notice.recipient_employee_id).sort();
  const heldFor = async (code: string, subjectId: string) =>
    (
      await h.ctx.sql.query<{ department_id: string; delivered_at: Date | null }>(
        `SELECT department_id, delivered_at FROM held_department_notifications WHERE code = $1 AND subject_id = $2`,
        [code, subjectId],
      )
    ).rows;

  it('tells Finance when a proposal is sent (row 40), with ids and the year only', async () => {
    const u = await unit();

    const proposal = await h.budgetProposed(u.head, u.department.unitId);

    const notices = await h.budgetNoticesOf('BUDGET_PROPOSAL_SUBMITTED', proposal.id);
    expect(notices.map((notice) => notice.recipient_employee_id)).toEqual([h.finance.employeeId]);
    expect(notices[0].params).toEqual({ proposalId: proposal.id, costCenterId: u.department.unitId, year: h.next });
  });

  describe('a version that waits for a decision (row 18)', () => {
    it('is told to the spending approver when Finance sends it, and again when it is sent after a request to look again', async () => {
      const u = await unit();
      const proposal = await h.budgetProposed(u.head, u.department.unitId);
      const version = await h.built(proposal.id);

      await h.sendVersion(version.id).expect(200);
      await h
        .decideVersion(version.id, { decision: 'REQUEST_CHANGES', reason: 'Look again' }, boss.account)
        .expect(200);
      await h.sendVersion(version.id).expect(200);

      expect(await recipients('BUDGET_VERSION_AWAITING_DECISION', version.id)).toEqual([
        boss.employeeId,
        boss.employeeId,
      ]);
    });
  });

  describe('a version that is decided (row 40)', () => {
    it('is told to the head of the department and to Finance, with the decision and the reason the head reads', async () => {
      const u = await unit();
      const proposal = await h.budgetProposed(u.head, u.department.unitId);
      const version = await h.built(proposal.id);
      await h.sendVersion(version.id).expect(200);

      await h
        .decideVersion(version.id, { decision: 'REJECT', reason: 'The reserve is too high' }, boss.account)
        .expect(200);

      const notices = await h.budgetNoticesOf('BUDGET_VERSION_DECIDED', version.id);
      expect(notices.map((notice) => notice.recipient_employee_id).sort()).toEqual(
        [h.finance.employeeId, u.head.employeeId].sort(),
      );
      expect(notices[0].params).toEqual({
        versionId: version.id,
        costCenterId: u.department.unitId,
        year: h.next,
        decision: 'REJECTED',
        reason: 'The reserve is too high',
      });
    });
  });

  describe('a proposal that Finance gives back (rows 40, 54, 55)', () => {
    it('is told to the head who sent it, with the reason, and to nobody else', async () => {
      const u = await unit();
      const proposal = await h.budgetProposed(u.head, u.department.unitId);

      await h.giveBack(proposal.id, { reason: 'Add the quotes' }, h.finance).expect(200);

      const notices = await h.budgetNoticesOf('BUDGET_PROPOSAL_RETURNED', proposal.id);
      expect(notices.map((notice) => notice.recipient_employee_id)).toEqual([u.head.employeeId]);
      expect(notices[0].params).toMatchObject({ proposalId: proposal.id, year: h.next, reason: 'Add the quotes' });
      expect(await recipients('BUDGET_PROPOSAL_TASK_ASSIGNED', proposal.id)).toEqual([]);
    });

    it('gives the work to the head of today when the head who sent it no longer heads the department (row 54)', async () => {
      const u = await unit();
      const proposal = await h.budgetProposed(u.head, u.department.unitId);
      await h.replaceHead(u.department, u.member);

      await h.giveBack(proposal.id, { reason: 'Add the quotes' }, h.finance).expect(200);

      expect(await recipients('BUDGET_PROPOSAL_TASK_ASSIGNED', proposal.id)).toEqual([u.member.employeeId]);
      expect(await recipients('BUDGET_PROPOSAL_RETURNED', proposal.id)).toEqual([]);
    });

    it('waits for the first head when nobody heads the department: Finance is told (row 55) and the Super Admin is not told again', async () => {
      const u = await unit();
      const proposal = await h.budgetProposed(u.head, u.department.unitId);
      await h.withoutHead(u.department);

      await h.giveBack(proposal.id, { reason: 'Add the quotes' }, h.finance).expect(200);

      expect(await recipients('BUDGET_PROPOSAL_TASK_WAITING', proposal.id)).toEqual([h.finance.employeeId]);
      expect(await recipients('BUDGET_PROPOSAL_TASK_ASSIGNED', proposal.id)).toEqual([]);
      expect(await heldFor('BUDGET_PROPOSAL_TASK_ASSIGNED', proposal.id)).toEqual([
        { department_id: u.department.id, delivered_at: null },
      ]);
    });
  });

  describe('a head who takes over while the proposal waits to be sent again (row 54)', () => {
    it('is given the work when the Super Admin names them, and the head who has gone is not', async () => {
      const u = await unit();
      const proposal = await h.budgetProposed(u.head, u.department.unitId);
      await h.giveBack(proposal.id, { reason: 'Add the quotes' }, h.finance).expect(200);
      expect(await recipients('BUDGET_PROPOSAL_TASK_ASSIGNED', proposal.id)).toEqual([]);

      await h.makeHead(u.department, u.member);

      expect(await recipients('BUDGET_PROPOSAL_TASK_ASSIGNED', proposal.id)).toEqual([u.member.employeeId]);
      expect(await recipients('BUDGET_PROPOSAL_RETURNED', proposal.id)).toEqual([u.head.employeeId]);
    });

    it('tells the first head once when the work waited for them: the notice that was kept is the one they read', async () => {
      const u = await unit();
      const proposal = await h.budgetProposed(u.head, u.department.unitId);
      await h.withoutHead(u.department);
      await h.giveBack(proposal.id, { reason: 'Add the quotes' }, h.finance).expect(200);

      await h.makeHead(u.department, u.member);

      expect(await recipients('BUDGET_PROPOSAL_TASK_ASSIGNED', proposal.id)).toEqual([u.member.employeeId]);
      expect(await heldFor('BUDGET_PROPOSAL_TASK_ASSIGNED', proposal.id)).toEqual([
        { department_id: u.department.id, delivered_at: expect.any(Date) as Date },
      ]);
    });

    it('gives nothing for a proposal that is not waiting to be sent again, or for another department', async () => {
      const here = await unit();
      const elsewhere = await unit();
      const sentOnly = await h.budgetProposed(here.head, here.department.unitId);
      const givenBackElsewhere = await h.budgetProposed(elsewhere.head, elsewhere.department.unitId);
      await h.giveBack(givenBackElsewhere.id, { reason: 'Add the quotes' }, h.finance).expect(200);

      await h.makeHead(here.department, here.member);

      expect(await recipients('BUDGET_PROPOSAL_TASK_ASSIGNED', sentOnly.id)).toEqual([]);
      expect(await recipients('BUDGET_PROPOSAL_TASK_ASSIGNED', givenBackElsewhere.id)).toEqual([]);
    });
  });

  /**
   * T-11 (review, T-11 a): a writer that keeps a notice for a department reads the head under the department lock `FOR SHARE`; the
   * assignment of a first head holds it `FOR UPDATE` and hands over what was kept before it commits. Whichever comes first, no notice is
   * left kept for a department that has a head. Each case holds the contended lock in a separate connection and queues the other party
   * on it (`waitForLockWaiters`), so the order is the one the case says, never a timing.
   */
  describe('a notice that may be kept and the assignment of the first head of the department (T-11)', () => {
    const holdDepartment = async (departmentId: string, mode: 'UPDATE' | 'SHARE'): Promise<Client> => {
      const holder = new Client({ connectionString: h.ctx.database.url });
      await holder.connect();
      await holder.query('BEGIN');
      await holder.query(`SELECT id FROM departments WHERE id = $1 FOR ${mode}`, [departmentId]);

      return holder;
    };

    it('queues the writer behind the assignment that commits first: the writer reads the new head and tells them directly, keeping nothing', async () => {
      const u = await unit();
      const proposal = await h.budgetProposed(u.head, u.department.unitId);
      await h.withoutHead(u.department);
      const assignment = await holdDepartment(u.department.id, 'UPDATE');
      const given = h.giveBack(proposal.id, { reason: 'Add the quotes' }, h.finance).then((response) => response);

      try {
        await waitForLockWaiters(h.ctx.sql, 1);
        // The assignment of the first head: the period is written under the department lock, and it commits while the writer waits.
        await assignment.query(
          `INSERT INTO department_head_periods (id, organization_id, department_id, employee_id, valid_from)
           VALUES (gen_random_uuid(), $1, $2, $3, $4::date)`,
          [h.seed.organizationId, u.department.id, u.member.employeeId, h.today()],
        );
      } finally {
        await assignment.query('COMMIT');
        await assignment.end();
      }

      expect((await given).status).toBe(200);
      expect(await recipients('BUDGET_PROPOSAL_TASK_ASSIGNED', proposal.id)).toEqual([u.member.employeeId]);
      expect(await recipients('BUDGET_PROPOSAL_TASK_WAITING', proposal.id)).toEqual([]);
      expect(await heldFor('BUDGET_PROPOSAL_TASK_ASSIGNED', proposal.id)).toEqual([]);
    });

    it('makes the assignment wait for the writer that is keeping a notice, and hands that notice over when the writer commits', async () => {
      const u = await unit();
      const subjectId = randomUUID();
      await h.withoutHead(u.department);
      const writer = await holdDepartment(u.department.id, 'SHARE');
      const named = h.makeHead(u.department, u.member);

      try {
        await waitForLockWaiters(h.ctx.sql, 1);
        // The writer read "nobody heads it" under its share lock and keeps the notice; the assignment is queued behind it.
        await writer.query(
          `INSERT INTO held_department_notifications (id, organization_id, department_id, code, subject_type, subject_id, params, event_key)
           VALUES (gen_random_uuid(), $1, $2, 'BUDGET_PROPOSAL_TASK_ASSIGNED', 'BUDGET_PROPOSAL', $3, $4::jsonb, $5)`,
          [
            h.seed.organizationId,
            u.department.id,
            subjectId,
            JSON.stringify({ costCenterId: u.department.unitId, departmentId: u.department.id, year: h.next }),
            `BUDGET_PROPOSAL_TASK_ASSIGNED:${subjectId}`,
          ],
        );
      } finally {
        await writer.query('COMMIT');
        await writer.end();
      }
      await named;

      expect(await recipients('BUDGET_PROPOSAL_TASK_ASSIGNED', subjectId)).toEqual([u.member.employeeId]);
      expect(await heldFor('BUDGET_PROPOSAL_TASK_ASSIGNED', subjectId)).toEqual([
        { department_id: u.department.id, delivered_at: expect.any(Date) as Date },
      ]);
    });
  });

  describe('what keeps a Cost Center in use (QĐ-87d(2), F16)', () => {
    const organization = () => h.ctx.app.get(OrganizationApi, { strict: false });
    const hold = async (costCenterId: string, year: number, state: 'HELD' | 'RELEASED' | 'EXPENSED') =>
      (
        await h.ctx.sql.query<{ id: string }>(
          // A released commitment gave all of its amount back (`budget_commitments_release_check`).
          `INSERT INTO budget_commitments (id, organization_id, request_id, cost_center_id, year, amount_minor, currency, state, unattached_reason,
                                           released_minor, released_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, 1000, $5, $6::"CommitmentState", 'NO_BUDGET',
                   CASE WHEN $6::"CommitmentState" = 'RELEASED' THEN 1000 ELSE 0 END,
                   CASE WHEN $6::"CommitmentState" = 'RELEASED' THEN now() END) RETURNING id`,
          [h.seed.organizationId, await h.fixtureRequestId(), costCenterId, year, h.reporting, state],
        )
      ).rows[0].id;

    it('lists the commitments that are still held, labelled with the year and never an amount, and counts them all', async () => {
      const u = await unit();
      const first = await hold(u.department.unitId, h.year, 'HELD');
      const second = await hold(u.department.unitId, h.next, 'HELD');
      await hold(u.department.unitId, h.next + 1, 'RELEASED');
      await hold(u.department.unitId, h.next + 2, 'EXPENSED');

      const use = await organization().getCostCenterUse(u.department.unitId, 1);

      expect(use.commitments.total).toBe(2);
      expect(use.commitments.items).toHaveLength(1);
      expect([first, second].sort()[0]).toBe(use.commitments.items[0].id);
      expect(use.commitments.items[0]).toMatchObject({ kind: 'BUDGET_COMMITMENT' });
      expect(use.commitments.items[0].label).toMatch(/^\d{4}$/);
    });

    it('answers with nothing for a Cost Center that holds none', async () => {
      const u = await unit();

      expect((await organization().getCostCenterUse(u.department.unitId, 20)).commitments).toEqual({
        items: [],
        total: 0,
      });
    });
  });

  describe('what every notice of these loops carries', () => {
    it('never says a figure: the keys of the parameters are ids, the year, the decision and the reason', async () => {
      const { rows } = await h.ctx.sql.query<{ code: string; params: Record<string, unknown> }>(
        `SELECT code, params FROM in_app_notifications WHERE code LIKE 'BUDGET_%'`,
      );

      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        for (const key of Object.keys(row.params)) {
          expect({ code: row.code, key, figure: FIGURE_WORDS.test(key) }).toEqual({
            code: row.code,
            key,
            figure: false,
          });
        }
      }
    });

    it('is written in the transaction of the change: a change that fails leaves no notice and no change', async () => {
      const u = await unit();
      const proposal = await h.budgetProposed(u.head, u.department.unitId);
      await h.ctx.sql.query(`
        CREATE FUNCTION budget_test_refuse_return() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW.action = 'BUDGET_PROPOSAL.RETURNED' THEN RAISE EXCEPTION 'the audit of this return is refused by the test'; END IF;
          RETURN NEW;
        END $$`);
      await h.ctx.sql.query(
        `CREATE TRIGGER budget_test_refuse_return BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION budget_test_refuse_return()`,
      );
      try {
        expect((await h.giveBack(proposal.id, { reason: 'Add the quotes' }, h.finance)).status).toBeGreaterThanOrEqual(
          500,
        );
      } finally {
        await h.ctx.sql.query(`DROP TRIGGER budget_test_refuse_return ON audit_events`);
        await h.ctx.sql.query(`DROP FUNCTION budget_test_refuse_return()`);
      }

      expect(await recipients('BUDGET_PROPOSAL_RETURNED', proposal.id)).toEqual([]);
      expect(
        h.dataOf<{ proposal: ProposalWire }>(await h.proposalOf(proposal.id, h.finance).expect(200)).proposal.state,
      ).toBe('SUBMITTED');
    });
  });
});
