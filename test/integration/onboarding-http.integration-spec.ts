import request from 'supertest';
import { ApiAccount, adminToken, createActivatedAccount } from '../support/api-accounts';
import {
  HttpTestApp,
  SeededInstallation,
  createHttpTestApp,
  insertEmployeeFixture,
  seedInstallation,
} from '../support/http-test-app';

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
    applications?: number;
    plans?: number;
    subscriptions?: number;
    assignments?: number;
    closed?: boolean;
    closedAt?: string | null;
  };
  createDepartmentBlockedBy?: string | null;
  warnings?: { code: string; departmentCode: string }[];
}

interface Suggestion {
  key: string;
  afterStep: number;
  story: string;
  available: boolean;
  configuredPairs: number;
  blocksStep: boolean;
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
  const suggestions = async (): Promise<Suggestion[]> =>
    (
      (await request(server()).get('/api/v1/onboarding-checklist').set(as(it1)).expect(200)).body as {
        data: { suggestions: Suggestion[] };
      }
    ).data.suggestions;
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

    // The latest import that was kept answers instead: the clean file of the case before, never the cancelled one.
    const after = (await steps())[0];
    expect(after).toMatchObject({ status: 'DONE', reasons: [] });
    expect(after.facts?.latestImport).toEqual({ id: expect.any(String) as unknown, status: 'PREVIEW', errorRows: 0 });
    expect(after.facts?.latestImport?.id).not.toBe(uploaded.data.id);
    expect(Object.keys(after.facts?.latestImport ?? {})).toEqual(['id', 'status', 'errorRows']);
  });

  it('points an empty list of subscriptions, and of applications, to the step that fills it, not to a blank page (AC-3, FR-9.6)', async () => {
    for (const account of [it1, finance]) {
      const subscriptions = (await request(server()).get('/api/v1/subscriptions').set(as(account)).expect(200))
        .body as {
        data: { items: unknown[]; emptyState: unknown };
      };
      expect(subscriptions.data.items).toEqual([]);
      expect(subscriptions.data.emptyState).toEqual({
        reason: 'NO_SUBSCRIPTIONS',
        nextStep: { step: 3, key: 'CONTRACTS_AND_SUBSCRIPTIONS' },
      });
    }
    const applications = (await request(server()).get('/api/v1/applications').set(as(it1)).expect(200)).body as {
      data: { items: unknown[]; emptyState: unknown };
    };
    expect(applications.data.items).toEqual([]);
    expect(applications.data.emptyState).toEqual({
      reason: 'NO_APPLICATIONS',
      nextStep: { step: 2, key: 'APPLICATIONS' },
    });
  });

  it('has the applications, subscriptions and seat steps incomplete or blocked on an empty catalog, and the usage step not built (AC-2)', async () => {
    const [first, applications, contracts, seats, usage] = await steps();

    expect(first.status).toBe('DONE');
    expect(applications).toMatchObject({
      step: 2,
      status: 'INCOMPLETE',
      reasons: ['NO_APPLICATION'],
      facts: { applications: 0 },
    });
    expect(contracts).toMatchObject({
      step: 3,
      status: 'INCOMPLETE',
      reasons: ['NO_SUBSCRIPTION'],
      facts: { plans: 0, subscriptions: 0 },
    });
    expect(seats).toMatchObject({ step: 4, status: 'BLOCKED', reasons: ['STEP_3_INCOMPLETE'] });
    expect(usage).toEqual({ step: 5, key: 'USAGE', status: 'NOT_AVAILABLE', reasons: ['NOT_BUILT_YET'] });
    expect(await suggestions()).toEqual([
      {
        key: 'STANDARD_TOOLSET',
        afterStep: 3,
        story: 'US-04-10',
        available: false,
        configuredPairs: 0,
        blocksStep: false,
      },
    ]);
  });

  it('follows the data: an application, a plan and a subscription make steps 2 and 3 done and the seat step ready (AC-1)', async () => {
    const owner = (await insertEmployeeFixture(ctx.app, seed, { code: 'E-OB-OWN', email: 'ob-owner@acme.vn' }))
      .employeeId;
    const application = await request(server())
      .post('/api/v1/applications')
      .set(as(it1))
      .send({
        name: 'Figma',
        kind: 'SAAS',
        vendorName: 'Figma Inc',
        dataSensitivity: 'LOW',
        businessOwnerEmployeeId: owner,
        communication: { personToPersonMessaging: false, callsOrMeetings: false, mailbox: false },
      })
      .expect(201);
    expect((await steps())[1]).toMatchObject({ status: 'DONE', reasons: [], facts: { applications: 1 } });
    expect((await steps())[3]).toMatchObject({ status: 'BLOCKED', reasons: ['STEP_3_INCOMPLETE'] });

    const plan = await request(server())
      .post('/api/v1/plans')
      .set(as(it1))
      .send({
        applicationId: (application.body as { data: { id: string } }).data.id,
        name: 'Organization',
        provisioningType: 'K2',
        pricingModel: 'PER_SEAT',
        controlLevel: 'FULL',
      })
      .expect(201);
    expect((await steps())[2]).toMatchObject({ status: 'INCOMPLETE', facts: { plans: 1, subscriptions: 0 } });

    await request(server())
      .post('/api/v1/subscriptions')
      .set(as(it1))
      .send({ planId: (plan.body as { data: { id: string } }).data.id, kind: 'TERM', purchasedQuantity: 100 })
      .expect(201);

    const [, , contracts, seats] = await steps();
    expect(contracts).toMatchObject({ status: 'DONE', reasons: [], facts: { plans: 1, subscriptions: 1 } });
    expect(seats).toEqual({
      step: 4,
      key: 'SEAT_BASELINE',
      status: 'INCOMPLETE',
      reasons: [],
      facts: { assignments: 0, closed: false, closedAt: null },
    });
  });

  it('suggests the standard toolsets after step 3 once it is done, and never blocks a step by them (US-02-04 AC-5, US-04-10)', async () => {
    const [toolsets] = await suggestions();

    expect(toolsets).toEqual({
      key: 'STANDARD_TOOLSET',
      afterStep: 3,
      story: 'US-04-10',
      available: true,
      configuredPairs: 0,
      blocksStep: false,
    });
    expect((await steps())[3].status).toBe('INCOMPLETE');

    const departmentId = (
      (await request(server()).get('/api/v1/departments').set(as(it1)).expect(200)).body as {
        data: { items: { id: string }[] };
      }
    ).data.items[0].id;
    const jobTitleId = (
      (await request(server()).post('/api/v1/job-titles').set(as(it1)).send({ name: 'Designer' }).expect(201)).body as {
        data: { id: string };
      }
    ).data.id;
    const planId = (
      (await request(server()).get('/api/v1/plans').set(as(it1)).expect(200)).body as {
        data: { items: { id: string }[] };
      }
    ).data.items[0].id;
    await request(server())
      .put(`/api/v1/standard-toolsets/${departmentId}/${jobTitleId}`)
      .set(as(it1))
      .send({ planIds: [planId], reason: 'bộ chuẩn đầu tiên' })
      .expect(200);

    expect((await suggestions())[0]).toMatchObject({ available: true, configuredPairs: 1, blocksStep: false });
    expect((await steps())[3].status).toBe('INCOMPLETE');
  });

  it('gives no empty state once a subscription and an application exist, even when a filter matches nothing', async () => {
    const all = (await request(server()).get('/api/v1/subscriptions').set(as(it1)).expect(200)).body as {
      data: { items: unknown[]; emptyState: unknown };
    };
    const filtered = (
      await request(server()).get('/api/v1/subscriptions').query({ status: 'ACTIVE' }).set(as(it1)).expect(200)
    ).body as { data: { items: unknown[]; emptyState: unknown } };
    const apps = (await request(server()).get('/api/v1/applications').set(as(it1)).expect(200)).body as {
      data: { emptyState: unknown };
    };

    expect(all.data.items).toHaveLength(1);
    expect(all.data.emptyState).toBeNull();
    expect(filtered.data.items).toEqual([]);
    expect(filtered.data.emptyState).toBeNull();
    expect(apps.data.emptyState).toBeNull();
  });

  it('is done at step 4 only when the IT Admin closes the baseline (US-02-05 AC-6, OI-10)', async () => {
    const response = await request(server()).post('/api/v1/seat-baseline/close').set(as(it1)).expect(200);

    const seats = (await steps())[3];
    expect(seats).toMatchObject({ status: 'DONE', reasons: [], facts: { closed: true } });
    expect(seats.facts?.closedAt).toBe((response.body as { data: { closedAt: string } }).data.closedAt);
  });
});
