import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const ID = '8a4d7c1e-2b3f-4c5d-9e6f-0a1b2c3d4e5f';
const base = { planId: ID, businessReason: 'A valid reason', termMonths: 6 };
const group = { ...base, lines: [{ employeeId: ID }] };
const cases: Array<[string, string, string, object]> = [
  ['preview', '/api/v1/access-requests/preview', 'EMPLOYEE', { planId: ID, termMonths: 6 }],
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
      termMonths: 6,
    },
  ],
  ['draft', '/api/v1/access-requests/drafts', 'EMPLOYEE', { kind: 'INDIVIDUAL', ...base }],
  [
    'delegated',
    '/api/v1/delegated-requests',
    'MANAGER',
    { beneficiaryEmployeeIds: [ID], items: [{ planId: ID }], businessReason: 'Work', termMonths: 6 },
  ],
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
    { assignmentId: ID, newExpectedEndDate: '2027-01-01', businessReason: 'Work' },
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
