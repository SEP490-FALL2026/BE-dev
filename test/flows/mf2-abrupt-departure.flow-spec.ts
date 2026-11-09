import { addWorkingDays } from '../../src/core/working-days';
import { FLOW_DEMO_PASSWORD } from '../support/flows/flow-template';
import { FlowWorld } from '../support/flows/flow-world';

/**
 * MF-2, a departure that blocks now (test-plan F2-02) and the refusals of the steps that follow (F2-05): the access of a person whose
 * departure is recorded with `BLOCK_NOW` stops at the next request, the IT Admin locks the account and opens the revocations, and no
 * step runs ahead of its day or of the work that is still open. Real sign-in, the seeded dataset, nothing mocked.
 */
describe('MF-2 chặn ngay với ngày cuối ở tương lai @MF2 @D1', () => {
  let world: FlowWorld;
  let lastDay: string;
  let caseId: string;

  const call = () => world.calls;
  const grounds = () => ({
    type: 'WRITTEN_DIRECTIVE',
    reference: 'CT-2026-17',
    issuer: 'Ban Giám đốc',
    issuedOn: call().today(),
  });
  const login = async (code: string) =>
    call().anonymous('post', '/auth/login', { email: world.actors.emailOf(code), password: FLOW_DEMO_PASSWORD });

  beforeAll(async () => {
    world = await FlowWorld.open();
    lastDay = addWorkingDays(call().today(), 5, new Set());
    await world.actors.ensure('NV-SA', 'NV-ITA1', 'NV-DEV1', 'NV-DEV3');
  }, 300000);

  afterAll(async () => {
    await world?.close();
  });

  describe('F2-02 chặn ngay với ngày cuối tương lai @MF2 @D1', () => {
    it('ghi BLOCK_NOW: token đang có và đăng nhập mới đều bị từ chối ngay, dù ngày cuối còn ở phía trước #1 #3 @B1', async () => {
      expect((await call().get('NV-DEV1', '/me')).status).toBe(200);
      const dev1 = await world.facts.employeeId('NV-DEV1');

      const recorded = await call().post('NV-SA', '/offboarding-cases', {
        employeeId: dev1,
        lastWorkingDay: lastDay,
        accessBlockMode: 'BLOCK_NOW',
        grounds: grounds(),
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
      expect((await world.facts.one<{ cause: string }>(`SELECT cause::text FROM employee_access_blocks`)).cause).toBe(
        'DEPARTURE_BLOCK_NOW',
      );
    });

    it('field abrupt cũ ⟹ 422 và không ghi hồ sơ #1 @B1', async () => {
      const before = await world.facts.count('offboarding_cases');

      const response = await call().post('NV-SA', '/offboarding-cases', {
        employeeId: await world.facts.employeeId('NV-DEV3'),
        lastWorkingDay: lastDay,
        accessBlockMode: 'BLOCK_NOW',
        abrupt: true,
        grounds: grounds(),
      });

      expect(response.status).toBe(422);
      expect(call().codeOf(response)).toBe('VALIDATION_ERROR');
      expect(await world.facts.count('offboarding_cases')).toBe(before);
    });

    it('IT Admin khóa tài khoản rồi mở thu hồi: tác vụ nguồn ABRUPT_DEPARTURE, ghế còn nguyên #3 @B1', async () => {
      const lock = await call().post('NV-ITA1', `/offboarding-cases/${caseId}/account-lock`, {
        note: 'Đã khóa tài khoản công ty và các phiên',
      });
      expect(lock.status).toBe(200);

      const opened = await call().post('NV-ITA1', `/offboarding-cases/${caseId}/revocations`, {});

      expect(opened.status).toBe(200);
      expect(
        await world.facts.one<{ revocation_source: string }>(
          `SELECT revocation_source::text FROM provisioning_tasks WHERE kind = 'REVOKE'`,
        ),
      ).toEqual({ revocation_source: 'ABRUPT_DEPARTURE' });
      const nothing = await call().post('NV-ITA1', `/offboarding-cases/${caseId}/revocations`, {});
      expect(call().codeOf(nothing)).toBe('OFFBOARDING_CASE.NOTHING_TO_REVOKE');
    });
  });

  describe('F2-05 từ chối các bước sau @MF2 @D1', () => {
    it('chưa tới ngày cuối: "đã nghỉ" ⟹ 409 LAST_WORKING_DAY_AHEAD; đóng hồ sơ ⟹ 409 CASE_NOT_LEFT; field cũ departedOn ⟹ 422 #3 @B0', async () => {
      const early = await call().post('NV-SA', `/offboarding-cases/${caseId}/departure`, {});
      const closing = await call().post('NV-ITA1', `/offboarding-cases/${caseId}/closure`);
      const withDay = await call().post('NV-SA', `/offboarding-cases/${caseId}/departure`, { departedOn: lastDay });

      expect([early.status, call().codeOf(early)]).toEqual([409, 'OFFBOARDING_CASE.LAST_WORKING_DAY_AHEAD']);
      expect(call().detailsOf(early)).toMatchObject({ lastWorkingDay: lastDay });
      expect([closing.status, call().codeOf(closing)]).toEqual([409, 'OFFBOARDING_CASE.CASE_NOT_LEFT']);
      expect([withDay.status, call().codeOf(withDay)]).toEqual([422, 'VALIDATION_ERROR']);
      expect(await world.facts.count('offboarding_cases', "state = 'LEFT'")).toBe(0);
    });

    it('người không còn quyền nào: khóa rồi mở thu hồi ⟹ 409 NOTHING_TO_REVOKE, không tác vụ mới #24 @B0', async () => {
      const dev3 = await world.facts.employeeId('NV-DEV3');
      const recorded = await call().post('NV-SA', '/offboarding-cases', {
        employeeId: dev3,
        lastWorkingDay: lastDay,
        accessBlockMode: 'BLOCK_NOW',
        grounds: grounds(),
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

    it('đến ngày cuối: ghi "đã nghỉ" được, nhưng đóng hồ sơ khi còn tác vụ thu hồi ⟹ 409 CASE_NOT_CLOSEABLE #3 @B0', async () => {
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
