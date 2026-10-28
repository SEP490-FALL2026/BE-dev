import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/bootstrap';
import { ACCESS_TOKEN_VERIFIER } from '../../src/infrastructure/security/tokens/access-token-verifier.port';
import { bodyOf } from '../support/api-body';

type Agent = ReturnType<typeof request>;

const PLAN = '8a4d7c1e-2b3f-4c5d-9e6f-0a1b2c3d4e5f';
const EMPLOYEE = '5c6d7e8f-9a0b-4c1d-8e2f-3a4b5c6d7e8f';
const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const DRAFTS = '/api/v1/access-requests/drafts';
const INDIVIDUAL = { kind: 'INDIVIDUAL', planId: PLAN, businessReason: 'Design the new brand', termMonths: 6 };
const GROUP = {
  kind: 'GROUP',
  planId: PLAN,
  lines: [{ employeeId: EMPLOYEE }],
  businessReason: 'The new brand needs the shared workspace',
  termMonths: 6,
};
const SERVICE_ACCOUNT = {
  kind: 'SERVICE_ACCOUNT',
  planId: PLAN,
  purpose: 'Build bot of the CI pipeline',
  expectedIdentifier: 'ci-bot-2',
  businessReason: 'Run the builds of the product',
  termMonths: 1,
};

function principal(direct: string[], derived: string[] = []) {
  return {
    subject: 'u1',
    appUserId: 'u1',
    sessionId: 's1',
    employeeId: 'e1',
    directRoles: direct,
    derivedRoles: derived,
    roles: [...direct, ...derived],
  };
}

/**
 * The drafts of paid requests (`accessRequestDraftSave`, `accessRequestDraftList`, `accessRequestDraftSubmit`,
 * `accessRequestDraftDelete`; F27, spec L.1) and the Super Admin who sends no request (F30): the contract of the routes, judged before
 * anything is read (e2e, no database). What they do with a database is proved by `finance-setup-gate.integration-spec.ts`.
 */
