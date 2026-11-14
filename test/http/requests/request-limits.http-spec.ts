import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const ID = '8a4d7c1e-2b3f-4c5d-9e6f-0a1b2c3d4e5f';

/**
 * The contract of the limits of a request for new access (`BR-MF1-01` GH-1/GH-2, `QĐ-111h`): there is no GH-3, so no form that sends one takes
 * a reason for having many paid applications (`manyPaidSoftwareReason`, once per request and once per line of a group): a body that carries it
 * is refused like any body with a field the form does not have. Judged before anything is read (no database); the refusals of the limits
 * themselves are proven in `test/integration/requests/request-limits.integration-spec.ts`.
 */
describe('the forms that send a request for new access take no GH-3 reason (http contract, QĐ-111h)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createHttpContractApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  const post = (path: string, body: object) =>
    request(app.getHttpServer())
      .post(path)
      .set('Authorization', bearer(principal(['EMPLOYEE'])))
      .send(body);

  const proposal = {
    softwareName: 'Tool',
    homepageUrl: 'https://example.test',
    purpose: 'Work',
    dataDescription: 'None',
    expectedUsers: 1,
  };

  describe.each([
    ['accessRequestSubmit', '/api/v1/access-requests', { planId: ID, businessReason: 'Work' }],
    ['accessRequestPropose', '/api/v1/access-requests/proposals', proposal],
    [
      'accessRequestRenewalSubmit',
      '/api/v1/access-requests/renewals',
      { assignmentId: ID, extensionMonths: 3, businessReason: 'Work' },
    ],
  ])('%s', (_name, path, body) => {
    it('takes the body as it is, and refuses it with the reason of GH-3, whatever the reason says', async () => {
      const without = await post(path, body);

      expect(bodyOf(without).error?.code).not.toBe('VALIDATION_ERROR');
      for (const reason of ['The client asks for it', '   ', 'x'.repeat(1001)]) {
        const withReason = await post(path, { ...body, manyPaidSoftwareReason: reason });

        expect([withReason.status, bodyOf(withReason).error?.code]).toEqual([422, 'VALIDATION_ERROR']);
      }
    });
  });

  describe('accessRequestRenewalSubmit: the new end date (BR-MF1-08b, QĐ-108a)', () => {
    const path = '/api/v1/access-requests/renewals';
    const base = { assignmentId: ID, businessReason: 'Work' };

    it('takes a new end date, or the deprecated months, but not both and not neither', async () => {
      const day = await post(path, { ...base, newEndDate: '2027-03-31' });
      const months = await post(path, { ...base, extensionMonths: 3 });
      const both = await post(path, { ...base, newEndDate: '2027-03-31', extensionMonths: 3 });
      const neither = await post(path, base);
      const notADay = await post(path, { ...base, newEndDate: 'next month' });

      expect(bodyOf(day).error?.code).not.toBe('VALIDATION_ERROR');
      expect(bodyOf(months).error?.code).not.toBe('VALIDATION_ERROR');
      for (const refused of [both, neither, notADay]) {
        expect([refused.status, bodyOf(refused).error?.code]).toEqual([422, 'VALIDATION_ERROR']);
      }
    });
  });

  describe('groupRequestSubmit and groupRequestCheck: the people of a group (QĐ-106g)', () => {
    it.each(['/api/v1/group-requests', '/api/v1/group-requests/check'])(
      '%s takes the people by their id alone',
      async (path) => {
        const response = await post(path, {
          planId: ID,
          businessReason: 'Work',
          lines: [{ employeeId: ID }, { employeeId: ID }],
        });

        expect(bodyOf(response).error?.code).not.toBe('VALIDATION_ERROR');
      },
    );

    it.each(['/api/v1/group-requests', '/api/v1/group-requests/check'])(
      '%s refuses a reason on a line',
      async (path) => {
        const response = await post(path, {
          planId: ID,
          businessReason: 'Work',
          lines: [{ employeeId: ID, manyPaidSoftwareReason: 'Needed for the audit' }, { employeeId: ID }],
        });

        expect([response.status, bodyOf(response).error?.code]).toEqual([422, 'VALIDATION_ERROR']);
      },
    );

    it('refuses a reason given for the whole request instead of a line', async () => {
      const response = await post('/api/v1/group-requests', {
        planId: ID,
        businessReason: 'Work',
        manyPaidSoftwareReason: 'Shared',
        lines: [{ employeeId: ID }],
      });

      expect([response.status, bodyOf(response).error?.code]).toEqual([422, 'VALIDATION_ERROR']);
    });
  });
});
