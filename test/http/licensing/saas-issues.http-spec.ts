import { INestApplication } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { App } from 'supertest/types';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const OTHER = '9a1d5c2e-7b3f-4e08-a6d4-0c8b2f1e7a55';
const SUBMIT = {
  assignmentId: ID,
  category: 'NO_ACCESS',
  impact: 'UNUSABLE',
  description: 'I cannot sign in',
  occurredAt: '2026-10-30T08:00:00Z',
};

type Call = (server: App) => request.Test;

const ROUTES: Array<[string, 'ANY' | 'IT_ADMIN', Call]> = [
  ['GET /saas-issues/options', 'ANY', (server) => request(server).get('/api/v1/saas-issues/options')],
  ['POST /saas-issues', 'ANY', (server) => request(server).post('/api/v1/saas-issues').send(SUBMIT)],
  ['GET /saas-issues', 'ANY', (server) => request(server).get('/api/v1/saas-issues')],
  ['GET /saas-issues/{id}', 'ANY', (server) => request(server).get(`/api/v1/saas-issues/${ID}`)],
  ['GET /saas-issues/{id}/entries', 'ANY', (server) => request(server).get(`/api/v1/saas-issues/${ID}/entries`)],
  [
    'POST /saas-issues/{id}/messages',
    'ANY',
    (server) => request(server).post(`/api/v1/saas-issues/${ID}/messages`).send({ body: 'More detail' }),
  ],
  [
    'POST /saas-issues/{id}/reopening',
    'ANY',
    (server) => request(server).post(`/api/v1/saas-issues/${ID}/reopening`).send({ reason: 'Still broken' }),
  ],
  [
    'POST /saas-issues/{id}/transitions',
    'IT_ADMIN',
    (server) => request(server).post(`/api/v1/saas-issues/${ID}/transitions`).send({ to: 'IN_PROGRESS' }),
  ],
  [
    'POST /saas-issues/{id}/duplicate',
    'IT_ADMIN',
    (server) => request(server).post(`/api/v1/saas-issues/${ID}/duplicate`).send({ ofIssueId: OTHER, reason: 'Same' }),
  ],
];

