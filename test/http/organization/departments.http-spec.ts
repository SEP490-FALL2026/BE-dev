import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const OTHER = '7a1c3e55-2d4b-4c8e-9f60-1b2c3d4e5f60';

type Call = (server: App) => request.Test;

/**
 * The old HR document the department routes used to take (`QĐ-93f` removed it). It is still sent to `/projects` until
 * `qd93-remove-department-projects`, and to the department routes to prove they now refuse it.
 */
const HR_BASIS_BODY = { type: 'DECISION', reference: 'QD-2026-001', issuer: 'HR Office', issuedOn: '2026-10-01' };

/** What the Super Admin alone does (`QĐ-87a`, `QĐ-87b(1)`, no HR basis since `QĐ-93f`): the IT Admin lost every one of these. */
const SUPER_ADMIN_ONLY: Array<[string, Call]> = [
  ['PATCH /departments/{id}', (server) => request(server).patch(`/api/v1/departments/${ID}`).send({ name: 'x' })],
  [
    'POST /departments/{id}/deactivate',
    (server) => request(server).post(`/api/v1/departments/${ID}/deactivate`).send({}),
  ],
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
  [
    'POST /departments/{id}/successor-designations',
    (server) =>
      request(server)
        .post(`/api/v1/departments/${ID}/successor-designations`)
        .send({ employeeId: OTHER, effectiveFrom: '2030-01-01' }),
  ],
  [
    'POST /departments/{id}/successor-clearances',
    (server) => request(server).post(`/api/v1/departments/${ID}/successor-clearances`).send({}),
  ],
  ['GET /projects', (server) => request(server).get('/api/v1/projects')],
  ['GET /projects/{id}', (server) => request(server).get(`/api/v1/projects/${ID}`)],
  [
    'POST /projects',
    (server) =>
      request(server)
        .post('/api/v1/projects')
        .send({ name: 'Alpha', departmentIds: [ID], hrBasis: HR_BASIS_BODY }),
  ],
  [
    'PATCH /projects/{id}',
    (server) => request(server).patch(`/api/v1/projects/${ID}`).send({ name: 'Beta', hrBasis: HR_BASIS_BODY }),
  ],
];

/** The list of departments and their warnings: the Super Admin, and an IT Admin for the departments in their scope (`F12`). */
const LISTS: Array<[string, Call]> = [
  ['GET /departments', (server) => request(server).get('/api/v1/departments')],
  ['GET /department-warnings', (server) => request(server).get('/api/v1/department-warnings')],
];

/** One department's profile: the Super Admin, an IT Admin in its scope, and the head of that department. */
const PROFILE: [string, Call] = ['GET /departments/{id}', (server) => request(server).get(`/api/v1/departments/${ID}`)];

/** The people of a department in full: the Super Admin and the head of that department, never the IT Admin. */
const PEOPLE: [string, Call] = [
  'GET /departments/{id}/employees',
  (server) => request(server).get(`/api/v1/departments/${ID}/employees`),
];

/** The technical view of the people (`EmployeeTechnicalView`): the IT Admin alone. */
const TECHNICAL: [string, Call] = [
  'GET /departments/{id}/technical-members',
  (server) => request(server).get(`/api/v1/departments/${ID}/technical-members`),
];

const NO_ROLE_OF_THEIR_OWN: Array<[string, string[], string[]]> = [
  ['the finance officer', ['FINANCE'], []],
  ['an employee', ['EMPLOYEE'], []],
  ['an account with no role', [], []],
  ['a department head, whose role is derived', [], ['MANAGER']],
  ['the spending approver, whose role is derived', [], ['SPENDING_APPROVER']],
];

