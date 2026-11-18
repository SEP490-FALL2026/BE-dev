import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { EmployeeFirstPlacementCorrectionService } from '../../../src/modules/organization/employee/first-placement-correction/employee-first-placement-correction.service';
import { EmployeeFirstPlacementService } from '../../../src/modules/organization/employee/employee-first-placement.service';
import {
  EmployeeSelfChangeForbiddenError,
  EmployeeUpdateEmptyError,
  FirstPlacementCorrectionError,
  FirstPlacementError,
} from '../../../src/modules/organization/employee/employee.errors';
import { EmployeeNotFoundError } from '../../../src/modules/organization/public/organization.errors';
import { bearer, createHttpContractApp, principal } from '../../support/http-contract-app';
import { bodyOf } from '../../support/api-body';

const id = '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11';
const body = { departmentId: id, effectiveFrom: '2026-11-03' };
const place = jest.fn();
const correct = jest.fn();
let app: INestApplication<App>;
beforeAll(async () => {
  app = await createHttpContractApp({
    overrides: [
      { token: EmployeeFirstPlacementService, useValue: { place } },
      { token: EmployeeFirstPlacementCorrectionService, useValue: { correct } },
    ],
  });
});
afterAll(async () => app.close());
beforeEach(() => {
  place.mockReset();
  correct.mockReset();
});
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
      contractEndDate: null,
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

describe('first placement correction HTTP (QĐ-113e)', () => {
  const patch = () => request(app.getHttpServer()).patch(`/api/v1/employees/${id}/first-placement`);
  const change = { departmentId: id, effectiveFrom: '2026-12-01', reason: 'Wrong team' };

  it('requires authentication and SUPER_ADMIN', async () => {
    await patch().send(change).expect(401);
    await patch()
      .set('Authorization', auth(['IT_ADMIN']))
      .send(change)
      .expect(403);
    expect(correct).not.toHaveBeenCalled();
  });

  it.each([
    ['a reason is missing', { departmentId: id }],
    ['the reason is blank', { ...change, reason: '   ' }],
    ['the reason is over 500 characters', { ...change, reason: 'x'.repeat(501) }],
    ['the day is not a date', { ...change, effectiveFrom: 'bad' }],
    ['the department is not a uuid', { ...change, departmentId: 'bad' }],
    ['an unknown field comes with it', { ...change, hireDate: '2026-01-01' }],
  ])('answers 422 when %s', async (_name, payload) => {
    await patch()
      .set('Authorization', auth(['SUPER_ADMIN']))
      .send(payload)
      .expect(422);
    expect(correct).not.toHaveBeenCalled();
  });

  it.each([
    [new EmployeeNotFoundError(id), 404, 'EMPLOYEE.NOT_FOUND'],
    [new EmployeeSelfChangeForbiddenError(), 403, 'EMPLOYEE.SELF_CHANGE_FORBIDDEN'],
    [new EmployeeUpdateEmptyError(), 422, 'EMPLOYEE.UPDATE_EMPTY'],
    [new FirstPlacementError('DATE_INVALID'), 422, 'EMPLOYEE.DATE_INVALID'],
    [new FirstPlacementCorrectionError('NOT_PLACED'), 409, 'EMPLOYEE.NOT_PLACED'],
    [new FirstPlacementCorrectionError('ALREADY_EFFECTIVE'), 409, 'EMPLOYEE.FIRST_PLACEMENT_ALREADY_EFFECTIVE'],
    [new FirstPlacementCorrectionError('IN_USE', 'REQUEST'), 409, 'EMPLOYEE.FIRST_PLACEMENT_IN_USE'],
  ])('maps the refusal of the service to its code', async (error, status, code) => {
    correct.mockRejectedValueOnce(error);

    const response = await patch()
      .set('Authorization', auth(['SUPER_ADMIN']))
      .send(change)
      .expect(status);

    expect(bodyOf(response).error.code).toBe(code);
  });

  it('names what refers to the placement', async () => {
    correct.mockRejectedValueOnce(new FirstPlacementCorrectionError('IN_USE', 'HEAD_PERIOD'));

    const response = await patch()
      .set('Authorization', auth(['SUPER_ADMIN']))
      .send(change)
      .expect(409);

    expect(bodyOf(response).error.details).toEqual({ usedBy: 'HEAD_PERIOD' });
  });

  it('passes the body to the service and answers the employee', async () => {
    correct.mockResolvedValueOnce({
      id,
      employeeCode: 'NV-001',
      fullName: 'Person',
      workEmail: null,
      employmentType: 'STAFF',
      hireDate: '2026-01-01',
      contractEndDate: null,
      status: 'ACTIVE',
      workState: 'WORKING',
      memberSince: change.effectiveFrom,
      department: { id, code: 'P-ENG', name: 'Engineering' },
      unplaced: false,
      jobTitle: null,
    });

    const response = await patch()
      .set('Authorization', auth(['SUPER_ADMIN']))
      .send(change)
      .expect(200);

    expect(correct).toHaveBeenCalledWith(expect.anything(), id, change);
    expect(bodyOf(response).message).toBe('EMPLOYEE.FIRST_PLACEMENT_CORRECTED');
    expect(bodyOf(response).data).toMatchObject({ id, memberSince: change.effectiveFrom, unplaced: false });
  });
});