describe('the drafts of a request, and the Super Admin (e2e, no database)', () => {
  let app: INestApplication<App>;

  async function appFor(identity: ReturnType<typeof principal> | null): Promise<INestApplication<App>> {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(ACCESS_TOKEN_VERIFIER)
      .useValue({ verify: jest.fn().mockResolvedValue(identity) })
      .compile();
    const created = moduleRef.createNestApplication<INestApplication<App>>();
    configureApplication(created, { mountDocs: false });
    await created.init();

    return created;
  }

  afterEach(async () => {
    await app?.close();
  });

  const operations: Array<[string, (agent: Agent) => request.Test]> = [
    ['accessRequestDraftSave', (agent) => agent.post(DRAFTS).send(INDIVIDUAL)],
    ['accessRequestDraftList', (agent) => agent.get(DRAFTS)],
    ['accessRequestDraftSubmit', (agent) => agent.post(`${DRAFTS}/${ID}/submission`).send({})],
    ['accessRequestDraftDelete', (agent) => agent.delete(`${DRAFTS}/${ID}`)],
  ];

  it.each(operations)('needs a token: %s', async (_name, call) => {
    app = await appFor(principal(['EMPLOYEE']));

    const response = await call(request(app.getHttpServer())).expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it.each([
    ['no kind', { planId: PLAN, businessReason: 'x', termMonths: 6 }],
    ['a kind that is none of the three', { ...INDIVIDUAL, kind: 'RENEWAL' }],
    ['a draft of an individual with no reason', { kind: 'INDIVIDUAL', planId: PLAN, termMonths: 6 }],
    ['a draft of an individual with a plan that is not an id', { ...INDIVIDUAL, planId: 'not-an-id' }],
    ['a draft of an individual with a term of no months', { ...INDIVIDUAL, termMonths: 0 }],
    [
      'a draft of an individual with an amount, which is nobody’s to give',
      { ...INDIVIDUAL, amount: { amount: '1', currency: 'VND' } },
    ],
    ['a draft of a group with no people', { ...GROUP, lines: [] }],
    ['a draft of a group with a person that is not an id', { ...GROUP, lines: [{ employeeId: 'x' }] }],
    ['a draft of a service account with no purpose', { ...SERVICE_ACCOUNT, purpose: undefined }],
    ['a draft of a service account with no identifier', { ...SERVICE_ACCOUNT, expectedIdentifier: undefined }],
    ['a field the route does not know', { ...INDIVIDUAL, costCenterId: ID }],
  ])('refuses saving %s with 422', async (_name, payload) => {
    app = await appFor(principal(['EMPLOYEE']));

    const response = await request(app.getHttpServer())
      .post(DRAFTS)
      .set('Authorization', 'Bearer any')
      .send(payload)
      .expect(422);

    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
  });

  it.each([
    ['a page of 0', { page: 0 }],
    ['a page size of 101', { pageSize: 101 }],
    ['a page size of 0', { pageSize: 0 }],
    ['a query the route does not know', { state: 'DRAFT' }],
  ])('refuses listing with %s with 422', async (_name, query) => {
    app = await appFor(principal(['EMPLOYEE']));

    const response = await request(app.getHttpServer())
      .get(DRAFTS)
      .query(query)
      .set('Authorization', 'Bearer any')
      .expect(422);

    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
  });

  it('refuses a draft id that is not an id, to send and to delete, with 422, and a body that carries content to send', async () => {
    app = await appFor(principal(['EMPLOYEE']));
    const agent = request(app.getHttpServer());

    const send = await agent
      .post(`${DRAFTS}/not-an-id/submission`)
      .set('Authorization', 'Bearer any')
      .send({})
      .expect(422);
    const remove = await agent.delete(`${DRAFTS}/not-an-id`).set('Authorization', 'Bearer any').expect(422);
    const content = await agent
      .post(`${DRAFTS}/${ID}/submission`)
      .set('Authorization', 'Bearer any')
      .send(INDIVIDUAL)
      .expect(422);

    expect([send, remove, content].map((response) => bodyOf(response).error.code)).toEqual(
      Array(3).fill('VALIDATION_ERROR'),
    );
  });

  const agents = (): Agent => request(app.getHttpServer());
  /** The operations that send a request, with a body that is valid for each: what is refused is the person, never the content. */
  const sending: Array<[string, (agent: Agent) => request.Test]> = [
    [
      'accessRequestSubmit',
      (agent) =>
        agent
          .post('/api/v1/access-requests')
          .send({ planId: PLAN, businessReason: 'Design the new brand', termMonths: 6 }),
    ],
    [
      'accessRequestPropose',
      (agent) =>
        agent.post('/api/v1/access-requests/proposals').send({
          softwareName: 'Miro',
          homepageUrl: 'https://miro.com',
          purpose: 'Whiteboards for design reviews',
          dataDescription: 'Product design boards',
          expectedUsers: 5,
          termMonths: 6,
        }),
    ],
    [
      'delegatedRequestSend',
      (agent) =>
        agent.post('/api/v1/delegated-requests').send({
          beneficiaryEmployeeIds: [EMPLOYEE],
          items: [{ planId: PLAN }],
          businessReason: 'The new designer needs the tool',
          termMonths: 1,
        }),
    ],
    ['groupRequestSubmit', (agent) => agent.post('/api/v1/group-requests').send({ ...GROUP, kind: undefined })],
    [
      'accessRequestServiceAccountSubmit',
      (agent) => agent.post('/api/v1/access-requests/service-accounts').send({ ...SERVICE_ACCOUNT, kind: undefined }),
    ],
    [
      'accessRequestRenewalSubmit',
      (agent) =>
        agent
          .post('/api/v1/access-requests/renewals')
          .send({ assignmentId: ID, newExpectedEndDate: '2027-01-31', businessReason: 'The work goes on' }),
    ],
  ];

  it.each([...operations, ...sending])(
    'answers the Super Admin 403 ACCESS_REQUEST.SUPER_ADMIN_CANNOT_REQUEST, before anything is read: %s (F30)',
    async (_name, call) => {
      app = await appFor(principal(['SUPER_ADMIN']));

      const response = await call(agents()).set('Authorization', 'Bearer any').expect(403);

      expect(bodyOf(response).error.code).toBe('ACCESS_REQUEST.SUPER_ADMIN_CANNOT_REQUEST');
    },
  );
});
