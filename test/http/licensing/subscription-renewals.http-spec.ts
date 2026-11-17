import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { RenewalOutcomeService } from '../../../src/modules/licensing/subscription-renewal/outcome/renewal-outcome.service';
import { RenewalRecordService } from '../../../src/modules/licensing/subscription-renewal/record/renewal-record.service';
import { RenewalError } from '../../../src/modules/licensing/subscription-renewal/subscription-renewal.errors';
import { RenewalViewService } from '../../../src/modules/licensing/subscription-renewal/subscription-renewal-view.service';
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

/** A body the route takes: the choice with the seats, what the vendor did and the new period (`SBF-20` §4.4). */
const RECORD = {
  subscriptionId: SUB,
  choice: 'REDUCE',
  proposedQuantity: 8,
  outcome: 'AS_DECIDED',
  nextPeriod: { ...NEXT_PERIOD, purchasedQuantity: 8 },
};
const CLOSURE = { dataExported: true, adminsTransferred: true };

const ROUTES: Array<[string, Call]> = [
  ['GET /subscription-renewals', (s) => request(s).get('/api/v1/subscription-renewals')],
  [
    'GET /subscription-renewals/adjustment',
    (s) => request(s).get(`/api/v1/subscription-renewals/adjustment?subscriptionId=${SUB}`),
  ],
  ['GET /subscription-renewals/{id}', (s) => request(s).get(`/api/v1/subscription-renewals/${ID}`)],
  [
    'GET /subscription-renewals/{id}/seat-ranking',
    (s) => request(s).get(`/api/v1/subscription-renewals/${ID}/seat-ranking`),
  ],
  ['POST /subscription-renewals', (s) => request(s).post('/api/v1/subscription-renewals').send(RECORD)],
  [
    'POST /subscription-renewals/{id}/outcome',
    (s) => request(s).post(`/api/v1/subscription-renewals/${ID}/outcome`).send({ outcome: 'UNCONFIRMED' }),
  ],
  ['GET /subscription-deadline-events', (s) => request(s).get('/api/v1/subscription-deadline-events')],
];

/** What the route of the seats needed answers (`SBF-20` §5): the point, the count of the seats, the target and whether a cancellation is allowed. */
const ADJUSTMENT = {
  subscriptionId: SUB,
  commitment: 'MONTHLY',
  deadlineKind: 'PAYMENT_DATE',
  deadline: '2026-12-01',
  adjustmentPointOn: '2026-11-24',
  renewalOn: '2026-12-01',
  redAlertOn: null,
  purchasedQuantity: 10,
  vendorMinimumSeats: null,
  seatsNeeded: { total: 8, heldPastRenewal: 6, pendingContinuations: 1, approvedAwaitingGrant: 1 },
  target: 8,
  suggestedChoice: 'REDUCE',
  canCancel: false,
  activeSeatsToday: 7,
  openRequests: 1,
  responsibleItAdminEmployeeId: null,
  callerIsResponsible: false,
  recordedRenewalId: null,
};

