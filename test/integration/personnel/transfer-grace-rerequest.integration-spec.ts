import { addDays } from '../../../src/core/business-date';
import { OffboardingHarness } from '../../support/offboarding-harness';
import type { Person } from '../../support/request-harness';
import type { Unit } from '../../support/spend-harness';

const h = new OffboardingHarness();
const M = 1_000_000;

interface RequestWire {
  id: string;
  limitExemption: string | null;
  plan: { planId: string } | null;
  department: { id: string };
}

/**
 * `MF3-C.3` (`QĐ-110q`, R-49, SPEC P10): a person in the grace of a transfer who asks again, as a new request in the new department, for software they
 * hold from before the transfer is let through the check of the seat held and the limits GH-1/GH-2; the request says so (`limitExemption`) and names
 * the old right it replaces (`replaces_assignment_id`, internal). Outside the grace, or for any other seat, nothing changes. On real PostgreSQL,
 * through the routes of the preview and of sending.
 */
describe('asking again in the grace of a transfer (integration, real PostgreSQL)', () => {
  let plan: string;
  let subscriptionId: string;
  let otherPlan: string;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    // The limits are judged as the product does: the suite does not leave its requests out of GH-1 and GH-2.
    await h.enforceRequestLimits();
    subscriptionId = await h.subscription(40, 'K2');
    plan = await h.planOf(subscriptionId);
    otherPlan = await h.planOf(await h.subscription(40, 'K2'));
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  /** A person of a department who holds a seat of `plan`, and the department they will move to, with a budget. */
  const example = async (): Promise<{ u: Unit; dest: Unit; person: Person; seat: string; code: string }> => {
    counter += 1;
    const u = await h.departmentWithHead(`P-RR${counter}`);
    const dest = await h.departmentWithHead(`P-RR${counter}-DEST`);
    await h.budgetFor(dest, { total: 500 * M });
    const code = `RR-E${counter}`;
    const person = await h.worker(u.department, code);
    const seat = await h.seatOf(person, { subscriptionId }, code);

    return { u, dest, person, seat, code };
  };
  const replaces = async (requestId: string): Promise<{ exemption: string | null; replaces: string | null }> => {
    const row = (
      await h.ctx.sql.query<{ exemption: string | null; replaces: string | null }>(
        'SELECT limit_exemption AS exemption, replaces_assignment_id AS replaces FROM access_requests WHERE id = $1',
        [requestId],
      )
    ).rows[0];

    return row;
  };
  const graceOverNow = async (transferId: string): Promise<void> => {
    await h.ctx.sql.query('BEGIN');
    try {
      await h.ctx.sql.query('ALTER TABLE department_transfers DISABLE TRIGGER USER');
      await h.ctx.sql.query(
        `UPDATE department_transfers SET effective_on = $2, grace_ends_on = $3, grace_reminder_on = $4 WHERE id = $1`,
        [transferId, addDays(h.today(), -10), addDays(h.today(), -1), addDays(h.today(), -3)],
      );
      await h.ctx.sql.query('ALTER TABLE department_transfers ENABLE TRIGGER USER');
      await h.ctx.sql.query('COMMIT');
    } catch (error) {
      await h.ctx.sql.query('ROLLBACK');
      throw error;
    }
  };

  it('is refused as ever while there is no transfer: ALREADY_HOLDS_ACCESS, no exemption, cannot submit', async () => {
    const { person } = await example();

    const preview = await h.previewed(person, plan);
    const refused = await h.submit(h.form(plan), person.account);

    expect(preview).toMatchObject({ canSubmit: false, limitExemption: null, existingAccess: { validUntil: null } });
    expect([refused.status, h.codeOf(refused)]).toEqual([409, 'ACCESS_REQUEST.ALREADY_HOLDS_ACCESS']);
  }, 240_000);

  it('in the grace: the preview says the person may ask again (TRANSFER_GRACE, can submit), the request is sent in the new department and replaces the old right', async () => {
    const { dest, person, seat } = await example();
    await h.moveToday(person, dest.department);

    const preview = await h.previewed(person, plan);
    const sent = await h.sent(person, plan, { termMonths: 1 });

    expect(preview).toMatchObject({
      canSubmit: true,
      limitExemption: 'TRANSFER_GRACE',
      existingAccess: { assignmentId: seat },
      department: { id: dest.department.id },
    });
    const wire = sent as unknown as RequestWire;
    expect(wire).toMatchObject({ limitExemption: 'TRANSFER_GRACE', department: { id: dest.department.id } });
    expect(await replaces(wire.id)).toEqual({ exemption: 'TRANSFER_GRACE', replaces: seat });
    // The audit entry of sending says why the limits were skipped.
    const events = await h.ctx.sql.query<{ after: Record<string, unknown> }>(
      `SELECT after FROM audit_events WHERE action = 'ACCESS_REQUEST.SUBMITTED' AND resource_id = $1`,
      [wire.id],
    );
    expect(events.rows[0].after).toMatchObject({ limitExemption: 'TRANSFER_GRACE', replacesAssignmentId: seat });
  }, 240_000);

  it('GH-2 is skipped: a person at the most open requests may ask again for what they hold in the grace, and not for anything else', async () => {
    const { dest, person } = await example();
    const internal = await h.plan('K5');
    await h.sent(person, internal);
    await h.moveToday(person, dest.department);
    await h.setParameter('REQUEST_OPEN_NEW_LIMIT', 1).expect(200);
    try {
      const again = await h.previewed(person, plan);
      const other = await h.previewed(person, otherPlan);

      expect(again).toMatchObject({ canSubmit: true, limitExemption: 'TRANSFER_GRACE', limits: { refusal: null } });
      expect(other).toMatchObject({
        canSubmit: false,
        limitExemption: null,
        limits: { refusal: 'OPEN_LIMIT_REACHED' },
      });
      expect((await h.sent(person, plan, { termMonths: 1 })).id).toBeTruthy();
    } finally {
      await h.setParameter('REQUEST_OPEN_NEW_LIMIT', 20).expect(200);
    }
  }, 240_000);

  it('GH-1 still holds: a second open request for the same plan, the one sent in the grace included, is refused', async () => {
    const { dest, person } = await example();
    await h.moveToday(person, dest.department);
    const first = (await h.sent(person, plan, { termMonths: 1 })) as unknown as RequestWire;

    const preview = await h.previewed(person, plan);
    const second = await h.submit(h.form(plan, { termMonths: 1 }), person.account);

    // The request sent in the grace is exempt from the count, not from the duplicate (QĐ-110q frees GH-2 only).
    expect(preview).toMatchObject({
      canSubmit: false,
      limitExemption: 'TRANSFER_GRACE',
      limits: { refusal: 'HAS_OPEN_REQUEST', openRequestId: first.id },
    });
    expect([second.status, h.codeOf(second)]).toEqual([409, 'ACCESS_REQUEST.OPEN_REQUEST_EXISTS']);
  }, 240_000);

  it('holding the right itself does not block: the person who holds the seat and has no open request asks again', async () => {
    const { dest, person, seat } = await example();
    await h.moveToday(person, dest.department);

    const preview = await h.previewed(person, plan);

    expect(preview).toMatchObject({
      canSubmit: true,
      limitExemption: 'TRANSFER_GRACE',
      existingAccess: { assignmentId: seat },
      limits: { refusal: null, openRequestId: null },
    });
  }, 240_000);

  it('a seat that is not an old right is refused as ever: one granted after the day the transfer took effect', async () => {
    counter += 1;
    const u = await h.departmentWithHead(`P-RR${counter}`);
    const dest = await h.departmentWithHead(`P-RR${counter}-DEST`);
    await h.budgetFor(dest, { total: 500 * M });
    const person = await h.worker(u.department, `RR-E${counter}`);
    await h.moveToday(person, dest.department);
    // The seat is granted to a request of the new head after the transfer: the picture of the day does not name it.
    await h.seatOf(person, { subscriptionId }, `RR-E${counter}`);

    const preview = await h.previewed(person, plan);
    const refused = await h.submit(h.form(plan), person.account);

    expect(preview).toMatchObject({ canSubmit: false, limitExemption: null });
    expect([refused.status, h.codeOf(refused)]).toEqual([409, 'ACCESS_REQUEST.ALREADY_HOLDS_ACCESS']);
  }, 240_000);

  it('another plan is an ordinary request: no exemption, nothing replaced', async () => {
    const { dest, person } = await example();
    await h.moveToday(person, dest.department);

    const sent = (await h.sent(person, otherPlan, { termMonths: 1 })) as unknown as RequestWire;
    const preview = await h.previewed(person, otherPlan);

    expect(sent.limitExemption).toBeNull();
    expect(preview.limitExemption).toBeNull();
    expect(await replaces(sent.id)).toEqual({ exemption: null, replaces: null });
  }, 240_000);

  it('after the last day of the grace the seat held refuses the request again', async () => {
    const { dest, person } = await example();
    const wire = await h.moveToday(person, dest.department);
    await graceOverNow(wire.id);

    const preview = await h.previewed(person, plan);
    const refused = await h.submit(h.form(plan), person.account);

    expect(preview).toMatchObject({ canSubmit: false, limitExemption: null });
    expect([refused.status, h.codeOf(refused)]).toEqual([409, 'ACCESS_REQUEST.ALREADY_HOLDS_ACCESS']);
  }, 240_000);

  it('the last day of the grace is still the grace', async () => {
    const { dest, person } = await example();
    const wire = await h.moveToday(person, dest.department);
    await h.ctx.sql.query('BEGIN');
    try {
      await h.ctx.sql.query('ALTER TABLE department_transfers DISABLE TRIGGER USER');
      await h.ctx.sql.query(
        `UPDATE department_transfers SET grace_ends_on = $2, grace_reminder_on = $2 WHERE id = $1`,
        [wire.id, h.today()],
      );
      await h.ctx.sql.query('ALTER TABLE department_transfers ENABLE TRIGGER USER');
      await h.ctx.sql.query('COMMIT');
    } catch (error) {
      await h.ctx.sql.query('ROLLBACK');
      throw error;
    }

    expect((await h.previewed(person, plan)).limitExemption).toBe('TRANSFER_GRACE');
  }, 240_000);

  it('a person who did not move is not let through because someone else did', async () => {
    const mover = await example();
    const stayer = await example();
    await h.moveToday(mover.person, mover.dest.department);

    const preview = await h.previewed(stayer.person, plan);

    expect(preview).toMatchObject({ canSubmit: false, limitExemption: null });
  }, 240_000);
});
