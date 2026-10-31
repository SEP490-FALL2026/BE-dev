import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { RenewalDecisionService } from '../../../src/modules/licensing/subscription-renewal/decision/renewal-decision.service';
import { RenewalOutcomeService } from '../../../src/modules/licensing/subscription-renewal/outcome/renewal-outcome.service';
import { RenewalProposalService } from '../../../src/modules/licensing/subscription-renewal/proposal/renewal-proposal.service';
import { RenewalError } from '../../../src/modules/licensing/subscription-renewal/subscription-renewal.errors';
import { RenewalViewService } from '../../../src/modules/licensing/subscription-renewal/subscription-renewal-view.service';
import { FinanceSetupIncompleteError } from '../../../src/modules/organization/public/organization.errors';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const ID = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const SUB = '7a1e9c0d-3f0c-4f6a-8d2c-5b7a1e9c0d22';

type Call = (server: App) => request.Test;

const NEXT_PERIOD = {
  purchasedQuantity: 88,
  unitPrice: { amount: '120', currency: 'USD' },
  billingCycle: 'ANNUAL',
  startDate: '2027-01-01',
  endDate: '2027-12-31',
  autoRenew: true,
  allowsMidTermReduction: false,
};

const ROUTES: Array<[string, Call]> = [
  ['GET /subscription-renewals', (s) => request(s).get('/api/v1/subscription-renewals')],
  ['GET /subscription-renewals/{id}', (s) => request(s).get(`/api/v1/subscription-renewals/${ID}`)],
  [
    'GET /subscription-renewals/{id}/seat-ranking',
    (s) => request(s).get(`/api/v1/subscription-renewals/${ID}/seat-ranking`),
  ],
  [
    'POST /subscription-renewals',
    (s) => request(s).post('/api/v1/subscription-renewals').send({ subscriptionId: SUB, choice: 'RENEW' }),
  ],
  [
    'POST /subscription-renewals/{id}/decision',
    (s) => request(s).post(`/api/v1/subscription-renewals/${ID}/decision`).send({ choice: 'RENEW' }),
  ],
  [
    'POST /subscription-renewals/{id}/outcome',
    (s) => request(s).post(`/api/v1/subscription-renewals/${ID}/outcome`).send({ outcome: 'UNCONFIRMED' }),
  ],
  ['GET /subscription-deadline-events', (s) => request(s).get('/api/v1/subscription-deadline-events')],
];

/** What a stand-in service throws for each test; the HTTP mapping is what is proven here. */
let next: Error | null = null;
const throwing = async () => {
  if (next) throw next;
  return Promise.reject(new Error('the stand-in was reached without an answer'));
};

