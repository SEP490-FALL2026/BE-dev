import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { TransientDatabaseError } from '../../../src/infrastructure/database/transaction-runner';
import { InvocationContentNotFoundError } from '../../../src/modules/ai-assist/invocation-content/invocation-content.errors';
import { InvocationContentQueryService } from '../../../src/modules/ai-assist/invocation-content/invocation-content-query.service';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal, UNAVAILABLE_TOKEN } from '../../support/http-contract-app';

const INVOCATION_ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const URL = `/api/v1/ai/invocations/${INVOCATION_ID}/content`;

const CONTENT = {
  invocationId: INVOCATION_ID,
  providerMode: 'MODEL',
  context: { generatedAt: '2026-11-04T09:00:00.000Z', requests: [{ sourceRef: 'R001', softwareName: 'Figma' }] },
  promptText: 'the prompt',
  rawResponse: '{"items":[]}',
  parsed: { items: [] },
  result: { total: 1, steps: [], accepted: [], rejections: [] },
};

/** The route that gives the Super Admin what was said to the AI and what it answered, with the service behind it replaced. */
describe('the content of a call of the AI (e2e, no database)', () => {
  let app: INestApplication<App>;
  const read = jest.fn<Promise<unknown>, [{ appUserId: string; roles: string[] }, string]>();

  beforeAll(async () => {
    app = await createHttpContractApp({ overrides: [{ token: InvocationContentQueryService, useValue: { read } }] });
  });

  beforeEach(() => {
    read.mockReset().mockResolvedValue(CONTENT);
  });

  afterAll(async () => {
    await app?.close();
  });

  const server = () => app.getHttpServer();
  const as = (roles: string[], appUserId = 'caller-account') => bearer(principal(roles, { appUserId }));

  describe('who may read it', () => {
    it('needs a token', async () => {
      const response = await request(server()).get(URL).expect(401);

      expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
      expect(read).not.toHaveBeenCalled();
    });

    it('answers 503 when the token cannot be checked, never 401', async () => {
      const response = await request(server()).get(URL).set('Authorization', `Bearer ${UNAVAILABLE_TOKEN}`).expect(503);

      expect(bodyOf(response).error.code).toBe('TOKEN_VERIFICATION_UNAVAILABLE');
    });

    it.each([
      ['an employee', ['EMPLOYEE']],
      ['a department head', ['MANAGER']],
      ['the spending approver', ['SPENDING_APPROVER']],
      ['Finance', ['FINANCE']],
      ['the IT Admin', ['IT_ADMIN']],
      ['a person with every role but Super Admin', ['EMPLOYEE', 'MANAGER', 'SPENDING_APPROVER', 'FINANCE', 'IT_ADMIN']],
    ])('refuses %s with 403, before the service is reached', async (_name, roles) => {
      const response = await request(server()).get(URL).set('Authorization', as(roles)).expect(403);

      expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
      expect(read).not.toHaveBeenCalled();
    });

    it('refuses the owner of the call with 403 when they are not the Super Admin: owning a call opens nothing', async () => {
      const response = await request(server())
        .get(URL)
        .set('Authorization', as(['MANAGER'], 'owner-account'))
        .expect(403);

      expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
      expect(read).not.toHaveBeenCalled();
    });
  });

  describe('reading it', () => {
    it('answers 200 with the content, as the Super Admin who reads it', async () => {
      const response = await request(server())
        .get(URL)
        .set('Authorization', as(['SUPER_ADMIN'], 'root-account'))
        .expect(200);

      expect(bodyOf(response)).toEqual({ success: true, message: 'AI.CONTENT_READ', data: CONTENT });
      expect(read).toHaveBeenCalledWith(expect.objectContaining({ appUserId: 'root-account' }), INVOCATION_ID);
    });

    it('carries the mode the call was made in, SIMULATED for one the simulation answered', async () => {
      read.mockResolvedValueOnce({ ...CONTENT, providerMode: 'SIMULATED' });

      const response = await request(server())
        .get(URL)
        .set('Authorization', as(['SUPER_ADMIN']))
        .expect(200);

      expect(bodyOf(response).data).toEqual({ ...CONTENT, providerMode: 'SIMULATED' });
    });

    it('carries the fields the table lets be empty as null, not as missing', async () => {
      const empty = { ...CONTENT, promptText: null, rawResponse: null, parsed: null, result: null };
      read.mockResolvedValueOnce(empty);

      const response = await request(server())
        .get(URL)
        .set('Authorization', as(['SUPER_ADMIN']))
        .expect(200);

      expect(bodyOf(response).data).toEqual(empty);
    });

    it.each([
      ['a word', 'source-of-truth'],
      ['a number', '12345'],
      ['an id with a character too many', `${INVOCATION_ID}0`],
    ])('refuses %s as the id with 422, before anything is read', async (_name, id) => {
      const response = await request(server())
        .get(`/api/v1/ai/invocations/${id}/content`)
        .set('Authorization', as(['SUPER_ADMIN']))
        .expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
      expect(read).not.toHaveBeenCalled();
    });

    it('answers 404 AI.NOT_FOUND for a call that is not there, or whose content was purged', async () => {
      read.mockRejectedValueOnce(new InvocationContentNotFoundError());

      const response = await request(server())
        .get(URL)
        .set('Authorization', as(['SUPER_ADMIN']))
        .expect(404);

      expect(bodyOf(response).error.code).toBe('AI.NOT_FOUND');
    });

    it('answers 503 SERVICE_UNAVAILABLE when the database cannot answer', async () => {
      read.mockRejectedValueOnce(new TransientDatabaseError('57P01', new Error('terminating connection')));

      const response = await request(server())
        .get(URL)
        .set('Authorization', as(['SUPER_ADMIN']))
        .expect(503);

      expect(bodyOf(response).error.code).toBe('SERVICE_UNAVAILABLE');
    });

    it('answers an error nobody expected with 500 and none of its message', async () => {
      read.mockRejectedValueOnce(new Error('internal: prompt text of Nguyễn An, token=abc123'));

      const response = await request(server())
        .get(URL)
        .set('Authorization', as(['SUPER_ADMIN']))
        .expect(500);

      expect(bodyOf(response).error.code).toBe('INTERNAL_SERVER_ERROR');
      expect(JSON.stringify(response.body)).not.toMatch(/prompt text|abc123|Nguyễn/);
    });
  });
});
