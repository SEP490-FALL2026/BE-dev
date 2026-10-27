import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { configureApplication } from '../../src/bootstrap';
import { ACCESS_TOKEN_VERIFIER } from '../../src/infrastructure/security/tokens/access-token-verifier.port';
import { bodyOf } from '../support/api-body';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const OTHER = '7a1c3e55-2d4b-4c8e-9f60-1b2c3d4e5f60';

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

type Call = (server: App) => request.Test;

/** The HR document a department is created from (`QĐ-87b`): every part is required. */
const HR_BASIS_BODY = { type: 'DECISION', reference: 'QD-2026-001', issuer: 'HR Office', issuedOn: '2026-10-01' };

const IT_ONLY: Array<[string, Call]> = [
  ['GET /departments', (server) => request(server).get('/api/v1/departments')],
  ['PATCH /departments/{id}', (server) => request(server).patch(`/api/v1/departments/${ID}`).send({ name: 'x' })],
  ['POST /departments/{id}/deactivate', (server) => request(server).post(`/api/v1/departments/${ID}/deactivate`)],
  [
    'POST /departments/{id}/head-assignments',
    (server) =>
      request(server)
        .post(`/api/v1/departments/${ID}/head-assignments`)
        .send({ employeeId: OTHER, effectiveFrom: '2030-01-01' }),
  ],
  [
    'POST /departments/{id}/head-vacancies',
    (server) => request(server).post(`/api/v1/departments/${ID}/head-vacancies`).send({ effectiveFrom: '2030-01-01' }),
  ],
  ['GET /projects', (server) => request(server).get('/api/v1/projects')],
  [
    'POST /projects',
    (server) =>
      request(server)
        .post('/api/v1/projects')
        .send({ name: 'Alpha', departmentIds: [ID] }),
  ],
  ['PATCH /projects/{id}', (server) => request(server).patch(`/api/v1/projects/${ID}`).send({ name: 'Beta' })],
];

const IT_OR_HEAD: Array<[string, Call]> = [
  ['GET /departments/{id}', (server) => request(server).get(`/api/v1/departments/${ID}`)],
  ['GET /departments/{id}/employees', (server) => request(server).get(`/api/v1/departments/${ID}/employees`)],
];

const WARNINGS: [string, Call] = [
  'GET /department-warnings',
  (server) => request(server).get('/api/v1/department-warnings'),
];

