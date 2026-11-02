import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { EmployeeFirstPlacementService } from '../../../src/modules/organization/employee/employee-first-placement.service';
import { FirstPlacementError } from '../../../src/modules/organization/employee/employee.errors';
import { EmployeeNotFoundError } from '../../../src/modules/organization/public/organization.errors';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';
import { bodyOf } from '../../support/api-body';

const id = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const body = { departmentId: id, effectiveFrom: '2026-11-03' };
const place = jest.fn();
let app: INestApplication<App>;
beforeAll(async () => {
  app = await createHttpContractApp({ overrides: [{ token: EmployeeFirstPlacementService, useValue: { place } }] });
});
afterAll(async () => app.close());
beforeEach(() => place.mockReset());
const post = () => request(app.getHttpServer()).post(`/api/v1/employees/${id}/first-placements`);
const auth = (roles: string[]) => bearer(principal(roles));

describe('first placement HTTP', () => {
  it('requires authentication', async () => {
    await post().send(body).expect(401);
  });
  it('requires SUPER_ADMIN', async () => {
    await post()
      .set('Authorization', auth(['EMPLOYEE']))
      .send(body)
      .expect(403);
  });
  it('validates input', async () => {
    await post()
      .set('Authorization', auth(['SUPER_ADMIN']))
      .send({ ...body, effectiveFrom: 'bad' })
      .expect(422);
  });
  it.each([
    [new EmployeeNotFoundError(id), 404],
    [new FirstPlacementError('ALREADY_PLACED'), 409],
    [new FirstPlacementError('DATE_INVALID'), 422],
  ])('maps service refusal', async (error, status) => {
    place.mockRejectedValueOnce(error);
    await post()
      .set('Authorization', auth(['SUPER_ADMIN']))
      .send(body)
      .expect(status);
  });
  it('returns the employee', async () => {
    place.mockResolvedValueOnce({
      id,
      employeeCode: 'NV-001',
      fullName: 'Person',
      workEmail: null,
      employmentType: 'STAFF',
      hireDate: '2026-01-01',
      status: 'ACTIVE',
      workState: 'WORKING',
      memberSince: body.effectiveFrom,
      department: { id, code: 'P-ENG', name: 'Engineering' },
      unplaced: false,
      jobTitle: null,
    });
    const response = await post()
      .set('Authorization', auth(['SUPER_ADMIN']))
      .send(body)
      .expect(201);
    expect(bodyOf(response).data).toMatchObject({ id, unplaced: false });
  });
});
