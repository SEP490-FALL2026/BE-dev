import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AccessRequestApplicationRetiredError } from '../../../src/modules/requests/access-request/access-request.errors';
import {
  AssessmentReferenceNotFoundError,
  CatalogLinkApplicationMismatchError,
  CatalogLinkRefusedError,
  ProposalSoftwareInCatalogError,
} from '../../../src/modules/requests/assessment/assessment.errors';
import { CatalogLinkService } from '../../../src/modules/requests/catalog-link/catalog-link.service';
import { ProposalService } from '../../../src/modules/requests/assessment/proposal.service';
import {
  DepartmentSoftwareNoteInvalidError,
  DepartmentSoftwareNotInCatalogError,
  ToolsDepartmentNotFoundError,
} from '../../../src/modules/licensing/public/licensing.errors';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const ID = '8a4d7c1e-2b3f-4c5d-9e6f-0a1b2c3d4e5f';
const APPLICATION = '0b1d5e0e-6f55-4b3c-8d0e-0a4a8f3a0a11';
const PLAN = '7c1d5e0e-6f55-4b3c-8d0e-0a4a8f3a0a22';
const declared = {
  softwareName: 'ChatGPT Business',
  homepageUrl: 'https://chatgpt.com',
  purpose: 'Drafting support replies',
  dataDescription: 'Customer questions',
  expectedUsers: 4,
};
const entry = {
  applicationId: APPLICATION,
  name: 'ChatGPT',
  status: 'APPROVED' as const,
  vendor: null,
  plans: [{ planId: PLAN, name: 'Plus', provisioningType: 'K1' as const }],
  planTotal: 1,
  planNamed: null,
};

/**
 * The route of the proposal and the route of the catalog link as the IN-1 package changed them (e2e, no database): what the body must carry
 * before a service is reached, and the code each refusal of the services is answered with. What they do to the data is proved by
 * `proposal-case-b.integration-spec.ts`.
 */