describe('SaaS issue routes (e2e, no database)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createHttpContractApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('who may call which route (US-07-10 AC-3, US-07-11 AC-9)', () => {
    it.each(ROUTES)('%s without a token is 401', async (_name, _who, call) => {
      const response = await call(app.getHttpServer()).expect(401);

      expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
    });

    it.each([
      ['Finance', ['FINANCE'], []],
      ['the Super Admin', ['SUPER_ADMIN'], []],
      ['the head of a department', [], ['MANAGER']],
      ['the spending approver', [], ['SPENDING_APPROVER']],
      ['an employee', ['EMPLOYEE'], []],
    ])('refuses %s the handling routes with 403', async (_name, direct, derived) => {
      for (const [route, who, call] of ROUTES) {
        if (who !== 'IT_ADMIN') continue;
        const response = await call(app.getHttpServer())
          .set('Authorization', bearer(principal([...direct, ...derived])))
          .expect(403);
        expect({ route, code: bodyOf(response).error.code }).toEqual({ route, code: 'AUTHORIZATION.FORBIDDEN' });
      }
    });
  });

  describe('validation before any work', () => {
    it.each([
      ['no assignment', { ...SUBMIT, assignmentId: undefined }],
      ['an assignment that is not an id', { ...SUBMIT, assignmentId: 'A1' }],
      ['a kind of error that does not exist', { ...SUBMIT, category: 'SLOW' }],
      ['an impact that does not exist', { ...SUBMIT, impact: 'HUGE' }],
      ['no description', { ...SUBMIT, description: '' }],
      ['a blank description', { ...SUBMIT, description: '   ' }],
      ['a description over 2000 characters', { ...SUBMIT, description: 'x'.repeat(2001) }],
      ['a moment that is not a date and time', { ...SUBMIT, occurredAt: 'yesterday' }],
      ['an attached file, which the form does not take', { ...SUBMIT, attachment: 'a.png' }],
    ])('refuses to report with %s with 422', async (_name, payload) => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/saas-issues')
        .set('Authorization', bearer(principal(['EMPLOYEE'])))
        .send(payload)
        .expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it.each([
      ['a state that does not exist', { to: 'DONE' }],
      ['no state', {}],
      ['a vendor ticket over 100 characters', { to: 'WAITING_PROVIDER', vendorTicketRef: 'x'.repeat(101) }],
      ['a flag that says the ticket was sent', { to: 'WAITING_PROVIDER', vendorTicketSent: true }],
      ['a pointer that is not an id', { to: 'RESOLVED', resolution: 'ok', linkedWork: { grantTaskId: 'T1' } }],
      ['a pointer of a kind that does not exist', { to: 'RESOLVED', resolution: 'ok', linkedWork: { ticketId: ID } }],
    ])('refuses a transition with %s with 422', async (_name, payload) => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/saas-issues/${ID}/transitions`)
        .set('Authorization', bearer(principal(['IT_ADMIN'])))
        .send(payload)
        .expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it.each([
      ['a duplicate with no other report', '/duplicate', { reason: 'Same' }],
      ['a duplicate with no reason', '/duplicate', { ofIssueId: OTHER }],
      ['a duplicate of something that is not an id', '/duplicate', { ofIssueId: 'P1', reason: 'Same' }],
      ['a reopening with no reason', '/reopening', {}],
      ['a message with no text', '/messages', {}],
    ])('refuses %s with 422', async (_name, path, payload) => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/saas-issues/${ID}${path}`)
        .set('Authorization', bearer(principal(['IT_ADMIN'])))
        .send(payload)
        .expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });

    it.each([
      ['a report id that is not an id', (server: App) => request(server).get('/api/v1/saas-issues/not-an-id')],
      ['a state that does not exist', (server: App) => request(server).get('/api/v1/saas-issues?state=DONE')],
      ['a scope that does not exist', (server: App) => request(server).get('/api/v1/saas-issues?scope=everyone')],
      ['a flag that is not true or false', (server: App) => request(server).get('/api/v1/saas-issues?overdue=x')],
      ['a page size over the limit', (server: App) => request(server).get('/api/v1/saas-issues?pageSize=101')],
      [
        'a page size over the limit on the form',
        (server: App) => request(server).get('/api/v1/saas-issues/options?pageSize=101'),
      ],
    ])('refuses %s with 422', async (_name, call) => {
      const response = await call(app.getHttpServer())
        .set('Authorization', bearer(principal(['IT_ADMIN'])))
        .expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('the operations the API publishes (US-07-10 AC-9)', () => {
    interface Operation {
      operationId: string;
      description?: string;
      responses: Record<string, { description?: string }>;
    }
    const paths = (
      JSON.parse(readFileSync(join(__dirname, '../../../openapi.json'), 'utf8')) as {
        paths: Record<string, Record<string, Operation>>;
      }
    ).paths;
    const operations = Object.entries(paths)
      .filter(([path]) => path.startsWith('/api/v1/saas-issues'))
      .flatMap(([path, methods]) => Object.values(methods).map((operation) => ({ path, operation })));

    it('publishes nine operations, none of them for mobile, and says each is for the web client only', () => {
      expect(operations).toHaveLength(9);
      for (const { path, operation } of operations) {
        expect({ path, mobile: /mobile/i.test(`${path}${operation.operationId}`) }).toEqual({ path, mobile: false });
        const described = Object.values(operation.responses).some((response) =>
          /web client only/i.test(response.description ?? ''),
        );
        expect({ operation: operation.operationId, described }).toEqual({
          operation: operation.operationId,
          described: true,
        });
      }
    });

    it('has no field that says a ticket was sent to the vendor', () => {
      expect(JSON.stringify(operations)).not.toMatch(/ticketSent|sentToVendor|vendorTicketSent/);
    });
  });
});
