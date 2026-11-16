import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AccountNotFoundError } from '../../../src/modules/identity-access/accounts/account.errors';
import { MeController } from '../../../src/modules/identity-access/access/me.controller';
import {
  AvatarFileRequiredError,
  AvatarInvalidError,
  AvatarNotSetError,
  AvatarTooLargeError,
  AvatarTypeUnsupportedError,
  WorkPhoneInvalidError,
} from '../../../src/modules/identity-access/profile/profile.errors';
import { AVATAR_MAX_BYTES } from '../../../src/modules/identity-access/profile/profile.policy';
import { ProfileAvatarService } from '../../../src/modules/identity-access/profile/profile-avatar.service';
import { ProfilePhoneService } from '../../../src/modules/identity-access/profile/profile-phone.service';
import { ProfileQueryService } from '../../../src/modules/identity-access/profile/profile-query.service';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';
import { OPENAPI_DOCUMENT_BUDGET_MS } from '../../support/openapi-document-budget';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const LINK = { url: 'https://storage.example/avatars/a.png?sig=1', expiresAt: '2026-11-15T10:15:00.000Z' };
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

const avatars = {
  upload: jest.fn((): Promise<unknown> => Promise.resolve({ avatar: LINK })),
  remove: jest.fn(() => Promise.resolve({ avatar: null })),
  removeByAdmin: jest.fn((): Promise<unknown> => Promise.resolve({ avatar: null })),
};
const phones = { change: jest.fn((): Promise<unknown> => Promise.resolve({ workPhone: '+84901234567' })) };
const queries = {
  lookup: jest.fn(() => Promise.resolve([{ employeeId: ID, avatar: LINK, workPhone: null }])),
  viewOf: jest.fn(() => Promise.resolve({ avatar: null, workPhone: null })),
};