describe('department routes (e2e, no database)', () => {
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

  it.each([...IT_ONLY, ...IT_OR_HEAD, WARNINGS])('%s without a token is 401', async (_name, call) => {
    app = await appFor(principal(['IT_ADMIN']));

    const response = await call(app.getHttpServer()).expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  describe('who may change department data (US-03-06 AC-16)', () => {
    it.each([
      ['the finance officer', ['FINANCE'], []],
      ['the Super Admin, who never does business work (SoD-1)', ['SUPER_ADMIN'], []],
      ['an employee', ['EMPLOYEE'], []],
      ['an account with no role', [], []],
      ['a department head, whose role is derived', [], ['MANAGER']],
      ['the spending approver, whose role is derived', [], ['SPENDING_APPROVER']],
    ])('refuses %s on every IT Admin route with 403', async (_name, direct, derived) => {
      app = await appFor(principal(direct, derived));

      for (const [route, call] of IT_ONLY) {
        const response = await call(app.getHttpServer()).set('Authorization', 'Bearer any').expect(403);
        expect({ route, code: bodyOf(response).error.code }).toEqual({ route, code: 'AUTHORIZATION.FORBIDDEN' });
      }
    });

    it.each([
      ['the finance officer', ['FINANCE'], []],
      ['the Super Admin', ['SUPER_ADMIN'], []],
      ['an employee', ['EMPLOYEE'], []],
      ['the spending approver', [], ['SPENDING_APPROVER']],
    ])('refuses %s the profile and the people of a department with 403', async (_name, direct, derived) => {
      app = await appFor(principal(direct, derived));

      for (const [route, call] of IT_OR_HEAD) {
        const response = await call(app.getHttpServer()).set('Authorization', 'Bearer any').expect(403);
        expect({ route, code: bodyOf(response).error.code }).toEqual({ route, code: 'AUTHORIZATION.FORBIDDEN' });
      }
    });

    it.each([
      ['the finance officer', ['FINANCE'], []],
      ['an employee', ['EMPLOYEE'], []],
      ['a department head', [], ['MANAGER']],
    ])(
      'shows the warnings to %s: no, 403 (only the IT Admin and the Super Admin see them)',
      async (_n, direct, derived) => {
        app = await appFor(principal(direct, derived));

        const [, call] = WARNINGS;
        const response = await call(app.getHttpServer()).set('Authorization', 'Bearer any').expect(403);

        expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
      },
    );
  });

  describe('creating a department belongs to the Super Admin (QĐ-87b, QĐ-87d(1))', () => {
    const body = { code: 'P-DES', name: 'Design', hrBasis: HR_BASIS_BODY };

    it.each([
      ['the finance officer', ['FINANCE'], []],
      ['the IT Admin, who keeps the technical work only', ['IT_ADMIN'], []],
      ['an employee', ['EMPLOYEE'], []],
      ['an account with no role', [], []],
      ['a department head, whose role is derived', [], ['MANAGER']],
      ['the spending approver, whose role is derived', [], ['SPENDING_APPROVER']],
    ])('refuses %s with 403', async (_name, direct, derived) => {
      app = await appFor(principal(direct, derived));

      const response = await request(app.getHttpServer())
        .post('/api/v1/departments')
        .set('Authorization', 'Bearer any')
        .send(body)
        .expect(403);

      expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
    });

    it('needs a token', async () => {
      app = await appFor(principal(['SUPER_ADMIN']));

      const response = await request(app.getHttpServer()).post('/api/v1/departments').send(body).expect(401);

      expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
    });
  });

  describe('validation', () => {
    const asIt = () => ({ Authorization: 'Bearer any' });

    it.each([
      ['no code', { name: 'Design', hrBasis: HR_BASIS_BODY }],
      ['a code with a space', { code: 'P DES', name: 'Design', hrBasis: HR_BASIS_BODY }],
      ['no name', { code: 'P-DES', hrBasis: HR_BASIS_BODY }],
      ['no HR basis', { code: 'P-DES', name: 'Design' }],
      ['an HR basis with a missing part', { code: 'P-DES', name: 'Design', hrBasis: { type: 'DECISION' } }],
      [
        'a cost center, which a department is not created with (QĐ-87d(1))',
        { code: 'P-DES', name: 'Design', hrBasis: HR_BASIS_BODY, costCenterId: OTHER },
      ],
      [
        'a parent department, which does not exist (AC-3)',
        { code: 'P-DES', name: 'Design', hrBasis: HR_BASIS_BODY, parentId: ID },
      ],
      ['an unknown field', { code: 'P-DES', name: 'Design', hrBasis: HR_BASIS_BODY, status: 'INACTIVE' }],
    ])('turns away a new department with %s, 422 VALIDATION_ERROR', async (_name, body) => {
      app = await appFor(principal(['SUPER_ADMIN']));

      const response = await request(app.getHttpServer())
        .post('/api/v1/departments')
        .set(asIt())
        .send(body)
        .expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it.each([
      ['a new cost center, which an edit cannot change (AC-4)', { costCenterId: OTHER }],
      ['a new code', { code: 'P-NEW' }],
      ['a parent', { parentId: ID }],
      ['a status', { status: 'INACTIVE' }],
    ])('turns away an update that names %s, 422 VALIDATION_ERROR', async (_name, body) => {
      app = await appFor(principal(['IT_ADMIN']));

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/departments/${ID}`)
        .set(asIt())
        .send(body)
        .expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it.each([
      ['no person', { effectiveFrom: '2030-01-01' }],
      ['a person that is not an id', { employeeId: 'E-1', effectiveFrom: '2030-01-01' }],
      ['no date', { employeeId: OTHER }],
      ['a date that is not a date', { employeeId: OTHER, effectiveFrom: '2030-02-31' }],
      ['an unknown field', { employeeId: OTHER, effectiveFrom: '2030-01-01', title: 'Head' }],
    ])('turns away a head assignment with %s, 422 VALIDATION_ERROR', async (_name, body) => {
      app = await appFor(principal(['IT_ADMIN']));

      const response = await request(app.getHttpServer())
        .post(`/api/v1/departments/${ID}/head-assignments`)
        .set(asIt())
        .send(body)
        .expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it.each([
      ['a status that is not one', '?status=DELETED'],
      ['a page size of 101', '?pageSize=101'],
      ['page 0', '?page=0'],
      ['an unknown parameter', '?organizationId=x'],
    ])('turns away a list with %s, 422', async (_name, query) => {
      app = await appFor(principal(['IT_ADMIN']));

      await request(app.getHttpServer()).get(`/api/v1/departments${query}`).set(asIt()).expect(422);
    });

    it('turns away an id that is not a UUID, 422', async () => {
      app = await appFor(principal(['IT_ADMIN']));

      await request(app.getHttpServer()).get('/api/v1/departments/not-a-uuid').set(asIt()).expect(422);
      await request(app.getHttpServer()).post('/api/v1/departments/not-a-uuid/deactivate').set(asIt()).expect(422);
    });
  });

  describe('nothing merges, splits or deletes a department (US-03-06 AC-20)', () => {
    it.each([
      ['POST', '/api/v1/departments/merge'],
      ['POST', '/api/v1/departments/split'],
      ['POST', `/api/v1/departments/${ID}/merge`],
      ['POST', `/api/v1/departments/${ID}/split`],
      ['DELETE', `/api/v1/departments/${ID}`],
      ['DELETE', '/api/v1/departments'],
    ])('has no %s %s: 404, even for an IT Admin', async (method, path) => {
      app = await appFor(principal(['IT_ADMIN']));

      const response = await request(app.getHttpServer())
        [method.toLowerCase() as 'post' | 'delete'](path)
        .set('Authorization', 'Bearer any')
        .send({})
        .expect(404);

      expect(bodyOf(response).error.code).toBe('HTTP_NOT_FOUND');
    });
  });
});