describe('subscription renewal routes (e2e, no database)', () => {
  let app: INestApplication<App>;
  const as = (roles: string[]) => bearer(principal(roles));

  beforeAll(async () => {
    app = await createHttpContractApp({
      overrides: [
        {
          token: RenewalViewService,
          useValue: {
            list: throwing,
            get: throwing,
            seatRanking: throwing,
            deadlineEvents: throwing,
            detailOf: throwing,
          },
        },
        { token: RenewalProposalService, useValue: { propose: throwing } },
        { token: RenewalDecisionService, useValue: { decide: throwing } },
        { token: RenewalOutcomeService, useValue: { record: throwing } },
      ],
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  afterEach(() => {
    next = null;
  });

  it.each(ROUTES)('%s without a token is 401', async (_name, call) => {
    const response = await call(app.getHttpServer()).expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  describe('roles checked before any work', () => {
    it.each([
      ['FINANCE', 'propose'],
      ['SPENDING_APPROVER', 'propose'],
      ['EMPLOYEE', 'propose'],
      ['SPENDING_APPROVER', 'record the outcome'],
      ['FINANCE', 'record the outcome'],
    ])('%s may not %s (SoD-3, SoD-7)', async (role, action) => {
      const call =
        action === 'propose'
          ? request(app.getHttpServer())
              .post('/api/v1/subscription-renewals')
              .send({ subscriptionId: SUB, choice: 'RENEW' })
          : request(app.getHttpServer())
              .post(`/api/v1/subscription-renewals/${ID}/outcome`)
              .send({ outcome: 'UNCONFIRMED' });
      const response = await call.set('Authorization', as([role])).expect(403);

      expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
    });

    it.each([['FINANCE'], ['EMPLOYEE'], ['MANAGER']])('%s does not read the milestone events', async (role) => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/subscription-deadline-events')
        .set('Authorization', as([role]))
        .expect(403);

      expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
    });
  });

  describe('the refusals of the services, as their codes (SoD-2, SoD-3, US-11-02 AC-2, AC-20, US-11-05 AC-9)', () => {
    it.each<[string, Error, number, string, Call, string[]]>([
      [
        'a head reading the queue',
        new RenewalError('READ_FORBIDDEN'),
        403,
        'SUBSCRIPTION_RENEWAL.READ_FORBIDDEN',
        (s) => request(s).get('/api/v1/subscription-renewals'),
        ['MANAGER'],
      ],
      [
        'an IT Admin deciding',
        new RenewalError('NOT_DECIDER'),
        403,
        'SUBSCRIPTION_RENEWAL.NOT_DECIDER',
        (s) => request(s).post(`/api/v1/subscription-renewals/${ID}/decision`).send({ choice: 'RENEW' }),
        ['IT_ADMIN'],
      ],
      [
        'a cancellation in use not confirmed',
        new RenewalError('ACTIVE_USERS_NOT_ACKNOWLEDGED', { seatsInUse: 5 }),
        409,
        'SUBSCRIPTION_RENEWAL.ACTIVE_USERS_NOT_ACKNOWLEDGED',
        (s) => request(s).post(`/api/v1/subscription-renewals/${ID}/decision`).send({ choice: 'CANCEL' }),
        ['SPENDING_APPROVER'],
      ],
      [
        'a renewal of a department without a Cost Center',
        new FinanceSetupIncompleteError('dep'),
        409,
        'FINANCE.SETUP_INCOMPLETE',
        (s) => request(s).post(`/api/v1/subscription-renewals/${ID}/decision`).send({ choice: 'RENEW' }),
        ['SPENDING_APPROVER'],
      ],
      [
        'three seats chosen for four to go',
        new RenewalError('EXCESS_SELECTION_INVALID', { required: 4, selected: 3 }),
        422,
        'SUBSCRIPTION_RENEWAL.EXCESS_SELECTION_INVALID',
        (s) =>
          request(s)
            .post(`/api/v1/subscription-renewals/${ID}/decision`)
            .send({
              choice: 'REDUCE',
              quantity: 88,
              releasedAssignmentIds: [SUB, ID, '11111111-1111-4111-8111-111111111111'],
            }),
        ['SPENDING_APPROVER'],
      ],
      [
        'an outcome with more seats in use than bought',
        new RenewalError('EXCESS_NOT_REVOKED', { seatsInUse: 89, quantity: 88 }),
        409,
        'SUBSCRIPTION_RENEWAL.EXCESS_NOT_REVOKED',
        (s) =>
          request(s)
            .post(`/api/v1/subscription-renewals/${ID}/outcome`)
            .send({ outcome: 'AS_DECIDED', nextPeriod: NEXT_PERIOD }),
        ['IT_ADMIN'],
      ],
      [
        'a period with no milestone',
        new RenewalError('CONTRACT_DATA_INCOMPLETE'),
        409,
        'SUBSCRIPTION_RENEWAL.CONTRACT_DATA_INCOMPLETE',
        (s) => request(s).post('/api/v1/subscription-renewals').send({ subscriptionId: SUB, choice: 'RENEW' }),
        ['IT_ADMIN'],
      ],
    ])('answers %s', async (_name, error, status, code, call, roles) => {
      next = error;
      const response = await call(app.getHttpServer()).set('Authorization', as(roles)).expect(status);

      expect(bodyOf(response).error.code).toBe(code);
      if (error instanceof RenewalError && Object.keys(error.details).length > 0) {
        expect(bodyOf(response).error.details).toEqual(error.details);
      }
    });
  });

  describe('validation before any work', () => {
    it.each<[string, string[], Call]>([
      [
        'a renewal id that is not an id',
        ['IT_ADMIN'],
        (s) => request(s).get('/api/v1/subscription-renewals/not-an-id'),
      ],
      ['a state that does not exist', ['IT_ADMIN'], (s) => request(s).get('/api/v1/subscription-renewals?state=DONE')],
      [
        'a late flag that is not a flag',
        ['IT_ADMIN'],
        (s) => request(s).get('/api/v1/subscription-renewals?late=maybe'),
      ],
      [
        'a page size over the limit',
        ['IT_ADMIN'],
        (s) => request(s).get(`/api/v1/subscription-renewals/${ID}/seat-ranking?pageSize=101`),
      ],
      [
        'a proposal with an unknown choice',
        ['IT_ADMIN'],
        (s) => request(s).post('/api/v1/subscription-renewals').send({ subscriptionId: SUB, choice: 'PAUSE' }),
      ],
      [
        'a proposal with a negative quantity',
        ['IT_ADMIN'],
        (s) =>
          request(s)
            .post('/api/v1/subscription-renewals')
            .send({ subscriptionId: SUB, choice: 'REDUCE', proposedQuantity: -1 }),
      ],
      [
        'a proposal with an unknown field',
        ['IT_ADMIN'],
        (s) =>
          request(s)
            .post('/api/v1/subscription-renewals')
            .send({ subscriptionId: SUB, choice: 'RENEW', commitment: true }),
      ],
      [
        'a decision with seats that are not ids',
        ['SPENDING_APPROVER'],
        (s) =>
          request(s)
            .post(`/api/v1/subscription-renewals/${ID}/decision`)
            .send({ choice: 'REDUCE', quantity: 8, releasedAssignmentIds: ['x'] }),
      ],
      [
        'an outcome that does not exist',
        ['IT_ADMIN'],
        (s) => request(s).post(`/api/v1/subscription-renewals/${ID}/outcome`).send({ outcome: 'DONE' }),
      ],
      [
        'a new period with a date that does not exist',
        ['IT_ADMIN'],
        (s) =>
          request(s)
            .post(`/api/v1/subscription-renewals/${ID}/outcome`)
            .send({ outcome: 'AS_DECIDED', nextPeriod: { ...NEXT_PERIOD, startDate: '2027-02-30' } }),
      ],
      [
        'a new period with a price as a number',
        ['IT_ADMIN'],
        (s) =>
          request(s)
            .post(`/api/v1/subscription-renewals/${ID}/outcome`)
            .send({
              outcome: 'AS_DECIDED',
              nextPeriod: { ...NEXT_PERIOD, unitPrice: { amount: 120, currency: 'USD' } },
            }),
      ],
      [
        'a milestone event kind that does not exist',
        ['IT_ADMIN'],
        (s) => request(s).get('/api/v1/subscription-deadline-events?kind=LATE'),
      ],
    ])('refuses %s with 422', async (_name, roles, call) => {
      const response = await call(app.getHttpServer()).set('Authorization', as(roles)).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    });
  });
});
