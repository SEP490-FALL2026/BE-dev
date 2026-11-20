import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  DepartmentAvatarFileRequiredError,
  DepartmentAvatarTooLargeError,
  DepartmentAvatarTypeUnsupportedError,
} from '../../../src/modules/organization/department/department.errors';
import { DepartmentAvatarService } from '../../../src/modules/organization/department-management/department-avatar.service';
import { DepartmentQueryService } from '../../../src/modules/organization/department-management/department-query.service';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';
import { OPENAPI_DOCUMENT_BUDGET_MS } from '../../support/openapi-document-budget';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

const avatars = {
  upload: jest.fn((): Promise<void> => Promise.resolve()),
  remove: jest.fn((): Promise<void> => Promise.resolve()),
};
const profile = {
  id: ID,
  code: 'P-ENG',
  name: 'Engineering',
  functionDescription: null,
  status: 'ACTIVE',
  effectiveFrom: '2026-01-01',
  costCenter: null,
  itAdmin: null,
  itAdminUsable: false,
  head: null,
  memberCount: 0,
  warnings: [],
  starting: false,
  avatarUrl: 'https://storage.example/department-avatars/a.png?sig=1',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  deactivatedAt: null,
  successor: null,
  headHistory: [],
  headHistoryHasMore: false,
};
const queries = {
  profile: jest.fn(() => Promise.resolve(profile)),
  list: jest.fn(() =>
    Promise.resolve({ items: [profile], pagination: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 } }),
  ),
};

/** The routes of the picture of a department (`QĐ-113c`): Super Admin only, one multipart file, the profile with its link as the answer. */
describe('department avatar routes (http contract, no database)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createHttpContractApp({
      overrides: [
        { token: DepartmentAvatarService, useValue: avatars },
        { token: DepartmentQueryService, useValue: queries },
      ],
    });
  }, OPENAPI_DOCUMENT_BUDGET_MS);

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => jest.clearAllMocks());

  const asSuperAdmin = (req: request.Test) => req.set('Authorization', bearer(principal(['SUPER_ADMIN'])));

  it('passes the bytes and the declared type, and answers the profile with avatarUrl', async () => {
    const response = await asSuperAdmin(
      request(app.getHttpServer())
        .put(`/api/v1/departments/${ID}/avatar`)
        .attach('file', PNG, { filename: 'd.png', contentType: 'image/png' }),
    ).expect(200);

    expect(avatars.upload).toHaveBeenCalledWith(expect.anything(), ID, {
      bytes: PNG,
      declaredContentType: 'image/png',
    });
    expect((response.body as { data: { avatarUrl: string } }).data.avatarUrl).toBe(profile.avatarUrl);
    expect(bodyOf(response).message).toBe('DEPARTMENT.AVATAR_CHANGED');
  });

  it('turns the refusal of the service into its code', async () => {
    avatars.upload.mockRejectedValueOnce(new DepartmentAvatarFileRequiredError());

    const response = await asSuperAdmin(request(app.getHttpServer()).put(`/api/v1/departments/${ID}/avatar`)).expect(
      422,
    );

    expect(bodyOf(response).error.code).toBe('DEPARTMENT.AVATAR_FILE_REQUIRED');
  });

  it('removes the picture and answers the profile', async () => {
    const response = await asSuperAdmin(request(app.getHttpServer()).delete(`/api/v1/departments/${ID}/avatar`)).expect(
      200,
    );

    expect(avatars.remove).toHaveBeenCalledWith(expect.anything(), ID);
    expect(bodyOf(response).message).toBe('DEPARTMENT.AVATAR_REMOVED');
  });

  it('puts the link of the picture in the list and in the detail of a department, null when it has none', async () => {
    const list = await asSuperAdmin(request(app.getHttpServer()).get('/api/v1/departments')).expect(200);
    expect((list.body as { data: { items: Array<{ avatarUrl: string | null }> } }).data.items[0].avatarUrl).toBe(
      profile.avatarUrl,
    );
    const detail = await asSuperAdmin(request(app.getHttpServer()).get(`/api/v1/departments/${ID}`)).expect(200);
    expect((detail.body as { data: { avatarUrl: string | null } }).data.avatarUrl).toBe(profile.avatarUrl);

    queries.profile.mockResolvedValueOnce({ ...profile, avatarUrl: null } as unknown as typeof profile);
    const bare = await asSuperAdmin(request(app.getHttpServer()).get(`/api/v1/departments/${ID}`)).expect(200);
    expect((bare.body as { data: { avatarUrl: string | null } }).data.avatarUrl).toBeNull();
  });

  it('answers 413 and 415 with their codes for a picture the service refuses', async () => {
    const put = () =>
      asSuperAdmin(
        request(app.getHttpServer())
          .put(`/api/v1/departments/${ID}/avatar`)
          .attach('file', PNG, { filename: 'd.png', contentType: 'image/png' }),
      );
    avatars.upload.mockRejectedValueOnce(new DepartmentAvatarTooLargeError());
    expect(bodyOf(await put().expect(413)).error.code).toBe('DEPARTMENT.AVATAR_TOO_LARGE');
    avatars.upload.mockRejectedValueOnce(new DepartmentAvatarTypeUnsupportedError());
    expect(bodyOf(await put().expect(415)).error.code).toBe('DEPARTMENT.AVATAR_TYPE_UNSUPPORTED');
  });

  it('stops a file much larger than one megabyte at the parser, before the service is asked', async () => {
    const huge = Buffer.alloc(1024 * 1024 + 2, 1);

    await asSuperAdmin(
      request(app.getHttpServer())
        .put(`/api/v1/departments/${ID}/avatar`)
        .attach('file', huge, { filename: 'd.png', contentType: 'image/png' }),
    ).expect(413);

    expect(avatars.upload).not.toHaveBeenCalled();
  });

  it('refuses a second file or an extra field of the form with 400', async () => {
    await asSuperAdmin(
      request(app.getHttpServer())
        .put(`/api/v1/departments/${ID}/avatar`)
        .attach('file', PNG, { filename: 'a.png', contentType: 'image/png' })
        .attach('file', PNG, { filename: 'b.png', contentType: 'image/png' }),
    ).expect(400);
    await asSuperAdmin(
      request(app.getHttpServer())
        .put(`/api/v1/departments/${ID}/avatar`)
        .field('note', 'x')
        .attach('file', PNG, { filename: 'a.png', contentType: 'image/png' }),
    ).expect(400);

    expect(avatars.upload).not.toHaveBeenCalled();
  });
});
