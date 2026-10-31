import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AccessRequestRoleRequiredError } from '../access-request/access-request.errors';
import { GroupLineClosureService } from './group-line-closure.service';

/**
 * The IT Admin removes one person who left or was transferred from a request for a group: the role is judged by the service
 * itself, before it reads or locks anything. Every dependency fails when touched, so a refusal that read a request first would be seen.
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

describe('the service removes a person of a group only for the IT Admin (F13)', () => {
  const stub = untouchable as never;
  const closure = new GroupLineClosureService(stub, stub, stub, stub, stub, stub, stub, stub);

  it.each([[['FINANCE']], [['MANAGER']], [['EMPLOYEE']], [['SUPER_ADMIN']], [[]]])(
    'refuses a caller who holds %j, whether the person left or was transferred',
    async (roles) => {
      await expect(closure.close(actor(roles), 'r-1', 'e-2', { cause: 'BENEFICIARY_LEFT' })).rejects.toBeInstanceOf(
        AccessRequestRoleRequiredError,
      );
      await expect(
        closure.close(actor(roles), 'r-1', 'e-2', { cause: 'BENEFICIARY_TRANSFERRED', note: 'Moved to Design' }),
      ).rejects.toBeInstanceOf(AccessRequestRoleRequiredError);
    },
  );
});
