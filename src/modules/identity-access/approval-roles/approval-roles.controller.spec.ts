import { HttpStatus } from '@nestjs/common';
import { TransientDatabaseError } from '../../../infrastructure/database/transaction-runner';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { EmployeeNotFoundError } from '../../organization/organization.errors';
import {
  ApprovalRoleHolderInvalidError,
  ApprovalRoleHolderProblem,
  ApprovalRolePairingError,
} from './approval-role.errors';
import { ApprovalRoleService } from './approval-role.service';
import { ApprovalRolesController } from './approval-roles.controller';

// H5.0 characterization: the error answers of the approval-role routes.

const actor = { appUserId: '00000000-0000-4000-8000-000000000001' } as AuthenticatedPrincipal;
const employeeId = '00000000-0000-4000-8000-000000000002';

const routes = {
  list: (c: ApprovalRolesController) => c.list(),
  set: (c: ApprovalRolesController) => c.set(actor, { role: 'SPENDING_APPROVER' }, { employeeId }),
};
type Route = keyof typeof routes;
const allRoutes = Object.keys(routes) as Route[];

async function rejectionOf(route: Route, error: Error): Promise<unknown> {
  const fail = () => Promise.reject(error);
  const controller = new ApprovalRolesController({ list: fail, set: fail } as unknown as ApprovalRoleService);
  try {
    await routes[route](controller);
  } catch (caught) {
    return caught;
  }
  throw new Error(`${route} did not fail`);
}

async function answerOf(route: Route, error: Error) {
  const caught = await rejectionOf(route, error);
  expect(caught).toBeInstanceOf(ApiException);
  const exception = caught as ApiException;

  return { status: exception.getStatus(), body: exception.getResponse() };
}

describe('ApprovalRolesController — error answers (status, code, message)', () => {
  it('answers an unknown employee with 404', async () => {
    expect(await answerOf('set', new EmployeeNotFoundError(employeeId))).toEqual({
      status: HttpStatus.NOT_FOUND,
      body: { code: 'ORGANIZATION.EMPLOYEE_NOT_FOUND', message: 'The employee was not found.' },
    });
  });

  it.each<ApprovalRoleHolderProblem>(['EMPLOYEE_NOT_ACTIVE', 'NO_USABLE_ACCOUNT', 'SUPER_ADMIN_CANNOT_HOLD'])(
    'answers a holder refused for %s with 422',
    async (problem) => {
      expect(await answerOf('set', new ApprovalRoleHolderInvalidError(problem))).toEqual({
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        body: { code: `APPROVAL_ROLE.${problem}`, message: `The person cannot hold an approval role: ${problem}.` },
      });
    },
  );

  it('answers a substitute who is the spending approver with 422', async () => {
    expect(await answerOf('set', new ApprovalRolePairingError())).toEqual({
      status: HttpStatus.UNPROCESSABLE_ENTITY,
      body: {
        code: 'APPROVAL_ROLE.SUBSTITUTE_MUST_DIFFER',
        message: 'The substitute for a conflict of interest cannot be the spending approver.',
      },
    });
  });

  it.each(allRoutes)('%s answers 503 SERVICE_UNAVAILABLE for an unreachable database', async (route) => {
    for (const outage of [new TransientDatabaseError('57014', new Error('timeout')), new Error('Query read timeout')]) {
      expect(await answerOf(route, outage)).toEqual({
        status: HttpStatus.SERVICE_UNAVAILABLE,
        body: { code: 'SERVICE_UNAVAILABLE', message: 'The service is temporarily unavailable. Retry shortly.' },
      });
    }
  });

  it.each(allRoutes)('%s passes an HTTP answer already made through unchanged', async (route) => {
    const answer = new ApiException(HttpStatus.CONFLICT, { code: 'SOME.CONFLICT', message: 'Already decided.' });

    await expect(rejectionOf(route, answer)).resolves.toBe(answer);
  });

  it.each(allRoutes)('%s keeps an unexpected error as it is, so it is reported as an internal error', async (route) => {
    const defect = new Error('column "nope" does not exist');

    await expect(rejectionOf(route, defect)).resolves.toBe(defect);
  });
});
