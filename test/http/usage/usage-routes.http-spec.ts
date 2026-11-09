import { INestApplication } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';
import request from 'supertest';
import { App } from 'supertest/types';
import { createOpenApiDocument } from '../../../src/app/configure-application';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';
import { OPENAPI_DOCUMENT_BUDGET_MS } from '../../support/openapi-document-budget';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const DEVICE_TOKEN = `Bearer sstd_${ID}_${'a'.repeat(43)}`;

const BATCH = {
  generatedAt: '2026-11-05T10:00:00+07:00',
  days: [{ date: '2026-11-05', tools: [{ tool: 'CODEX', coverage: 'PARTIAL', responses: 1, totalTokens: 10 }] }],
};
const SNAPSHOT = {
  snapshots: [
    {
      tool: 'CODEX',
      observedAt: '2026-11-05T10:00:00+07:00',
      auth: { status: 'LOGGED_IN' },
      quota: { status: 'OK', windows: [{ code: 'PRIMARY', usedPercent: 10, resetsAt: null }] },
    },
  ],
};

describe('usage routes (http contract, no database)', () => {
  let app: INestApplication<App>;
  let document: OpenAPIObject;

  beforeAll(async () => {
    app = await createHttpContractApp();
    document = createOpenApiDocument(app);
  }, OPENAPI_DOCUMENT_BUDGET_MS);

  afterAll(async () => {
    await app?.close();
  });

  it.each([
    ['post', '/api/v1/ai-usage-batches', BATCH],
    ['post', '/api/v1/ai-tool-status-snapshots', SNAPSHOT],
  ] as const)('answers %s %s without a credential with the device answer', async (method, path, body) => {
    const response = await request(app.getHttpServer())[method](path).send(body).expect(401);

    expect(bodyOf(response).error.code).toBe('DEVICE.CREDENTIAL_INVALID');
  });

  it('refuses a person’s token on the routes the collector sends to, and a collector’s token on the routes people read', async () => {
    const server = app.getHttpServer();
    const person = await request(server)
      .post('/api/v1/ai-usage-batches')
      .set('Authorization', bearer(principal(['IT_ADMIN'])))
      .send(BATCH)
      .expect(401);
    const device = await request(server)
      .get(`/api/v1/devices/${ID}/usage`)
      .set('Authorization', DEVICE_TOKEN)
      .expect(401);

    expect(bodyOf(person).error.code).toBe('DEVICE.CREDENTIAL_INVALID');
    expect(bodyOf(device).error.code).toBe('INVALID_ACCESS_TOKEN');
  });

  it.each([
    ['get', `/api/v1/devices/${ID}/usage`],
    ['get', `/api/v1/devices/${ID}/tool-status`],
    ['get', `/api/v1/devices/${ID}/intake-rejections`],
    ['get', '/api/v1/collector-allowlist-entries'],
    ['post', '/api/v1/collector-allowlist-versions'],
    ['get', `/api/v1/me/devices/${ID}/usage`],
    ['get', `/api/v1/me/devices/${ID}/tool-status`],
  ] as const)('answers 401 to %s %s without a token', async (method, path) => {
    const response = await request(app.getHttpServer())[method](path).expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it.each([
    ['the department head', ['MANAGER']],
    ['Finance', ['FINANCE']],
    ['an employee', ['EMPLOYEE']],
    ['the Super Admin', ['SUPER_ADMIN']],
  ])('keeps the machine reads and the allowlist for the IT Admin: %s gets 403', async (_name, roles) => {
    const server = app.getHttpServer();
    const as = (req: request.Test) => req.set('Authorization', bearer(principal(roles)));

    for (const response of [
      await as(request(server).get(`/api/v1/devices/${ID}/usage`)),
      await as(request(server).get(`/api/v1/devices/${ID}/tool-status`)),
      await as(request(server).get(`/api/v1/devices/${ID}/intake-rejections`)),
      await as(request(server).get('/api/v1/collector-allowlist-entries')),
      await as(request(server).post('/api/v1/collector-allowlist-versions').send({ reason: 'x', aiTools: [] })),
    ]) {
      expect(response.status).toBe(403);
    }
  });

  it.each([
    ['a field the allowlist never takes (a version number)', { reason: 'x', aiTools: [], versionNumber: 5 }],
    ['a reason that is blank', { reason: ' ', aiTools: [] }],
    [
      'a tool twice',
      {
        reason: 'x',
        aiTools: [
          { tool: 'CODEX', applicationId: ID },
          { tool: 'CODEX', applicationId: '4f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11' },
        ],
      },
    ],
    ['a tool that does not exist', { reason: 'x', aiTools: [{ tool: 'COPILOT', applicationId: ID }] }],
  ])('refuses %s with 422', async (_name, body) => {
    await request(app.getHttpServer())
      .post('/api/v1/collector-allowlist-versions')
      .set('Authorization', bearer(principal(['IT_ADMIN'])))
      .send(body)
      .expect(422);
  });

  it.each([
    ['from after to', `/api/v1/devices/${ID}/usage?from=2026-11-06&to=2026-11-05`],
    ['a day that does not exist', `/api/v1/devices/${ID}/usage?from=2026-02-30`],
    ['a sort parameter', `/api/v1/devices/${ID}/usage?sort=totalTokens`],
    ['a page size over 100', `/api/v1/devices/${ID}/tool-status?pageSize=101`],
    ['a reason that does not exist', `/api/v1/devices/${ID}/intake-rejections?reasonCode=BORED`],
    ['an id that is not a UUID', '/api/v1/devices/not-a-uuid/usage'],
  ])('refuses %s on a read with 422', async (_name, path) => {
    await request(app.getHttpServer())
      .get(path)
      .set('Authorization', bearer(principal(['IT_ADMIN'])))
      .expect(422);
  });

  describe('the fields the document promises', () => {
    type Schema = { properties?: Record<string, unknown>; required?: string[]; additionalProperties?: unknown };
    const schema = (name: string): Schema => {
      const found = ((document.components?.schemas ?? {}) as unknown as Record<string, Schema>)[name];
      if (!found) throw new Error(`No schema ${name}`);

      return found;
    };

    it.each([
      ['AiUsageBatchBodyDto', ['generatedAt', 'days']],
      ['ToolStatusBatchBodyDto', ['snapshots']],
      ['AllowlistVersionBodyDto', ['reason', 'aiTools']],
    ])('takes exactly the fields of %s', (name, properties) => {
      expect(Object.keys(schema(name).properties ?? {}).sort()).toEqual([...properties].sort());
      expect([...(schema(name).required ?? [])].sort()).toEqual([...properties].sort());
      expect(schema(name).additionalProperties).toBe(false);
    });

    it('shows no address, token, credential, link or package name in what is read', () => {
      const text = JSON.stringify(
        ['DeviceUsagePageResponseDto', 'MyDeviceUsagePageResponseDto', 'ToolStatusPageResponseDto'].map(schema),
      );

      expect(text).not.toMatch(/"(?:ip|address|ipAddress|token|credential|url|link|package)[A-Za-z]*"/i);
    });

    it('does not let the holder see which registration a count belongs to', () => {
      const mine = JSON.stringify(schema('MyDeviceUsagePageResponseDto'));
      const its = JSON.stringify(schema('DeviceUsagePageResponseDto'));

      expect(mine).not.toContain('registrationId');
      expect(its).toContain('registrationId');
    });
  });
});
