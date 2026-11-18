import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { bodyOf } from '../../support/api-body';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';

const ID = '8a4d7c1e-2b3f-4c5d-9e6f-0a1b2c3d4e5f';

/**
 * The contract of the amount and the term of a request (`QĐ-104a`, `P0-01`, `P1-06`): the body takes an end date (a day), never months, and the
 * supplementary file shortens a term or leaves people out, one of the two at least. Judged before anything is read (no database).
 */
describe('the end date and the supplementary file of a request (http contract)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createHttpContractApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  const post = (path: string, role: string, body: object) =>
    request(app.getHttpServer())
      .post(path)
      .set('Authorization', bearer(principal([role])))
      .send(body);

  describe('the end date of the forms (P0-01)', () => {
    it.each([
      ['accessRequestSubmit', '/api/v1/access-requests', { planId: ID, businessReason: 'Work' }],
      ['accessRequestPreview', '/api/v1/access-requests/preview', { planId: ID }],
      [
        'accessRequestPropose',
        '/api/v1/access-requests/proposals',
        {
          softwareName: 'Tool',
          homepageUrl: 'https://example.test',
          purpose: 'Work',
          dataDescription: 'None',
          expectedUsers: 1,
        },
      ],
      [
        'groupRequestSubmit',
        '/api/v1/group-requests',
        { planId: ID, businessReason: 'Work', lines: [{ employeeId: ID }] },
      ],
    ])(
      '%s: takes the months of use, a right with no end or nothing; refuses an end date and a month that is not a whole number',
      async (_name, path, body) => {
        const none = await post(path, 'EMPLOYEE', body);
        const months = await post(path, 'EMPLOYEE', { ...body, termMonths: 6 });
        const noEnd = await post(path, 'EMPLOYEE', { ...body, termMonths: null });
        const day = await post(path, 'EMPLOYEE', { ...body, expectedEndDate: '2027-03-31' });
        const half = await post(path, 'EMPLOYEE', { ...body, termMonths: 2.5 });
        const word = await post(path, 'EMPLOYEE', { ...body, termMonths: 'six' });

        for (const accepted of [none, months, noEnd]) expect(bodyOf(accepted).error?.code).not.toBe('VALIDATION_ERROR');
        for (const refused of [day, half, word]) {
          expect([refused.status, bodyOf(refused).error?.code]).toEqual([422, 'VALIDATION_ERROR']);
        }
      },
    );
  });

  describe('the supplementary file (P1-06, L2-38)', () => {
    const path = `/api/v1/access-requests/${ID}/supplements`;

    it('takes a shorter time of use alone, people alone, or both, with a reason', async () => {
      for (const body of [
        { reason: 'Ends sooner', termMonths: 3 },
        { reason: 'One left', dropEmployeeIds: [ID] },
        { reason: 'Both', termMonths: 3, dropEmployeeIds: [ID] },
      ]) {
        expect(bodyOf(await post(path, 'MANAGER', body)).error?.code).not.toBe('VALIDATION_ERROR');
      }
    });

    it('refuses a file that names neither a person nor a time of use, a blank reason, and months that are not a number', async () => {
      for (const body of [
        { reason: 'Nothing to change' },
        { reason: '  ', termMonths: 3 },
        { reason: 'Ends sooner', termMonths: 'tomorrow' },
        { reason: 'Ends sooner', termMonths: null },
        { reason: 'Ends sooner', expectedEndDate: '2026-12-31' },
        { reason: 'Ends sooner', termMonths: 3, expectedSpendOn: '2026-12-01' },
      ]) {
        const response = await post(path, 'MANAGER', body);

        expect([response.status, bodyOf(response).error?.code]).toEqual([422, 'VALIDATION_ERROR']);
      }
    });
  });
});
