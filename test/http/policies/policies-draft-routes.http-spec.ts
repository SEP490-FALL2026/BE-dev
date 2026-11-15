import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { LibraryDraftService } from '../../../src/modules/policies/library/library-draft.service';
import { LibraryPublishService } from '../../../src/modules/policies/library/library-publish.service';
import { PolicyDraftNotFoundError } from '../../../src/modules/policies/library/library.errors';
import type { PolicyVersionRecord, PublishedVersionRecord } from '../../../src/modules/policies/library/library.types';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';
import { OPENAPI_DOCUMENT_BUDGET_MS } from '../../support/openapi-document-budget';

const POLICIES = '/api/v1/policies';
const DRAFT = `${POLICIES}/POL-MF1/draft`;

const CONTENT = { sections: [{ heading: 'Mục đích', body: 'Cấp đúng công cụ.' }], steps: [] };
const draft: PolicyVersionRecord = {
  id: 'd1',
  policyId: 'p1',
  policyCode: 'POL-MF1',
  versionNumber: null,
  title: 'Chính sách cấp phát',
  content: CONTENT,
  applicableRoles: ['MANAGER'],
  changeNote: null,
  requiresReacknowledgement: true,
  publishedByAppUserId: null,
  publishedAt: null,
  updatedAt: new Date('2026-11-15T01:00:00.000Z'),
};
const published: PublishedVersionRecord = {
  ...draft,
  versionNumber: 2,
  changeNote: 'Quyết định số 05/2026/QĐ-GĐ',
  publishedAt: new Date('2026-11-15T02:00:00.000Z'),
};

const drafts = {
  read: jest.fn(() => Promise.resolve(draft)),
  write: jest.fn(() => Promise.resolve(draft)),
  discard: jest.fn(() => Promise.resolve()),
};
const publication = { publish: jest.fn(() => Promise.resolve({ version: published, notified: 4 })) };

/** The routes of the draft and the publication of a policy: who may call them, what they refuse first, what they promise. */
describe('policy draft routes (http contract, no database)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createHttpContractApp({
      overrides: [
        { token: LibraryDraftService, useValue: drafts },
        { token: LibraryPublishService, useValue: publication },
      ],
    });
  }, OPENAPI_DOCUMENT_BUDGET_MS);

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => jest.clearAllMocks());

  const asSuperAdmin = (req: request.Test) => req.set('Authorization', bearer(principal(['SUPER_ADMIN'])));
  const PUBLISH_BODY = { changeNote: 'Quyết định số 05', applicableRoles: ['MANAGER', 'IT_ADMIN'] };

  const routes = [
    ['get', DRAFT, undefined],
    ['put', DRAFT, {}],
    ['delete', DRAFT, undefined],
    ['post', `${DRAFT}/publish`, PUBLISH_BODY],
  ] as const;

  it.each(routes)('answers 401 to %s %s without a token', async (method, path) => {
    const response = await request(app.getHttpServer())[method](path).expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it.each([['MANAGER'], ['IT_ADMIN'], ['FINANCE'], ['SPENDING_APPROVER'], ['EMPLOYEE']])(
    'refuses %s every route of the draft with 403',
    async (role) => {
      for (const [method, path, body] of routes) {
        const response = await request(app.getHttpServer())
          [method](path)
          .set('Authorization', bearer(principal([role])))
          .send(body);

        expect(response.status).toBe(403);
        expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
      }
      expect(publication.publish).not.toHaveBeenCalled();
    },
  );

  it('opens the draft with an empty body and returns it', async () => {
    const response = await asSuperAdmin(request(app.getHttpServer()).put(DRAFT).send({})).expect(200);

    expect(drafts.write).toHaveBeenCalledWith(expect.anything(), 'POL-MF1', {});
    expect(bodyOf(response).data).toMatchObject({ policyCode: 'POL-MF1', title: draft.title });
  });

  it('refuses a draft with a step that has no item (422)', async () => {
    const response = await asSuperAdmin(
      request(app.getHttpServer())
        .put(DRAFT)
        .send({ content: { sections: [], steps: [{ code: '1.2', title: 't', checklist: [] }] } }),
    ).expect(422);

    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    expect(drafts.write).not.toHaveBeenCalled();
  });

  it('refuses a field nobody defined in the draft (422)', async () => {
    await asSuperAdmin(
      request(app.getHttpServer())
        .put(DRAFT)
        .send({ applicableRoles: ['MANAGER'] }),
    ).expect(422);
  });

  it('refuses a code that is not a policy code (422)', async () => {
    await asSuperAdmin(request(app.getHttpServer()).get(`${POLICIES}/pol_mf1/draft`)).expect(422);
  });

  it('answers 404 POLICY.DRAFT_NOT_FOUND when there is nothing to publish', async () => {
    publication.publish.mockRejectedValueOnce(new PolicyDraftNotFoundError());
    const response = await asSuperAdmin(
      request(app.getHttpServer()).post(`${DRAFT}/publish`).send(PUBLISH_BODY),
    ).expect(404);

    expect(bodyOf(response).error.code).toBe('POLICY.DRAFT_NOT_FOUND');
  });

  it.each([
    ['no ground of the issue', { applicableRoles: ['MANAGER'] }],
    ['a blank ground', { changeNote: '   ', applicableRoles: ['MANAGER'] }],
    ['no role', { changeNote: 'Quyết định số 05', applicableRoles: [] }],
    ['a role named twice', { changeNote: 'Quyết định số 05', applicableRoles: ['MANAGER', 'MANAGER'] }],
    ['a role that does not exist', { changeNote: 'Quyết định số 05', applicableRoles: ['CEO'] }],
    [
      'the Super Admin among the roles (they publish, they are not asked to acknowledge)',
      { changeNote: 'Quyết định số 05', applicableRoles: ['SUPER_ADMIN', 'EMPLOYEE'] },
    ],
  ])('refuses a publication with %s (422)', async (_name, body) => {
    const response = await asSuperAdmin(request(app.getHttpServer()).post(`${DRAFT}/publish`).send(body)).expect(422);

    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    expect(publication.publish).not.toHaveBeenCalled();
  });

  it('publishes with the choice to ask again on by default and says how many were told', async () => {
    const response = await asSuperAdmin(
      request(app.getHttpServer()).post(`${DRAFT}/publish`).send(PUBLISH_BODY),
    ).expect(201);

    expect(publication.publish).toHaveBeenCalledWith(expect.anything(), 'POL-MF1', {
      changeNote: 'Quyết định số 05',
      applicableRoles: ['MANAGER', 'IT_ADMIN'],
      requiresReacknowledgement: true,
    });
    expect(bodyOf(response).data).toMatchObject({ policyCode: 'POL-MF1', versionNumber: 2, notified: 4 });
  });

  it('has no route that makes or deletes a policy (R-42)', async () => {
    const server = app.getHttpServer();

    await asSuperAdmin(request(server).post(POLICIES).send({ code: 'POL-NEW', title: 'x' })).expect(404);
    await asSuperAdmin(request(server).delete(`${POLICIES}/POL-MF1`)).expect(404);
  });
});
