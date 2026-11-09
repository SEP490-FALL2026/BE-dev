import { recordAsSuperAdmin, SUPER_ADMIN_EVENT_BASIS } from '../../support/super-admin-event-runner';
import { OffboardingHarness, type CaseWire } from '../../support/offboarding-harness';
import type { Department, Person } from '../../support/request-harness';

const h = new OffboardingHarness();

/**
 * `qd96-100-personnel-grounds-and-reasons` (S-10, L-412, L-413, L-460): the basis and the reason of a move of the last working day and
 * of a cancellation are kept with the change and in the Audit Trail, the revocations are counted by the server and carry the standard
 * reason, and the procedure gives the basis of its ticket to the same two writes. Over HTTP on real PostgreSQL.
 */
describe('the basis and the reasons of a departure (integration, real PostgreSQL)', () => {
  let des: Department;
  let figma: string;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    des = await h.departmentWithUnit('P-GR');
    const head = await h.worker(des, 'H1-GR');
    await h.makeHead(des, head);
    figma = await h.subscription(60, 'K2');
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  const leaver = async (): Promise<Person> => h.worker(des, `E-GR-${(counter += 1)}`);
  const detailOf = async (caseId: string, kind: string): Promise<Record<string, unknown> | null> =>
    (
      await h.ctx.sql.query<{ detail: Record<string, unknown> | null }>(
        `SELECT detail FROM offboarding_case_changes WHERE case_id = $1 AND kind = $2::"OffboardingChangeKind" ORDER BY changed_at DESC LIMIT 1`,
        [caseId, kind],
      )
    ).rows[0]?.detail ?? null;

  it('keeps the basis of a move of the last working day in the change and in the Audit Trail (AC-14)', async () => {
    const wire = await h.recordedCase(await leaver());
    const basis = { type: 'WRITTEN_DIRECTIVE', reference: 'CT-77/2026', issuer: 'Board', issuedOn: '2026-10-21' };

    await h
      .changeLastDay(wire.id, { lastWorkingDay: h.day(20), reason: 'Bàn giao kéo dài', grounds: basis })
      .expect(200);

    expect(await detailOf(wire.id, 'LAST_DAY_CHANGED')).toMatchObject({ grounds: basis });
    const [event] = await h.auditEventsOf('OFFBOARDING_CASE.LAST_DAY_CHANGED', wire.id);
    expect(event.after).toMatchObject({ lastWorkingDay: h.day(20), reason: 'Bàn giao kéo dài', grounds: basis });
  });

  it('keeps the basis of a cancellation in the change and in the Audit Trail (AC-15)', async () => {
    const wire = await h.recordedCase(await leaver());

    await h.cancelCase(wire.id, { reason: 'Ở lại', grounds: h.grounds }).expect(200);

    expect(await detailOf(wire.id, 'CANCELLED')).toMatchObject({ grounds: h.grounds });
    const [event] = await h.auditEventsOf('OFFBOARDING_CASE.CANCELLED', wire.id);
    expect(event.after).toMatchObject({ state: 'CANCELLED', reason: 'Ở lại', grounds: h.grounds });
  });

  it('refuses the code of a notice as the basis of a move and of a cancellation, and changes nothing', async () => {
    const wire = await h.recordedCase(await leaver());
    const notice = { ...h.grounds, reference: 'BM09-2026-000123' };

    const moved = await h.changeLastDay(wire.id, { lastWorkingDay: h.day(20), reason: 'x', grounds: notice });
    const cancelled = await h.cancelCase(wire.id, { reason: 'x', grounds: notice });

    expect([moved, cancelled].map((response) => [response.status, h.codeOf(response)])).toEqual([
      [422, 'OFFBOARDING_CASE.GROUNDS_IS_NOTICE'],
      [422, 'OFFBOARDING_CASE.GROUNDS_IS_NOTICE'],
    ]);
    expect((await h.caseRow(wire.id)).last_working_day).toBe(h.day(10));
    expect(await h.changeKinds(wire.id)).toEqual(['RECORDED']);
  });

  it('refuses a move and a cancellation that lack the reason or the basis (L-460)', async () => {
    const wire = await h.recordedCase(await leaver());

    const responses = [
      await h.changeLastDay(wire.id, { lastWorkingDay: h.day(20), reason: 'x', grounds: undefined }),
      await h.changeLastDay(wire.id, { lastWorkingDay: h.day(20), reason: undefined }),
      await h.cancelCase(wire.id, { reason: 'x', grounds: undefined }),
      await h.cancelCase(wire.id, { reason: '  ' }),
    ];

    expect(responses.map((response) => [response.status, h.codeOf(response)])).toEqual([
      [422, 'VALIDATION_ERROR'],
      [422, 'VALIDATION_ERROR'],
      [422, 'VALIDATION_ERROR'],
      [422, 'VALIDATION_ERROR'],
    ]);
    expect(await h.changeKinds(wire.id)).toEqual(['RECORDED']);
  });

  it('opens the revocations with the standard reason when the IT Admin sends no note, and with the note added when it does (L-412)', async () => {
    const reasonOf = async (caseId: string) =>
      (
        await h.ctx.sql.query<{ reason: string }>(
          `SELECT reason FROM offboarding_case_changes WHERE case_id = $1 AND kind = 'REVOCATIONS_OPENED'`,
          [caseId],
        )
      ).rows[0]?.reason;
    const noteOf = async (employeeCode: string) =>
      (
        await h.ctx.sql.query<{ note: string }>(
          `SELECT r.note FROM provisioning_task_reasons r
             JOIN provisioning_tasks t ON t.id = r.task_id
             JOIN license_assignments a ON a.id = t.assignment_id
             JOIN employees e ON e.id = a.employee_id
            WHERE e.employee_code = $1`,
          [employeeCode],
        )
      ).rows[0]?.note;
    const blocked = async (withNote: boolean) => {
      const employeeCode = `E-GRR-${(counter += 1)}`;
      const person = await h.worker(des, employeeCode);
      await h.seatOf(person, { subscriptionId: figma }, employeeCode);
      const wire = await h.recordedCase(person);
      await h.leaveOnLastDay(wire.id).expect(200);
      await h.lockAccount(wire.id, { note: 'Đã khóa tài khoản' }).expect(200);
      const opened = h.dataOf<CaseWire>(
        await h.revokeRights(wire.id, withNote ? { note: 'Xuất dữ liệu trước' } : {}).expect(200),
      );

      return { wire, employeeCode, opened };
    };

    const plain = await blocked(false);
    const noted = await blocked(true);

    expect(plain.opened.revocations).toEqual({ created: 1, reasonAdded: 0 });
    expect(await reasonOf(plain.wire.id)).toBe('DEPARTURE_REVOCATION');
    expect(await noteOf(plain.employeeCode)).toBe('DEPARTURE_REVOCATION');
    expect(await reasonOf(noted.wire.id)).toBe('DEPARTURE_REVOCATION: Xuất dữ liệu trước');
    expect(await noteOf(noted.employeeCode)).toBe('DEPARTURE_REVOCATION: Xuất dữ liệu trước');
    // Asking again finds every right already under way: nothing is left to take away.
    const again = await h.revokeRights(plain.wire.id, {});
    expect([again.status, h.codeOf(again)]).toEqual([409, 'OFFBOARDING_CASE.NOTHING_TO_REVOKE']);
  });

  // Last in the file: the procedure moves and cancels the case of the Super Admin, whose token the rest would need.
  describe('the controlled procedure (Task 2, dòng CLI)', () => {
    it('gives the basis of its ticket to the move of the last working day and to the cancellation', async () => {
      const subject = h.seed.superAdmin;
      await h.ctx.sql.query(`UPDATE employees SET hire_date = '2020-01-01' WHERE id = $1`, [subject.employeeId]);
      const subjectCode = (
        await h.ctx.sql.query<{ employee_code: string }>(`SELECT employee_code FROM employees WHERE id = $1`, [
          subject.employeeId,
        ])
      ).rows[0].employee_code;
      const recorded = await recordAsSuperAdmin(h.ctx.app, subjectCode, 'R-GR-001', {
        mode: 'departure-record',
        lastWorkingDay: h.day(10),
      });

      await recordAsSuperAdmin(h.ctx.app, subjectCode, 'R-GR-002', {
        mode: 'departure-change',
        caseId: recorded.recordId,
        lastWorkingDay: h.day(12),
        reason: 'The handover takes longer',
      });
      await recordAsSuperAdmin(h.ctx.app, subjectCode, 'R-GR-003', {
        mode: 'departure-cancel',
        caseId: recorded.recordId,
        reason: 'The Super Admin stays',
      });

      expect(await detailOf(recorded.recordId, 'LAST_DAY_CHANGED')).toMatchObject({ grounds: SUPER_ADMIN_EVENT_BASIS });
      expect(await detailOf(recorded.recordId, 'CANCELLED')).toMatchObject({ grounds: SUPER_ADMIN_EVENT_BASIS });
      const read = h.dataOf<CaseWire>(await h.readCase(recorded.recordId).expect(200));
      expect(read.state).toBe('CANCELLED');
    });
  });
});
