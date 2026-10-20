import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/bootstrap';
import { ACCESS_TOKEN_VERIFIER } from '../../src/infrastructure/security/tokens/access-token-verifier.port';
import { bodyOf } from '../support/api-body';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const DOCUMENTS = '/api/v1/documents';
const CONTRACTS = '/api/v1/contracts';

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

describe('contract and document routes (e2e, no database)', () => {
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

  it.each([
    ['post', CONTRACTS],
    ['get', `${CONTRACTS}/${ID}`],
    ['post', DOCUMENTS],
    ['get', `${DOCUMENTS}/${ID}`],
    ['post', `${DOCUMENTS}/${ID}/complete`],
    ['post', `${DOCUMENTS}/${ID}/attach`],
    ['post', `${DOCUMENTS}/${ID}/links`],
  ] as const)('answers 401 to %s %s without a token', async (method, path) => {
    app = await appFor(null);

    const response = await request(app.getHttpServer())[method](path).expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it.each([
    ['the department head', ['MANAGER'], []],
    ['an employee', ['EMPLOYEE'], []],
    ['the Super Admin, who never does business work (SoD-1)', ['SUPER_ADMIN'], []],
    ['the spending approver, whose role is derived', [], ['SPENDING_APPROVER']],
    ['an account with no role', [], []],
  ])('refuses %s every route of files with 403, and a link is not issued (SoD-2)', async (_name, direct, derived) => {
    app = await appFor(principal(direct, derived));
    const server = app.getHttpServer();
    const as = (req: request.Test) => req.set('Authorization', 'Bearer any');

    for (const response of [
      await as(
        request(server)
          .post(DOCUMENTS)
          .send({ fileName: 'a.pdf', contentType: 'application/pdf', sizeBytes: 1, purpose: 'CONTRACT_ATTACHMENT' }),
      ),
      await as(request(server).get(`${DOCUMENTS}/${ID}`)),
      await as(request(server).post(`${DOCUMENTS}/${ID}/complete`)),
      await as(request(server).post(`${DOCUMENTS}/${ID}/attach`).send({ contractId: ID })),
      await as(request(server).post(`${DOCUMENTS}/${ID}/links`)),
      await as(request(server).get(`${CONTRACTS}/${ID}`)),
      await as(request(server).post(CONTRACTS).send({ name: 'x' })),
    ]) {
      expect(response.status).toBe(403);
      expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
    }
  });

  it('keeps contract making for the IT Admin: Finance reads a contract and makes none', async () => {
    app = await appFor(principal(['FINANCE']));

    await request(app.getHttpServer())
      .post(CONTRACTS)
      .set('Authorization', 'Bearer any')
      .send({ name: 'x' })
      .expect(403);
  });

  it.each([
    ['an id that is not a UUID', 'get', `${DOCUMENTS}/not-a-uuid`, undefined],
    ['a link for an id that is not a UUID', 'post', `${DOCUMENTS}/not-a-uuid/links`, undefined],
    [
      'a declaration with no purpose',
      'post',
      DOCUMENTS,
      { fileName: 'a.pdf', contentType: 'application/pdf', sizeBytes: 1 },
    ],
    [
      'a purpose that does not exist',
      'post',
      DOCUMENTS,
      { fileName: 'a.pdf', contentType: 'application/pdf', sizeBytes: 1, purpose: 'OTHER' },
    ],
    [
      'a size that is not a whole number',
      'post',
      DOCUMENTS,
      { fileName: 'a.pdf', contentType: 'application/pdf', sizeBytes: 1.5, purpose: 'CONTRACT_ATTACHMENT' },
    ],
    [
      'an uploader named in the body',
      'post',
      DOCUMENTS,
      {
        fileName: 'a.pdf',
        contentType: 'application/pdf',
        sizeBytes: 1,
        purpose: 'CONTRACT_ATTACHMENT',
        uploadedBy: ID,
      },
    ],
    [
      'an organization named in the body',
      'post',
      DOCUMENTS,
      {
        fileName: 'a.pdf',
        contentType: 'application/pdf',
        sizeBytes: 1,
        purpose: 'CONTRACT_ATTACHMENT',
        organizationId: ID,
      },
    ],
    ['an attachment to a contract that is not a UUID', 'post', `${DOCUMENTS}/${ID}/attach`, { contractId: 'x' }],
    ['an attachment with an unknown field', 'post', `${DOCUMENTS}/${ID}/attach`, { contractId: ID, force: true }],
    ['a contract name over two hundred characters', 'post', CONTRACTS, { name: 'x'.repeat(201) }],
    ['a contract with an unknown field', 'post', CONTRACTS, { name: 'x', vendorId: ID }],
  ] as const)('turns away %s with 422', async (_name, method, path, body) => {
    app = await appFor(principal(['IT_ADMIN']));
    const req = request(app.getHttpServer())[method](path).set('Authorization', 'Bearer any');

    const response = await (body === undefined ? req : req.send(body)).expect(422);

    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
  });

  it('has no route that deletes or rewrites a file or a contract, or gives the bytes back through the API', async () => {
    app = await appFor(principal(['IT_ADMIN']));
    const server = app.getHttpServer();
    const as = (req: request.Test) => req.set('Authorization', 'Bearer any');

    await as(request(server).delete(`${DOCUMENTS}/${ID}`)).expect(404);
    await as(request(server).patch(`${DOCUMENTS}/${ID}`).send({})).expect(404);
    await as(request(server).get(`${DOCUMENTS}/${ID}/content`)).expect(404);
    await as(request(server).delete(`${CONTRACTS}/${ID}`)).expect(404);
  });
});