/** What a stand-in service throws for each test; the HTTP mapping is what is proven here. */
let next: Error | null = null;
const throwing = async () => {
  if (next) throw next;
  return Promise.reject(new Error('the stand-in was reached without an answer'));
};
const adjustmentOf = jest.fn<Promise<unknown>, [unknown, string]>();
/** The reader of one case by id: the route of the seats needed must never reach it (R2-5). */
const caseGet = jest.fn(throwing);
const EMPTY_PAGE = { items: [], pagination: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } };
/** The page of events: empty unless the test asked for a refusal. */
const emptyPage = () => (next ? Promise.reject(next) : Promise.resolve(EMPTY_PAGE));

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
            get: caseGet,
            adjustmentOf,
            seatRanking: throwing,
            deadlineEvents: emptyPage,
            detailOf: throwing,
          },
        },
        { token: RenewalRecordService, useValue: { record: throwing } },
        { token: RenewalOutcomeService, useValue: { record: throwing } },
      ],
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    adjustmentOf.mockImplementation(async () => (next ? Promise.reject(next) : ADJUSTMENT));
  });

  afterEach(() => {
    next = null;
    jest.clearAllMocks();
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
          ? request(app.getHttpServer()).post('/api/v1/subscription-renewals').send(RECORD)
          : request(app.getHttpServer())
              .post(`/api/v1/subscription-renewals/${ID}/outcome`)
              .send({ outcome: 'UNCONFIRMED' });
      const response = await call.set('Authorization', as([role])).expect(403);

      expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
    });

    it.each([['EMPLOYEE'], ['MANAGER'], ['SPENDING_APPROVER'], ['SUPER_ADMIN']])(
      '%s does not read the seats a subscription needs (SBF-20 §7: the IT Admin and Finance only)',
      async (role) => {
        const response = await request(app.getHttpServer())
          .get(`/api/v1/subscription-renewals/adjustment?subscriptionId=${SUB}`)
          .set('Authorization', as([role]))
          .expect(403);

        expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
        expect(adjustmentOf).not.toHaveBeenCalled();
      },
    );

    it.each([['EMPLOYEE'], ['MANAGER']])('%s does not read the events of the renewal days', async (role) => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/subscription-deadline-events')
        .set('Authorization', as([role]))
        .expect(403);

      expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
    });

    it.each([['IT_ADMIN'], ['FINANCE'], ['SPENDING_APPROVER'], ['SUPER_ADMIN']])(
      '%s reads the events of the renewal days (S20-T7: Finance is told of them, so Finance reads them)',
      async (role) => {
        const response = await request(app.getHttpServer())
          .get('/api/v1/subscription-deadline-events')
          .set('Authorization', as([role]))
          .expect(200);

        expect(bodyOf(response).data).toEqual(EMPTY_PAGE);
      },
    );

    it.each([['IT_ADMIN'], ['MANAGER'], ['FINANCE']])(
      '%s finds no route to confirm a renewal: the head confirms nothing any more (QĐ-103e)',
      async (role) => {
        const response = await request(app.getHttpServer())
          .post(`/api/v1/subscription-renewals/${ID}/decision`)
          .set('Authorization', as([role]))
          .send({ decision: 'CONFIRM' })
          .expect(404);

        expect(bodyOf(response).error.code).toBe('HTTP_NOT_FOUND');
      },
    );
  });

  describe('the seats a subscription needs, read before the result is recorded (S20-T5, R2-5)', () => {
    const URL = `/api/v1/subscription-renewals/adjustment?subscriptionId=${SUB}`;

    it.each([['IT_ADMIN'], ['FINANCE']])(
      '%s reads it with 200: declared before the route of a case by id, it never falls to it',
      async (role) => {
        const response = await request(app.getHttpServer())
          .get(URL)
          .set('Authorization', as([role]))
          .expect(200);

        const body = bodyOf(response);
        expect(body.message).toBe('SUBSCRIPTION_RENEWAL.ADJUSTMENT_FOUND');
        expect(body.data).toEqual({ adjustment: ADJUSTMENT });
        expect(adjustmentOf).toHaveBeenCalledWith(expect.objectContaining({ roles: [role] }), SUB);
        expect(caseGet).not.toHaveBeenCalled();
      },
    );

    it('still answers a case by id on its own route', async () => {
      next = new RenewalError('NOT_FOUND');
      const response = await request(app.getHttpServer())
        .get(`/api/v1/subscription-renewals/${ID}`)
        .set('Authorization', as(['IT_ADMIN']))
        .expect(404);

      expect(bodyOf(response).error.code).toBe('SUBSCRIPTION_RENEWAL.NOT_FOUND');
      expect(caseGet).toHaveBeenCalledTimes(1);
      expect(adjustmentOf).not.toHaveBeenCalled();
    });

    it.each<[string, Error, number, string]>([
      [
        'a subscription of a department (K1), which has no point',
        new RenewalError('NOT_RENEWABLE', { reason: 'NOT_POOL_TERM' }),
        409,
        'SUBSCRIPTION_RENEWAL.NOT_RENEWABLE',
      ],
      [
        'a subscription with no date to count from',
        new RenewalError('CONTRACT_DATA_INCOMPLETE'),
        409,
        'SUBSCRIPTION_RENEWAL.CONTRACT_DATA_INCOMPLETE',
      ],
      ['a subscription that does not exist', new RenewalError('NOT_FOUND'), 404, 'SUBSCRIPTION_RENEWAL.NOT_FOUND'],
    ])('answers %s', async (_name, error, status, code) => {
      next = error;
      const response = await request(app.getHttpServer())
        .get(URL)
        .set('Authorization', as(['FINANCE']))
        .expect(status);

      expect(bodyOf(response).error.code).toBe(code);
      if (error instanceof RenewalError && Object.keys(error.details).length > 0) {
        expect(bodyOf(response).error.details).toEqual(error.details);
      }
    });

    it.each([
      ['no subscription', '/api/v1/subscription-renewals/adjustment'],
      ['a subscription that is not an id', '/api/v1/subscription-renewals/adjustment?subscriptionId=x'],
      ['a filter the route does not know', `/api/v1/subscription-renewals/adjustment?subscriptionId=${SUB}&page=1`],
    ])('refuses %s with 422', async (_name, url) => {
      const response = await request(app.getHttpServer())
        .get(url)
        .set('Authorization', as(['IT_ADMIN']))
        .expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
      expect(adjustmentOf).not.toHaveBeenCalled();
    });
  });

  describe('the refusals of the services, as their codes (SoD-2, SoD-3, US-11-02 AC-2, AC-20, US-11-05 AC-9)', () => {
    it.each<[string, Error, number, string, Call, string[]]>([
      [
        'an employee reading the queue',
        new RenewalError('READ_FORBIDDEN'),
        403,
        'SUBSCRIPTION_RENEWAL.READ_FORBIDDEN',
        (s) => request(s).get('/api/v1/subscription-renewals'),
        ['EMPLOYEE'],
      ],
      [
        'a head of another department reading a case',
        new RenewalError('NOT_FOUND'),
        404,
        'SUBSCRIPTION_RENEWAL.NOT_FOUND',
        (s) => request(s).get(`/api/v1/subscription-renewals/${ID}`),
        ['MANAGER'],
      ],
      [
        'a result recorded before the point of adjustment',
        new RenewalError('BEFORE_ADJUSTMENT_POINT', { adjustmentPointOn: '2026-11-24', deadline: '2026-12-01' }),
        409,
        'SUBSCRIPTION_RENEWAL.BEFORE_ADJUSTMENT_POINT',
        (s) => request(s).post('/api/v1/subscription-renewals').send(RECORD),
        ['IT_ADMIN'],
      ],
      [
        'a quantity that is not the seats the next period needs',
        new RenewalError('QUANTITY_NOT_SEATS_NEEDED', {
          seatsNeeded: 8,
          vendorMinimumSeats: 5,
          target: 8,
          quantity: 7,
        }),
        409,
        'SUBSCRIPTION_RENEWAL.QUANTITY_NOT_SEATS_NEEDED',
        (s) => request(s).post('/api/v1/subscription-renewals').send(RECORD),
        ['IT_ADMIN'],
      ],
      [
        'a cancellation while seats are needed, in effect or asked for',
        new RenewalError('CANCEL_NOT_ALLOWED', {
          seatsNeeded: 8,
          heldPastRenewal: 6,
          pendingContinuations: 1,
          approvedAwaitingGrant: 1,
          activeSeatsToday: 7,
          openRequests: 1,
        }),
        409,
        'SUBSCRIPTION_RENEWAL.CANCEL_NOT_ALLOWED',
        (s) =>
          request(s)
            .post('/api/v1/subscription-renewals')
            .send({ ...RECORD, choice: 'CANCEL', proposedQuantity: undefined, closure: CLOSURE }),
        ['IT_ADMIN'],
      ],
      [
        'a subscription that has no point of adjustment, with the reason',
        new RenewalError('NOT_RENEWABLE', { reason: 'NOT_POOL_TERM' }),
        409,
        'SUBSCRIPTION_RENEWAL.NOT_RENEWABLE',
        (s) => request(s).post('/api/v1/subscription-renewals').send(RECORD),
        ['IT_ADMIN'],
      ],
      [
        'a subscription already recorded as cancelled, with the reason CANCELLED (A1C-02)',
        new RenewalError('NOT_RENEWABLE', { reason: 'CANCELLED' }),
        409,
        'SUBSCRIPTION_RENEWAL.NOT_RENEWABLE',
        (s) => request(s).post('/api/v1/subscription-renewals').send(RECORD),
        ['IT_ADMIN'],
      ],
      [
        'a period that already has its result, with the case',
        new RenewalError('ALREADY_PROPOSED', { renewalId: ID }),
        409,
        'SUBSCRIPTION_RENEWAL.ALREADY_PROPOSED',
        (s) => request(s).post('/api/v1/subscription-renewals').send(RECORD),
        ['IT_ADMIN'],
      ],
      [
        'seats above the need without the evidence of the vendor minimum',
        new RenewalError('VENDOR_MINIMUM_EVIDENCE_REQUIRED', { seatsNeeded: 3, vendorMinimumSeats: 5 }),
        422,
        'SUBSCRIPTION_RENEWAL.VENDOR_MINIMUM_EVIDENCE_REQUIRED',
        (s) => request(s).post('/api/v1/subscription-renewals').send(RECORD),
        ['IT_ADMIN'],
      ],
      [
        'a quantity that does not fit the choice',
        new RenewalError('QUANTITY_INVALID'),
        422,
        'SUBSCRIPTION_RENEWAL.QUANTITY_INVALID',
        (s) =>
          request(s)
            .post('/api/v1/subscription-renewals')
            .send({ ...RECORD, choice: 'INCREASE' }),
        ['IT_ADMIN'],
      ],
      [
        'an outcome as decided that does not buy the seats recorded',
        new RenewalError('OUTCOME_MISMATCH'),
        422,
        'SUBSCRIPTION_RENEWAL.OUTCOME_MISMATCH',
        (s) => request(s).post('/api/v1/subscription-renewals').send(RECORD),
        ['IT_ADMIN'],
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
        (s) => request(s).post('/api/v1/subscription-renewals').send(RECORD),
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
        'a result with an unknown choice',
        ['IT_ADMIN'],
        (s) =>
          request(s)
            .post('/api/v1/subscription-renewals')
            .send({ ...RECORD, choice: 'PAUSE' }),
      ],
      [
        'a result with a negative quantity',
        ['IT_ADMIN'],
        (s) =>
          request(s)
            .post('/api/v1/subscription-renewals')
            .send({ ...RECORD, proposedQuantity: -1 }),
      ],
      [
        'a result with no outcome (the route records what was done, in one write)',
        ['IT_ADMIN'],
        (s) =>
          request(s)
            .post('/api/v1/subscription-renewals')
            .send({ subscriptionId: SUB, choice: 'REDUCE', proposedQuantity: 8 }),
      ],
      [
        'a result with an unknown field',
        ['IT_ADMIN'],
        (s) =>
          request(s)
            .post('/api/v1/subscription-renewals')
            .send({ ...RECORD, commitment: true }),
      ],
      [
        'a result that still names the seats to take back (no seat is chosen any more)',
        ['IT_ADMIN'],
        (s) =>
          request(s)
            .post('/api/v1/subscription-renewals')
            .send({ ...RECORD, releasedAssignmentIds: [SUB] }),
      ],
      [
        'a result that sends the point of execution (worked out by the system)',
        ['IT_ADMIN'],
        (s) =>
          request(s)
            .post('/api/v1/subscription-renewals')
            .send({ ...RECORD, withinCurrentTerm: true }),
      ],
      [
        'a result whose subscription is not an id',
        ['IT_ADMIN'],
        (s) =>
          request(s)
            .post('/api/v1/subscription-renewals')
            .send({ ...RECORD, subscriptionId: 'x' }),
      ],
      [
        'a result of a vendor that refused, with no note on the outcome',
        ['IT_ADMIN'],
        (s) =>
          request(s)
            .post('/api/v1/subscription-renewals')
            .send({ ...RECORD, outcome: 'VENDOR_REFUSED' }),
      ],
      [
        'a closure sent with a choice that is not a cancellation',
        ['IT_ADMIN'],
        (s) =>
          request(s)
            .post('/api/v1/subscription-renewals')
            .send({ ...RECORD, closure: CLOSURE }),
      ],
      [
        'a cancellation as decided that does not confirm the closure (QĐ-99i)',
        ['IT_ADMIN'],
        (s) =>
          request(s)
            .post('/api/v1/subscription-renewals')
            .send({ subscriptionId: SUB, choice: 'CANCEL', outcome: 'AS_DECIDED' }),
      ],
      [
        'a cancellation whose closure is only half confirmed',
        ['IT_ADMIN'],
        (s) =>
          request(s)
            .post('/api/v1/subscription-renewals')
            .send({
              subscriptionId: SUB,
              choice: 'CANCEL',
              outcome: 'AS_DECIDED',
              closure: { dataExported: true, adminsTransferred: false },
            }),
      ],
      [
        'an outcome of a vendor that refused, with no note',
        ['IT_ADMIN'],
        (s) => request(s).post(`/api/v1/subscription-renewals/${ID}/outcome`).send({ outcome: 'VENDOR_REFUSED' }),
      ],
      [
        'an outcome that is different from the decision, with no note',
        ['IT_ADMIN'],
        (s) => request(s).post(`/api/v1/subscription-renewals/${ID}/outcome`).send({ outcome: 'DIFFERENT' }),
      ],
      [
        'a seat ranking asked proposedOnly with something that is not a flag',
        ['IT_ADMIN'],
        (s) => request(s).get(`/api/v1/subscription-renewals/${ID}/seat-ranking?proposedOnly=maybe`),
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