describe('department routes (e2e, no database)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createHttpContractApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it.each([...SUPER_ADMIN_ONLY, ...LISTS, PROFILE, PEOPLE, TECHNICAL])(
    '%s without a token is 401',
    async (_name, call) => {
      const response = await call(app.getHttpServer()).expect(401);

      expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
    },
  );

  describe('who may change department data: the Super Admin alone (QĐ-87a, US-03-06 AC-16)', () => {
    it.each([
      ['the IT Admin, who keeps the technical work only and lost every write (F10)', ['IT_ADMIN'], []],
      ...NO_ROLE_OF_THEIR_OWN,
    ])('refuses %s on every Super Admin route with 403', async (_name, direct, derived) => {
      for (const [route, call] of SUPER_ADMIN_ONLY) {
        const response = await call(app.getHttpServer())
          .set('Authorization', bearer(principal(direct, derived)))
          .expect(403);
        expect({ route, code: bodyOf(response).error.code }).toEqual({ route, code: 'AUTHORIZATION.FORBIDDEN' });
      }
    });
  });

  describe('who may read department data (F12)', () => {
    it.each(NO_ROLE_OF_THEIR_OWN)(
      'refuses %s the list of departments and their warnings with 403',
      async (_name, direct, derived) => {
        for (const [route, call] of LISTS) {
          const response = await call(app.getHttpServer())
            .set('Authorization', bearer(principal(direct, derived)))
            .expect(403);
          expect({ route, code: bodyOf(response).error.code }).toEqual({ route, code: 'AUTHORIZATION.FORBIDDEN' });
        }
      },
    );

    it.each(NO_ROLE_OF_THEIR_OWN.filter(([, , derived]) => !derived.includes('MANAGER')))(
      'refuses %s the profile of a department with 403: only the Super Admin, an IT Admin in its scope and its head read it',
      async (_name, direct, derived) => {
        const [route, call] = PROFILE;

        const response = await call(app.getHttpServer())
          .set('Authorization', bearer(principal(direct, derived)))
          .expect(403);

        expect({ route, code: bodyOf(response).error.code }).toEqual({ route, code: 'AUTHORIZATION.FORBIDDEN' });
      },
    );

    it.each([
      ['the IT Admin, who reads the technical view instead', ['IT_ADMIN'], []],
      ...NO_ROLE_OF_THEIR_OWN.filter(([, , derived]) => !derived.includes('MANAGER')),
    ])('refuses %s the people of a department in full with 403', async (_name, direct, derived) => {
      const [route, call] = PEOPLE;

      const response = await call(app.getHttpServer())
        .set('Authorization', bearer(principal(direct, derived)))
        .expect(403);

      expect({ route, code: bodyOf(response).error.code }).toEqual({ route, code: 'AUTHORIZATION.FORBIDDEN' });
    });

    it.each([['the Super Admin, who reads the people in full', ['SUPER_ADMIN'], []], ...NO_ROLE_OF_THEIR_OWN])(
      'refuses %s the technical view of the people with 403: it is for the IT Admin alone',
      async (_name, direct, derived) => {
        const [route, call] = TECHNICAL;

        const response = await call(app.getHttpServer())
          .set('Authorization', bearer(principal(direct, derived)))
          .expect(403);

        expect({ route, code: bodyOf(response).error.code }).toEqual({ route, code: 'AUTHORIZATION.FORBIDDEN' });
      },
    );
  });

  describe('creating a department belongs to the Super Admin (QĐ-87b, QĐ-87d(1))', () => {
    const body = { code: 'P-DES', name: 'Design' };

    it.each([
      ['the finance officer', ['FINANCE'], []],
      ['the IT Admin, who keeps the technical work only', ['IT_ADMIN'], []],
      ['an employee', ['EMPLOYEE'], []],
      ['an account with no role', [], []],
      ['a department head, whose role is derived', [], ['MANAGER']],
      ['the spending approver, whose role is derived', [], ['SPENDING_APPROVER']],
    ])('refuses %s with 403', async (_name, direct, derived) => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/departments')
        .set('Authorization', bearer(principal(direct, derived)))
        .send(body)
        .expect(403);

      expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
    });

    it('needs a token', async () => {
      const response = await request(app.getHttpServer()).post('/api/v1/departments').send(body).expect(401);

      expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
    });
  });

  describe('validation', () => {
    const asIt = () => ({ Authorization: bearer(principal(['IT_ADMIN'])) });
    const asSuperAdmin = () => ({ Authorization: bearer(principal(['SUPER_ADMIN'])) });

    it.each([
      ['no code', { name: 'Design' }],
      ['a code with a space', { code: 'P DES', name: 'Design' }],
      ['no name', { code: 'P-DES' }],
      [
        'an HR basis, which no department write takes since QĐ-93f',
        { code: 'P-DES', name: 'Design', hrBasis: HR_BASIS_BODY },
      ],
      [
        'a cost center, which a department is not created with (QĐ-87d(1))',
        { code: 'P-DES', name: 'Design', costCenterId: OTHER },
      ],
      ['a parent department, which does not exist (AC-3)', { code: 'P-DES', name: 'Design', parentId: ID }],
      ['an unknown field', { code: 'P-DES', name: 'Design', status: 'INACTIVE' }],
      ['a name of 201 characters (API-DOC-F05)', { code: 'P-DES', name: 'x'.repeat(201) }],
      ['a function of 1 001 characters (API-DOC-F05)', { code: 'P-DES', name: 'Design', function: 'x'.repeat(1001) }],
      ['a name of 201 accented letters typed in NFD form', { code: 'P-DES', name: 'á'.repeat(201) }],
    ])('turns away a new department with %s, 422 VALIDATION_ERROR', async (_name, body) => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/departments')
        .set(asSuperAdmin())
        .send(body)
        .expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it.each([
      ['a new cost center, which an edit cannot change (AC-4)', { costCenterId: OTHER }],
      ['a new code', { code: 'P-NEW' }],
      ['a parent', { parentId: ID }],
      ['a status', { status: 'INACTIVE' }],
      ['an HR basis, which no department write takes since QĐ-93f', { name: 'Design', hrBasis: HR_BASIS_BODY }],
      ['a name of 201 characters (API-DOC-F05)', { name: 'x'.repeat(201) }],
      ['a function of 1 001 characters (API-DOC-F05)', { function: 'x'.repeat(1001) }],
    ])('turns away an update that names %s, 422 VALIDATION_ERROR', async (_name, body) => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/departments/${ID}`)
        .set(asSuperAdmin())
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
      ['an HR basis (QĐ-93f)', { employeeId: OTHER, effectiveFrom: '2030-01-01', hrBasis: HR_BASIS_BODY }],
    ])('turns away a head assignment with %s, 422 VALIDATION_ERROR', async (_name, body) => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/departments/${ID}/head-assignments`)
        .set(asSuperAdmin())
        .send(body)
        .expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it.each([
      ['no date', {}],
      ['an HR basis (QĐ-93f)', { effectiveFrom: '2030-01-01', hrBasis: HR_BASIS_BODY }],
    ])('turns away a head vacancy with %s, 422 VALIDATION_ERROR', async (_name, body) => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/departments/${ID}/head-vacancies`)
        .set(asSuperAdmin())
        .send(body)
        .expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it.each([
      ['no person', { effectiveFrom: '2030-01-01' }],
      ['a person that is not an id', { employeeId: 'E-1', effectiveFrom: '2030-01-01' }],
      ['no date', { employeeId: OTHER }],
      ['an unknown field', { employeeId: OTHER, effectiveFrom: '2030-01-01', title: 'Head' }],
      ['an HR basis (QĐ-93f)', { employeeId: OTHER, effectiveFrom: '2030-01-01', hrBasis: HR_BASIS_BODY }],
    ])('turns away a successor designation with %s, 422 VALIDATION_ERROR', async (_name, body) => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/departments/${ID}/successor-designations`)
        .set(asSuperAdmin())
        .send(body)
        .expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it.each([
      ['an HR basis (QĐ-93f)', { hrBasis: HR_BASIS_BODY }],
      ['an unknown field', { employeeId: OTHER }],
    ])('turns away a successor clearance with %s, 422 VALIDATION_ERROR', async (_name, body) => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/departments/${ID}/successor-clearances`)
        .set(asSuperAdmin())
        .send(body)
        .expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it.each([
      ['an HR basis (QĐ-93f)', { hrBasis: HR_BASIS_BODY }],
      ['an unknown field', { status: 'INACTIVE' }],
    ])('turns away a deactivation with %s, 422 VALIDATION_ERROR', async (_name, body) => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/departments/${ID}/deactivate`)
        .set(asSuperAdmin())
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
      await request(app.getHttpServer()).get(`/api/v1/departments${query}`).set(asIt()).expect(422);
    });

    it('turns away an id that is not a UUID, 422', async () => {
      await request(app.getHttpServer()).get('/api/v1/departments/not-a-uuid').set(asIt()).expect(422);
      await request(app.getHttpServer())
        .post('/api/v1/departments/not-a-uuid/deactivate')
        .set(asSuperAdmin())
        .send({})
        .expect(422);
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
    ])('has no %s %s: 404, even for the Super Admin', async (method, path) => {
      const response = await request(app.getHttpServer())
        [method.toLowerCase() as 'post' | 'delete'](path)
        .set('Authorization', bearer(principal(['SUPER_ADMIN'])))
        .send({})
        .expect(404);

      expect(bodyOf(response).error.code).toBe('HTTP_NOT_FOUND');
    });
  });
});
