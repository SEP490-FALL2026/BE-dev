import { addWorkingDays } from '../../src/core/working-days';
import { FLOW_DEMO_PASSWORD } from '../support/flows/flow-template';
import { FlowWorld } from '../support/flows/flow-world';

/**
 * MF-2, a departure that blocks now (test-plan F2-02) and the refusals of the steps that follow (F2-05): the access of a person whose
 * departure is recorded with `BLOCK_NOW` stops at the next request, the IT Admin locks the account and opens the revocations, and no
 * step runs ahead of its day or of the work that is still open. Real sign-in, the seeded dataset, nothing mocked.
 *
 * The person who is blocked is NV-DEV1, who holds five rights in the dataset; the one who holds none is NV-MKT2. The dataset already holds
 * one departure that is over (NV-OFF1, LEFT) and the tasks that came with it: the counts below are of this file's cases, never of the table.
 *
 * Skipped until the MF-2/MF-3 round rewrites them: they pass on `dev` of 11/11/2026 (with the data above) but assert the `BLOCK_NOW` case with a
 * last working day ahead and the closure by the IT Admin, which MF2-B and MF2-G of `docs/reviews/mf2-mf3-2026-11-10/SPEC.md` replace. The
 * check that the retired field `abrupt` is refused does not depend on either and stays.
 */
