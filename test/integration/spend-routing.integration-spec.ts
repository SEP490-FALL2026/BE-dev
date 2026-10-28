import type { Person } from '../support/request-harness';
import { SpendHarness, Unit } from '../support/spend-harness';

const h = new SpendHarness();
const M = 1_000_000;

describe('who holds the spend step over PostgreSQL (US-06-01, US-06-14 AC-7, US-05-03 AC-9)', () => {
  let plan: string;
  let design: Unit;
  let substitute: Person;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    plan = await h.planOf(await h.subscription(10));
    await h
      .declareTaxProfile((await h.vendorOf(plan)).id, [{ taxType: 'GTGT', ratePercent: '10', deductible: true }])
      .expect(200);
    design = await h.departmentWithHead('P-DES');
    await h.budgetFor(design, { total: 100 * M });
    const legal = await h.departmentWithUnit('P-LEG');
    substitute = await h.staff(legal, 'LEG-S1');
    await h.setRole('CONFLICT_SUBSTITUTE', substitute);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const ready = async () => {
    const id = await h.paidRequest(design, plan, { amount: 10 * M });

    return id;
  };

  it('is the spending approver, for the step that follows a check that is in order', async () => {
    const id = await ready();

    await h.route(id, design.head.account);

    expect(await h.steps(id, 'SPEND_APPROVAL')).toEqual([
      expect.objectContaining({
        state: 'PENDING',
        assignee_employee_id: h.boss.employeeId,
        same_person_as_spend: false,
      }),
    ]);
  });

  it('is the substitute when the approver is the one the request is for, and the approver does not read it (FR-3.15)', async () => {
    const id = await ready();
    await h.ctx.sql.query(`UPDATE access_request_beneficiaries SET employee_id = $2 WHERE request_id = $1`, [
      id,
      h.boss.employeeId,
    ]);

    await h.route(id, design.head.account);

    expect(await h.steps(id, 'SPEND_APPROVAL')).toEqual([
      expect.objectContaining({ state: 'PENDING', assignee_employee_id: substitute.employeeId }),
    ]);
    await h.checkOf(id, substitute.account).expect(200);
    await h.checkOf(id, h.boss.account).expect(404);
  });

  it('waits under control when the approver is in conflict and there is no substitute, and decides nothing', async () => {
    const id = await ready();
    await h.ctx.sql.query(`UPDATE access_request_beneficiaries SET employee_id = $2 WHERE request_id = $1`, [
      id,
      h.boss.employeeId,
    ]);
    await h.clearRole('CONFLICT_SUBSTITUTE');

    try {
      await h.route(id, design.head.account);

      expect(await h.steps(id, 'SPEND_APPROVAL')).toEqual([
        expect.objectContaining({
          state: 'WAITING',
          assignee_employee_id: null,
          waiting_reason: 'NO_CONFLICT_SUBSTITUTE',
        }),
      ]);
      expect(await h.state(id)).toBe('WAITING_CONTROLLED');
    } finally {
      await h.setRole('CONFLICT_SUBSTITUTE', substitute);
    }
  });

  it('waits under control, and is given to nobody else, when nobody holds the role of the approver', async () => {
    const id = await ready();
    await h.clearRole('SPENDING_APPROVER');

    try {
      await h.route(id, design.head.account);

      expect(await h.steps(id, 'SPEND_APPROVAL')).toEqual([
        expect.objectContaining({
          state: 'WAITING',
          assignee_employee_id: null,
          waiting_reason: 'NO_SPENDING_APPROVER',
        }),
      ]);
      expect(await h.state(id)).toBe('WAITING_CONTROLLED');
      const wire = h.dataOf<{ request: { spend: { stage: string } } }>(
        await h.fetch(id, design.head.account).expect(200),
      );
      expect(wire.request.spend.stage).toBe('WAITING_SPEND_DECISION');
    } finally {
      await h.setRole('SPENDING_APPROVER', h.boss);
    }
  });

  it('is made at once, with both steps flagged, when the head who approved the need is the spending approver (US-06-14 AC-8, US-05-03 AC-9)', async () => {
    const executive = await h.ctx.sql.query<{ id: string; code: string; cost_center_id: string }>(
      `SELECT d.id, d.code, c.id AS cost_center_id FROM departments d
       JOIN cost_centers c ON c.department_id = d.id AND c.status = 'ACTIVE' WHERE d.code = 'P-EXE'`,
    );
    const unit: Unit = {
      department: { id: executive.rows[0].id, code: 'P-EXE', unitId: executive.rows[0].cost_center_id },
      head: h.boss,
      member: await h.staff(
        { id: executive.rows[0].id, code: 'P-EXE', unitId: executive.rows[0].cost_center_id },
        'EXE-E1',
      ),
    };
    await h.budgetFor(unit, { total: 100 * M });
    // The head is the approver: nobody sends it on, so the check ran when the need was approved.
    const id = await h.paidRequest(unit, plan, { amount: 10 * M });

    expect(await h.steps(id, 'SPEND_APPROVAL')).toEqual([
      expect.objectContaining({ assignee_employee_id: h.boss.employeeId, same_person_as_spend: true }),
    ]);
    const need = await h.ctx.sql.query<{ same_person_as_spend: boolean; assignee_employee_id: string }>(
      `SELECT same_person_as_spend, assignee_employee_id FROM access_request_steps WHERE request_id = $1 AND kind = 'NEED'`,
      [id],
    );
    expect(need.rows).toEqual([{ same_person_as_spend: true, assignee_employee_id: h.boss.employeeId }]);
  });

  it('writes the check into the Audit Trail with the codes and where the request went', async () => {
    const id = await ready();

    await h.route(id, design.head.account);

    const events = await h.ctx.sql.query<{
      action: string;
      after: { route: string; codes: string; opened: string; state: string };
    }>(`SELECT action, after FROM audit_events WHERE resource_id = $1 AND action = 'ACCESS_REQUEST.BUDGET_CHECKED'`, [
      id,
    ]);
    expect(events.rows).toHaveLength(1);
    expect(events.rows[0].after).toMatchObject({
      route: 'SPEND_APPROVAL',
      codes: 'BUDGET_OK',
      opened: 'SPEND_APPROVAL',
      state: 'AWAITING_SPEND_DECISION',
    });
  });
});
