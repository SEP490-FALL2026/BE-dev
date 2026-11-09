import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const ID = '8a4d7c1e-2b3f-4c5d-9e6f-0a1b2c3d4e5f';

/**
 * The contract of the limits of a request for new access (`BR-MF1-01` GH-1/GH-2/GH-3, `QĐ-106g`): every form that sends one takes the
 * GH-3 reason (`manyPaidSoftwareReason`, per line for a group), bounded like any reason and never required by the shape of the body. Judged
 * before anything is read (no database); the refusals themselves are proven in `test/integration/requests/request-limits.integration-spec.ts`.
 */
describe('the GH-3 reason of the forms that send a request for new access (http contract, BR-MF1-01)', () => {
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
    it('BR-MF1-01g: takes the body without the reason and with one', async () => {
      const without = await post(path, body);
      const withReason = await post(path, { ...body, manyPaidSoftwareReason: 'The client asks for it' });

      expect(bodyOf(without).error?.code).not.toBe('VALIDATION_ERROR');
      expect(bodyOf(withReason).error?.code).not.toBe('VALIDATION_ERROR');
    });

    it('BR-MF1-01g: refuses a blank reason and one longer than 1000 characters', async () => {
      for (const reason of ['   ', 'x'.repeat(1001)]) {
        const response = await post(path, { ...body, manyPaidSoftwareReason: reason });

        expect([response.status, bodyOf(response).error?.code]).toEqual([422, 'VALIDATION_ERROR']);
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

  describe('groupRequestSubmit and groupRequestCheck: the reason of each line (QĐ-106g, BR-MF1-01g)', () => {
    it.each(['/api/v1/group-requests', '/api/v1/group-requests/check'])('%s takes a reason per line', async (path) => {
      const response = await post(path, {
        planId: ID,
        businessReason: 'Work',
        lines: [{ employeeId: ID, manyPaidSoftwareReason: 'Needed for the audit' }, { employeeId: ID }],
      });

      expect(bodyOf(response).error?.code).not.toBe('VALIDATION_ERROR');
    });

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
