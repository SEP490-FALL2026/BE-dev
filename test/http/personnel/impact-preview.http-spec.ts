import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { createOpenApiDocument } from '../../../src/app/configure-application';
import { TransientDatabaseError } from '../../../src/infrastructure/database/transaction-runner';
import { DeparturePreviewService } from '../../../src/modules/personnel/impact-preview/departure-preview.service';
import { TransferPreviewService } from '../../../src/modules/personnel/impact-preview/transfer-preview.service';
import { OffboardingRefusedError } from '../../../src/modules/personnel/offboarding/offboarding.errors';
import { PersonnelAccessRefusedError } from '../../../src/modules/personnel/public/personnel.errors';
import { TransferRefusedError } from '../../../src/modules/personnel/transfer/transfer.errors';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';
import { OPENAPI_DOCUMENT_BUDGET_MS } from '../../support/openapi-document-budget';

const EMPLOYEE = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const DEPARTMENT = '7a1e9c0d-5b3f-4c2d-9e6a-3f0c7d549e1b';
const NOTE = 'Quyết định số QD-12/2026 của phòng Nhân sự';
const RIGHT = {
  assignmentId: '5b7a1e9c-0d11-4f6a-8d2c-3f0c7d549e1b',
  application: { id: '0d115b7a-1e9c-4f6a-8d2c-3f0c7d549e1b', name: 'Figma' },
  plan: { id: '9e1b3f0c-7d54-4f6a-8d2c-5b7a1e9c0d11', name: 'Team' },
  provisioningType: 'K2',
  revocable: true,
  dataLossOnRemoval: false,
  revocationNote: null,
  revocationUnderWay: false,
};
const IMPACT = {
  rightsToRevoke: [RIGHT],
  openRequestsToCancel: [
    { requestId: '1e9c0d11-5b7a-4f6a-8d2c-3f0c7d549e1b', type: 'GRANT', state: 'WAITING', line: false },
  ],
  provisioningInFlight: [],
  commitmentToRelease: [{ currency: 'VND', amountMinor: '5000000' }],
  responsibilities: { subscriptions: 1, applications: 2 },
  vendorAdminRoles: ['Figma / Team (OWNER)'],
  headSuccessorRequired: false,
};
const DEPARTURE = { ...IMPACT, revocationDueOn: '2026-11-13' };
const TRANSFER = { ...IMPACT, graceEndsOn: '2026-11-20', graceReminderOn: '2026-11-18' };
const DEPARTURE_BODY = {
  employeeId: EMPLOYEE,
  lastWorkingDay: '2026-11-12',
  accessBlockMode: 'WITH_LAST_DAY',
  groundsNote: NOTE,
};
const TRANSFER_BODY = {
  employeeId: EMPLOYEE,
  toDepartmentId: DEPARTMENT,
  effectiveOn: '2026-11-16',
  groundsNote: NOTE,
};
const DEPARTURE_PATH = '/api/v1/offboarding-cases/preview';
const TRANSFER_PATH = '/api/v1/department-transfers/preview';

const ROUTES = [
  {
    name: 'departure',
    path: DEPARTURE_PATH,
    body: DEPARTURE_BODY,
    answer: DEPARTURE,
    message: 'OFFBOARDING_CASE.PREVIEWED',
  },
  {
    name: 'transfer',
    path: TRANSFER_PATH,
    body: TRANSFER_BODY,
    answer: TRANSFER,
    message: 'DEPARTMENT_TRANSFER.PREVIEWED',
  },
];

/**
 * RD.3 (P23): the contract of the two previews, with their services replaced, so what is proved here is the route: who may call it, the body it refuses
 * (the very bodies of the records), the shape and message of the answer, the refusals of the record answered with the codes of the record, and the document.
 * What the preview reads and that it writes nothing is proved on PostgreSQL.
 */
