import { addDays } from '../../src/core/business-date';
import { addWorkingDays } from '../../src/core/working-days';
import { FLOW_DEMO_PASSWORD } from '../support/flows/flow-template';
import { FlowWorld } from '../support/flows/flow-world';

/**
 * MF-2, a departure with a last working day (test-plan section 4): the Super Admin records it with its basis, the access of the person
 * is refused by the date alone — no one presses "has left" — and a handover that is cancelled before the last day leaves nothing
 * behind. Real sign-in, the seeded dataset, the clock moved by hand, nothing mocked.
 *
 * The person who leaves is NV-DEV1, who holds five rights in the dataset (1Password, Jira, GitHub, ChatGPT, Postman), and the dataset
 * already holds one departure that is over (NV-OFF1, state LEFT): the counts below are of this file's case, never of the table.
 */
describe('MF-2 nghỉ việc có ngày cuối @MF2 @D1', () => {
  let world: FlowWorld;
  let lastDay: string;
  let caseId: string;
  /** The rights NV-DEV1 holds when the case is recorded, and the departures already over in the dataset (NV-OFF1). */
  let heldRights: number;
  let leftBefore: number;

  const call = () => world.calls;
  const grounds = () => ({
    type: 'HR_DECISION',
    reference: 'QĐ-NV-2026-01',
    issuer: 'Phòng Nhân sự',
    issuedOn: call().today(),
  });
  const login = async (code: string) =>
    call().anonymous('post', '/auth/login', { email: world.actors.emailOf(code), password: FLOW_DEMO_PASSWORD });
  const caseOf = async () =>
    call().data<{ id: string; state: string; accessBlocked: boolean; accessBlockedFrom: string | null }>(
      await call().get('NV-SA', `/offboarding-cases/${caseId}`),
    );

  beforeAll(async () => {
    world = await FlowWorld.open();
    lastDay = addWorkingDays(call().today(), 3, new Set());
    await world.actors.ensure('NV-SA', 'NV-ITA1', 'NV-DEV1', 'NV-DEV2', 'NV-DEV3');
    heldRights = await world.facts.count(
      'license_assignments',
      'employee_id = $1 AND valid_until IS NULL AND cancelled_at IS NULL',
      [await world.facts.employeeId('NV-DEV1')],
    );
    leftBefore = await world.facts.count('offboarding_cases', "state = 'LEFT'");
  }, 300000);

  afterAll(async () => {
    await world?.close();
  });

  describe('F2-04 hủy trước ngày cuối @MF2 @D1', () => {
    it('hủy ở ngày ghi hồ sơ: dòng chặn bị xóa, người đó vẫn đăng nhập được #1 #2 @B1', async () => {
      const dev2 = await world.facts.employeeId('NV-DEV2');
      const recorded = await call().post('NV-SA', '/offboarding-cases', {
        employeeId: dev2,
        lastWorkingDay: lastDay,
        accessBlockMode: 'WITH_LAST_DAY',
        grounds: grounds(),
        successor: { kind: 'NONE' },
      });
      expect(recorded.status).toBe(201);
      const id = call().data<{ id: string }>(recorded).id;
      expect(await world.facts.count('employee_access_blocks', 'employee_id = $1', [dev2])).toBe(1);

      const noReason = await call().post('NV-SA', `/offboarding-cases/${id}/cancellation`, { grounds: grounds() });
      expect(noReason.status).toBe(422);
      expect(call().codeOf(noReason)).toBe('VALIDATION_ERROR');
      expect(await world.facts.count('employee_access_blocks', 'employee_id = $1', [dev2])).toBe(1);

      const cancelled = await call().post('NV-SA', `/offboarding-cases/${id}/cancellation`, {
        reason: 'Người lao động rút đơn xin nghỉ',
        grounds: grounds(),
      });
      expect(cancelled.status).toBe(200);
      expect(call().data<{ state: string }>(cancelled).state).toBe('CANCELLED');
      expect(await world.facts.count('employee_access_blocks', 'employee_id = $1', [dev2])).toBe(0);
      expect((await login('NV-DEV2')).status).toBe(200);
      // A cancelled handover cannot be cancelled again.
      const again = await call().post('NV-SA', `/offboarding-cases/${id}/cancellation`, {
        reason: 'x',
        grounds: grounds(),
      });
      expect(again.status).toBe(409);
    });
  });

  describe('F2-05 từ chối @MF2 @D1', () => {
    it('IT Admin không ghi hồ sơ; Super Admin không ghi cho chính mình #3 @B0', async () => {
      const dev2 = await world.facts.employeeId('NV-DEV2');
      const body = {
        employeeId: dev2,
        lastWorkingDay: lastDay,
        accessBlockMode: 'WITH_LAST_DAY',
        grounds: grounds(),
      };
      const before = await world.facts.count('offboarding_cases');

      const byIt = await call().post('NV-ITA1', '/offboarding-cases', body);
      const bySelf = await call().post('NV-SA', '/offboarding-cases', {
        ...body,
        employeeId: await world.facts.employeeId('NV-SA'),
      });

      expect(byIt.status).toBe(403);
      expect(call().codeOf(byIt)).toBe('AUTHORIZATION.FORBIDDEN');
      expect(bySelf.status).toBe(403);
      expect(call().codeOf(bySelf)).toBe('PERSONNEL.SELF_CHANGE_FORBIDDEN');
      expect(await world.facts.count('offboarding_cases')).toBe(before);
    });

    it('thiếu căn cứ, ngày cuối hoặc chế độ chặn ⟹ 422; field cũ abrupt ⟹ 422; không ghi gì #3 #24 @B0', async () => {
      const dev3 = await world.facts.employeeId('NV-DEV3');
      const before = await world.facts.count('offboarding_cases');
      const full = { employeeId: dev3, lastWorkingDay: lastDay, accessBlockMode: 'WITH_LAST_DAY', grounds: grounds() };

      const bodies: Record<string, unknown>[] = [
        { employeeId: dev3, lastWorkingDay: lastDay, accessBlockMode: 'WITH_LAST_DAY' },
        { ...full, grounds: { type: 'HR_DECISION', reference: 'QĐ-1' } },
        { ...full, accessBlockMode: undefined },
        { ...full, lastWorkingDay: undefined },
        { ...full, abrupt: true },
      ];
      for (const body of bodies) {
        const refused = await call().post('NV-SA', '/offboarding-cases', body);
        expect(refused.status).toBe(422);
        expect(call().codeOf(refused)).toMatch(/^(VALIDATION_ERROR|OFFBOARDING_CASE\.LAST_WORKING_DAY_REQUIRED)$/);
      }
      expect(await world.facts.count('offboarding_cases')).toBe(before);
    });
  });

  describe('F2-01 có ngày cuối: tự chặn hết ngày cuối, không bấm "đã nghỉ" @MF2 @D1', () => {
    it('ghi hồ sơ: HANDING_OVER, dòng chặn có hiệu lực từ ngày sau ngày cuối; IT chưa mở được gì #2 #3 #24 @B2', async () => {
      const dev1 = await world.facts.employeeId('NV-DEV1');
      const recorded = await call().post('NV-SA', '/offboarding-cases', {
        employeeId: dev1,
        lastWorkingDay: lastDay,
        accessBlockMode: 'WITH_LAST_DAY',
        grounds: grounds(),
        successor: { kind: 'NONE' },
      });

      expect(recorded.status).toBe(201);
      const record = call().data<Record<string, unknown>>(recorded);
      caseId = record.id as string;
      expect(record).toMatchObject({
        state: 'HANDING_OVER',
        accessBlockMode: 'WITH_LAST_DAY',
        lastWorkingDay: lastDay,
        accessBlocked: false,
        accessBlockedFrom: addDays(lastDay, 1),
        heldRights,
      });
      expect(
        await world.facts.one<{ cause: string; releasable: boolean }>(
          `SELECT cause::text, releasable FROM employee_access_blocks WHERE employee_id = $1`,
          [dev1],
        ),
      ).toEqual({ cause: 'DEPARTURE_LAST_DAY', releasable: false });

      // Until the block takes effect the IT Admin can lock nothing and revoke nothing.
      const lock = await call().post('NV-ITA1', `/offboarding-cases/${caseId}/account-lock`, {
        note: 'Khóa tài khoản',
      });
      const revoke = await call().post('NV-ITA1', `/offboarding-cases/${caseId}/revocations`, {});
      expect([lock.status, call().codeOf(lock)]).toEqual([409, 'OFFBOARDING_CASE.CASE_NOT_BLOCKED']);
      expect([revoke.status, call().codeOf(revoke)]).toEqual([409, 'OFFBOARDING_CASE.CASE_NOT_BLOCKED']);
      expect(
        await world.facts.count(
          'provisioning_tasks',
          "kind = 'REVOKE' AND assignment_id IN (SELECT id FROM license_assignments WHERE employee_id = $1)",
          [dev1],
        ),
      ).toBe(0);
    });

    it('đến hết ngày cuối: người đó vẫn đăng nhập và làm việc được #2 @B2', async () => {
      world.clock.jumpTo(lastDay);

      expect((await login('NV-DEV1')).status).toBe(200);
      await world.actors.signIn('NV-DEV1');
      expect((await call().get('NV-DEV1', '/me')).status).toBe(200);
      await world.actors.signIn('NV-SA');
      expect((await caseOf()).accessBlocked).toBe(false);
    });

    it('sang ngày sau ngày cuối: đăng nhập, làm mới phiên và gọi API đều bị từ chối; hồ sơ chưa "đã nghỉ" #2 @B2', async () => {
      const oldRefresh = (await world.actors.session('NV-DEV1')).refreshToken;
      world.clock.jumpTo(addDays(lastDay, 1));

      const signIn = await login('NV-DEV1');
      const refresh = await world.actors.refresh('NV-DEV1', oldRefresh);
      const me = await call().get('NV-DEV1', '/me');

      expect(signIn.status).toBe(401);
      expect(refresh.status).toBe(401);
      expect(me.status).toBe(401);
      await world.actors.signIn('NV-SA');
      expect(await caseOf()).toMatchObject({ state: 'HANDING_OVER', accessBlocked: true });
      expect(await world.facts.count('offboarding_cases', "state = 'LEFT'")).toBe(leftBefore);
    });

    it('khi đã chặn, IT Admin ghi khóa tài khoản và mở thu hồi quyền: tác vụ nguồn DEPARTURE, ghế còn nguyên #1 #24 @B2', async () => {
      await world.actors.signIn('NV-ITA1');
      const rights = await call().get('NV-ITA1', `/offboarding-cases/${caseId}/rights`);
      expect(call().data<{ items: unknown[] }>(rights).items).toHaveLength(heldRights);

      const withoutLock = await call().post('NV-ITA1', `/offboarding-cases/${caseId}/revocations`, {});
      expect(call().codeOf(withoutLock)).toBe('OFFBOARDING_CASE.ACCOUNT_LOCK_NOT_RECORDED');
      const lock = await call().post('NV-ITA1', `/offboarding-cases/${caseId}/account-lock`, {
        note: 'Đã khóa tài khoản công ty',
      });
      expect(lock.status).toBe(200);
      const opened = await call().post('NV-ITA1', `/offboarding-cases/${caseId}/revocations`, {});
      expect(opened.status).toBe(200);
      expect(call().data<{ revocations: { created: number } }>(opened).revocations.created).toBe(heldRights);

      // Every right of the person gets a task of its own, from the departure, queued; the tasks the dataset already has (the head's
      // reclaim of NV-DES11, the departure of NV-OFF1) are other people's.
      expect(
        await world.facts.rows<{ revocation_source: string; status: string }>(
          `SELECT t.revocation_source::text, t.status::text
             FROM provisioning_tasks t JOIN license_assignments a ON a.id = t.assignment_id
            WHERE t.kind = 'REVOKE' AND a.employee_id = $1`,
          [await world.facts.employeeId('NV-DEV1')],
        ),
      ).toEqual(Array.from({ length: heldRights }, () => ({ revocation_source: 'DEPARTURE', status: 'QUEUED' })));
      expect(
        await world.facts.count(
          'license_assignments',
          'employee_id = $1 AND valid_until IS NULL AND cancelled_at IS NULL',
          [await world.facts.employeeId('NV-DEV1')],
        ),
      ).toBe(heldRights);
      const again = await call().post('NV-ITA1', `/offboarding-cases/${caseId}/account-lock`, { note: 'lần hai' });
      expect(call().codeOf(again)).toBe('OFFBOARDING_CASE.ALREADY_RECORDED');
    });
  });
});
