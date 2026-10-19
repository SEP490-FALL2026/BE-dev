import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { TransientDatabaseError } from '../../../infrastructure/database/transaction-runner';
import {
  CostCenterCodeTakenError,
  CostCenterInUseError,
  CostCenterKindNotSupportedError,
  CostCenterNameInvalidError,
  CostCenterNameReservedError,
  CostCenterNotFoundError,
} from '../cost-center/cost-center.errors';
import {
  DepartmentCodeTakenError,
  DepartmentCostCenterError,
  DepartmentInUseError,
  DepartmentInactiveError,
  DepartmentItAdminInvalidError,
  DepartmentNameInvalidError,
  DepartmentNotFoundError,
  DepartmentOutOfScopeError,
  DepartmentUpdateEmptyError,
  HeadAssignmentError,
} from '../errors/department.errors';
import { EmployeeRowInvalidError } from '../employee/employee.errors';
import { OrganizationAlreadyExistsError } from '../errors/organization.errors';
import {
  JobTitleNameRequiredError,
  JobTitleNameTakenError,
  JobTitleNameTooLongError,
  JobTitleNotFoundError,
} from '../job-title/job-title.errors';
import { ProjectInvalidError, ProjectNotFoundError } from '../project/project.errors';
import { EmployeeCodeTakenError, EmployeeNotFoundError } from '../organization.errors';
import { toOrganizationApiException } from './organization.http-errors';

/** The HTTP answer an error becomes: status and the body the global filter writes. */
function answer(error: unknown): { status: number; body: unknown } {
  const mapped = toOrganizationApiException(error);
  if (!(mapped instanceof ApiException)) throw new Error('expected an ApiException');

  return { status: mapped.getStatus(), body: mapped.getResponse() };
}

const department = { id: 'dep-1', code: 'DES', name: 'Design' };
const people = [{ employeeCode: 'E-1', fullName: 'An Nguyen' }];
const conflict = { id: 'jt-1', name: 'Designer', status: 'INACTIVE' as const };

/**
 * Characterization of the organization error contract before the H4.1 refactor (wire contract: status, code, message,
 * details). One row per branch of `toOrganizationApiException`; `details` appears only where a row names it.
 */
