import { INestApplication } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';
import request from 'supertest';
import { App } from 'supertest/types';
import { createOpenApiDocument } from '../../../src/app/configure-application';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';
import { OPENAPI_DOCUMENT_BUDGET_MS } from '../../support/openapi-document-budget';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const DEVICES = '/api/v1/devices';
const REGISTRATIONS = '/api/v1/device-registrations';
const ME = '/api/v1/me';
const NOTICES = '/api/v1/monitoring-notice-versions';

const NOTICE = {
  collected: 'The names of the tools used and their usage totals.',
  notCollected: 'Prompts, answers, code, files, addresses and the content of messages.',
  purpose: 'To see which licenses are used.',
  retention: 'Kept as long as the machine is registered.',
  stopRight: 'The holder may ask to stop at any time.',
  includesToolStatus: false,
  requiresReacknowledgement: false,
};

/** The routes of the register: who may call them, what they refuse before they reach a use case, and the fields they promise. */
describe('company machine routes (http contract, no database)', () => {
  let app: INestApplication<App>;
  let document: OpenAPIObject;

  beforeAll(async () => {
    app = await createHttpContractApp();
    document = createOpenApiDocument(app);
  }, OPENAPI_DOCUMENT_BUDGET_MS);

  afterAll(async () => {
    await app?.close();
  });

  const routes = [
    ['post', DEVICES, { assetCode: 'AS-1', hostname: 'h', os: 'Windows 11', holderEmployeeId: ID }],
    ['get', DEVICES, undefined],
    ['get', `${DEVICES}/${ID}`, undefined],
    ['post', `${DEVICES}/${ID}/holder-changes`, { holderEmployeeId: ID }],
    ['post', `${DEVICES}/${ID}/retirements`, { reason: 'broken' }],
    ['post', `${REGISTRATIONS}/${ID}/signature-records`, { documentId: ID, noticeVersionId: ID }],
    ['post', NOTICES, NOTICE],
    ['get', '/api/v1/monitoring-notices/current', undefined],
    ['get', `${ME}/devices`, undefined],
    ['post', `${ME}/device-registrations/${ID}/acknowledgements`, { noticeVersionId: ID }],
    ['post', `${REGISTRATIONS}/${ID}/enrollment-codes`, { collectorKind: 'AI_COLLECTOR' }],
    ['get', `${REGISTRATIONS}/${ID}/credentials`, undefined],
    ['post', `/api/v1/device-credentials/${ID}/revocations`, { reason: 'x' }],
  ] as const;

  it.each(routes)('answers 401 to %s %s without a token', async (method, path) => {
    const response = await request(app.getHttpServer())[method](path).expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it.each([
    ['the department head', ['MANAGER']],
    ['Finance', ['FINANCE']],
    ['an employee', ['EMPLOYEE']],
    ['the Super Admin, who does no technical work', ['SUPER_ADMIN']],
  ])('refuses %s every route of the register with 403', async (_name, roles) => {
    const server = app.getHttpServer();
    const as = (req: request.Test) => req.set('Authorization', bearer(principal(roles)));

    for (const response of [
      await as(request(server).post(DEVICES).send(routes[0][2])),
      await as(request(server).get(DEVICES)),
      await as(request(server).get(`${DEVICES}/${ID}`)),
      await as(request(server).post(`${DEVICES}/${ID}/holder-changes`).send({ holderEmployeeId: ID })),
      await as(request(server).post(`${DEVICES}/${ID}/retirements`).send({ reason: 'x' })),
      await as(
        request(server).post(`${REGISTRATIONS}/${ID}/signature-records`).send({ documentId: ID, noticeVersionId: ID }),
      ),
    ]) {
      expect(response.status).toBe(403);
      expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
    }
  });

  it.each([
    ['get', '/api/v1/device-session'],
    ['post', '/api/v1/device-session/rotations'],
  ] as const)('answers %s %s without a token with the device answer, never the person one', async (method, path) => {
    const response = await request(app.getHttpServer())[method](path).expect(401);

    expect(bodyOf(response).error.code).toBe('DEVICE.CREDENTIAL_INVALID');
  });

  it.each([
    ['a person token', 'Bearer test-principal.eyJ4IjoxfQ'],
    ['a malformed credential', 'Bearer sstd_nonsense'],
  ])('answers 401 DEVICE.CREDENTIAL_INVALID to %s on a device route', async (_name, authorization) => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/device-session')
      .set('Authorization', authorization)
      .expect(401);

    expect(bodyOf(response).error.code).toBe('DEVICE.CREDENTIAL_INVALID');
  });

  it.each([
    ['the department head', ['MANAGER']],
    ['Finance', ['FINANCE']],
    ['an employee', ['EMPLOYEE']],
    ['the Super Admin', ['SUPER_ADMIN']],
  ])('refuses %s the codes and the credentials of a machine with 403', async (_name, roles) => {
    const server = app.getHttpServer();
    const as = (req: request.Test) => req.set('Authorization', bearer(principal(roles)));

    for (const response of [
      await as(request(server).post(`${REGISTRATIONS}/${ID}/enrollment-codes`).send({ collectorKind: 'AI_COLLECTOR' })),
      await as(request(server).get(`${REGISTRATIONS}/${ID}/credentials`)),
      await as(request(server).post(`/api/v1/device-credentials/${ID}/revocations`).send({ reason: 'x' })),
    ]) {
      expect(response.status).toBe(403);
    }
  });

  it.each([
    ['an AI collector with a number of uses', { collectorKind: 'AI_COLLECTOR', maxUses: 2 }],
    ['a browser extension with more than five uses', { collectorKind: 'BROWSER_EXTENSION', maxUses: 6 }],
    ['a kind that does not exist', { collectorKind: 'ROBOT' }],
    ['a field the code never takes', { collectorKind: 'AI_COLLECTOR', registrationId: ID }],
  ])('refuses a code for %s with 422', async (_name, body) => {
    await request(app.getHttpServer())
      .post(`${REGISTRATIONS}/${ID}/enrollment-codes`)
      .set('Authorization', bearer(principal(['IT_ADMIN'])))
      .send(body)
      .expect(422);
  });

  it('refuses a device token on the routes of people with the answer of people', async () => {
    const response = await request(app.getHttpServer())
      .get(DEVICES)
      .set('Authorization', `Bearer sstd_${ID}_${'a'.repeat(43)}`)
      .expect(401);

    expect(bodyOf(response).error.code).toBe('INVALID_ACCESS_TOKEN');
  });

  it('asks for an Idempotency-Key and a well-formed body before it looks at the code', async () => {
    const server = app.getHttpServer();
    await request(server).post('/api/v1/device-enrollments').send({ enrollmentCode: 'ABCD-EFGH-JKMN' }).expect(422);
    await request(server)
      .post('/api/v1/device-enrollments')
      .set('Idempotency-Key', 'short')
      .send({ enrollmentCode: 'x' })
      .expect(422);
    await request(server)
      .post('/api/v1/device-enrollments')
      .set('Idempotency-Key', 'k'.repeat(20))
      .send({ enrollmentCode: 'x', extra: 1 })
      .expect(422);
  });

  it('keeps the publication of the notice for the Super Admin: the IT Admin gets 403', async () => {
    const response = await request(app.getHttpServer())
      .post(NOTICES)
      .set('Authorization', bearer(principal(['IT_ADMIN'])))
      .send(NOTICE)
      .expect(403);

    expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
  });

  it.each([
    [
      'a field the register never takes (organization)',
      'post',
      DEVICES,
      { ...(routes[0][2] as object), organizationId: ID },
    ],
    ['a machine with no holder', 'post', DEVICES, { assetCode: 'AS-1', hostname: 'h', os: 'Windows 11' }],
    ['a handover day that is not a date', 'post', DEVICES, { ...(routes[0][2] as object), handedOverOn: '2026-02-30' }],
    ['a blank asset code', 'post', DEVICES, { ...(routes[0][2] as object), assetCode: '   ' }],
    ['a page size over 100', 'get', `${DEVICES}?pageSize=101`, undefined],
    ['a state that does not exist', 'get', `${DEVICES}?state=BROKEN`, undefined],
    ['an id that is not a UUID', 'get', `${DEVICES}/not-a-uuid`, undefined],
    [
      'a holder change that names the registration',
      'post',
      `${DEVICES}/${ID}/holder-changes`,
      { holderEmployeeId: ID, registrationId: ID },
    ],
    ['a retirement with no reason', 'post', `${DEVICES}/${ID}/retirements`, {}],
    ['a signed record with no version', 'post', `${REGISTRATIONS}/${ID}/signature-records`, { documentId: ID }],
  ] as const)('refuses %s with 422', async (_name, method, path, body) => {
    const call = request(app.getHttpServer())
      [method](path)
      .set('Authorization', bearer(principal(['IT_ADMIN'])));
    const response = await (body ? call.send(body) : call).expect(422);

    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
  });

  it.each([
    ['a notice with a section missing', { ...NOTICE, stopRight: undefined }],
    ['a notice that names the publisher', { ...NOTICE, publishedByAppUserId: ID }],
    ['a notice with a blank section', { ...NOTICE, purpose: ' ' }],
    ['a notice with a flag that is not a boolean', { ...NOTICE, includesToolStatus: 'yes' }],
  ])('refuses %s with 422', async (_name, body) => {
    const response = await request(app.getHttpServer())
      .post(NOTICES)
      .set('Authorization', bearer(principal(['SUPER_ADMIN'])))
      .send(body)
      .expect(422);

    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
  });

  it.each([
    ['an acknowledgement with no version', {}],
    ['an acknowledgement that names the signer', { noticeVersionId: ID, employeeId: ID }],
  ])('refuses %s with 422', async (_name, body) => {
    const response = await request(app.getHttpServer())
      .post(`${ME}/device-registrations/${ID}/acknowledgements`)
      .set('Authorization', bearer(principal(['EMPLOYEE'])))
      .send(body)
      .expect(422);

    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
  });

  it('refuses a page size over 50 of the machines of the holder', async () => {
    await request(app.getHttpServer())
      .get(`${ME}/devices?pageSize=51`)
      .set('Authorization', bearer(principal(['EMPLOYEE'])))
      .expect(422);
  });

  /** The wire promises: the fields a request takes and a response shows are exactly these (a field added without the spec fails here). */
  describe('the fields the document promises', () => {
    type Schema = { properties?: Record<string, unknown>; required?: string[]; additionalProperties?: unknown };
    const schemas = (): Record<string, Schema> =>
      (document.components?.schemas ?? {}) as unknown as Record<string, Schema>;
    const bodyOf_ = (name: string): Schema => {
      const schema = schemas()[name];
      if (!schema) throw new Error(`No schema ${name}`);

      return schema;
    };

    it.each([
      [
        'DeviceCreateBodyDto',
        ['assetCode', 'hostname', 'os', 'holderEmployeeId', 'handedOverOn'],
        ['assetCode', 'hostname', 'os', 'holderEmployeeId'],
      ],
      ['HolderChangeBodyDto', ['holderEmployeeId'], ['holderEmployeeId']],
      ['RetirementBodyDto', ['reason'], ['reason']],
      ['SignatureRecordBodyDto', ['documentId', 'noticeVersionId'], ['documentId', 'noticeVersionId']],
      [
        'NoticeVersionBodyDto',
        [
          'collected',
          'notCollected',
          'purpose',
          'retention',
          'stopRight',
          'includesToolStatus',
          'requiresReacknowledgement',
        ],
        [
          'collected',
          'notCollected',
          'purpose',
          'retention',
          'stopRight',
          'includesToolStatus',
          'requiresReacknowledgement',
        ],
      ],
      ['AcknowledgementBodyDto', ['noticeVersionId'], ['noticeVersionId']],
    ])('takes exactly the fields of %s', (name, properties, required) => {
      const schema = bodyOf_(name);

      expect(Object.keys(schema.properties ?? {}).sort()).toEqual([...properties].sort());
      expect([...(schema.required ?? [])].sort()).toEqual([...required].sort());
      expect(schema.additionalProperties).toBe(false);
    });

    it('shows no address, token, credential or link in the machines it lists', () => {
      const text = JSON.stringify([
        bodyOf_('DevicePageResponseDto'),
        bodyOf_('DeviceDetailResponseDto'),
        bodyOf_('MyDevicePageResponseDto'),
      ]);

      expect(text).not.toMatch(/"(?:ip|address|ipAddress|token|credential|url|link)[A-Za-z]*"/i);
    });
  });
});
