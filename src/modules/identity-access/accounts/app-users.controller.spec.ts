import { HttpStatus } from '@nestjs/common';
import { TransientDatabaseError } from '../../../infrastructure/database/transaction-runner';
import { ApiException } from '../../../infrastructure/http/errors/api.exception';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { EmployeeNotFoundError } from '../../organization/organization.errors';
import {
  AccountAlreadyActivatedError,
  AccountAlreadyExistsError,
  AccountLockedError,
  AccountNotFoundError,
  EmployeeTerminatedError,
  FinanceAlreadyAssignedError,
  InvitationInvalidError,
  LoginEmailInvalidError,
  LoginEmailRequiredError,
  LoginEmailTakenError,
  RoleAlreadyGrantedError,
  RoleCombinationForbiddenError,
  RoleNotGrantedError,
  RoleRequestRefusedError,
  SelfChangeForbiddenError,
  SuperAdminHolderNotLockableError,
} from './account.errors';
import { AccountInvitationService } from './account-invitation.service';
import { AccountQueryService } from './account-query.service';
import { AccountStatusService } from './account-status.service';
import { AppUsersController } from './app-users.controller';

// H5.0 characterization: the error answers of account administration, route by route.

const actor = { appUserId: '00000000-0000-4000-8000-000000000001' } as AuthenticatedPrincipal;
const id = '00000000-0000-4000-8000-000000000002';

function failingWith(error: Error): AppUsersController {
  const fail = () => Promise.reject(error);

  return new AppUsersController(
    { listCandidates: fail, listAccounts: fail, getAccount: fail } as unknown as AccountQueryService,
    { createAccount: fail, resendInvitation: fail } as unknown as AccountInvitationService,
    { lock: fail, unlock: fail, grantRole: fail, revokeRole: fail } as unknown as AccountStatusService,
  );
}

const routes = {
  listCandidates: (c: AppUsersController) => c.listCandidates({}),
  create: (c: AppUsersController) => c.create(actor, { employeeId: id } as never),
  list: (c: AppUsersController) => c.list({} as never),
  get: (c: AppUsersController) => c.get({ id }),
  resendInvitation: (c: AppUsersController) => c.resendInvitation(actor, { id }),
  lock: (c: AppUsersController) => c.lock(actor, { id }, { reason: 'Ticket 42' }),
  unlock: (c: AppUsersController) => c.unlock(actor, { id }, { reason: 'Ticket 42' }),
  grantRole: (c: AppUsersController) => c.grantRole(actor, { id }, { role: 'FINANCE' } as never),
  revokeRole: (c: AppUsersController) => c.revokeRole(actor, { id, role: 'FINANCE' } as never),
};
type Route = keyof typeof routes;
const allRoutes = Object.keys(routes) as Route[];

async function rejectionOf(route: Route, error: Error): Promise<unknown> {
  try {
    await routes[route](failingWith(error));
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

const refused = (status: HttpStatus, code: string, message: string) => ({ status, body: { code, message } });

describe('AppUsersController — error answers (status, code, message)', () => {
  it.each<[string, () => Error, { status: HttpStatus; body: object }]>([
    ['unknown account', () => new AccountNotFoundError(), refused(404, 'APP_USER.NOT_FOUND', 'Account not found.')],
    [
      'unknown employee',
      () => new EmployeeNotFoundError(id),
      refused(404, 'ORGANIZATION.EMPLOYEE_NOT_FOUND', 'The employee was not found.'),
    ],
    [
      'a change to the own account',
      () => new SelfChangeForbiddenError(),
      refused(409, 'APP_USER.SELF_CHANGE_FORBIDDEN', 'You cannot change your own account.'),
    ],
    [
      'a derived role',
      () => new RoleRequestRefusedError('ROLE_DERIVED'),
      refused(422, 'APP_USER.ROLE_DERIVED', 'The role cannot be granted by hand: ROLE_DERIVED.'),
    ],
    [
      'the Super Admin role',
      () => new RoleRequestRefusedError('SUPER_ADMIN_TRANSFER_ONLY'),
      refused(
        422,
        'APP_USER.SUPER_ADMIN_TRANSFER_ONLY',
        'The role cannot be granted by hand: SUPER_ADMIN_TRANSFER_ONLY.',
      ),
    ],
    [
      'an employee who left',
      () => new EmployeeTerminatedError(),
      refused(409, 'APP_USER.EMPLOYEE_TERMINATED', 'The employee has left; no account can be created or invited.'),
    ],
    [
      'a second account',
      () => new AccountAlreadyExistsError(),
      refused(409, 'APP_USER.ALREADY_EXISTS_FOR_EMPLOYEE', 'The employee already has an account.'),
    ],
    [
      'a login email in use',
      () => new LoginEmailTakenError(),
      refused(409, 'APP_USER.LOGIN_EMAIL_TAKEN', 'The login email is already used by another account.'),
    ],
    [
      'no login email',
      () => new LoginEmailRequiredError(),
      refused(422, 'APP_USER.LOGIN_EMAIL_REQUIRED', 'The employee has no work email and none was supplied.'),
    ],
    [
      'an invalid login email',
      () => new LoginEmailInvalidError(),
      refused(422, 'APP_USER.LOGIN_EMAIL_INVALID', 'The login email is not a valid address.'),
    ],
    [
      'an activated account',
      () => new AccountAlreadyActivatedError(),
      refused(409, 'APP_USER.ALREADY_ACTIVATED', 'The account is already activated.'),
    ],
    [
      'a locked account',
      () => new AccountLockedError(),
      refused(409, 'APP_USER.ACCOUNT_LOCKED', 'The account is locked.'),
    ],
    [
      'the Super Admin holder',
      () => new SuperAdminHolderNotLockableError(),
      refused(409, 'APP_USER.SUPER_ADMIN_HOLDER_NOT_LOCKABLE', 'The account holding SUPER_ADMIN cannot be locked.'),
    ],
    [
      'a role already held',
      () => new RoleAlreadyGrantedError(),
      refused(409, 'APP_USER.ROLE_ALREADY_GRANTED', 'The account already holds this role.'),
    ],
    [
      'a role not held',
      () => new RoleNotGrantedError(),
      refused(404, 'APP_USER.ROLE_NOT_GRANTED', 'The account does not hold this role.'),
    ],
    [
      'a forbidden combination',
      () => new RoleCombinationForbiddenError(),
      refused(
        409,
        'APP_USER.ROLE_COMBINATION_FORBIDDEN',
        'This role cannot be combined with the roles the account holds.',
      ),
    ],
    [
      'a second Finance',
      () => new FinanceAlreadyAssignedError(),
      refused(409, 'APP_USER.FINANCE_ALREADY_ASSIGNED', 'Another account already holds the FINANCE role.'),
    ],
    [
      'an unusable invitation link',
      () => new InvitationInvalidError(),
      refused(400, 'AUTH.INVITATION_INVALID', 'The invitation link is not valid.'),
    ],
  ])('answers %s', async (_case, error, expected) => {
    expect(await answerOf('lock', error())).toEqual(expected);
  });

  it.each(allRoutes)('%s maps an account error and an outage through the same mapper', async (route) => {
    expect(await answerOf(route, new AccountNotFoundError())).toEqual(
      refused(404, 'APP_USER.NOT_FOUND', 'Account not found.'),
    );
    for (const outage of [new TransientDatabaseError('57014', new Error('timeout')), new Error('Query read timeout')]) {
      expect(await answerOf(route, outage)).toEqual(
        refused(503, 'SERVICE_UNAVAILABLE', 'The service is temporarily unavailable. Retry shortly.'),
      );
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
