import { HttpStatus } from '@nestjs/common';
import { FORBIDDEN_ERROR } from '../../infrastructure/http/errors/access-errors';
import { ApiException } from '../../infrastructure/http/errors/api.exception';
import { TransientDatabaseError } from '../../infrastructure/database/transaction-runner';
import {
  CostCenterCodeTakenError,
  CostCenterDepartmentAlreadyLinkedError,
  CostCenterDepartmentNotActiveError,
  CostCenterForbiddenError,
  CostCenterInUseError,
  CostCenterKindNotSupportedError,
  CostCenterNameInvalidError,
  CostCenterNameReservedError,
  CostCenterNotFoundError,
} from './cost-center/cost-center.errors';
import {
  DepartmentCodeTakenError,
  DepartmentForbiddenError,
  DepartmentInUseError,
  DepartmentInactiveError,
  DepartmentItAdminInvalidError,
  DepartmentNameInvalidError,
  DepartmentNotFoundError,
  DepartmentOutOfScopeError,
  DepartmentUpdateEmptyError,
  HeadAssignmentError,
} from './department/department.errors';
import {
  EmployeeForbiddenError,
  EmployeeRowInvalidError,
  EmployeeSelfChangeForbiddenError,
  EmployeeUpdateEmptyError,
} from './employee/employee.errors';
import {
  EmployeeCodeTakenError,
  EmployeeNotFoundError,
  OrganizationAlreadyExistsError,
} from './public/organization.errors';
import { toCostCenterApiException } from './cost-center/cost-center.http-errors';
import { toDepartmentApiException } from './department-management/department.http-errors';
import { toEmployeeApiException } from './employee/employee.http-errors';
import { toOrganizationApiException } from './organization.http-errors';

/**
 * The mapper of the capability whose error it is (each capability answers its own errors and falls back to the one of the module),
 * so that every row below goes through the mapper a controller of that capability uses.
 */
function mapperOwning(error: unknown): (error: unknown) => unknown {
  const name = error instanceof Error ? error.constructor.name : '';
  if (name.startsWith('CostCenter')) return toCostCenterApiException;
  if (name.startsWith('Department') || name === 'HeadAssignmentError') return toDepartmentApiException;
  if (name.startsWith('Employee') && name !== 'EmployeeNotFoundError') return toEmployeeApiException;

  return toOrganizationApiException;
}

/** The HTTP answer an error becomes: status and the body the global filter writes. */
function answer(error: unknown): { status: number; body: unknown } {
  const mapped = mapperOwning(error)(error);
  if (!(mapped instanceof ApiException)) throw new Error('expected an ApiException');

  return { status: mapped.getStatus(), body: mapped.getResponse() };
}

const department = { id: 'dep-1', code: 'DES', name: 'Design' };
const people = [{ employeeCode: 'E-1', fullName: 'An Nguyen' }];
const work = [{ kind: 'ACCESS_REQUEST', id: 'req-1', label: null }];

/**
 * Characterization of the organization error contract before its refactor (wire contract: status, code, message,
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
    new CostCenterInUseError(department, {
      requests: { items: work, total: 3 },
      commitments: { items: [], total: 0 },
    }),
    HttpStatus.CONFLICT,
    'COST_CENTER.IN_USE',
    { department, requests: work, totalRequests: 3, commitments: [], totalCommitments: 0 },
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
    'EmployeeSelfChangeForbiddenError',
    new EmployeeSelfChangeForbiddenError(),
    HttpStatus.FORBIDDEN,
    'EMPLOYEE.SELF_CHANGE_FORBIDDEN',
    undefined,
  ],
  [
    'DepartmentInUseError',
    new DepartmentInUseError({
      members: { items: people, total: 4 },
      serviceAccounts: { items: [], total: 0 },
      openWork: { items: work, total: 2 },
      subscriptions: { items: [], total: 0 },
    }),
    HttpStatus.CONFLICT,
    'DEPARTMENT.IN_USE',
    {
      members: people,
      totalMembers: 4,
      serviceAccounts: [],
      totalServiceAccounts: 0,
      openWork: work,
      totalOpenWork: 2,
      subscriptions: [],
      totalSubscriptions: 0,
    },
  ],
  ...(
    [
      'EMPLOYEE_NOT_FOUND',
      'EMPLOYEE_NOT_ACTIVE',
      'NOT_A_MEMBER_ON_DATE',
      'SUPER_ADMIN_CANNOT_HEAD',
      'DATE_IN_PAST',
      'HEADS_ANOTHER_DEPARTMENT',
      'SUCCESSOR_DATE_NOT_FUTURE',
      'SUCCESSOR_NEEDS_A_HEAD',
      'SUCCESSOR_IS_THE_HEAD',
    ] as const
  ).map((problem): [string, Error, HttpStatus, string, undefined] => [
    `HeadAssignmentError ${problem}`,
    new HeadAssignmentError(problem),
    HttpStatus.UNPROCESSABLE_ENTITY,
    `DEPARTMENT.HEAD_${problem}`,
    undefined,
  ]),
  [
    'HeadAssignmentError SUCCESSOR_ALREADY_NAMED',
    new HeadAssignmentError('SUCCESSOR_ALREADY_NAMED'),
    HttpStatus.CONFLICT,
    'DEPARTMENT.HEAD_SUCCESSOR_ALREADY_NAMED',
    undefined,
  ],
];

describe('toOrganizationApiException (organization HTTP error contract)', () => {
  it.each(CASES)('maps %s', (_label, error, status, code, details) => {
    expect(answer(error)).toEqual({
      status,
      body: { code, message: error.message, ...(details ? { details } : {}) },
    });
  });

  it.each([
    ['DepartmentForbiddenError', new DepartmentForbiddenError()],
    ['CostCenterForbiddenError', new CostCenterForbiddenError()],
    ['EmployeeForbiddenError', new EmployeeForbiddenError()],
  ])('answers %s with the same 403 as a route that refuses the role (F13)', (_label, error) => {
    expect(answer(error)).toEqual({ status: HttpStatus.FORBIDDEN, body: { ...FORBIDDEN_ERROR } });
  });

  it('keeps DEPARTMENT.IN_USE details to the four bounded groups, never shared accounts (QĐ-75, QĐ-86c, F15)', () => {
    const { body } = answer(
      new DepartmentInUseError({
        members: { items: people, total: 1 },
        serviceAccounts: { items: [{ assignmentId: 'a-1', accountIdentifier: 'ci-bot' }], total: 1 },
        openWork: { items: [], total: 0 },
        subscriptions: { items: [], total: 0 },
      }),
    );

    expect(Object.keys((body as { details: object }).details).sort()).toEqual([
      'members',
      'openWork',
      'serviceAccounts',
      'subscriptions',
      'totalMembers',
      'totalOpenWork',
      'totalServiceAccounts',
      'totalSubscriptions',
    ]);
  });

  it('keeps COST_CENTER.IN_USE details to the department and the two groups of obligations, never people (F16)', () => {
    const { body } = answer(
      new CostCenterInUseError(department, {
        requests: { items: [], total: 0 },
        commitments: { items: [], total: 0 },
      }),
    );

    expect(Object.keys((body as { details: object }).details).sort()).toEqual([
      'commitments',
      'department',
      'requests',
      'totalCommitments',
      'totalRequests',
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
