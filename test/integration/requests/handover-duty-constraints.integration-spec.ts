import { HandoverHarness } from '../../support/handover-harness';
import type { Department, Person } from '../../support/request-harness';

const h = new HandoverHarness();

/** What the database refuses, whatever the code asks (g6-handover-confirmation, `US-03-09`, `US-07-09`): real PostgreSQL. */
describe('what the database refuses about a handover duty (integration, real PostgreSQL)', () => {
  let des: Department;
  let head: Person;
  let counter = 0;
  const code = () => `E-HDC-${(counter += 1)}`;

  beforeAll(async () => {
    await h.start();
    des = await h.departmentWithUnit('P-DES');
    head = await h.veteran(des, 'H-HDC');
    await h.makeHead(des, head);
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  /** A duty of a person who leaves, opened as the record of a departure opens it. */
  const duty = async (): Promise<{ id: string; assignmentId: string }> => {
    const leaverCode = code();
    const leaver = await h.veteran(des, leaverCode);
    const subscriptionId = await h.subscription(2, 'K2');
    const assignmentId = await h.seatOf(leaver, { subscriptionId }, leaverCode);
    const opened = await h.openDuties({
      leaverEmployeeId: leaver.employeeId,
      source: 'DEPARTURE',
      lastWorkingDay: h.day(10),
      dueOn: h.day(9),
      leaverIsHead: false,
    });
    expect(opened.opened).toHaveLength(1);

    return { id: opened.opened[0].dutyId, assignmentId };
  };

  /** The SQLSTATE and the constraint the database answered with, or null when it accepted the statement. */
  const refused = async (
    statement: string,
    params: unknown[],
  ): Promise<{ code?: string; constraint?: string } | null> => {
    try {
      await h.ctx.sql.query(statement, params);

      return null;
    } catch (error) {
      return { code: (error as { code?: string }).code, constraint: (error as { constraint?: string }).constraint };
    }
  };

  const confirm = (id: string, byEmployeeId: string) =>
    h.ctx.sql.query(
      `UPDATE handover_duties SET confirmed_value = 'HANDED_OVER', confirmed_by_employee_id = $2,
              confirmed_role = 'DEPARTMENT_HEAD', confirmed_at = now() WHERE id = $1`,
      [id, byEmployeeId],
    );

  const second = (id: string) =>
    refused(
      `INSERT INTO handover_duties (id, organization_id, assignment_id, employee_id, source, leaver_is_head, confirmer_role,
                                    data_loss, due_on, created_by_app_user_id)
       SELECT gen_random_uuid(), organization_id, assignment_id, employee_id, source, leaver_is_head, confirmer_role,
              data_loss, due_on, created_by_app_user_id FROM handover_duties WHERE id = $1`,
      [id],
    );

  it('a seat owes one handover at a time: a second one that is not confirmed or cancelled is refused (23505)', async () => {
    const { id, assignmentId } = await duty();

    expect(await second(id)).toMatchObject({ code: '23505', constraint: 'handover_duties_one_open_per_assignment' });
    expect(await h.dutyRows(assignmentId)).toHaveLength(1);
  });

  it('the four columns of a confirmation come together, and a duty is never both confirmed and cancelled (23514)', async () => {
    const { id } = await duty();

    expect(await refused(`UPDATE handover_duties SET confirmed_value = 'HANDLED' WHERE id = $1`, [id])).toMatchObject({
      code: '23514',
      constraint: 'handover_duties_confirmation_together',
    });
    expect(await refused(`UPDATE handover_duties SET confirmed_late = true WHERE id = $1`, [id])).toMatchObject({
      code: '23514',
    });
    expect(await refused(`UPDATE handover_duties SET cancelled_at = now() WHERE id = $1`, [id])).toMatchObject({
      code: '23514',
      constraint: 'handover_duties_cancel_together',
    });
    expect(await refused(`UPDATE handover_duties SET cancel_reason = 'x' WHERE id = $1`, [id])).toMatchObject({
      code: '23514',
    });
    expect(
      await refused(`UPDATE handover_duties SET cancel_reason = '  ', cancelled_at = now() WHERE id = $1`, [id]),
    ).toMatchObject({ code: '23514' });
    expect(
      await refused(
        `UPDATE handover_duties SET confirmed_value = 'HANDLED', confirmed_by_employee_id = $2,
                confirmed_role = 'IT_ADMIN', confirmed_at = now(), cancelled_at = now(), cancel_reason = 'x' WHERE id = $1`,
        [id, head.employeeId],
      ),
    ).toMatchObject({ code: '23514', constraint: 'handover_duties_cancelled_not_confirmed' });
  });

  it('the role and the person agree: a return names the person, the IT Admin never has one, a successor is looked for only for a head who leaves (23514)', async () => {
    const { id } = await duty();

    expect(await refused(`UPDATE handover_duties SET confirmer_role = 'REQUESTER' WHERE id = $1`, [id])).toMatchObject({
      code: '23514',
      constraint: 'handover_duties_requester_is_fixed',
    });
    expect(
      await refused(
        `UPDATE handover_duties SET confirmer_role = 'IT_ADMIN', confirmer_employee_id = $2 WHERE id = $1`,
        [id, head.employeeId],
      ),
    ).toMatchObject({ code: '23514', constraint: 'handover_duties_it_admin_not_fixed' });
    expect(await refused(`UPDATE handover_duties SET resolve_on = '2026-12-01' WHERE id = $1`, [id])).toMatchObject({
      code: '23514',
      constraint: 'handover_duties_resolve_on_for_head',
    });
    expect(await refused(`UPDATE handover_duties SET notice_text = '  ' WHERE id = $1`, [id])).toMatchObject({
      code: '23514',
    });
  });

  it('a confirmation is written once and kept: it is never changed or deleted (55000), and the seat may then owe another', async () => {
    const { id, assignmentId } = await duty();
    await confirm(id, head.employeeId);

    expect(
      await refused(`UPDATE handover_duties SET confirmed_value = 'NOT_NEEDED' WHERE id = $1`, [id]),
    ).toMatchObject({
      code: '55000',
      constraint: 'handover_duty_confirmed_final',
    });
    expect(
      await refused(`UPDATE handover_duties SET confirmed_by_employee_id = NULL WHERE id = $1`, [id]),
    ).toMatchObject({
      code: '55000',
    });
    expect(await refused(`UPDATE handover_duties SET due_on = due_on + 1 WHERE id = $1`, [id])).toMatchObject({
      code: '55000',
    });
    expect(await refused(`DELETE FROM handover_duties WHERE id = $1`, [id])).toMatchObject({
      code: '55000',
      constraint: 'handover_duty_kept',
    });
    expect((await h.dutyRows(assignmentId))[0]).toMatchObject({ confirmed_value: 'HANDED_OVER' });

    expect(await second(id)).toBeNull();
    expect(await h.dutyRows(assignmentId)).toHaveLength(2);
  });

  it('a cancelled duty keeps its reason and is never changed or deleted (55000)', async () => {
    const { id } = await duty();
    await h.ctx.sql.query(
      `UPDATE handover_duties SET cancelled_at = now(), cancel_reason = 'The departure was cancelled' WHERE id = $1`,
      [id],
    );

    expect(
      await refused(`UPDATE handover_duties SET cancelled_at = NULL, cancel_reason = NULL WHERE id = $1`, [id]),
    ).toMatchObject({
      code: '55000',
      constraint: 'handover_duty_cancelled_final',
    });
    expect(await refused(`DELETE FROM handover_duties WHERE id = $1`, [id])).toMatchObject({ code: '55000' });
  });

  it('a duty keeps its seat and its person while it waits (55000)', async () => {
    const { id } = await duty();
    const other = await h.veteran(des, code());

    expect(
      await refused(`UPDATE handover_duties SET employee_id = $2 WHERE id = $1`, [id, other.employeeId]),
    ).toMatchObject({
      code: '55000',
      constraint: 'handover_duty_identity_fixed',
    });
  });
});
