import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';

type Call = (server: App) => request.Test;

/** Every route of the dictionary (US-04-07 AC-4: only the IT Admin). */
const ROUTES: Array<[string, Call]> = [
  ['GET /vendor-dictionary/groups', (s) => request(s).get('/api/v1/vendor-dictionary/groups')],
  [
    'POST /vendor-dictionary/groups',
    (s) => request(s).post('/api/v1/vendor-dictionary/groups').send({ name: 'Figma' }),
  ],
  [
    'PATCH /vendor-dictionary/groups/{id}',
    (s) => request(s).patch(`/api/v1/vendor-dictionary/groups/${ID}`).send({ name: 'Figma' }),
  ],
  [
    'POST /vendor-dictionary/groups/{id}/service-lines',
    (s) => request(s).post(`/api/v1/vendor-dictionary/groups/${ID}/service-lines`).send({ name: 'Figma' }),
  ],
  [
    'PATCH /vendor-dictionary/service-lines/{id}',
    (s) => request(s).patch(`/api/v1/vendor-dictionary/service-lines/${ID}`).send({ name: 'Figma' }),
  ],
  ['GET /vendor-dictionary/suggestions', (s) => request(s).get('/api/v1/vendor-dictionary/suggestions?name=figma')],
  [
    'POST /vendor-dictionary/normalizations',
    (s) => request(s).post('/api/v1/vendor-dictionary/normalizations').send({ kind: 'DOMAIN', value: 'figma.com' }),
  ],
  ['GET /vendor-dictionary/proposals', (s) => request(s).get('/api/v1/vendor-dictionary/proposals')],
  [
    'POST /vendor-dictionary/proposals/{id}/resolutions',
    (s) => request(s).post(`/api/v1/vendor-dictionary/proposals/${ID}/resolutions`).send({ outcome: 'DISMISSED' }),
  ],
];

describe('vendor dictionary routes (e2e, no database)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createHttpContractApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  it.each(ROUTES)('%s without a token is 401', async (_name, call) => {
    const response = await call(app.getHttpServer()).expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it.each([
    ['Finance', ['FINANCE'], []],
    ['the Super Admin, who never does business work (SoD-1)', ['SUPER_ADMIN'], []],
    ['an employee (AC-4)', ['EMPLOYEE'], []],
    ['an account with no role', [], []],
    ['a department head, whose role is derived', [], ['MANAGER']],
    ['the spending approver, whose role is derived', [], ['SPENDING_APPROVER']],
  ])('refuses %s on every route with 403', async (_name, direct, derived) => {
    for (const [route, call] of ROUTES) {
      const response = await call(app.getHttpServer())
        .set('Authorization', bearer(principal(direct, derived)))
        .expect(403);
      expect({ route, code: bodyOf(response).error.code }).toEqual({ route, code: 'AUTHORIZATION.FORBIDDEN' });
    }
  });

  describe('validation', () => {
    const asIt = () => ({ Authorization: bearer(principal(['IT_ADMIN'])) });

    it.each([
      ['no name', '/api/v1/vendor-dictionary/groups', {}],
      ['a name that is not text', '/api/v1/vendor-dictionary/groups', { name: 7 }],
      ['brand domains that are not a list', '/api/v1/vendor-dictionary/groups', { name: 'A', brandDomains: 'x.com' }],
      ['an unknown field', '/api/v1/vendor-dictionary/groups', { name: 'A', status: 'X' }],
      ['no name for a line', `/api/v1/vendor-dictionary/groups/${ID}/service-lines`, {}],
      [
        'patterns that are not text',
        `/api/v1/vendor-dictionary/groups/${ID}/service-lines`,
        { name: 'A', patterns: [1] },
      ],
      ['no kind', '/api/v1/vendor-dictionary/normalizations', { value: 'figma.com' }],
      ['a kind that is not one', '/api/v1/vendor-dictionary/normalizations', { kind: 'NAME', value: 'x' }],
      ['no value', '/api/v1/vendor-dictionary/normalizations', { kind: 'DOMAIN' }],
      [
        'a value that is far too long',
        '/api/v1/vendor-dictionary/normalizations',
        { kind: 'DOMAIN', value: 'x'.repeat(501) },
      ],
      ['no outcome', `/api/v1/vendor-dictionary/proposals/${ID}/resolutions`, {}],
      ['an outcome that is not one', `/api/v1/vendor-dictionary/proposals/${ID}/resolutions`, { outcome: 'MAYBE' }],
      [
        'a line that is not a uuid',
        `/api/v1/vendor-dictionary/proposals/${ID}/resolutions`,
        { outcome: 'ACCEPTED', serviceLineId: 'x' },
      ],
    ])('turns away a POST with %s, 422 VALIDATION_ERROR', async (_name, path, body) => {
      const response = await request(app.getHttpServer()).post(path).set(asIt()).send(body).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it.each([
      ['PATCH group', (s: App) => request(s).patch('/api/v1/vendor-dictionary/groups/not-a-uuid').send({ name: 'x' })],
      [
        'PATCH line',
        (s: App) => request(s).patch('/api/v1/vendor-dictionary/service-lines/not-a-uuid').send({ name: 'x' }),
      ],
      [
        'POST line',
        (s: App) => request(s).post('/api/v1/vendor-dictionary/groups/not-a-uuid/service-lines').send({ name: 'x' }),
      ],
      [
        'POST resolution',
        (s: App) =>
          request(s).post('/api/v1/vendor-dictionary/proposals/not-a-uuid/resolutions').send({ outcome: 'DISMISSED' }),
      ],
    ])('turns away %s with an id that is not a UUID, 422', async (_name, call) => {
      const response = await call(app.getHttpServer()).set(asIt()).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it.each([
      ['suggestions with no name', '/api/v1/vendor-dictionary/suggestions'],
      ['suggestions with an empty name', '/api/v1/vendor-dictionary/suggestions?name='],
      ['suggestions with an unknown parameter', '/api/v1/vendor-dictionary/suggestions?name=a&x=1'],
      ['groups with page 0', '/api/v1/vendor-dictionary/groups?page=0'],
      ['groups with a page size of 101', '/api/v1/vendor-dictionary/groups?pageSize=101'],
      ['proposals with a status that is not one', '/api/v1/vendor-dictionary/proposals?status=GONE'],
    ])('turns away %s, 422', async (_name, path) => {
      const response = await request(app.getHttpServer()).get(path).set(asIt()).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('nothing in the dictionary is deleted', () => {
    it('has no route that deletes a group, a line or a proposal: DELETE is 404, even for the IT Admin', async () => {
      for (const path of [
        `/api/v1/vendor-dictionary/groups/${ID}`,
        `/api/v1/vendor-dictionary/service-lines/${ID}`,
        `/api/v1/vendor-dictionary/proposals/${ID}`,
      ]) {
        const response = await request(app.getHttpServer())
          .delete(path)
          .set('Authorization', bearer(principal(['IT_ADMIN'])))
          .expect(404);
        expect(bodyOf(response).error.code).toBe('HTTP_NOT_FOUND');
      }
    });
  });
});
