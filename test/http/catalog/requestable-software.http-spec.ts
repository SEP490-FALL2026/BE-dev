import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { RequestableSoftwareRepo } from '../../../src/modules/catalog/requestable-software/requestable-software.repo';
import { SubscriptionLookupService } from '../../../src/modules/catalog/subscription/subscription-lookup.service';
import { OrganizationApi } from '../../../src/modules/organization/public/organization.api';
import { bodyOf } from '../../support/api-body';
import { UNAVAILABLE_TOKEN, bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const SAAS_APP = '0b3c1e8a-6d2f-4f7a-9b1c-2d3e4f5a6b70';
const INTERNAL_APP = '1c4d2f9b-7e3a-4a8b-8c2d-3e4f5a6b7c81';
const SAAS_PLAN = '2d5e3a0c-8f4b-4b9c-9d3e-4f5a6b7c8d92';
const INTERNAL_PLAN = '3e6f4b1d-9a5c-4cad-8e4f-5a6b7c8d9ea3';
const WITH_COST_CENTER = 'e-with-cost-center';
const WITHOUT_COST_CENTER = 'e-without-cost-center';
const NO_DEPARTMENT = 'e-no-department';

const applications = [
  { id: SAAS_APP, name: 'Figma', kind: 'SAAS', vendorName: 'Figma Inc', functionalGroup: null, planCount: 1 },
  { id: INTERNAL_APP, name: 'Report portal', kind: 'INTERNAL', vendorName: null, functionalGroup: null, planCount: 1 },
] as const;
const plans = [
  {
    id: SAAS_PLAN,
    name: 'Professional',
    provisioningType: 'K2',
    application: { id: SAAS_APP, name: 'Figma', kind: 'SAAS' },
  },
  {
    id: INTERNAL_PLAN,
    name: 'Standard',
    provisioningType: 'K5',
    application: { id: INTERNAL_APP, name: 'Report portal', kind: 'INTERNAL' },
  },
] as const;

/** Every name of a field the catalog of the IT Admin and Finance has, and the person who asks for software never sees. */
const KEPT_FROM_REQUESTERS = [
  'businessOwner',
  'unitPrice',
  'amount',
  'billingCycle',
  'subscription',
  'subscriptions',
  'purchasedQuantity',
  'seats',
  'occupied',
  'contract',
  'licenseKey',
  'workspaceProfile',
  'revocationNote',
  'pricingModel',
  'controlLevel',
  'domains',
];
const leaked = (row: Record<string, unknown>): string[] =>
  Object.keys(row).filter((key) => KEPT_FROM_REQUESTERS.includes(key));

describe('the software a person may request (HTTP contract, no database)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const repo = {
      listApplications: () => Promise.resolve({ items: [...applications], total: 2 }),
      findApplication: (id: string) => {
        const found = applications.find((application) => application.id === id);
        return Promise.resolve(found ? { ...found, dataSensitivity: 'LOW' } : null);
      },
      listPlans: () => Promise.resolve({ items: [...plans], total: 2 }),
      findPlan: (id: string) => {
        const found = plans.find((plan) => plan.id === id);
        return Promise.resolve(
          found ? { ...found, vendorName: null, sharingPolicy: 'NOT_ALLOWED', dataLossOnRemoval: false } : null,
        );
      },
    };
    const organization = {
      businessToday: () => Promise.resolve('2026-10-31'),
      getOwningUnits: (ids: readonly string[]) =>
        Promise.resolve(
          new Map(
            ids.flatMap((id) =>
              id === NO_DEPARTMENT
                ? []
                : [
                    [
                      id,
                      {
                        departmentId: 'd1',
                        costCenter: id === WITHOUT_COST_CENTER ? null : { id: 'c1', code: 'CC', status: 'ACTIVE' },
                      },
                    ] as const,
                  ],
            ),
          ),
        ),
    };
    const subscriptions = {
      pricedCyclesOfPlans: () => Promise.resolve(new Map([[SAAS_PLAN, 'MONTHLY']])),
    };
    app = await createHttpContractApp({
      overrides: [
        { token: RequestableSoftwareRepo, useValue: repo },
        { token: OrganizationApi, useValue: organization },
        { token: SubscriptionLookupService, useValue: subscriptions },
      ],
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  const ROUTES = [
    '/api/v1/requestable-applications',
    `/api/v1/requestable-applications/${SAAS_APP}`,
    '/api/v1/requestable-plans',
    `/api/v1/requestable-plans/${SAAS_PLAN}`,
  ];
  const get = (path: string, employeeId = WITH_COST_CENTER, direct: string[] = [], derived: string[] = []) =>
    request(app.getHttpServer())
      .get(path)
      .set('Authorization', bearer(principal(direct, derived, { employeeId })));

  it.each(ROUTES)('%s without a token is 401', async (path) => {
    const response = await request(app.getHttpServer()).get(path).expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it.each(ROUTES)('%s answers 503 when authentication is unavailable', async (path) => {
    const response = await request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${UNAVAILABLE_TOKEN}`)
      .expect(503);

    expect(bodyOf(response).error.code).toBe('TOKEN_VERIFICATION_UNAVAILABLE');
  });

  it.each([
    ['an employee with no role at all', [], []],
    ['an Employee', ['EMPLOYEE'], []],
    ['an IT Admin, who may also send a request', ['IT_ADMIN'], []],
    ['Finance, who may also send a request', ['FINANCE'], []],
    ['a department head', [], ['MANAGER']],
    ['the spending approver', [], ['SPENDING_APPROVER']],
  ])('lets %s read every route', async (_name, direct, derived) => {
    for (const path of ROUTES) {
      const response = await get(path, WITH_COST_CENTER, direct, derived);
      expect({ path, status: response.status }).toEqual({ path, status: 200 });
    }
  });

  it.each(ROUTES)('%s answers 409 to a person who belongs to no department today', async (path) => {
    const response = await get(path, NO_DEPARTMENT).expect(409);

    expect(bodyOf(response).error.code).toBe('REQUESTABLE_SOFTWARE.NO_DEPARTMENT');
  });

  it('lists the applications with the gate of the department and nothing of cost, owner or seat', async () => {
    const response = await get('/api/v1/requestable-applications').expect(200);
    const body = response.body as { message: string; data: { items: Record<string, unknown>[]; pagination: unknown } };

    expect(body.message).toBe('REQUESTABLE_APPLICATION.LISTED');
    expect(body.data.pagination).toEqual({ page: 1, pageSize: 20, totalItems: 2, totalPages: 1 });
    expect(body.data.items).toEqual([
      { ...applications[0], costsMoney: true, canSubmit: true, submitBlockedReason: null },
      { ...applications[1], costsMoney: false, canSubmit: true, submitBlockedReason: null },
    ]);
    expect(body.data.items.flatMap(leaked)).toEqual([]);
  });

  it('says paid software cannot be sent while the department has no Cost Center, and internal software still can', async () => {
    const items = (
      (await get('/api/v1/requestable-plans', WITHOUT_COST_CENTER).expect(200)).body as {
        data: { items: { id: string; canSubmit: boolean; submitBlockedReason: string | null }[] };
      }
    ).data.items;

    expect(items.map(({ id, canSubmit, submitBlockedReason }) => ({ id, canSubmit, submitBlockedReason }))).toEqual([
      { id: SAAS_PLAN, canSubmit: false, submitBlockedReason: 'FINANCE_SETUP_INCOMPLETE' },
      { id: INTERNAL_PLAN, canSubmit: true, submitBlockedReason: null },
    ]);
  });

  it('answers a plan with whether it is priced, never the price', async () => {
    const body = (await get(`/api/v1/requestable-plans/${SAAS_PLAN}`).expect(200)).body as {
      message: string;
      data: Record<string, unknown>;
    };

    expect(body.message).toBe('REQUESTABLE_PLAN.FETCHED');
    expect(body.data).toEqual({
      ...plans[0],
      costsMoney: true,
      price: { status: 'PRICED', missingReason: null },
      canSubmit: true,
      submitBlockedReason: null,
      vendorName: null,
      sharingPolicy: 'NOT_ALLOWED',
      dataLossOnRemoval: false,
    });
    expect(leaked(body.data)).toEqual([]);
  });

  it('answers an application with its sensitivity', async () => {
    const body = (await get(`/api/v1/requestable-applications/${INTERNAL_APP}`).expect(200)).body as {
      message: string;
      data: Record<string, unknown>;
    };

    expect(body.message).toBe('REQUESTABLE_APPLICATION.FETCHED');
    expect(body.data).toMatchObject({ id: INTERNAL_APP, dataSensitivity: 'LOW', costsMoney: false });
  });

  it.each([
    [`/api/v1/requestable-applications/${SAAS_PLAN}`, 'REQUESTABLE_SOFTWARE.APPLICATION_NOT_FOUND'],
    [`/api/v1/requestable-plans/${SAAS_APP}`, 'REQUESTABLE_SOFTWARE.PLAN_NOT_FOUND'],
  ])('%s that is not offered is 404 %s', async (path, code) => {
    const response = await get(path).expect(404);

    expect(bodyOf(response).error.code).toBe(code);
  });

  it.each([
    '/api/v1/requestable-applications?pageSize=101',
    '/api/v1/requestable-applications?page=0',
    '/api/v1/requestable-applications?kind=FREE',
    '/api/v1/requestable-applications?functionalGroupId=x',
    '/api/v1/requestable-applications?status=RETIRED',
    `/api/v1/requestable-applications?search=${'x'.repeat(101)}`,
    '/api/v1/requestable-applications/not-a-uuid',
    '/api/v1/requestable-plans?pageSize=0',
    '/api/v1/requestable-plans?applicationId=x',
    '/api/v1/requestable-plans?kind=FREE',
    '/api/v1/requestable-plans?departmentId=d1',
    '/api/v1/requestable-plans/not-a-uuid',
  ])('turns away %s with 422 VALIDATION_ERROR', async (path) => {
    const response = await get(path).expect(422);

    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
  });
});
