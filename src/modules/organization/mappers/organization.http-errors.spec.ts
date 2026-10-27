import { HttpStatus } from '@nestjs/common';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { TransientDatabaseError } from '../../../infrastructure/database/transaction-runner';
import {
  CostCenterCodeTakenError,
  CostCenterDepartmentAlreadyLinkedError,
  CostCenterDepartmentNotActiveError,
  CostCenterInUseError,
  CostCenterKindNotSupportedError,
  CostCenterNameInvalidError,
  CostCenterNameReservedError,
  CostCenterNotFoundError,
} from '../cost-center/cost-center.errors';
import {
  DepartmentCodeTakenError,
  DepartmentCreationAwaitingActivationError,
  DepartmentInUseError,
  DepartmentInactiveError,
  DepartmentItAdminInvalidError,
  DepartmentNameInvalidError,
  DepartmentNotFoundError,
  DepartmentOutOfScopeError,
  DepartmentUpdateEmptyError,
  HeadAssignmentError,
} from '../department/department.errors';
import {
  EmployeeAnotherItAdminNeededError,
  EmployeeRowInvalidError,
  EmployeeUpdateEmptyError,
} from '../employee/employee.errors';
import { ProjectInvalidError, ProjectNotFoundError } from '../project/project.errors';
import { EmployeeCodeTakenError, EmployeeNotFoundError, OrganizationAlreadyExistsError } from '../organization.errors';
import { toOrganizationApiException } from './organization.http-errors';

/** The HTTP answer an error becomes: status and the body the global filter writes. */
function answer(error: unknown): { status: number; body: unknown } {
  const mapped = toOrganizationApiException(error);
  if (!(mapped instanceof ApiException)) throw new Error('expected an ApiException');

  return { status: mapped.getStatus(), body: mapped.getResponse() };
}

const department = { id: 'dep-1', code: 'DES', name: 'Design' };
const people = [{ employeeCode: 'E-1', fullName: 'An Nguyen' }];

/**
 * Characterization of the organization error contract before the H4.1 refactor (wire contract: status, code, message,
 * details). One row per branch of `toOrganizationApiException`; `details` appears only where a row names it.
 */
const CASES: [string, Error, HttpStatus, string, Record<string, unknown> | undefined][] = [
  [
    'EmployeeRowInvalidError',
    new EmployeeRowInvalidError([{ field: 'jobTitle', code: 'JOB_TITLE_TOO_LONG' }]),
    HttpStatus.UNPROCESSABLE_ENTITY,
    'EMPLOYEE.ROW_INVALID',
    { reasons: [{ field: 'jobTitle', code: 'JOB_TITLE_TOO_LONG' }] },
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
    'CostCenterDepartmentNotActiveError',
    new CostCenterDepartmentNotActiveError(),
    HttpStatus.UNPROCESSABLE_ENTITY,
    'COST_CENTER.DEPARTMENT_NOT_ACTIVE',
    undefined,
  ],
  [
    'CostCenterDepartmentAlreadyLinkedError',
    new CostCenterDepartmentAlreadyLinkedError('<department-id>'),
    HttpStatus.CONFLICT,
    'COST_CENTER.DEPARTMENT_ALREADY_LINKED',
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
    'DepartmentCreationAwaitingActivationError',
    new DepartmentCreationAwaitingActivationError(),
    HttpStatus.CONFLICT,
    'DEPARTMENT.CREATION_AWAITING_ACTIVATION',
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
  ['EmployeeNotFoundError', new EmployeeNotFoundError('emp-1'), HttpStatus.NOT_FOUND, 'EMPLOYEE.NOT_FOUND', undefined],
  [
    'EmployeeUpdateEmptyError',
    new EmployeeUpdateEmptyError(),
    HttpStatus.UNPROCESSABLE_ENTITY,
    'EMPLOYEE.UPDATE_EMPTY',
    undefined,
  ],
  [
    'EmployeeAnotherItAdminNeededError',
    new EmployeeAnotherItAdminNeededError(),
    HttpStatus.FORBIDDEN,
    'EMPLOYEE.ANOTHER_IT_ADMIN_NEEDED',
    undefined,
  ],
  [
    'DepartmentInUseError',
    new DepartmentInUseError(people, 4),
    HttpStatus.CONFLICT,
    'DEPARTMENT.IN_USE',
    { members: people, totalMembers: 4, serviceAccounts: [], totalServiceAccounts: 0, openWork: [] },
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

  it('keeps DEPARTMENT.IN_USE details to the members, the service accounts it owns and open work, never shared accounts (QĐ-75, QĐ-86c)', () => {
    const { body } = answer(
      new DepartmentInUseError(people, 1, [{ assignmentId: 'a-1', accountIdentifier: 'ci-bot' }], 1),
    );

    expect(Object.keys((body as { details: object }).details).sort()).toEqual([
      'members',
      'openWork',
      'serviceAccounts',
      'totalMembers',
      'totalServiceAccounts',
    ]);
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
    ['OrganizationAlreadyExistsError', new OrganizationAlreadyExistsError()],
    ['EmployeeCodeTakenError', new EmployeeCodeTakenError('E-1')],
    ['a non-error value', 'not an error'],
  ])('returns %s unchanged, for the global filter to report', (_label, error) => {
    expect(toOrganizationApiException(error)).toBe(error);
  });
});
