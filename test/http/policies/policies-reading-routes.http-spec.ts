import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AcknowledgementReportService } from '../../../src/modules/policies/acknowledgement/acknowledgement-report.service';
import { PolicyAcknowledgementNotRequiredError } from '../../../src/modules/policies/acknowledgement/acknowledgement.errors';
import { AcknowledgementService } from '../../../src/modules/policies/acknowledgement/acknowledgement.service';
import { PolicyNotFoundError, PolicyStepNotFoundError } from '../../../src/modules/policies/library/library.errors';
import { PolicyReadingQueryService } from '../../../src/modules/policies/reading/policy-reading-query.service';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';
import { OPENAPI_DOCUMENT_BUDGET_MS } from '../../support/openapi-document-budget';

const POLICIES = '/api/v1/policies';
const PAGE = { page: 1, pageSize: 50, totalItems: 0, totalPages: 0 };

const reading = {
  list: jest.fn(() => Promise.resolve({ items: [], pagination: PAGE })),
  detail: jest.fn((): Promise<never> => Promise.reject(new PolicyNotFoundError())),
  versions: jest.fn(() => Promise.resolve({ items: [], pagination: PAGE })),
  step: jest.fn((): Promise<never> => Promise.reject(new PolicyStepNotFoundError())),
};
const acknowledgements = {
  acknowledge: jest.fn(() =>
    Promise.resolve({
      policyCode: 'POL-GEN',
      versionNumber: 1,
      acknowledgedAt: new Date('2026-11-15T01:00:00Z'),
      alreadyAcknowledged: false,
    }),
  ),
};
const reports = {
  report: jest.fn(() => Promise.resolve({ policyCode: 'POL-GEN', currentVersionNumber: 1, rows: [], total: 0 })),
};

/** The routes everyone reads and the acknowledgement: who may call them, what they refuse first, what they promise. */
describe('policy reading and acknowledgement routes (http contract, no database)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createHttpContractApp({
      overrides: [
        { token: PolicyReadingQueryService, useValue: reading },
        { token: AcknowledgementService, useValue: acknowledgements },
        { token: AcknowledgementReportService, useValue: reports },
      ],
    });
  }, OPENAPI_DOCUMENT_BUDGET_MS);

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => jest.clearAllMocks());

  const as = (roles: string[], req: request.Test) => req.set('Authorization', bearer(principal(roles)));

  it.each([
    ['get', POLICIES],
    ['get', `${POLICIES}/POL-GEN`],
    ['get', `${POLICIES}/POL-GEN/versions`],
    ['get', `${POLICIES}/POL-MF1/steps/1.2`],
    ['post', `${POLICIES}/POL-GEN/acknowledgements`],
    ['get', `${POLICIES}/POL-GEN/acknowledgements`],
  ] as const)('answers 401 to %s %s without a token', async (method, path) => {
    const response = await request(app.getHttpServer())[method](path).expect(401);

    expect(bodyOf(response).error.code).toBe('AUTHENTICATION_REQUIRED');
  });

  it.each([['EMPLOYEE'], ['MANAGER'], ['IT_ADMIN'], ['FINANCE'], ['SPENDING_APPROVER'], ['SUPER_ADMIN']])(
    'lets %s read the list and acknowledge',
    async (role) => {
      await as([role], request(app.getHttpServer()).get(POLICIES)).expect(200);
      await as([role], request(app.getHttpServer()).post(`${POLICIES}/POL-GEN/acknowledgements`)).expect(201);
    },
  );

  it.each([['EMPLOYEE'], ['MANAGER'], ['IT_ADMIN'], ['FINANCE'], ['SPENDING_APPROVER']])(
    'refuses %s the report of who acknowledged with 403',
    async (role) => {
      const response = await as([role], request(app.getHttpServer()).get(`${POLICIES}/POL-GEN/acknowledgements`));

      expect(response.status).toBe(403);
      expect(reports.report).not.toHaveBeenCalled();
    },
  );

  it('gives the Super Admin the report as a page', async () => {
    const response = await as(
      ['SUPER_ADMIN'],
      request(app.getHttpServer()).get(`${POLICIES}/POL-GEN/acknowledgements?pageSize=20`),
    ).expect(200);

    expect(reports.report).toHaveBeenCalledWith('POL-GEN', 1, 20);
    expect(bodyOf(response).data).toMatchObject({ policyCode: 'POL-GEN', items: [], pagination: { pageSize: 20 } });
  });

  it('refuses a page size above one hundred (422)', async () => {
    await as(['SUPER_ADMIN'], request(app.getHttpServer()).get(`${POLICIES}?pageSize=101`)).expect(422);
  });

  it('refuses a version that is not a number (422)', async () => {
    await as(['EMPLOYEE'], request(app.getHttpServer()).get(`${POLICIES}/POL-GEN?version=abc`)).expect(422);
    expect(reading.detail).not.toHaveBeenCalled();
  });

  it('answers 404 POLICY.NOT_FOUND for a code the library does not have', async () => {
    const response = await as(['EMPLOYEE'], request(app.getHttpServer()).get(`${POLICIES}/POL-NONE`)).expect(404);

    expect(bodyOf(response).error.code).toBe('POLICY.NOT_FOUND');
  });

  it('answers 404 POLICY.STEP_NOT_FOUND for a step the version in force does not have', async () => {
    const response = await as(['MANAGER'], request(app.getHttpServer()).get(`${POLICIES}/POL-MF1/steps/9.9`)).expect(
      404,
    );

    expect(bodyOf(response).error.code).toBe('POLICY.STEP_NOT_FOUND');
  });

  it('answers 409 when the policy applies to none of the roles of the account', async () => {
    acknowledgements.acknowledge.mockRejectedValueOnce(new PolicyAcknowledgementNotRequiredError());
    const response = await as(
      ['FINANCE'],
      request(app.getHttpServer()).post(`${POLICIES}/POL-MF1/acknowledgements`),
    ).expect(409);

    expect(bodyOf(response).error.code).toBe('POLICY.ACKNOWLEDGEMENT_NOT_REQUIRED');
  });

  it('says when nothing was written because the account had acknowledged already', async () => {
    acknowledgements.acknowledge.mockResolvedValueOnce({
      policyCode: 'POL-GEN',
      versionNumber: 2,
      acknowledgedAt: null as never,
      alreadyAcknowledged: true,
    });
    const response = await as(
      ['EMPLOYEE'],
      request(app.getHttpServer()).post(`${POLICIES}/POL-GEN/acknowledgements`),
    ).expect(201);

    expect(bodyOf(response).data).toMatchObject({ acknowledgedAt: null, alreadyAcknowledged: true });
  });

  it('has no route that makes a policy or answers a bare list with a body (R-42)', async () => {
    await as(['SUPER_ADMIN'], request(app.getHttpServer()).post(POLICIES).send({ code: 'POL-NEW' })).expect(404);
  });
});