describe('software that the catalog has or lacks: the proposal and the catalog link (e2e, no database)', () => {
  let app: INestApplication<App>;
  const submit = jest.fn();
  const link = jest.fn();

  beforeAll(async () => {
    app = await createHttpContractApp({
      overrides: [
        { token: ProposalService, useValue: { submit } },
        { token: CatalogLinkService, useValue: { link } },
      ],
    });
  });
  afterAll(async () => app?.close());
  beforeEach(() => {
    submit.mockReset();
    link.mockReset();
  });

  const propose = (body: object) =>
    request(app.getHttpServer())
      .post('/api/v1/access-requests/proposals')
      .set('Authorization', bearer(principal(['EMPLOYEE'])))
      .send(body);
  const linkPlan = (body: object) =>
    request(app.getHttpServer())
      .post(`/api/v1/access-requests/${ID}/catalog-link`)
      .set('Authorization', bearer(principal(['IT_ADMIN'])))
      .send(body);

  describe('the proposal', () => {
    it.each([
      ['an application without the plan asked for', { existingApplicationId: APPLICATION }],
      ['a plan without the application', { plannedPlanName: 'Business' }],
      ['an application that is not an id', { existingApplicationId: 'chatgpt', plannedPlanName: 'Business' }],
    ])('is refused with 422 before the service for %s', async (_name, extra) => {
      const response = await propose({ ...declared, ...extra }).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
      expect(submit).not.toHaveBeenCalled();
    });

    it('reaches the service with the application and the plan, trimmed', async () => {
      submit.mockRejectedValue(new Error('handler reached'));

      await propose({ ...declared, existingApplicationId: APPLICATION, plannedPlanName: '  Business ' });

      expect(submit).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ existingApplicationId: APPLICATION, plannedPlanName: 'Business' }),
      );
    });

    it.each(['NAME', 'DOMAIN', 'PLAN'] as const)(
      'answers software the catalog has (found by %s) with 409 and the entry, so the person asks for it from the catalog',
      async (by) => {
        submit.mockRejectedValue(new ProposalSoftwareInCatalogError(entry, by));

        const response = await propose(declared).expect(409);

        expect(bodyOf(response).error).toMatchObject({
          code: 'ACCESS_REQUEST.SOFTWARE_IN_CATALOG',
          details: {
            matchedBy: by,
            existing: {
              applicationId: APPLICATION,
              name: 'ChatGPT',
              plans: [{ planId: PLAN, name: 'Plus', provisioningType: 'K1' }],
              planTotal: 1,
            },
          },
        });
      },
    );

    it('answers an application that does not exist with 422 naming the field, and one that has left the catalog with 409', async () => {
      submit.mockRejectedValueOnce(new AssessmentReferenceNotFoundError('existingApplicationId'));
      const missing = await propose({ ...declared, existingApplicationId: APPLICATION, plannedPlanName: 'Business' });
      submit.mockRejectedValueOnce(new AccessRequestApplicationRetiredError());
      const retired = await propose({ ...declared, existingApplicationId: APPLICATION, plannedPlanName: 'Business' });

      expect(missing.status).toBe(422);
      expect(bodyOf(missing).error).toMatchObject({
        code: 'ASSESSMENT.REFERENCE_NOT_FOUND',
        details: { field: 'existingApplicationId' },
      });
      expect(retired.status).toBe(409);
      expect(bodyOf(retired).error.code).toBe('ACCESS_REQUEST.APPLICATION_RETIRED');
    });
  });

  describe('the catalog link', () => {
    it.each([
      ['a tick that is not a boolean', { planId: PLAN, addToDepartmentList: 'yes' }],
      ['a department chosen by hand', { planId: PLAN, departmentId: ID }],
    ])('is refused with 422 before the service for %s', async (_name, body) => {
      const response = await linkPlan(body).expect(422);

      expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
      expect(link).not.toHaveBeenCalled();
    });

    it('reaches the service with the tick', async () => {
      link.mockRejectedValue(new Error('handler reached'));

      await linkPlan({ planId: PLAN, addToDepartmentList: true });

      expect(link).toHaveBeenCalledWith(expect.anything(), ID, { planId: PLAN, addToDepartmentList: true });
    });

    it.each([
      [
        'a department the IT Admin is not in charge of',
        403,
        'DEPARTMENT.OUT_OF_SCOPE',
        new CatalogLinkRefusedError('DEPARTMENT_OUT_OF_SCOPE'),
      ],
      [
        'a request that cannot be linked',
        409,
        'ACCESS_REQUEST.CATALOG_LINK_NOT_ALLOWED',
        new CatalogLinkRefusedError('NOT_LINKABLE'),
      ],
      ['a department that is not there', 404, 'DEPARTMENT.NOT_FOUND', new ToolsDepartmentNotFoundError()],
      [
        'a short proposal and a plan of another application',
        422,
        'ACCESS_REQUEST.CATALOG_LINK_APPLICATION_MISMATCH',
        new CatalogLinkApplicationMismatchError(APPLICATION),
      ],
      [
        'software the catalog no longer offers to the list of the department',
        422,
        'DEPARTMENT_SOFTWARE.NOT_IN_CATALOG',
        new DepartmentSoftwareNotInCatalogError([{ applicationId: APPLICATION, planId: PLAN }]),
      ],
      [
        'a note of the list the table would refuse',
        422,
        'DEPARTMENT_SOFTWARE.NOTE_INVALID',
        new DepartmentSoftwareNoteInvalidError('TOO_LONG'),
      ],
    ])('answers %s with %i %s', async (_name, status, code, error) => {
      link.mockRejectedValue(error);

      const response = await linkPlan({ planId: PLAN, addToDepartmentList: true });

      expect(response.status).toBe(status);
      expect(bodyOf(response).error.code).toBe(code);
    });

    it('names the application the short proposal expects, so the screen can say which plan to pick', async () => {
      link.mockRejectedValue(new CatalogLinkApplicationMismatchError(APPLICATION));

      const response = await linkPlan({ planId: PLAN }).expect(422);

      expect(bodyOf(response).error.details).toEqual({ expectedApplicationId: APPLICATION });
    });

    it('names every place the catalog no longer offers, as the routes of the list do', async () => {
      link.mockRejectedValue(new DepartmentSoftwareNotInCatalogError([{ applicationId: APPLICATION, planId: PLAN }]));

      const response = await linkPlan({ planId: PLAN, addToDepartmentList: true }).expect(422);

      expect(bodyOf(response).error.details).toEqual({ places: [{ applicationId: APPLICATION, planId: PLAN }] });
    });

    it('is for an IT Admin only', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/access-requests/${ID}/catalog-link`)
        .set('Authorization', bearer(principal(['EMPLOYEE'])))
        .send({ planId: PLAN, addToDepartmentList: true })
        .expect(403);

      expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
      expect(link).not.toHaveBeenCalled();
    });
  });
});
