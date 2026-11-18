import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { ApiAccount } from '../../support/api-accounts';
import { createDepartment, enterEmployee } from '../../support/builders/organization.builder';
import { pretendBusinessToday } from '../../support/pretend-today';
import { USAGE_TODAY, UsageOverviewHarness } from '../../support/usage-overview-harness';

const h = new UsageOverviewHarness();

interface Machine {
  deviceId: string;
  registrationId: string;
}
interface PageWire<T> {
  items: T[];
  pagination: { totalItems: number };
}

/**
 * Whose machines an IT Admin reads the usage and the tool status of (`QĐ-111ax`, FX-T6c): the machines held by the people of the departments in
 * their charge and of a department with no IT Admin, never of another IT Admin's. The world: `P1` (`it1`), `P2` (`it2`) and `P3` (nobody in
 * charge), a person and a machine in each; a machine that passed from `P1` to `P2` shows each IT Admin only the days of the holder of theirs.
 */
describe('the usage of a machine by department of the IT Admin (integration, real PostgreSQL)', () => {
  let applicationId: string;
  let m1: Machine;
  let m2: Machine;
  let m3: Machine;
  let shared: Machine;
  let p2: string;

  const day = (date: string, responses = 1) => ({ date, responses });
  const status = async (machine: Machine, tool: 'CODEX' | 'CLAUDE_CODE') => {
    await h.ctx.sql.query(
      `INSERT INTO tool_status_snapshots (id, organization_id, device_id, registration_id, credential_id, tool, observed_at, auth_status, quota_status)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5::"AiToolKey", now(), 'LOGGED_IN', 'OK')`,
      [h.seed.organizationId, machine.deviceId, machine.registrationId, randomUUID(), tool],
    );
  };

  beforeAll(async () => {
    await h.startTwoDepartments();
    pretendBusinessToday(h.ctx.app, USAGE_TODAY);
    ({ applicationId } = await h.usageApp());
    const p1 = await h.person('DS-P1');
    p2 = await h.personOfOtherDepartment('DS-P2');
    const third = await createDepartment(h.ctx, h.admin, { code: 'P-THIRD', name: 'Department without an IT Admin' });
    const hireDate = '2026-01-05';
    const { id: p3 } = await enterEmployee(h.ctx, h.admin, {
      employeeCode: 'DS-P3',
      fullName: 'Person DS-P3',
      workEmail: 'ds-p3@acme.vn',
      employmentType: 'STAFF',
      hireDate,
      departmentCode: third.code,
      jobTitle: 'Tester',
    });
    await h.ctx.sql.query(`UPDATE employee_placements SET valid_from = $2 WHERE employee_id = $1`, [p3, hireDate]);
    m1 = await h.registrationOf(p1, USAGE_TODAY);
    m2 = await h.registrationOf(p2, USAGE_TODAY);
    m3 = await h.registrationOf(p3, USAGE_TODAY);
    shared = await h.registrationOf(p1, USAGE_TODAY);
    for (const machine of [m1, m2, m3]) {
      await h.collectorUsage(machine, applicationId, [day('2026-11-05'), day('2026-11-06')]);
      await status(machine, 'CODEX');
    }
    await h.collectorUsage(shared, applicationId, [day('2026-11-05')]);
    await status(shared, 'CODEX');
    // A holder change ends the registration at the real instant, so it is made on the real day, then the world goes back to its fixed one.
    jest.restoreAllMocks();
    await request(h.server())
      .post(`/api/v1/devices/${shared.deviceId}/holder-changes`)
      .set(h.as(h.it1))
      .send({ holderEmployeeId: p2 })
      .expect(201);
    pretendBusinessToday(h.ctx.app, USAGE_TODAY);
    const current = await h.ctx.sql.query<{ id: string }>(
      `SELECT id FROM device_registrations WHERE device_id = $1 AND holder_employee_id = $2`,
      [shared.deviceId, p2],
    );
    const second = { deviceId: shared.deviceId, registrationId: current.rows[0].id };
    await h.collectorUsage(second, applicationId, [day('2026-11-12')]);
    await status(second, 'CLAUDE_CODE');
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  const read = (kind: 'usage' | 'tool-status', deviceId: string, account: ApiAccount) =>
    request(h.server()).get(`/api/v1/devices/${deviceId}/${kind}`).query({ pageSize: '100' }).set(h.as(account));
  const usageDays = async (deviceId: string, account: ApiAccount): Promise<string[]> =>
    h
      .dataOf<PageWire<{ date: string }>>(await read('usage', deviceId, account).expect(200))
      .items.map((item) => item.date)
      .sort();
  const tools = async (deviceId: string, account: ApiAccount): Promise<string[]> =>
    h
      .dataOf<PageWire<{ tool: string }>>(await read('tool-status', deviceId, account).expect(200))
      .items.map((item) => item.tool)
      .sort();

  it('reads the days of a machine of its own department, and of the department with no IT Admin, not of the other IT Admin', async () => {
    expect(await usageDays(m1.deviceId, h.it1)).toEqual(['2026-11-05', '2026-11-06']);
    expect(await usageDays(m3.deviceId, h.it1)).toEqual(['2026-11-05', '2026-11-06']);
    expect(await usageDays(m2.deviceId, h.it2)).toEqual(['2026-11-05', '2026-11-06']);
    expect(await usageDays(m3.deviceId, h.it2)).toEqual(['2026-11-05', '2026-11-06']);
  });

  it('answers an empty page, not an error, for the days of a machine that only people of another department held', async () => {
    const page = h.dataOf<PageWire<unknown>>(await read('usage', m2.deviceId, h.it1).expect(200));
    expect(page.items).toEqual([]);
    expect(page.pagination.totalItems).toBe(0);
    expect(await usageDays(m1.deviceId, h.it2)).toEqual([]);
  });

  it('reads the tool status of a machine in scope and an empty page for one outside it', async () => {
    expect(await tools(m1.deviceId, h.it1)).toEqual(['CODEX']);
    expect(await tools(m3.deviceId, h.it2)).toEqual(['CODEX']);
    expect(await tools(m2.deviceId, h.it1)).toEqual([]);
    expect(await tools(m1.deviceId, h.it2)).toEqual([]);
  });

  it('shows each IT Admin only what the holder of their own department left on a machine that changed hands', async () => {
    expect(await usageDays(shared.deviceId, h.it1)).toEqual(['2026-11-05']);
    expect(await usageDays(shared.deviceId, h.it2)).toEqual(['2026-11-12']);
    expect(await tools(shared.deviceId, h.it1)).toEqual(['CODEX']);
    expect(await tools(shared.deviceId, h.it2)).toEqual(['CLAUDE_CODE']);
  });

  it('answers 404 for a machine that does not exist, on both routes', async () => {
    for (const kind of ['usage', 'tool-status'] as const) {
      const response = await read(kind, randomUUID(), h.it1).expect(404);

      expect(h.codeOf(response)).toBe('DEVICE.NOT_FOUND');
    }
  });
});
