import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { TransientDatabaseError } from '../../../src/infrastructure/database/transaction-runner';
import {
  AiDisabledError,
  AiProviderUnavailableError,
  NoAssignedStepsError,
  SummaryNotFoundError,
  SummarySourceStaleError,
} from '../../../src/modules/ai-assist/queue-summary/queue-summary.errors';
import { QueueSummaryService } from '../../../src/modules/ai-assist/queue-summary/queue-summary.service';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal, UNAVAILABLE_TOKEN } from '../../support/http-contract-app';

const BASE = '/api/v1/ai/access-request-summaries';
const INVOCATION_ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const REQUEST_ID = '7a1f0c54-2e1b-4a6a-9d2c-5b7a1e9c0d22';
const STEP_ID = '9c0d1e2f-3a4b-4c5d-8e6f-7a8b9c0d1e2f';
const REVISION = 'a'.repeat(64);

const VIEW = {
  invocationId: INVOCATION_ID,
  status: 'COMPLETED',
  createdAt: '2026-11-04T03:00:00.000Z',
  sourceStale: false,
  simulated: false,
  omittedCount: 1,
  items: [
    { requestId: REQUEST_ID, stepId: STEP_ID, stepKind: 'NEED_APPROVAL', summary: 'An cần Figma trong 3 tháng.' },
  ],
  errorCode: null,
};