/** The routes of the picture and the work phone: who may call them, what they refuse first, the codes of what the services refuse (`QĐ-111at`). */
describe('profile routes (http contract, no database)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createHttpContractApp({
      overrides: [
        { token: ProfileAvatarService, useValue: avatars },
        { token: ProfilePhoneService, useValue: phones },
        { token: ProfileQueryService, useValue: queries },
      ],
    });
  }, OPENAPI_DOCUMENT_BUDGET_MS);

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => jest.clearAllMocks());

  const as = (roles: string[], req: request.Test) => req.set('Authorization', bearer(principal(roles)));

  it.each([
    ['put', '/api/v1/me/avatar'],
    ['delete', '/api/v1/me/avatar'],
    ['patch', '/api/v1/me/profile'],
    ['post', '/api/v1/employee-profiles/lookup'],
    ['delete', `/api/v1/app-users/${ID}/avatar`],
  ] as const)('answers 401 to %s %s without a token', async (method, path) => {
    const response = await request(app.getHttpServer())[method](path).expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  describe('PUT /me/avatar', () => {
    it('passes the bytes and the type the file declared, for any account', async () => {
      const response = await as(
        ['EMPLOYEE'],
        request(app.getHttpServer())
          .put('/api/v1/me/avatar')
          .attach('file', PNG, { filename: 'me.png', contentType: 'image/png' }),
      ).expect(200);

      expect(avatars.upload).toHaveBeenCalledWith(expect.anything(), { bytes: PNG, declaredContentType: 'image/png' });
      expect(bodyOf(response).data).toEqual({ avatar: LINK });
    });

    it('hands the service nothing when the form has no file, and says the code it answers', async () => {
      avatars.upload.mockRejectedValueOnce(new AvatarFileRequiredError());

      const response = await as(['EMPLOYEE'], request(app.getHttpServer()).put('/api/v1/me/avatar')).expect(422);

      expect(avatars.upload).toHaveBeenCalledWith(expect.anything(), undefined);
      expect(bodyOf(response).error.code).toBe('PROFILE.AVATAR_FILE_REQUIRED');
    });

    it.each([
      [new AvatarTooLargeError(), 413, 'PROFILE.AVATAR_TOO_LARGE'],
      [new AvatarTypeUnsupportedError(), 415, 'PROFILE.AVATAR_TYPE_UNSUPPORTED'],
      [new AvatarInvalidError('EMPTY'), 422, 'PROFILE.AVATAR_EMPTY'],
      [new AvatarInvalidError('TYPE_MISMATCH'), 422, 'PROFILE.AVATAR_TYPE_MISMATCH'],
    ])('answers %s with %i %s', async (error, status, code) => {
      avatars.upload.mockRejectedValueOnce(error);

      const response = await as(
        ['EMPLOYEE'],
        request(app.getHttpServer())
          .put('/api/v1/me/avatar')
          .attach('file', PNG, { filename: 'me.png', contentType: 'image/png' }),
      ).expect(status);

      expect(bodyOf(response).error.code).toBe(code);
    });

    it('answers 413 HTTP_PAYLOAD_TOO_LARGE for a file the parser stops at once, a byte over the limit and more, and never reaches the service (PF1-03)', async () => {
      const huge = Buffer.alloc(AVATAR_MAX_BYTES + 2, 1);

      const response = await as(
        ['EMPLOYEE'],
        request(app.getHttpServer())
          .put('/api/v1/me/avatar')
          .attach('file', huge, { filename: 'me.png', contentType: 'image/png' }),
      ).expect(413);

      expect(bodyOf(response).error.code).toBe('HTTP_PAYLOAD_TOO_LARGE');
      expect(avatars.upload).not.toHaveBeenCalled();
    });

    it('is never cached: the answer carries a signed link (PF1-02)', async () => {
      const response = await as(
        ['EMPLOYEE'],
        request(app.getHttpServer())
          .put('/api/v1/me/avatar')
          .attach('file', PNG, { filename: 'me.png', contentType: 'image/png' }),
      ).expect(200);

      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('refuses a form with a text field or a second file before the service is reached (400)', async () => {
      await as(
        ['EMPLOYEE'],
        request(app.getHttpServer())
          .put('/api/v1/me/avatar')
          .field('note', 'x')
          .attach('file', PNG, { filename: 'me.png', contentType: 'image/png' }),
      ).expect(400);
      expect(avatars.upload).not.toHaveBeenCalled();
    });
  });

  it('removes my own picture and answers a null link', async () => {
    const response = await as(['MANAGER'], request(app.getHttpServer()).delete('/api/v1/me/avatar')).expect(200);

    expect(bodyOf(response).data).toEqual({ avatar: null });
  });

  describe('PATCH /me/profile', () => {
    it('changes the phone, or clears it with null', async () => {
      await as(
        ['EMPLOYEE'],
        request(app.getHttpServer()).patch('/api/v1/me/profile').send({ workPhone: '+84 90 123 4567' }),
      ).expect(200);
      await as(['EMPLOYEE'], request(app.getHttpServer()).patch('/api/v1/me/profile').send({ workPhone: null })).expect(
        200,
      );

      expect(phones.change.mock.calls.map((call) => (call as unknown[])[1])).toEqual(['+84 90 123 4567', null]);
    });

    it.each([
      ['a number', { workPhone: 123 }],
      ['a field nobody defined', { workPhone: '0901234567', fullName: 'X' }],
      ['no field at all', {}],
    ])('refuses %s (422)', async (_name, body) => {
      await as(['EMPLOYEE'], request(app.getHttpServer()).patch('/api/v1/me/profile').send(body)).expect(422);
      expect(phones.change).not.toHaveBeenCalled();
    });

    it('answers the code of a number that is not 8 to 15 digits', async () => {
      phones.change.mockRejectedValueOnce(new WorkPhoneInvalidError());

      const response = await as(
        ['EMPLOYEE'],
        request(app.getHttpServer()).patch('/api/v1/me/profile').send({ workPhone: 'abc' }),
      ).expect(422);

      expect(bodyOf(response).error.code).toBe('PROFILE.WORK_PHONE_INVALID');
    });
  });

  describe('POST /employee-profiles/lookup', () => {
    const lookup = (body: unknown) =>
      as(
        ['EMPLOYEE'],
        request(app.getHttpServer())
          .post('/api/v1/employee-profiles/lookup')
          .send(body as object),
      );

    it('answers for any account with one entry per employee asked', async () => {
      const response = await lookup({ employeeIds: [ID] }).expect(200);

      expect(bodyOf(response).data).toEqual({ items: [{ employeeId: ID, avatar: LINK, workPhone: null }] });
    });

    it.each([
      ['no id', { employeeIds: [] }],
      ['an id that is not a UUID', { employeeIds: ['e1'] }],
      ['a field nobody defined', { employeeIds: [ID], includeNames: true }],
      ['101 ids', { employeeIds: Array.from({ length: 101 }, () => ID) }],
    ])('refuses %s (422)', async (_name, body) => {
      await lookup(body).expect(422);
      expect(queries.lookup).not.toHaveBeenCalled();
    });

    it('is never cached: the entries carry signed links (PF1-02)', async () => {
      const response = await lookup({ employeeIds: [ID] }).expect(200);

      expect(response.headers['cache-control']).toBe('no-store');
    });

    it('accepts exactly 100 ids', async () => {
      await lookup({ employeeIds: Array.from({ length: 100 }, () => ID) }).expect(200);
    });
  });

  describe('DELETE /app-users/{id}/avatar', () => {
    const remove = (role: string, body: unknown, id = ID) =>
      as(
        [role],
        request(app.getHttpServer())
          .delete(`/api/v1/app-users/${id}/avatar`)
          .send(body as object),
      );

    it.each([['EMPLOYEE'], ['MANAGER'], ['IT_ADMIN'], ['FINANCE'], ['SPENDING_APPROVER']])(
      'refuses %s with 403',
      async (role) => {
        expect((await remove(role, { reason: 'x' })).status).toBe(403);
        expect(avatars.removeByAdmin).not.toHaveBeenCalled();
      },
    );

    it('lets the Super Admin remove it with a reason, which is passed on', async () => {
      await remove('SUPER_ADMIN', { reason: 'Ảnh không phù hợp' }).expect(200);

      expect(avatars.removeByAdmin).toHaveBeenCalledWith(expect.anything(), ID, 'Ảnh không phù hợp');
    });

    it.each([
      ['no reason', {}],
      ['a blank reason', { reason: '   ' }],
    ])('refuses %s (422)', async (_name, body) => {
      await remove('SUPER_ADMIN', body).expect(422);
      expect(avatars.removeByAdmin).not.toHaveBeenCalled();
    });

    it('refuses an id that is not a UUID (422)', async () => {
      await remove('SUPER_ADMIN', { reason: 'x' }, 'u1').expect(422);
    });

    it('answers 404 for an unknown account and 409 for an account with no picture', async () => {
      avatars.removeByAdmin.mockRejectedValueOnce(new AccountNotFoundError());
      expect(bodyOf(await remove('SUPER_ADMIN', { reason: 'x' }).expect(404)).error.code).toBe('APP_USER.NOT_FOUND');
      avatars.removeByAdmin.mockRejectedValueOnce(new AvatarNotSetError());
      expect(bodyOf(await remove('SUPER_ADMIN', { reason: 'x' }).expect(409)).error.code).toBe(
        'PROFILE.AVATAR_NOT_SET',
      );
    });
  });

  it('says GET /me is never cached either, for it carries the link to the picture (PF1-02)', () => {
    const handler: unknown = Object.getOwnPropertyDescriptor(MeController.prototype, 'get')?.value;
    const headers = Reflect.getMetadata('__headers__', handler as object) as { name: string; value: string }[];

    expect(headers).toContainEqual({ name: 'Cache-Control', value: 'no-store' });
  });
});
