import request from 'supertest';
import { ApiAccount, adminToken, createActivatedAccount } from '../../support/api-accounts';
import {
  HttpTestApp,
  SeededInstallation,
  createHttpTestApp,
  insertEmployeeFixture,
  seedInstallation,
} from '../../support/http-test-app';
import { changeRoleTo } from '../../support/builders/account.builder';

interface Step {
  step: number;
  key: string;
  status: string;
  reasons: string[];
  facts?: {
    activeDepartments: number;
    activeEmployees: number;
    departmentsWithoutCostCenter: number;
    latestImport: { id: string; status: string; errorRows: number } | null;
    applications?: number;
    plans?: number;
    subscriptions?: number;
    assignments?: number;
    closed?: boolean;
    closedAt?: string | null;
  };
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
    it1 = await createActivatedAccount(ctx, seed, { code: 'E-IT1', email: 'it1@acme.vn', role: 'IT_ADMIN', admin });
    finance = await createActivatedAccount(ctx, seed, {
      code: 'E-FIN',
      email: 'fin@acme.vn',
      role: 'FINANCE',
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
  const checklistKeys = async (): Promise<string[]> =>
    Object.keys(
      (
        (await request(server()).get('/api/v1/onboarding-checklist').set(as(it1)).expect(200)).body as {
          data: object;
        }
      ).data,
    );
  const upload = (content: string) =>
    request(server())
      .post('/api/v1/employee-imports')
      .set({ Authorization: `Bearer ${admin}` })
      .attach('file', Buffer.from(content), 'people.csv');
  const HEADER = 'employee_code,full_name,work_email,employment_type,hire_date,department_code,job_title';

  it('is for the Super Admin, who does step 1, and the IT Admin, who does steps 2 to 5, and nobody else (US-02-04, F13)', async () => {
    await request(server()).get('/api/v1/onboarding-checklist').set(as(finance)).expect(403);
    for (const headers of [as(it1), { Authorization: `Bearer ${admin}` }]) {
      const response = await request(server()).get('/api/v1/onboarding-checklist').set(headers).expect(200);

      expect((response.body as { data: { steps: Step[] } }).data.steps).toHaveLength(5);
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

  it('says nothing of an activation any more: a department is created before its Cost Center, and step 1 never waits for one (F14, QĐ-87d(1))', async () => {
    const response = await request(server()).get('/api/v1/onboarding-checklist').set(as(it1)).expect(200);
    const [first] = (response.body as { data: { steps: Step[] } }).data.steps;

    expect(Object.keys(first)).not.toContain('createDepartmentBlockedBy');
    expect(response.text).not.toMatch(/AWAITING_ACTIVATION|NO_FREE_COST_CENTER/);
  });

  it('shows a department with no Cost Center as a warning that stops nothing, and drops it once Finance creates one for it (QĐ-87d(1))', async () => {
    const bare = await ctx.sql.query<{ id: string }>(
      `INSERT INTO departments (id, organization_id, code, name) VALUES (gen_random_uuid(), $1, 'P-ZBARE', 'No cost center yet') RETURNING id`,
      [seed.organizationId],
    );
    const withWarning = (await steps())[0];
    expect(withWarning.status).toBe('DONE');
    expect(withWarning.warnings).toContainEqual({
      code: 'MISSING_COST_CENTER',
      departmentCode: 'P-ZBARE',
      departmentName: 'No cost center yet',
    });
    expect(withWarning.facts?.departmentsWithoutCostCenter).toBe(1);

    await request(server())
      .post('/api/v1/cost-centers')
      .set(as(finance))
      .send({ code: 'CC-BARE', name: 'For the bare one', kind: 'UNIT', departmentId: bare.rows[0].id })
      .expect(201);

    const [first] = await steps();
    expect(first.warnings?.map((warning) => warning.code)).not.toContain('MISSING_COST_CENTER');
    expect(first.facts?.departmentsWithoutCostCenter).toBe(0);

    // Retired, so the later cases still see only the department they were written for.
    await ctx.sql.query(`UPDATE departments SET status = 'INACTIVE', deactivated_at = now() WHERE code = 'P-ZBARE'`);
  });

  it('stops warning about a department once it has a head and an IT Admin in charge', async () => {
    const head = await createActivatedAccount(ctx, seed, {
      code: 'E-HEAD',
      email: 'head@acme.vn',
      role: 'EMPLOYEE',
      admin,
    });
    await changeRoleTo(ctx, admin, head.employeeId, 'MANAGER');
    await request(server())
      .post(`/api/v1/departments/${seed.departmentId}/head-assignments`)
      .set({ Authorization: `Bearer ${admin}` })
      .send({ employeeId: head.employeeId, effectiveFrom: today() })
      .expect(200);
    await request(server())
      .patch(`/api/v1/departments/${seed.departmentId}`)
      .set({ Authorization: `Bearer ${admin}` })
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

    await request(server())
      .post(`/api/v1/employee-imports/${uploaded.data.id}/cancellations`)
      .set({ Authorization: `Bearer ${admin}` })
      .expect(200);

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
    expect(await checklistKeys()).toEqual(['steps']);
  });

  it('follows the data: an application, a plan and a subscription make steps 2 and 3 done and the seat step ready (AC-1)', async () => {
    await insertEmployeeFixture(ctx.app, seed, { code: 'E-OB-OWN', email: 'ob-owner@acme.vn' });
    const application = await request(server())
      .post('/api/v1/applications')
      .set(as(it1))
      .send({
        name: 'Figma',
        kind: 'SAAS',
        vendorName: 'Figma Inc',
        dataSensitivity: 'LOW',
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
      .send({
        ownerDepartmentId: seed.departmentId,
        planId: (plan.body as { data: { id: string } }).data.id,
        kind: 'TERM',
        purchasedQuantity: 100,
      })
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