describe('previews of a departure and of a transfer (e2e, no database)', () => {
  let app: INestApplication<App>;
  const departure = jest.fn();
  const transfer = jest.fn();
  const service = (route: (typeof ROUTES)[number]) => (route.name === 'departure' ? departure : transfer);

  beforeAll(async () => {
    app = await createHttpContractApp({
      overrides: [
        { token: DeparturePreviewService, useValue: { preview: departure } },
        { token: TransferPreviewService, useValue: { preview: transfer } },
      ],
    });
  });

  beforeEach(() => {
    departure.mockReset().mockResolvedValue(DEPARTURE);
    transfer.mockReset().mockResolvedValue(TRANSFER);
  });

  afterAll(async () => {
    await app?.close();
  });

  describe.each(ROUTES)('the preview of a $name', (route) => {
    it('without a token is 401', async () => {
      await request(app.getHttpServer()).post(route.path).send(route.body).expect(401);
      expect(service(route)).not.toHaveBeenCalled();
    });

    it.each(['EMPLOYEE', 'MANAGER', 'IT_ADMIN', 'FINANCE', 'SPENDING_APPROVER'])(
      'refuses the role %s with 403 before reading anything',
      async (role) => {
        const response = await request(app.getHttpServer())
          .post(route.path)
          .set('Authorization', bearer(principal([role])))
          .send(route.body)
          .expect(403);

        expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
        expect(service(route)).not.toHaveBeenCalled();
      },
    );

    it('answers the Super Admin with 200 (nothing is created) under its message, for the body and the caller', async () => {
      const caller = principal(['SUPER_ADMIN'], { employeeId: 'sa-1' });
      const response = await request(app.getHttpServer())
        .post(route.path)
        .set('Authorization', bearer(caller))
        .send(route.body)
        .expect(200);

      expect(response.body).toEqual({ success: true, message: route.message, data: route.answer });
      const asked = service(route).mock.calls[0] as [
        { kind: string; principal: { employeeId: string; roles: string[] } },
        unknown,
      ];
      expect([asked[0].kind, asked[0].principal.employeeId, asked[0].principal.roles, asked[1]]).toEqual([
        'USER',
        'sa-1',
        ['SUPER_ADMIN'],
        route.body,
      ]);
    });

    it.each([
      ['no body', {}],
      ['a person that is not an id', { employeeId: 'not-an-id' }],
      ['a basis that is blank', { groundsNote: '   ' }],
      ['a basis over 500 characters', { groundsNote: 'x'.repeat(501) }],
      ['a field the record does not know', { surprise: true }],
    ])('refuses %s with 422 before any work, as the record does', async (_name, patch) => {
      const body = _name === 'no body' ? {} : { ...route.body, ...patch };
      const response = await request(app.getHttpServer())
        .post(route.path)
        .set('Authorization', bearer(principal(['SUPER_ADMIN'])))
        .send(body)
        .expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
      expect(service(route)).not.toHaveBeenCalled();
    });

    it('answers 503 when the database cannot answer, without detail', async () => {
      service(route).mockRejectedValueOnce(new TransientDatabaseError('57P01', new Error('terminating connection')));

      const response = await request(app.getHttpServer())
        .post(route.path)
        .set('Authorization', bearer(principal(['SUPER_ADMIN'])))
        .send(route.body)
        .expect(503);

      expect(bodyOf(response).error.code).toBe('SERVICE_UNAVAILABLE');
      expect(JSON.stringify(response.body)).not.toContain('terminating');
    });

    it('answers a refusal about themselves as the record does: 403 PERSONNEL.SELF_CHANGE_FORBIDDEN', async () => {
      service(route).mockRejectedValueOnce(new PersonnelAccessRefusedError('SELF_CHANGE_FORBIDDEN'));

      const response = await request(app.getHttpServer())
        .post(route.path)
        .set('Authorization', bearer(principal(['SUPER_ADMIN'])))
        .send(route.body)
        .expect(403);

      expect(bodyOf(response).error.code).toBe('PERSONNEL.SELF_CHANGE_FORBIDDEN');
    });
  });

  it('answers the refusals of the record with the codes of the record: the departure as OFFBOARDING_CASE.*', async () => {
    departure.mockRejectedValueOnce(new OffboardingRefusedError('EMPLOYEE_NOT_FOUND'));
    departure.mockRejectedValueOnce(new OffboardingRefusedError('EMPLOYEE_LEFT'));

    const missing = await request(app.getHttpServer())
      .post(DEPARTURE_PATH)
      .set('Authorization', bearer(principal(['SUPER_ADMIN'])))
      .send(DEPARTURE_BODY);
    const gone = await request(app.getHttpServer())
      .post(DEPARTURE_PATH)
      .set('Authorization', bearer(principal(['SUPER_ADMIN'])))
      .send(DEPARTURE_BODY);

    expect([missing.status, bodyOf(missing).error.code]).toEqual([404, 'OFFBOARDING_CASE.EMPLOYEE_NOT_FOUND']);
    expect([gone.status, bodyOf(gone).error.code]).toEqual([409, 'OFFBOARDING_CASE.EMPLOYEE_LEFT']);
  });

  it('answers the refusals of the record with the codes of the record: the transfer as DEPARTMENT_TRANSFER.*', async () => {
    transfer.mockRejectedValueOnce(new TransferRefusedError('EMPLOYEE_NOT_FOUND'));
    transfer.mockRejectedValueOnce(new TransferRefusedError('NO_CHANGE'));

    const missing = await request(app.getHttpServer())
      .post(TRANSFER_PATH)
      .set('Authorization', bearer(principal(['SUPER_ADMIN'])))
      .send(TRANSFER_BODY);
    const same = await request(app.getHttpServer())
      .post(TRANSFER_PATH)
      .set('Authorization', bearer(principal(['SUPER_ADMIN'])))
      .send(TRANSFER_BODY);

    expect([missing.status, bodyOf(missing).error.code]).toEqual([404, 'DEPARTMENT_TRANSFER.EMPLOYEE_NOT_FOUND']);
    expect([same.status, bodyOf(same).error.code]).toEqual([422, 'DEPARTMENT_TRANSFER.NO_CHANGE']);
  });

  it(
    'does not take the place of the routes of the record: a person id is not "preview", and the record route is still the one that creates',
    () => {
      const document = createOpenApiDocument(app);
      const departureRoute = document.paths[DEPARTURE_PATH] as {
        post: { operationId: string; responses: Record<string, unknown> };
      };
      const transferRoute = document.paths[TRANSFER_PATH] as {
        post: { operationId: string; responses: Record<string, unknown> };
      };
      const record = document.paths['/api/v1/offboarding-cases'] as { post: { responses: Record<string, unknown> } };

      expect(departureRoute.post.operationId).toBe('offboardingCasePreview');
      expect(transferRoute.post.operationId).toBe('departmentTransferPreview');
      // A preview creates nothing, so it answers 200; the record answers 201.
      expect(Object.keys(departureRoute.post.responses)).toContain('200');
      expect(Object.keys(departureRoute.post.responses)).not.toContain('201');
      expect(Object.keys(record.post.responses)).toContain('201');
    },
    OPENAPI_DOCUMENT_BUDGET_MS,
  );
});