describe('MF-2 chặn ngay với ngày cuối ở tương lai @MF2 @D1', () => {
  let world: FlowWorld;
  let lastDay: string;
  let caseId: string;
  /** The departures already over in the dataset (NV-OFF1). */
  let leftBefore: number;

  const call = () => world.calls;
  const groundsNote = 'Chỉ thị CT-2026-17 của Ban Giám đốc';
  const login = async (code: string) =>
    call().anonymous('post', '/auth/login', { email: world.actors.emailOf(code), password: FLOW_DEMO_PASSWORD });

  beforeAll(async () => {
    world = await FlowWorld.open();
    lastDay = addWorkingDays(call().today(), 5, new Set());
    await world.actors.ensure('NV-SA', 'NV-ITA1', 'NV-DEV1', 'NV-DEV3');
    leftBefore = await world.facts.count('offboarding_cases', "state = 'LEFT'");
  }, 300000);

  afterAll(async () => {
    await world?.close();
  });

  describe('F2-02 chặn ngay với ngày cuối tương lai @MF2 @D1', () => {
    // MF-2/MF-3 round rewrites this — SPEC mf2-mf3-2026-11-10 MF2-B (N0/O-1: BLOCK_NOW has no future last day; the last working day is the day it is recorded)
    it.skip('ghi BLOCK_NOW: token đang có và đăng nhập mới đều bị từ chối ngay, dù ngày cuối còn ở phía trước #1 #3 @B1', async () => {
      expect((await call().get('NV-DEV1', '/me')).status).toBe(200);
      const dev1 = await world.facts.employeeId('NV-DEV1');

      const recorded = await call().post('NV-SA', '/offboarding-cases', {
        employeeId: dev1,
        lastWorkingDay: lastDay,
        accessBlockMode: 'BLOCK_NOW',
        groundsNote,
        successor: { kind: 'NONE' },
      });

      expect(recorded.status).toBe(201);
      const record = call().data<Record<string, unknown>>(recorded);
      caseId = record.id as string;
      expect(record).toMatchObject({
        state: 'HANDING_OVER',
        accessBlockMode: 'BLOCK_NOW',
        lastWorkingDay: lastDay,
        accessBlocked: true,
        accessBlockedFrom: call().today(),
      });
      expect((await call().get('NV-DEV1', '/me')).status).toBe(401);
      expect((await login('NV-DEV1')).status).toBe(401);
      expect(
        (
          await world.facts.one<{ cause: string }>(
            `SELECT cause::text FROM employee_access_blocks WHERE employee_id = $1`,
            [dev1],
          )
        ).cause,
      ).toBe('DEPARTURE_BLOCK_NOW');
    });

    it('field abrupt cũ ⟹ 422 và không ghi hồ sơ #1 @B1', async () => {
      const before = await world.facts.count('offboarding_cases');

      const response = await call().post('NV-SA', '/offboarding-cases', {
        employeeId: await world.facts.employeeId('NV-DEV3'),
        lastWorkingDay: lastDay,
        accessBlockMode: 'BLOCK_NOW',
        abrupt: true,
        groundsNote,
      });

      expect(response.status).toBe(422);
      expect(call().codeOf(response)).toBe('VALIDATION_ERROR');
      expect(await world.facts.count('offboarding_cases')).toBe(before);
    });

    // MF-2/MF-3 round rewrites this — SPEC mf2-mf3-2026-11-10 MF2-B (the case it works on is the BLOCK_NOW case with a future last day) and MF2-D (due day of the revocations)
    it.skip('IT Admin khóa tài khoản rồi mở thu hồi: tác vụ nguồn ABRUPT_DEPARTURE, ghế còn nguyên #3 @B1', async () => {
      const lock = await call().post('NV-ITA1', `/offboarding-cases/${caseId}/account-lock`, {
        note: 'Đã khóa tài khoản công ty và các phiên',
      });
      expect(lock.status).toBe(200);

      const opened = await call().post('NV-ITA1', `/offboarding-cases/${caseId}/revocations`, {});

      expect(opened.status).toBe(200);
      // Every right of the person gets a task of its own, from the abrupt departure.
      const held = await world.facts.count(
        'license_assignments',
        'employee_id = $1 AND valid_until IS NULL AND cancelled_at IS NULL',
        [await world.facts.employeeId('NV-DEV1')],
      );
      expect(
        await world.facts.rows<{ revocation_source: string }>(
          `SELECT t.revocation_source::text
             FROM provisioning_tasks t JOIN license_assignments a ON a.id = t.assignment_id
            WHERE t.kind = 'REVOKE' AND a.employee_id = $1`,
          [await world.facts.employeeId('NV-DEV1')],
        ),
      ).toEqual(Array.from({ length: held }, () => ({ revocation_source: 'ABRUPT_DEPARTURE' })));
      const nothing = await call().post('NV-ITA1', `/offboarding-cases/${caseId}/revocations`, {});
      expect(call().codeOf(nothing)).toBe('OFFBOARDING_CASE.NOTHING_TO_REVOKE');
    });
  });

  describe('F2-05 từ chối các bước sau @MF2 @D1', () => {
    // MF-2/MF-3 round rewrites this — SPEC mf2-mf3-2026-11-10 MF2-B (O-1: a BLOCK_NOW case can be marked left at once, so LAST_WORKING_DAY_AHEAD no longer applies) and MF2-G (N9: the closure route of the IT Admin goes)
    it.skip('chưa tới ngày cuối: "đã nghỉ" ⟹ 409 LAST_WORKING_DAY_AHEAD; đóng hồ sơ ⟹ 409 CASE_NOT_LEFT; field cũ departedOn ⟹ 422 #3 @B0', async () => {
      const early = await call().post('NV-SA', `/offboarding-cases/${caseId}/departure`, {});
      const closing = await call().post('NV-ITA1', `/offboarding-cases/${caseId}/closure`);
      const withDay = await call().post('NV-SA', `/offboarding-cases/${caseId}/departure`, { departedOn: lastDay });

      expect([early.status, call().codeOf(early)]).toEqual([409, 'OFFBOARDING_CASE.LAST_WORKING_DAY_AHEAD']);
      expect(call().detailsOf(early)).toMatchObject({ lastWorkingDay: lastDay });
      expect([closing.status, call().codeOf(closing)]).toEqual([409, 'OFFBOARDING_CASE.CASE_NOT_LEFT']);
      expect([withDay.status, call().codeOf(withDay)]).toEqual([422, 'VALIDATION_ERROR']);
      expect(await world.facts.count('offboarding_cases', "state = 'LEFT'")).toBe(leftBefore);
    });

    // MF-2/MF-3 round rewrites this — SPEC mf2-mf3-2026-11-10 MF2-B (BLOCK_NOW with a future last day is refused, N0)
    it.skip('người không còn quyền nào: khóa rồi mở thu hồi ⟹ 409 NOTHING_TO_REVOKE, không tác vụ mới #24 @B0', async () => {
      const nobody = await world.facts.employeeId('NV-MKT2');
      const recorded = await call().post('NV-SA', '/offboarding-cases', {
        employeeId: nobody,
        lastWorkingDay: lastDay,
        accessBlockMode: 'BLOCK_NOW',
        groundsNote,
      });
      const id = call().data<{ id: string }>(recorded).id;
      const tasks = await world.facts.count('provisioning_tasks', "kind = 'REVOKE'");

      expect(
        (await call().post('NV-ITA1', `/offboarding-cases/${id}/account-lock`, { note: 'Đã khóa tài khoản' })).status,
      ).toBe(200);
      const revoke = await call().post('NV-ITA1', `/offboarding-cases/${id}/revocations`, {});

      expect([revoke.status, call().codeOf(revoke)]).toEqual([409, 'OFFBOARDING_CASE.NOTHING_TO_REVOKE']);
      expect(await world.facts.count('provisioning_tasks', "kind = 'REVOKE'")).toBe(tasks);
    });

    // MF-2/MF-3 round rewrites this — SPEC mf2-mf3-2026-11-10 MF2-G (N9/T-1: the system closes the case, the closure route of the IT Admin goes)
    it.skip('đến ngày cuối: ghi "đã nghỉ" được, nhưng đóng hồ sơ khi còn tác vụ thu hồi ⟹ 409 CASE_NOT_CLOSEABLE #3 @B0', async () => {
      world.clock.jumpTo(lastDay);
      await world.actors.signIn('NV-SA');
      await world.actors.signIn('NV-ITA1');

      const left = await call().post('NV-SA', `/offboarding-cases/${caseId}/departure`, {});
      expect(left.status).toBe(200);
      expect(call().data<{ state: string; left: { leftOn: string } }>(left)).toMatchObject({
        state: 'LEFT',
        left: { leftOn: lastDay },
      });
      const closing = await call().post('NV-ITA1', `/offboarding-cases/${caseId}/closure`);

      expect([closing.status, call().codeOf(closing)]).toEqual([409, 'OFFBOARDING_CASE.CASE_NOT_CLOSEABLE']);
      expect(call().detailsOf(closing)).toHaveProperty('blockers');
    });
  });
});
