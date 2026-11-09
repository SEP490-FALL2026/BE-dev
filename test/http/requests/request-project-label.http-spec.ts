import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const ID = '8a4d7c1e-2b3f-4c5d-9e6f-0a1b2c3d4e5f';
const base = { planId: ID, businessReason: 'A valid reason' };
const group = { ...base, lines: [{ employeeId: ID }] };
const cases: Array<[string, string, string, object]> = [
  ['preview', '/api/v1/access-requests/preview', 'EMPLOYEE', { planId: ID }],
  ['submit', '/api/v1/access-requests', 'EMPLOYEE', base],
  [
    'propose',
    '/api/v1/access-requests/proposals',
    'EMPLOYEE',
    {
      softwareName: 'Tool',
      homepageUrl: 'https://example.test',
      purpose: 'Work',
      dataDescription: 'None',
      expectedUsers: 1,
    },
  ],
  ['draft', '/api/v1/access-requests/drafts', 'EMPLOYEE', { kind: 'INDIVIDUAL', ...base }],
  [
    'service account',
    '/api/v1/access-requests/service-accounts',
    'EMPLOYEE',
    { ...base, purpose: 'Build', expectedIdentifier: 'ci-bot' },
  ],
  [
    'renewal',
    '/api/v1/access-requests/renewals',
    'EMPLOYEE',
    { assignmentId: ID, extensionMonths: 6, businessReason: 'Work' },
  ],
  ['group check', '/api/v1/group-requests/check', 'EMPLOYEE', group],
  ['group submit', '/api/v1/group-requests', 'EMPLOYEE', group],
];

describe('retired project label on request bodies', () => {
  let app: INestApplication<App>;
  beforeAll(async () => {
    app = await createHttpContractApp();
  });
  afterAll(async () => {
    await app?.close();
  });
  it.each(cases)('rejects projectLabel for %s', async (_name, path, role, body) => {
    const response = await request(app.getHttpServer())
      .post(path)
      .set('Authorization', bearer(principal([role])))
      .send({ ...body, projectLabel: 'Retired label' });
    expect([response.status, bodyOf(response).error?.code]).toEqual([422, 'VALIDATION_ERROR']);
  });
});
