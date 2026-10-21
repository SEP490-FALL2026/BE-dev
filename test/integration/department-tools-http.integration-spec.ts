import request from 'supertest';
import { ApiAccount, createActivatedAccount } from '../support/api-accounts';
import { SeatHarness } from '../support/seat-baseline-harness';

const h = new SeatHarness();

/** Today in the calendar of the organization (the seeded one is Asia/Ho_Chi_Minh). */
function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
}

interface ToolsWire {
  departmentId: string;
  asOf: string;
  summary: Array<{ applicationName: string; planName: string; seats: number }>;
  items: Array<{
    assignmentId: string;
    employeeCode: string;
    fullName: string;
    holderStatus: string;
    kind: string;
    source: string;
    application: { id: string; name: string };
    plan: { id: string; name: string };
    effectiveFrom: string;
    effectiveFromLabel: string | null;
  }>;
  pagination: { totalItems: number };
}

describe('the tools a department uses (US-03-06 AC-13, AC-17, integration, real PostgreSQL)', () => {
  let design: { id: string; code: string };
  let finance: { id: string; code: string };
  let headOfDesign: ApiAccount;
  let headOfFinance: ApiAccount;
  let figmaSubscription: string;

  const tools = (departmentId: string, headers: Record<string, string> = h.as(h.it1), query: object = {}) =>
    request(h.server()).get(`/api/v1/departments/${departmentId}/tools-in-use`).query(query).set(headers);
  const toolsOf = async (departmentId: string, query: object = {}): Promise<ToolsWire> =>
    h.dataOf<ToolsWire>(await tools(departmentId, h.as(h.it1), query).expect(200));

  const created = (response: request.Response): request.Response => {
    if (response.status !== 201) throw new Error(`${response.status} ${JSON.stringify(response.body)}`);

    return response;
  };
  const department = async (code: string) => {
    const costCenter = await h.costCenter('UNIT');

    return h.dataOf<{ id: string; code: string }>(
      await request(h.server())
        .post('/api/v1/departments')
        .set(h.as(h.it1))
        .send({ code, name: `Department ${code}`, costCenterId: costCenter.id })
        .then(created),
    );
  };
  const enter = async (departmentCode: string, code: string): Promise<string> =>
    h.dataOf<{ id: string }>(
      await request(h.server())
        .post('/api/v1/employees')
        .set(h.as(h.it1))
        .send({
          employeeCode: code,
          fullName: `Person ${code}`,
          workEmail: `${code.toLowerCase()}@acme.vn`,
          employmentType: 'STAFF',
          // Long before any seat of the baseline: a seat never starts before the person does.
          hireDate: '2024-06-01',
          departmentCode,
          jobTitleId: h.seed.jobTitleId,
        })
        .then(created),
    ).id;
  const headAccount = async (dept: { id: string; code: string }, code: string): Promise<ApiAccount> => {
    const employeeId = await enter(dept.code, code);
    const account = await createActivatedAccount(h.ctx, h.seed, {
      code,
      email: `${code.toLowerCase()}@acme.vn`,
      roles: [],
      admin: h.admin,
      employeeId,
    });
    await request(h.server())
      .post(`/api/v1/departments/${dept.id}/head-assignments`)
      .set(h.as(h.it1))
      .send({ employeeId, effectiveFrom: today() })
      .expect(200);

    return account;
  };

  beforeAll(async () => {
    await h.start();
    design = await department('P-DES');
    finance = await department('P-FIN');
    headOfDesign = await headAccount(design, 'H-DES');
    headOfFinance = await headAccount(finance, 'H-FIN');
    for (const code of ['D1', 'D2', 'D3', 'D4', 'D5', 'D6']) await enter(design.code, code);
    await enter(finance.code, 'F1');

    figmaSubscription = await h.subscription(10, 'K2');
    const githubSubscription = await h.subscription(10, 'K1');
    const corp = await h.costCenter('COMPANY');
    const person = (code: string) => ({ employee_code: code, account_identifier: `${code.toLowerCase()}@acme.vn` });
    await h.written({ subscriptionId: figmaSubscription }, [
      person('D1'),
      person('D2'),
      person('D3'),
      person('F1'),
      { ...person('D6'), granted_on: '2025-01-01' },
    ]);
    await h.written({ subscriptionId: githubSubscription }, [
      person('D4'),
      { employee_code: 'D5', account_identifier: 'ci-bot', kind: 'service', reason: 'CI', cost_center_code: corp.code },
    ]);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  it('AC-13: lists exactly the seats the people of the department hold today, with the tool and the plan, and none of another department', async () => {
    const result = await toolsOf(design.id);

    expect(result.pagination.totalItems).toBe(6);
    expect(result.items.map((item) => item.employeeCode).sort()).toEqual(['D1', 'D2', 'D3', 'D4', 'D5', 'D6']);
    expect(result.items.map((item) => item.employeeCode)).not.toContain('F1');
    expect(result.items.find((item) => item.employeeCode === 'D5')).toMatchObject({
      kind: 'SERVICE',
      source: 'BASELINE',
      holderStatus: 'ACTIVE',
    });
    expect(result.summary.map((entry) => entry.seats).sort()).toEqual([2, 4]);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        application: { id: expect.any(String) as unknown, name: expect.any(String) as unknown },
        plan: { id: expect.any(String) as unknown, name: expect.any(String) as unknown },
      }),
    );
    expect(JSON.stringify(result)).not.toContain('@acme.vn');
    expect(JSON.stringify(result)).not.toContain('ci-bot');
  });

  it('shows a start that is only the day of recording with its label, never as a grant date', async () => {
    const result = await toolsOf(design.id);

    for (const item of result.items) {
      if (item.employeeCode === 'D6')
        expect(item).toMatchObject({ effectiveFrom: '2025-01-01', effectiveFromLabel: null });
      else expect(item.effectiveFromLabel?.startsWith('ghi nhận từ ')).toBe(true);
    }
  });

  it('AC-13: lets the head of the department read it, and it is the same list', async () => {
    const asHead = h.dataOf<ToolsWire>(await tools(design.id, h.as(headOfDesign)).expect(200));

    expect(asHead.items.map((item) => item.assignmentId).sort()).toEqual(
      (await toolsOf(design.id)).items.map((item) => item.assignmentId).sort(),
    );
  });

  it('AC-17: refuses the head of another department, and the roles that have no business here', async () => {
    expect(h.codeOf(await tools(finance.id, h.as(headOfDesign)).expect(403))).toBe('DEPARTMENT.OUT_OF_SCOPE');
    expect(h.codeOf(await tools(design.id, h.as(headOfFinance)).expect(403))).toBe('DEPARTMENT.OUT_OF_SCOPE');
    for (const headers of [h.as(h.finance), h.as(h.employee), { Authorization: `Bearer ${h.admin}` }]) {
      expect(h.codeOf(await tools(design.id, headers).expect(403))).toBe('AUTHORIZATION.FORBIDDEN');
    }
    expect(h.codeOf(await request(h.server()).get(`/api/v1/departments/${design.id}/tools-in-use`).expect(401))).toBe(
      'AUTHENTICATION_REQUIRED',
    );
  });

  it('does not list a seat that has ended, and counts the seats of every page in the summary', async () => {
    const before = await toolsOf(design.id);
    expect(before.items.map((item) => item.employeeCode)).toContain('D6');
    await h.ctx.sql.query(`UPDATE license_assignments SET valid_until = '2025-06-01' WHERE employee_id = $1`, [
      await employeeId('D6'),
    ]);

    const second = await toolsOf(design.id, { pageSize: 2, page: 2 });
    const all = await toolsOf(design.id);

    expect(all.items.map((item) => item.employeeCode)).not.toContain('D6');
    expect(second.pagination.totalItems).toBe(5);
    expect(second.items).toHaveLength(2);
    expect(second.summary.reduce((sum, entry) => sum + entry.seats, 0)).toBe(5);
  });

  it('answers 404 for a department that does not exist, 422 for a bad id or page, and has no way to write the list', async () => {
    expect(h.codeOf(await tools('3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11').expect(404))).toBe('DEPARTMENT.NOT_FOUND');
    expect(h.codeOf(await tools('not-a-uuid').expect(422))).toBe('VALIDATION_ERROR');
    expect(h.codeOf(await tools(design.id, h.as(h.it1), { pageSize: 101 }).expect(422))).toBe('VALIDATION_ERROR');
    for (const method of ['post', 'put', 'patch', 'delete'] as const) {
      const response = await request(h.server())
        [method](`/api/v1/departments/${design.id}/tools-in-use`)
        .set(h.as(h.it1))
        .send({});
      expect([response.status, h.codeOf(response)]).toEqual([404, 'HTTP_NOT_FOUND']);
    }
  });

  const employeeId = async (code: string): Promise<string> =>
    (await h.ctx.sql.query<{ id: string }>(`SELECT id FROM employees WHERE employee_code = $1`, [code])).rows[0].id;
});
