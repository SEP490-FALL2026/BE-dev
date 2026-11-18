import { HttpStatus } from '@nestjs/common';
import { FORBIDDEN_ERROR } from '../../../infrastructure/http/errors/access-errors';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import { errorExampleOf } from '../../../infrastructure/http/openapi-error-examples';
import { refuse, toOrganizationApiException } from '../organization.http-errors';
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
} from './cost-center.errors';

/**
 * Maps the errors of the cost-center routes to their HTTP answers; every other error goes to the mapper of the module
 * (`toOrganizationApiException`: an ApiException as it is, an unknown employee, a database that cannot answer, the rest unchanged).
 */
export function toCostCenterApiException(error: unknown): unknown {
  if (error instanceof CostCenterForbiddenError) {
    // The policy of a service refuses a role the way the guard of the route does, with the same body.
    return new ApiException(HttpStatus.FORBIDDEN, FORBIDDEN_ERROR);
  }
  if (error instanceof CostCenterNotFoundError) {
    return refuse(HttpStatus.NOT_FOUND, 'COST_CENTER.NOT_FOUND', error.message);
  }
  if (error instanceof CostCenterCodeTakenError) {
    return refuse(HttpStatus.CONFLICT, 'COST_CENTER.CODE_TAKEN', error.message);
  }
  if (error instanceof CostCenterDepartmentNotActiveError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'COST_CENTER.DEPARTMENT_NOT_ACTIVE', error.message);
  }
  if (error instanceof CostCenterDepartmentAlreadyLinkedError) {
    return refuse(HttpStatus.CONFLICT, 'COST_CENTER.DEPARTMENT_ALREADY_LINKED', error.message);
  }
  if (error instanceof CostCenterKindNotSupportedError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'COST_CENTER.KIND_NOT_SUPPORTED', error.message);
  }
  if (error instanceof CostCenterNameReservedError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'COST_CENTER.NAME_RESERVED', error.message);
  }
  if (error instanceof CostCenterNameInvalidError) {
    return refuse(HttpStatus.UNPROCESSABLE_ENTITY, 'COST_CENTER.NAME_INVALID', error.message);
  }
  if (error instanceof CostCenterInUseError) {
    const { requests, commitments } = error.groups;

    return refuse(HttpStatus.CONFLICT, 'COST_CENTER.IN_USE', error.message, {
      department: error.department,
      requests: requests.items,
      totalRequests: requests.total,
      commitments: commitments.items,
      totalCommitments: commitments.total,
    });
  }

  return toOrganizationApiException(error);
}

const example = (error: Error) => errorExampleOf(toCostCenterApiException(error));

/** The answers above as OpenAPI examples, each produced by the mapper that gives it at runtime. */
export const COST_CENTER_ERROR_EXAMPLES = {
  COST_CENTER_NOT_FOUND: example(new CostCenterNotFoundError()),
  COST_CENTER_CODE_TAKEN: example(new CostCenterCodeTakenError('CC-01')),
  COST_CENTER_DEPARTMENT_NOT_ACTIVE: example(new CostCenterDepartmentNotActiveError()),
  COST_CENTER_DEPARTMENT_ALREADY_LINKED: example(new CostCenterDepartmentAlreadyLinkedError('<department-id>')),
  COST_CENTER_KIND_NOT_SUPPORTED: example(new CostCenterKindNotSupportedError()),
  COST_CENTER_NAME_RESERVED: example(new CostCenterNameReservedError()),
  COST_CENTER_NAME_INVALID: example(new CostCenterNameInvalidError()),
  COST_CENTER_IN_USE: example(
    new CostCenterInUseError(
      { id: '<department-id>', code: 'D01', name: '<department-name>' },
      {
        requests: { items: [{ kind: 'ACCESS_REQUEST', id: '<request-id>', label: null }], total: 1 },
        commitments: { items: [{ kind: 'BUDGET_COMMITMENT', id: '<commitment-id>', label: null }], total: 1 },
      },
    ),
  ),
} as const;