const CASES: [string, Error, HttpStatus, string, Record<string, unknown> | undefined][] = [
  [
    'EmployeeRowInvalidError',
    new EmployeeRowInvalidError([{ field: 'jobTitle', code: 'JOB_TITLE_INACTIVE' }]),
    HttpStatus.UNPROCESSABLE_ENTITY,
    'EMPLOYEE.ROW_INVALID',
    { reasons: [{ field: 'jobTitle', code: 'JOB_TITLE_INACTIVE' }] },
  ],
  ['JobTitleNotFoundError', new JobTitleNotFoundError(), HttpStatus.NOT_FOUND, 'JOB_TITLE.NOT_FOUND', undefined],
  [
    'JobTitleNameRequiredError',
    new JobTitleNameRequiredError(),
    HttpStatus.UNPROCESSABLE_ENTITY,
    'JOB_TITLE.NAME_REQUIRED',
    undefined,
  ],
  [
    'JobTitleNameTooLongError',
    new JobTitleNameTooLongError(),
    HttpStatus.UNPROCESSABLE_ENTITY,
    'JOB_TITLE.NAME_TOO_LONG',
    undefined,
  ],
  [
    'JobTitleNameTakenError with a conflict',
    new JobTitleNameTakenError(conflict),
    HttpStatus.CONFLICT,
    'JOB_TITLE.NAME_TAKEN',
    { conflict },
  ],
  [
    'JobTitleNameTakenError without a conflict',
    new JobTitleNameTakenError(null),
    HttpStatus.CONFLICT,
    'JOB_TITLE.NAME_TAKEN',
    undefined,
  ],
  ['CostCenterNotFoundError', new CostCenterNotFoundError(), HttpStatus.NOT_FOUND, 'COST_CENTER.NOT_FOUND', undefined],
  [
    'CostCenterCodeTakenError',
    new CostCenterCodeTakenError('CC-DES'),
    HttpStatus.CONFLICT,
    'COST_CENTER.CODE_TAKEN',
    undefined,
  ],
  [
    'CostCenterKindNotSupportedError',
    new CostCenterKindNotSupportedError(),
    HttpStatus.UNPROCESSABLE_ENTITY,
    'COST_CENTER.KIND_NOT_SUPPORTED',
    undefined,
  ],
  [
    'CostCenterNameReservedError',
    new CostCenterNameReservedError(),
    HttpStatus.UNPROCESSABLE_ENTITY,
    'COST_CENTER.NAME_RESERVED',
    undefined,
  ],
  [
    'CostCenterNameInvalidError',
    new CostCenterNameInvalidError(),
    HttpStatus.UNPROCESSABLE_ENTITY,
    'COST_CENTER.NAME_INVALID',
    undefined,
  ],
  [
    'CostCenterInUseError',
    new CostCenterInUseError(department, people, 3),
    HttpStatus.CONFLICT,
    'COST_CENTER.IN_USE',
    { department, employees: people, totalEmployees: 3 },
  ],
  ['DepartmentNotFoundError', new DepartmentNotFoundError(), HttpStatus.NOT_FOUND, 'DEPARTMENT.NOT_FOUND', undefined],
  [
    'DepartmentOutOfScopeError',
    new DepartmentOutOfScopeError(),
    HttpStatus.FORBIDDEN,
    'DEPARTMENT.OUT_OF_SCOPE',
    undefined,
  ],
  [
    'DepartmentCodeTakenError',
    new DepartmentCodeTakenError('DES'),
    HttpStatus.CONFLICT,
    'DEPARTMENT.CODE_TAKEN',
    undefined,
  ],
  [
    'DepartmentCostCenterError TAKEN',
    new DepartmentCostCenterError('TAKEN'),
    HttpStatus.CONFLICT,
    'DEPARTMENT.COST_CENTER_TAKEN',
    undefined,
  ],
  [
    'DepartmentCostCenterError NOT_FOUND',
    new DepartmentCostCenterError('NOT_FOUND'),
    HttpStatus.UNPROCESSABLE_ENTITY,
    'DEPARTMENT.COST_CENTER_NOT_FOUND',
    undefined,
  ],
  [
    'DepartmentCostCenterError NOT_UNIT',
    new DepartmentCostCenterError('NOT_UNIT'),
    HttpStatus.UNPROCESSABLE_ENTITY,
    'DEPARTMENT.COST_CENTER_NOT_UNIT',
    undefined,
  ],
  [
    'DepartmentCostCenterError INACTIVE',
    new DepartmentCostCenterError('INACTIVE'),
    HttpStatus.UNPROCESSABLE_ENTITY,
    'DEPARTMENT.COST_CENTER_INACTIVE',
    undefined,
  ],
  [
    'DepartmentNameInvalidError',
    new DepartmentNameInvalidError(),
    HttpStatus.UNPROCESSABLE_ENTITY,
    'DEPARTMENT.NAME_INVALID',
    undefined,
  ],
  [
    'DepartmentItAdminInvalidError',
    new DepartmentItAdminInvalidError(),
    HttpStatus.UNPROCESSABLE_ENTITY,
    'DEPARTMENT.IT_ADMIN_INVALID',
    undefined,
  ],
  [
    'DepartmentUpdateEmptyError',
    new DepartmentUpdateEmptyError(),
    HttpStatus.UNPROCESSABLE_ENTITY,
    'DEPARTMENT.UPDATE_EMPTY',
    undefined,
  ],
  ['DepartmentInactiveError', new DepartmentInactiveError(), HttpStatus.CONFLICT, 'DEPARTMENT.INACTIVE', undefined],
  [
    'DepartmentInUseError',
    new DepartmentInUseError(people, 4),
    HttpStatus.CONFLICT,
    'DEPARTMENT.IN_USE',
    { members: people, totalMembers: 4, openWork: [] },
  ],
  ...(
    [
      'EMPLOYEE_NOT_FOUND',
      'EMPLOYEE_NOT_ACTIVE',
      'NOT_A_MEMBER_ON_DATE',
      'SUPER_ADMIN_CANNOT_HEAD',
      'DATE_IN_PAST',
      'HEADS_ANOTHER_DEPARTMENT',
    ] as const
  ).map((problem): [string, Error, HttpStatus, string, undefined] => [
    `HeadAssignmentError ${problem}`,
    new HeadAssignmentError(problem),
    HttpStatus.UNPROCESSABLE_ENTITY,
    `DEPARTMENT.HEAD_${problem}`,
    undefined,
  ]),
  ['ProjectNotFoundError', new ProjectNotFoundError(), HttpStatus.NOT_FOUND, 'PROJECT.NOT_FOUND', undefined],
  ...(['NAME', 'DESCRIPTION', 'DEPARTMENT_NOT_FOUND'] as const).map(
    (reason): [string, Error, HttpStatus, string, undefined] => [
      `ProjectInvalidError ${reason}`,
      new ProjectInvalidError(reason),
      HttpStatus.UNPROCESSABLE_ENTITY,
      `PROJECT.INVALID_${reason}`,
      undefined,
    ],
  ),
];

describe('toOrganizationApiException (organization HTTP error contract)', () => {
  it.each(CASES)('maps %s', (_label, error, status, code, details) => {
    expect(answer(error)).toEqual({
      status,
      body: { code, message: error.message, ...(details ? { details } : {}) },
    });
  });

  it('keeps DEPARTMENT.IN_USE details to exactly members, openWork and totalMembers (QĐ-75)', () => {
    const { body } = answer(new DepartmentInUseError(people, 1));

    expect(Object.keys((body as { details: object }).details).sort()).toEqual(['members', 'openWork', 'totalMembers']);
  });

  it('passes an ApiException through as the same object', () => {
    const existing = new ApiException(HttpStatus.CONFLICT, { code: 'SAMPLE.CONFLICT', message: 'Already there.' });

    expect(toOrganizationApiException(existing)).toBe(existing);
  });

  it('turns a database that cannot answer into 503 SERVICE_UNAVAILABLE', () => {
    expect(answer(new TransientDatabaseError('40001', new Error('serialization failure')))).toEqual({
      status: HttpStatus.SERVICE_UNAVAILABLE,
      body: { code: 'SERVICE_UNAVAILABLE', message: 'The service is temporarily unavailable. Retry shortly.' },
    });
  });

  it.each([
    ['a plain Error', new Error('boom')],
    ['EmployeeNotFoundError (handled by callers, not by this mapper)', new EmployeeNotFoundError('emp-1')],
    ['OrganizationAlreadyExistsError', new OrganizationAlreadyExistsError()],
    ['EmployeeCodeTakenError', new EmployeeCodeTakenError('E-1')],
    ['a non-error value', 'not an error'],
  ])('returns %s unchanged, for the global filter to report', (_label, error) => {
    expect(toOrganizationApiException(error)).toBe(error);
  });
});
