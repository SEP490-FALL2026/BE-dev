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
const INITIAL_RECORDS = '/api/v1/device-initial-records';
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
    ['post', DEVICES, { deviceType: 'LAP', hostname: 'h', os: 'Windows 11' }],
    ['post', INITIAL_RECORDS, { deviceType: 'LAP', hostname: 'h', os: 'Windows 11', assetCode: 'IT-OLD-0042' }],
    ['get', DEVICES, undefined],
    ['get', `${DEVICES}/${ID}`, undefined],
    ['patch', `${DEVICES}/${ID}`, { expectedUpdatedAt: '2026-11-24T00:00:00.000Z', hostname: 'h2' }],
    ['get', `${DEVICES}/${ID}/registrations`, undefined],
    ['post', `${DEVICES}/${ID}/holder-changes`, { holderEmployeeId: ID, collectorInstalled: true }],
    [
      'post',
      `${DEVICES}/${ID}/replacements`,
      {
        replacementDeviceId: ID,
        condition: 'USABLE',
        softwareRemoval: { outcome: 'REMOVED' },
        collectorInstalled: true,
      },
    ],
    ['post', `${DEVICES}/${ID}/returns`, { condition: 'USABLE', softwareRemoval: { outcome: 'REMOVED' } }],
    ['post', `${DEVICES}/${ID}/condition-changes`, { condition: 'IN_REPAIR' }],
    ['post', `${DEVICES}/${ID}/retirements`, { reason: 'broken' }],
    ['post', `${DEVICES}/${ID}/voids`, { reason: 'entered twice' }],
    ['post', `${DEVICES}/${ID}/activations`, { planId: ID }],
    ['get', `${DEVICES}/${ID}/holder-software`, undefined],
    ['get', '/api/v1/device-activations', undefined],
    ['post', `/api/v1/device-activations/${ID}/deactivation`, {}],
    ['post', `/api/v1/device-activations/${ID}/moves`, { targetDeviceId: ID }],
    ['post', `${REGISTRATIONS}/${ID}/signature-records`, { documentId: ID, noticeVersionId: ID }],
    ['post', `${REGISTRATIONS}/${ID}/collector-installation`, undefined],
    ['post', NOTICES, NOTICE],
    ['get', '/api/v1/monitoring-notices/current', undefined],
    ['get', `${ME}/devices`, undefined],
    ['get', `${ME}/device-software`, undefined],
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
      await as(request(server).post(INITIAL_RECORDS).send(routes[1][2])),
      await as(request(server).get(DEVICES)),
      await as(request(server).get(`${DEVICES}/${ID}`)),
      await as(
        request(server)
          .patch(`${DEVICES}/${ID}`)
          .send({ expectedUpdatedAt: '2026-11-24T00:00:00.000Z', hostname: 'h2' }),
      ),
      await as(request(server).get(`${DEVICES}/${ID}/registrations`)),
      await as(
        request(server)
          .post(`${DEVICES}/${ID}/holder-changes`)
          .send({ holderEmployeeId: ID, collectorInstalled: true }),
      ),
      await as(
        request(server)
          .post(`${DEVICES}/${ID}/replacements`)
          .send({
            replacementDeviceId: ID,
            condition: 'USABLE',
            softwareRemoval: { outcome: 'REMOVED' },
            collectorInstalled: true,
          }),
      ),
      await as(
        request(server)
          .post(`${DEVICES}/${ID}/returns`)
          .send({ condition: 'USABLE', softwareRemoval: { outcome: 'REMOVED' } }),
      ),
      await as(request(server).post(`${DEVICES}/${ID}/condition-changes`).send({ condition: 'IN_REPAIR' })),
      await as(request(server).post(`${DEVICES}/${ID}/retirements`).send({ reason: 'x' })),
      await as(request(server).post(`${DEVICES}/${ID}/voids`).send({ reason: 'x' })),
      await as(request(server).post(`${DEVICES}/${ID}/activations`).send({ planId: ID })),
      await as(request(server).get(`${DEVICES}/${ID}/holder-software`)),
      await as(request(server).get('/api/v1/device-activations')),
      await as(request(server).post(`/api/v1/device-activations/${ID}/deactivation`).send({})),
      await as(request(server).post(`/api/v1/device-activations/${ID}/moves`).send({ targetDeviceId: ID })),
      await as(
        request(server).post(`${REGISTRATIONS}/${ID}/signature-records`).send({ documentId: ID, noticeVersionId: ID }),
      ),
      await as(request(server).post(`${REGISTRATIONS}/${ID}/collector-installation`)),
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
    [
      'a hand-typed asset code (generated only)',
      'post',
      DEVICES,
      { ...(routes[0][2] as object), assetCode: 'LAP-26-0001' },
    ],
    [
      'an initial record with blank assetCode',
      'post',
      INITIAL_RECORDS,
      { ...(routes[0][2] as object), assetCode: '   ' },
    ],
    [
      'an initial record with duplicate keyActivations',
      'post',
      INITIAL_RECORDS,
      { ...(routes[0][2] as object), keyActivations: [{ licenseKeyId: ID }, { licenseKeyId: ID }] },
    ],
    [
      'an initial record with an unknown field',
      'post',
      INITIAL_RECORDS,
      { ...(routes[0][2] as object), organizationId: ID },
    ],
    [
      'a handover day that is not a date',
      'post',
      DEVICES,
      { ...(routes[0][2] as object), holderEmployeeId: ID, handedOverOn: '2026-02-30' },
    ],
    ['a duplicate bundled plan id', 'post', DEVICES, { ...(routes[0][2] as object), bundledPlanIds: [ID, ID] }],
    ['a blank hostname', 'post', DEVICES, { ...(routes[0][2] as object), hostname: '   ' }],
    ['an unknown deviceType', 'post', DEVICES, { deviceType: 'TABLET', hostname: 'h', os: 'Android' }],
    [
      'an update on non-UUID id',
      'patch',
      `${DEVICES}/not-a-uuid`,
      { expectedUpdatedAt: '2026-11-24T00:00:00.000Z', hostname: 'x' },
    ],
    ['an update with missing expectedUpdatedAt', 'patch', `${DEVICES}/${ID}`, { hostname: 'x' }],
    ['an invalid custody filter', 'get', `${DEVICES}?custody=VOIDED`, undefined],
    ['a page size over 100', 'get', `${DEVICES}?pageSize=101`, undefined],
    ['a state that does not exist', 'get', `${DEVICES}?state=BROKEN`, undefined],
    ['an id that is not a UUID', 'get', `${DEVICES}/not-a-uuid`, undefined],
    ['the registrations of an id that is not a UUID', 'get', `${DEVICES}/not-a-uuid/registrations`, undefined],
    ['a page size over 100 of the registrations', 'get', `${DEVICES}/${ID}/registrations?pageSize=101`, undefined],
    ['page 0 of the registrations', 'get', `${DEVICES}/${ID}/registrations?page=0`, undefined],
    [
      'a filter the registrations never take',
      'get',
      `${DEVICES}/${ID}/registrations?holderEmployeeId=${ID}`,
      undefined,
    ],
    [
      'a holder change that names the registration',
      'post',
      `${DEVICES}/${ID}/holder-changes`,
      { holderEmployeeId: ID, collectorInstalled: true, registrationId: ID },
    ],
    ['a holder change missing collectorInstalled', 'post', `${DEVICES}/${ID}/holder-changes`, { holderEmployeeId: ID }],
    [
      'a device return with an invalid condition',
      'post',
      `${DEVICES}/${ID}/returns`,
      { condition: 'DAMAGED', softwareRemoval: { outcome: 'REMOVED' } },
    ],
    [
      'a device return with an unknown field',
      'post',
      `${DEVICES}/${ID}/returns`,
      { condition: 'USABLE', softwareRemoval: { outcome: 'REMOVED' }, extra: 1 },
    ],
    [
      'a condition change with an invalid condition',
      'post',
      `${DEVICES}/${ID}/condition-changes`,
      { condition: 'LOST' },
    ],
    ['a retirement with no reason', 'post', `${DEVICES}/${ID}/retirements`, {}],
    [
      'a retirement with invalid retirementKind',
      'post',
      `${DEVICES}/${ID}/retirements`,
      { reason: 'broken', retirementKind: 'SOLD' },
    ],
    [
      'a retirement with duplicate activationIds',
      'post',
      `${DEVICES}/${ID}/retirements`,
      {
        reason: 'broken',
        activationDecisions: [
          { activationId: ID, licenseRelease: 'RETURN_TO_LOT' },
          { activationId: ID, licenseRelease: 'LOST_WITH_DEVICE' },
        ],
      },
    ],
    [
      'a replacement missing collectorInstalled',
      'post',
      `${DEVICES}/${ID}/replacements`,
      { replacementDeviceId: ID, condition: 'USABLE', softwareRemoval: { outcome: 'REMOVED' } },
    ],
    [
      'a replacement with duplicate activationIds',
      'post',
      `${DEVICES}/${ID}/replacements`,
      {
        replacementDeviceId: ID,
        condition: 'USABLE',
        softwareRemoval: { outcome: 'REMOVED' },
        collectorInstalled: true,
        activations: [
          { activationId: ID, action: 'MOVE' },
          { activationId: ID, action: 'STAY' },
        ],
      },
    ],
    ['a void with blank reason', 'post', `${DEVICES}/${ID}/voids`, { reason: '   ' }],
    ['an activation with no planId', 'post', `${DEVICES}/${ID}/activations`, {}],
    [
      'an activation with non-UUID licenseKeyId',
      'post',
      `${DEVICES}/${ID}/activations`,
      { planId: ID, licenseKeyId: 'bad' },
    ],
    ['an activation list with invalid state', 'get', '/api/v1/device-activations?state=BAD', undefined],
    ['an activation list with pageSize over 100', 'get', '/api/v1/device-activations?pageSize=101', undefined],
    ['holder software for non-UUID device id', 'get', `${DEVICES}/not-a-uuid/holder-software`, undefined],
    ['holder software with pageSize over 50', 'get', `${DEVICES}/${ID}/holder-software?pageSize=51`, undefined],
    ['holder software with an unknown query param', 'get', `${DEVICES}/${ID}/holder-software?extra=1`, undefined],
    [
      'a deactivation with invalid licenseRelease',
      'post',
      `/api/v1/device-activations/${ID}/deactivation`,
      { licenseRelease: 'OTHER' },
    ],
    ['a move missing targetDeviceId', 'post', `/api/v1/device-activations/${ID}/moves`, {}],
    ['a signed record with no version', 'post', `${REGISTRATIONS}/${ID}/signature-records`, { documentId: ID }],
    [
      'a collector enable on non-UUID registration id',
      'post',
      `${REGISTRATIONS}/not-a-uuid/collector-installation`,
      undefined,
    ],
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

  it.each([
    ['pageSize over 50', `${ME}/device-software?pageSize=51`],
    ['page 0', `${ME}/device-software?page=0`],
    ['an unknown query param', `${ME}/device-software?extra=1`],
  ])('refuses /me/device-software with %s with 422', async (_name, path) => {
    const response = await request(app.getHttpServer())
      .get(path)
      .set('Authorization', bearer(principal(['EMPLOYEE'])))
      .expect(422);

    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
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
        [
          'deviceType',
          'hostname',
          'os',
          'serialNumber',
          'bundledPlanIds',
          'holderEmployeeId',
          'handedOverOn',
          'collectorInstalled',
        ],
        ['deviceType', 'hostname', 'os'],
      ],
      [
        'DeviceInitialRecordBodyDto',
        [
          'deviceType',
          'hostname',
          'os',
          'serialNumber',
          'bundledPlanIds',
          'holderEmployeeId',
          'handedOverOn',
          'collectorInstalled',
          'assetCode',
          'keyActivations',
        ],
        ['deviceType', 'hostname', 'os'],
      ],
      [
        'DeviceAttributesBodyDto',
        ['expectedUpdatedAt', 'hostname', 'os', 'serialNumber', 'deviceType'],
        ['expectedUpdatedAt'],
      ],
      [
        'HolderChangeBodyDto',
        ['holderEmployeeId', 'collectorInstalled', 'softwareRemoval'],
        ['holderEmployeeId', 'collectorInstalled'],
      ],
      ['DeviceReturnBodyDto', ['condition', 'conditionNote', 'softwareRemoval'], ['condition', 'softwareRemoval']],
      ['ConditionChangeBodyDto', ['condition', 'note'], ['condition']],
      ['RetirementBodyDto', ['retirementKind', 'reason', 'activationDecisions'], ['reason']],
      [
        'DeviceReplacementBodyDto',
        ['replacementDeviceId', 'condition', 'conditionNote', 'softwareRemoval', 'collectorInstalled', 'activations'],
        ['replacementDeviceId', 'condition', 'softwareRemoval', 'collectorInstalled'],
      ],
      ['DeviceVoidBodyDto', ['reason'], ['reason']],
      [
        'DeviceReturnTaskCompleteBodyDto',
        ['outcome', 'condition', 'conditionNote', 'softwareRemoval', 'reason', 'activationDecisions'],
        ['outcome'],
      ],
      ['OpenDeviceActivationBodyDto', ['planId', 'licenseKeyId'], ['planId']],
      ['DeactivateDeviceActivationBodyDto', ['licenseRelease'], []],
      ['MoveDeviceActivationBodyDto', ['targetDeviceId'], ['targetDeviceId']],
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
        bodyOf_('DeviceRegistrationPageResponseDto'),
        bodyOf_('DeviceHolderSoftwarePageResponseDto'),
        bodyOf_('MeDeviceSoftwarePageResponseDto'),
      ]);

      expect(text).not.toMatch(/"(?:ip|address|ipAddress|token|credential|url|link)[A-Za-z]*"/i);
    });

    it('says in the list of machines and in the history of one the last time an intake was accepted, and lists the history a page at a time', () => {
      for (const name of ['DevicePageResponseDto', 'DeviceDetailResponseDto', 'DeviceRegistrationPageResponseDto']) {
        expect(JSON.stringify(bodyOf_(name))).toContain('lastAcceptedAt');
      }
      const registrations = document.paths?.[`/api/v1/devices/{id}/registrations`]?.get;
      const parameters = ((registrations?.parameters ?? []) as { name: string }[]).map((parameter) => parameter.name);

      expect(registrations?.operationId).toBe('deviceRegistrationList');
      expect(parameters.sort()).toEqual(['id', 'page', 'pageSize']);
    });

    it('answers the correction of a machine with the detail of the machine, like the other commands on it, and lists 403 for the activations', () => {
      const update = document.paths?.[`/api/v1/devices/{id}`]?.patch;
      const ok = JSON.stringify(update?.responses?.['200'] ?? null);
      const activations = document.paths?.['/api/v1/device-activations']?.get;

      expect(update?.operationId).toBe('deviceUpdate');
      expect(ok).toContain('#/components/schemas/DeviceDetailResponseDto');
      expect(Object.keys(update?.responses ?? {})).toEqual(expect.arrayContaining(['403', '404', '409', '422']));
      expect(Object.keys(activations?.responses ?? {})).toContain('403');
    });
  });

  describe('device return task routes', () => {
    it('enforces authentication and role guards for list and completion endpoints', async () => {
      const server = app.getHttpServer();
      await request(server).get('/api/v1/device-return-tasks').expect(401);
      await request(server).post(`/api/v1/device-return-tasks/${ID}/completion`).send({}).expect(401);

      for (const roles of [['EMPLOYEE'], ['MANAGER'], ['FINANCE']]) {
        const res = await request(server)
          .get('/api/v1/device-return-tasks')
          .set('Authorization', bearer(principal(roles)))
          .expect(403);
        expect(bodyOf(res).error.code).toBe('AUTHORIZATION.FORBIDDEN');
      }

      const saComplete = await request(server)
        .post(`/api/v1/device-return-tasks/${ID}/completion`)
        .set('Authorization', bearer(principal(['SUPER_ADMIN'])))
        .send({ outcome: 'NOT_RECOVERED', reason: 'Lost' })
        .expect(403);
      expect(bodyOf(saComplete).error.code).toBe('AUTHORIZATION.FORBIDDEN');

      const badQuery = await request(server)
        .get('/api/v1/device-return-tasks?scope=GENERAL')
        .set('Authorization', bearer(principal(['IT_ADMIN'])))
        .expect(422);
      expect(bodyOf(badQuery).error.code).toBe('VALIDATION_ERROR');
    });
  });
});
