import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AccessRequestRoleRequiredError } from './access-request.errors';
import { DepartureCancellationService } from './departure-cancellation.service';

/**
 * The IT Admin closes a request because its beneficiary left or was transferred (F13, F29): the role is judged by the service itself,
 * before it reads or locks anything, so a caller that does not come through the controller is refused as the guard refuses.
 * Every dependency is a stub that fails when touched: a refusal that read a request first would be seen.
 */
const untouchable = new Proxy(
  {},
  {
    get: (_target, property) => {
      throw new Error(`The role was not judged first: ${String(property)} was touched.`);
    },
  },
);

const actor = (roles: string[]): AuthenticatedPrincipal => ({
  subject: 'a-1',
  appUserId: 'a-1',
  sessionId: 's-1',
  employeeId: 'e-1',
  directRoles: roles,
  derivedRoles: [],
  roles,
});

describe('the service closes a request only for the IT Admin (F13)', () => {
  const stub = untouchable as never;
  const cancellation = new DepartureCancellationService(stub, stub, stub, stub, stub, stub, stub, stub);

  it.each([[['FINANCE']], [['MANAGER']], [['SPEND_APPROVER']], [['EMPLOYEE']], [['SUPER_ADMIN']], [[]]])(
    'refuses a caller who holds %j, whether the person left or was transferred',
    async (roles) => {
      await expect(cancellation.cancel(actor(roles), 'r-1', { cause: 'BENEFICIARY_LEFT' })).rejects.toBeInstanceOf(
        AccessRequestRoleRequiredError,
      );
      await expect(
        cancellation.cancel(actor(roles), 'r-1', { cause: 'BENEFICIARY_TRANSFERRED', note: 'Moved to Design' }),
      ).rejects.toBeInstanceOf(AccessRequestRoleRequiredError);
    },
  );
});
