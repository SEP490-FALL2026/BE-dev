import { SpendHarness, Unit } from '../../support/spend-harness';

const h = new SpendHarness();
const M = 1_000_000;

describe('who holds the spend step over PostgreSQL (US-06-01, US-06-14 AC-7, US-05-03 AC-9)', () => {
  let plan: string;
  let design: Unit;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    plan = await h.planOf(await h.subscription(10));
    await h
      .declareTaxProfile((await h.vendorOf(plan)).id, [{ taxType: 'GTGT', ratePercent: '10', deductible: true }])
      .expect(200);
    design = await h.departmentWithHead('P-DES');
    await h.budgetFor(design, { total: 100 * M });
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const ready = async () => {
    const id = await h.paidRequest(design, plan, { amount: 10 * M });

    return id;
  };

  /**
   * The approver becomes the person the request is for, as the premise of the two cases that route around a conflict needs; the returned
   * function puts the person back, because the grant of the role is refused while the approver is a party of an open request (rule 10,
   * QĐ-93d(3)) and the cases that follow give the role back to the approver.
   */
  const approverIsTheBeneficiary = async (id: string): Promise<() => Promise<void>> => {
    const { rows } = await h.ctx.sql.query<{ employee_id: string }>(
      `SELECT employee_id FROM access_request_beneficiaries WHERE request_id = $1`,
      [id],
    );
    await h.ctx.sql.query(`UPDATE access_request_beneficiaries SET employee_id = $2 WHERE request_id = $1`, [
      id,
      h.boss.employeeId,
    ]);

    return async () => {
      await h.ctx.sql.query(`UPDATE access_request_beneficiaries SET employee_id = $2 WHERE request_id = $1`, [
        id,
        rows[0].employee_id,
      ]);
    };
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

  it('waits for the spending approver, and no substitute is given the step, when the approver is the one the request is for (data of before QĐ-93, SoD-7)', async () => {
    const id = await ready();
    const restore = await approverIsTheBeneficiary(id);

    try {
      await h.route(id, design.head.account);

      expect(await h.steps(id, 'SPEND_APPROVAL')).toEqual([
        expect.objectContaining({
          state: 'WAITING',
          assignee_employee_id: null,
          waiting_reason: 'SPENDING_APPROVER_IS_PARTY',
        }),
      ]);
      expect(await h.state(id)).toBe('WAITING_CONTROLLED');
      // Nobody is given the step in their place, and the approver does not read a request they are a party of.
      await h.checkOf(id, h.bystander.account).expect(404);
      await h.checkOf(id, h.boss.account).expect(404);
    } finally {
      await restore();
    }
  });

  it('writes no substitute and no conflict of interest in the Audit Trail of a check of a request the approver is a party of', async () => {
    const id = await ready();
    const restore = await approverIsTheBeneficiary(id);

    try {
      await h.route(id, design.head.account);

      const events = await h.ctx.sql.query<{ after: Record<string, unknown> }>(
        `SELECT after FROM audit_events WHERE resource_id = $1 AND action = 'ACCESS_REQUEST.BUDGET_CHECKED'`,
        [id],
      );
      expect(events.rows).toHaveLength(1);
      expect(events.rows[0].after).toMatchObject({ opened: 'SPEND_APPROVAL', state: 'WAITING_CONTROLLED' });
      expect(events.rows[0].after).not.toHaveProperty('conflictOfInterest');
    } finally {
      await restore();
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

  it('BR-MF1-02 is checked when a head sends their own request, and goes to the spending approver for the spend step alone', async () => {
    const unit = await h.departmentWithHead('P-RT9');
    await h.budgetFor(unit, { total: 100 * M });
    // A head's own request is one-step (row 2): there is no need step, so the check ran when it was sent.
    const sent = await h.sent(unit.head, plan, { termMonths: 1 });
    const id = sent.id;

    expect(sent.needStep).toMatchObject({ routingRow: 2, state: 'NOT_REQUIRED', assignee: null });
    expect(await h.steps(id, 'SPEND_APPROVAL')).toEqual([
      expect.objectContaining({ assignee_employee_id: h.boss.employeeId }),
    ]);
    const need = await h.ctx.sql.query<{ state: string; assignee_employee_id: string | null }>(
      `SELECT state::text, assignee_employee_id FROM access_request_steps WHERE request_id = $1 AND kind = 'NEED'`,
      [id],
    );
    expect(need.rows).toEqual([{ state: 'NOT_REQUIRED', assignee_employee_id: null }]);
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
    expect(events.rows[0].after).not.toHaveProperty('conflictOfInterest');
  });
});