/** The three routes of the AI summary of the queue of a person, with the service behind them replaced: no database, no AI service. */
describe('the AI summary of the approval queue (e2e, no database)', () => {
  let app: INestApplication<App>;
  const create = jest.fn<Promise<unknown>, [{ appUserId: string; employeeId: string }, { queueRevision: string }]>();
  const get = jest.fn<Promise<unknown>, [{ appUserId: string }, string]>();
  const readSource = jest.fn<Promise<unknown>, [{ employeeId: string }]>();

  beforeAll(async () => {
    app = await createHttpContractApp({
      overrides: [{ token: QueueSummaryService, useValue: { create, get, readSource } }],
    });
  });

  beforeEach(() => {
    create.mockReset().mockResolvedValue({ invocationId: INVOCATION_ID, status: 'PENDING' });
    get.mockReset().mockResolvedValue(VIEW);
    readSource.mockReset().mockResolvedValue({ queueRevision: REVISION, stepCount: 2, omittedCount: 0 });
  });

  afterAll(async () => {
    await app?.close();
  });

  const as = (...roles: string[]) =>
    bearer(principal(roles, { appUserId: 'caller-account', employeeId: 'caller-employee' }));
  const server = () => app.getHttpServer();

  const ROUTES: Array<[string, (token?: string) => request.Test]> = [
    ['POST', (token) => withToken(request(server()).post(BASE).send({ queueRevision: REVISION }), token)],
    ['GET {invocationId}', (token) => withToken(request(server()).get(`${BASE}/${INVOCATION_ID}`), token)],
    ['GET source', (token) => withToken(request(server()).get(`${BASE}/source`), token)],
  ];
  const withToken = (call: request.Test, token?: string) =>
    token === undefined ? call : call.set('Authorization', token);

  describe('who may call them', () => {
    it.each(ROUTES)('%s needs a token', async (_name, call) => {
      const response = await call().expect(401);

      expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
      expect(create).not.toHaveBeenCalled();
      expect(get).not.toHaveBeenCalled();
      expect(readSource).not.toHaveBeenCalled();
    });

    it.each(ROUTES)('%s answers 503 when the token cannot be checked, never 401', async (_name, call) => {
      const response = await call(`Bearer ${UNAVAILABLE_TOKEN}`).expect(503);

      expect(bodyOf(response).error.code).toBe('TOKEN_VERIFICATION_UNAVAILABLE');
    });

    it.each([
      ['an employee', ['EMPLOYEE']],
      ['a department head', ['MANAGER']],
      ['the spending approver', ['SPENDING_APPROVER']],
    ])('lets %s through to the handler: what they read is decided by the steps given to them', async (_name, roles) => {
      await request(server())
        .get(`${BASE}/source`)
        .set('Authorization', as(...roles))
        .expect(200);
      await request(server())
        .get(`${BASE}/${INVOCATION_ID}`)
        .set('Authorization', as(...roles))
        .expect(200);
      await request(server())
        .post(BASE)
        .set('Authorization', as(...roles))
        .send({ queueRevision: REVISION })
        .expect(202);
    });
  });

  describe('POST: asking for a summary', () => {
    it('answers 202 with the call and its state, for the caller and the revision they read', async () => {
      const response = await request(server())
        .post(BASE)
        .set('Authorization', as('MANAGER'))
        .send({ queueRevision: REVISION })
        .expect(202);

      expect(bodyOf(response)).toEqual({
        success: true,
        message: 'AI.SUMMARY_ACCEPTED',
        data: { invocationId: INVOCATION_ID, status: 'PENDING' },
      });
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({ appUserId: 'caller-account', employeeId: 'caller-employee' }),
        { queueRevision: REVISION },
      );
    });

    it('answers 202 with FAILED, not 500, when the queue could not be read: the call is recorded as failed', async () => {
      create.mockResolvedValueOnce({ invocationId: INVOCATION_ID, status: 'FAILED' });

      const response = await request(server())
        .post(BASE)
        .set('Authorization', as('MANAGER'))
        .send({ queueRevision: REVISION })
        .expect(202);

      expect(bodyOf(response).data).toEqual({ invocationId: INVOCATION_ID, status: 'FAILED' });
    });

    it.each([
      ['an unknown field', { queueRevision: REVISION, force: true }],
      ['no revision', {}],
      ['an empty revision', { queueRevision: '' }],
      ['a revision of 129 characters', { queueRevision: 'a'.repeat(129) }],
      ['a revision that is not a string', { queueRevision: 7 }],
    ])('refuses %s with 422, before anything is read', async (_name, body) => {
      const response = await request(server()).post(BASE).set('Authorization', as('MANAGER')).send(body).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
      expect(create).not.toHaveBeenCalled();
    });

    it.each([
      ['the switch is off', new AiDisabledError(), 403, 'AI.DISABLED'],
      ['no step waits for the person', new NoAssignedStepsError(), 403, 'AI.NO_ASSIGNED_STEPS'],
      ['the queue changed since it was read', new SummarySourceStaleError(), 409, 'AI.SOURCE_STALE'],
      ['no AI service is available', new AiProviderUnavailableError(), 503, 'AI.PROVIDER_UNAVAILABLE'],
    ])('maps the case where %s to its own status and code', async (_name, error, status, code) => {
      create.mockRejectedValueOnce(error);

      const response = await request(server())
        .post(BASE)
        .set('Authorization', as('MANAGER'))
        .send({ queueRevision: REVISION })
        .expect(status);

      expect(bodyOf(response).error.code).toBe(code);
    });

    it('answers 503 SERVICE_UNAVAILABLE when the database cannot answer', async () => {
      create.mockRejectedValueOnce(new TransientDatabaseError('57P01', new Error('terminating connection')));

      const response = await request(server())
        .post(BASE)
        .set('Authorization', as('MANAGER'))
        .send({ queueRevision: REVISION })
        .expect(503);

      expect(bodyOf(response).error.code).toBe('SERVICE_UNAVAILABLE');
    });

    it('answers an error nobody expected with 500 and none of its message', async () => {
      create.mockRejectedValueOnce(new Error('internal: prompt text of Nguyễn An, token=abc123'));

      const response = await request(server())
        .post(BASE)
        .set('Authorization', as('MANAGER'))
        .send({ queueRevision: REVISION })
        .expect(500);

      expect(bodyOf(response).error.code).toBe('INTERNAL_SERVER_ERROR');
      expect(JSON.stringify(response.body)).not.toMatch(/prompt text|abc123|Nguyễn/);
    });

    it("does not put the message of a refusal in the answer: the text is the mapper's own", async () => {
      create.mockRejectedValueOnce(Object.assign(new NoAssignedStepsError(), { message: 'internal: R001 Figma' }));

      const response = await request(server())
        .post(BASE)
        .set('Authorization', as('MANAGER'))
        .send({ queueRevision: REVISION })
        .expect(403);

      expect(JSON.stringify(response.body)).not.toContain('R001');
    });
  });

  describe('GET {invocationId}: reading a summary', () => {
    it('answers 200 with the summary of the caller read against the queue now', async () => {
      const response = await request(server())
        .get(`${BASE}/${INVOCATION_ID}`)
        .set('Authorization', as('MANAGER'))
        .expect(200);

      const { items, ...rest } = VIEW;
      // The service says `items`; on the wire the lines are `lines` (a GET with `items` is a collection to the contract gate).
      expect(bodyOf(response)).toEqual({ success: true, message: 'AI.SUMMARY_READ', data: { ...rest, lines: items } });
      expect(get).toHaveBeenCalledWith(expect.objectContaining({ appUserId: 'caller-account' }), INVOCATION_ID);
    });

    it('carries simulated true for a summary composed by the simulation, so the label "not AI" is always shown', async () => {
      get.mockResolvedValueOnce({ ...VIEW, simulated: true });

      const response = await request(server())
        .get(`${BASE}/${INVOCATION_ID}`)
        .set('Authorization', as('MANAGER'))
        .expect(200);

      expect(bodyOf(response).data).toMatchObject({ simulated: true, status: 'COMPLETED' });
    });

    it.each([
      ['a failed call', { status: 'FAILED', items: [], omittedCount: 0, errorCode: 'AI.PROVIDER_UNAVAILABLE' }],
      [
        'a call whose lines did not pass',
        { status: 'NO_VALID_OUTPUT', items: [], omittedCount: 0, errorCode: 'AI.NO_VALID_OUTPUT' },
      ],
      [
        'a call whose queue could not be read',
        { status: 'FAILED', items: [], omittedCount: 0, errorCode: 'AI.SOURCE_UNREADABLE' },
      ],
      [
        'a run that failed unexpectedly',
        { status: 'FAILED', items: [], omittedCount: 0, errorCode: 'AI.INTERNAL_ERROR' },
      ],
      ['a call still running', { status: 'RUNNING', items: [], omittedCount: 0, errorCode: null }],
    ])('carries %s in the body with 200, never as an HTTP status', async (_name, change) => {
      get.mockResolvedValueOnce({ ...VIEW, ...change });

      const response = await request(server())
        .get(`${BASE}/${INVOCATION_ID}`)
        .set('Authorization', as('MANAGER'))
        .expect(200);

      const { items, ...wire } = change;
      expect(bodyOf(response).data).toMatchObject({ ...wire, lines: items });
    });

    it.each([
      ['a word', 'source-of-truth'],
      ['a number', '12345'],
      ['an id with a character too many', `${INVOCATION_ID}0`],
    ])('refuses %s as the id with 422, before anything is read', async (_name, id) => {
      const response = await request(server()).get(`${BASE}/${id}`).set('Authorization', as('MANAGER')).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
      expect(get).not.toHaveBeenCalled();
    });

    it("answers 404 AI.NOT_FOUND for a summary that is not there or is somebody else's, the same for both", async () => {
      get.mockRejectedValueOnce(new SummaryNotFoundError());

      const response = await request(server())
        .get(`${BASE}/${INVOCATION_ID}`)
        .set('Authorization', as('MANAGER'))
        .expect(404);

      expect(bodyOf(response).error.code).toBe('AI.NOT_FOUND');
    });

    it('asks the service for the summary as the caller, so a person never reads the summary of another', async () => {
      get.mockImplementation((actor) =>
        actor.appUserId === 'owner-account' ? Promise.resolve(VIEW) : Promise.reject(new SummaryNotFoundError()),
      );
      const stranger = bearer(principal(['MANAGER'], { appUserId: 'other-account' }));
      const owner = bearer(principal(['MANAGER'], { appUserId: 'owner-account' }));

      await request(server()).get(`${BASE}/${INVOCATION_ID}`).set('Authorization', stranger).expect(404);
      await request(server()).get(`${BASE}/${INVOCATION_ID}`).set('Authorization', owner).expect(200);
    });

    it('answers 503 SERVICE_UNAVAILABLE when the database cannot answer', async () => {
      get.mockRejectedValueOnce(new TransientDatabaseError('57P01', new Error('terminating connection')));

      const response = await request(server())
        .get(`${BASE}/${INVOCATION_ID}`)
        .set('Authorization', as('MANAGER'))
        .expect(503);

      expect(bodyOf(response).error.code).toBe('SERVICE_UNAVAILABLE');
    });
  });

  describe('GET source: the queue the person sees, without the AI service', () => {
    it('answers 200 with the revision and the counts, and is not taken for the id of a summary', async () => {
      const response = await request(server()).get(`${BASE}/source`).set('Authorization', as('MANAGER')).expect(200);

      expect(bodyOf(response)).toEqual({
        success: true,
        message: 'AI.SUMMARY_SOURCE_READ',
        data: { queueRevision: REVISION, stepCount: 2, omittedCount: 0 },
      });
      expect(readSource).toHaveBeenCalledWith(expect.objectContaining({ employeeId: 'caller-employee' }));
      expect(get).not.toHaveBeenCalled();
    });

    it('answers 200 with stepCount 0 when no step waits for the person', async () => {
      readSource.mockResolvedValueOnce({ queueRevision: REVISION, stepCount: 0, omittedCount: 0 });

      const response = await request(server()).get(`${BASE}/source`).set('Authorization', as('EMPLOYEE')).expect(200);

      expect(bodyOf(response).data).toEqual({ queueRevision: REVISION, stepCount: 0, omittedCount: 0 });
    });

    it('answers 403 AI.DISABLED when a switch is off', async () => {
      readSource.mockRejectedValueOnce(new AiDisabledError());

      const response = await request(server()).get(`${BASE}/source`).set('Authorization', as('MANAGER')).expect(403);

      expect(bodyOf(response).error.code).toBe('AI.DISABLED');
    });

    it('answers 503 SERVICE_UNAVAILABLE when the database cannot answer', async () => {
      readSource.mockRejectedValueOnce(new TransientDatabaseError('57P01', new Error('terminating connection')));

      const response = await request(server()).get(`${BASE}/source`).set('Authorization', as('MANAGER')).expect(503);

      expect(bodyOf(response).error.code).toBe('SERVICE_UNAVAILABLE');
    });
  });
});
