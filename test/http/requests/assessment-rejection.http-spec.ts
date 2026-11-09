import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AssessmentRejectionService } from '../../../src/modules/requests/assessment/assessment-rejection.service';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';
import { bodyOf } from '../../support/api-body';
const ID = '8a4d7c1e-2b3f-4c5d-9e6f-0a1b2c3d4e5f';
describe('BR-MF1-04: an uncontrollable tool needs an alternative', () => {
  let app: INestApplication<App>;
  const reject = jest.fn().mockRejectedValue(new Error('handler reached'));
  beforeAll(async () => {
    app = await createHttpContractApp({ overrides: [{ token: AssessmentRejectionService, useValue: { reject } }] });
  });
  afterAll(async () => app?.close());
  const post = (body: object) =>
    request(app.getHttpServer())
      .post(`/api/v1/access-requests/${ID}/assessment/rejection`)
      .set('Authorization', bearer(principal(['IT_ADMIN'])))
      .send(body);
  it('returns 422 before the service when UNCONTROLLABLE has no alternative', async () => {
    const response = await post({ kind: 'UNCONTROLLABLE', reason: 'Cannot revoke access' }).expect(422);
    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
    expect(reject).not.toHaveBeenCalled();
  });
  it.each([
    { kind: 'UNCONTROLLABLE', alternativeNote: 'Use approved portal' },
    { kind: 'UNCONTROLLABLE', alternativePlanId: ID },
    { kind: 'NOT_ELIGIBLE' },
  ])('accepts the alternative or NOT_ELIGIBLE without one', async (body) => {
    const response = await post({ reason: 'Cannot use this tool', ...body });
    expect(bodyOf(response).error?.code).not.toBe('VALIDATION_ERROR');
  });
  it.each([
    [`/api/v1/access-requests/${ID}/internal-registration`, { businessOwnerEmployeeId: ID }],
    [`/api/v1/access-requests/${ID}/assessment`, { proposedBusinessOwnerEmployeeId: ID }],
  ])('P2-05: refuses retired owner input at %s', async (path, body) => {
    const method = path.endsWith('/assessment') ? 'put' : 'post';
    const response = await request(app.getHttpServer())
      [method](path)
      .set('Authorization', bearer(principal(['IT_ADMIN'])))
      .send(body)
      .expect(422);
    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
  });
});
