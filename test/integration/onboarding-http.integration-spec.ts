import request from 'supertest';
import { ApiAccount, adminToken, createActivatedAccount } from '../support/api-accounts';
import { HttpTestApp, SeededInstallation, createHttpTestApp, seedInstallation } from '../support/http-test-app';

interface Step {
  step: number;
  key: string;
  status: string;
  reasons: string[];
  facts?: {
    activeDepartments: number;
    activeEmployees: number;
    freeCostCenters: number;
    latestImport: { id: string; status: string; errorRows: number } | null;
  };
  createDepartmentBlockedBy?: string | null;
  warnings?: { code: string; departmentCode: string }[];
}

const ORG_TIME_ZONE = 'Asia/Ho_Chi_Minh';

function today(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ORG_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? '';

  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}

describe('the onboarding checklist over HTTP (integration, real PostgreSQL)', () => {
  let ctx: HttpTestApp;
  let seed: SeededInstallation;
  let admin: string;
  let it1: ApiAccount;
  let finance: ApiAccount;
  const server = () => ctx.app.getHttpServer();
  const as = (account: ApiAccount) => ({ Authorization: `Bearer ${account.accessToken}` });

  beforeAll(async () => {
    ctx = await createHttpTestApp();
    seed = await seedInstallation(ctx.app);
    admin = await adminToken(ctx, seed);
    it1 = await createActivatedAccount(ctx, seed, { code: 'E-IT1', email: 'it1@acme.vn', roles: ['IT_ADMIN'], admin });
    finance = await createActivatedAccount(ctx, seed, {
      code: 'E-FIN',
      email: 'fin@acme.vn',
      roles: ['FINANCE'],
      admin,
    });
  }, 120000);

  afterAll(async () => {
    await ctx?.close();
  });

  const steps = async (): Promise<Step[]> =>
    (
      (await request(server()).get('/api/v1/onboarding-checklist').set(as(it1)).expect(200)).body as {
        data: { steps: Step[] };
      }
    ).data.steps;
  const upload = (content: string) =>
    request(server()).post('/api/v1/employee-imports').set(as(it1)).attach('file', Buffer.from(content), 'people.csv');
  const HEADER = 'employee_code,full_name,work_email,employment_type,hire_date,department_code,job_title';

  it('is for the IT Admin only', async () => {
    for (const headers of [as(finance), { Authorization: `Bearer ${admin}` }]) {
      await request(server()).get('/api/v1/onboarding-checklist').set(headers).expect(403);
    }
  });

  it('says step 1 is done when there are departments and people, and which departments need a head or an IT Admin (AC-1, AC-6)', async () => {
    const [first] = await steps();

    expect(first).toMatchObject({ step: 1, key: 'ORGANIZATION_AND_PEOPLE', status: 'DONE', reasons: [] });
    expect(first.facts?.activeDepartments).toBe(1);
    expect(first.facts?.activeEmployees).toBeGreaterThanOrEqual(3);
    expect(first.warnings).toEqual([
      { code: 'MISSING_HEAD', departmentCode: 'P-OPS', departmentName: 'Operations' },
      { code: 'MISSING_IT_ADMIN', departmentCode: 'P-OPS', departmentName: 'Operations' },
    ]);
  });

  it('says a new department is blocked until Finance makes a cost center, and unblocks when it does (AC-4)', async () => {
    expect((await steps())[0].createDepartmentBlockedBy).toBe('NO_FREE_COST_CENTER');

    await request(server())
      .post('/api/v1/cost-centers')
      .set(as(finance))
      .send({ code: 'CC-NEW', name: 'New cost center', kind: 'UNIT' })
      .expect(201);

    const [first] = await steps();
    expect(first.createDepartmentBlockedBy).toBeNull();
    expect(first.facts?.freeCostCenters).toBe(1);
  });

  it('stops warning about a department once it has a head and an IT Admin in charge', async () => {
    const head = await createActivatedAccount(ctx, seed, { code: 'E-HEAD', email: 'head@acme.vn', roles: [], admin });
    await request(server())
      .post(`/api/v1/departments/${seed.departmentId}/head-assignments`)
      .set(as(it1))
      .send({ employeeId: head.employeeId, effectiveFrom: today() })
      .expect(200);
    await request(server())
      .patch(`/api/v1/departments/${seed.departmentId}`)
      .set(as(it1))
      .send({ itAdminEmployeeId: it1.employeeId })
      .expect(200);

    const [first] = await steps();

    expect(first.warnings).toEqual([]);
    expect(first.status).toBe('DONE');
  });

  it('keeps step 1 open while the latest people file still has wrong rows, and closes it when a clean file follows (AC-6)', async () => {
    const wrong = `${HEADER}\nE-OB-1,Person One,,STAFF,not-a-date,P-OPS,Administrator\nE-OB-2,Person Two,,STAFF,2026-09-01,P-OPS,Administrator\n`;
    const uploaded = (await upload(wrong).expect(201)).body as { data: { id: string } };

    const open = (await steps())[0];
    expect(open).toMatchObject({ status: 'INCOMPLETE', reasons: ['IMPORT_HAS_ERRORS'] });
    expect(open.facts?.latestImport).toMatchObject({ id: uploaded.data.id, status: 'PREVIEW', errorRows: 1 });

    await upload(`${HEADER}\nE-OB-3,Person Three,,STAFF,2026-09-01,P-OPS,Administrator\n`).expect(201);

    expect((await steps())[0]).toMatchObject({ status: 'DONE', reasons: [] });
  });

  it('ignores an import that was thrown away', async () => {
    const wrong = `${HEADER}\nE-OB-4,Person Four,,STAFF,not-a-date,P-OPS,Administrator\n`;
    const uploaded = (await upload(wrong).expect(201)).body as { data: { id: string } };
    expect((await steps())[0].status).toBe('INCOMPLETE');

    await request(server()).post(`/api/v1/employee-imports/${uploaded.data.id}/cancellations`).set(as(it1)).expect(200);

    expect((await steps())[0].status).toBe('DONE');
  });

  it('says the later steps are not built, and what the seat step waits for (AC-2, AC-5)', async () => {
    const [, applications, contracts, seats, usage] = await steps();

    expect([applications, contracts, usage].map((step) => [step.step, step.status, step.reasons])).toEqual([
      [2, 'NOT_AVAILABLE', ['NOT_BUILT_YET']],
      [3, 'NOT_AVAILABLE', ['NOT_BUILT_YET']],
      [5, 'NOT_AVAILABLE', ['NOT_BUILT_YET']],
    ]);
    expect(seats).toMatchObject({ step: 4, status: 'BLOCKED', reasons: ['STEP_3_NOT_AVAILABLE'] });
  });
});
