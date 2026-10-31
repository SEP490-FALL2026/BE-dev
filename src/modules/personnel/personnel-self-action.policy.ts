import type { AuthenticatedPrincipal } from '../../infrastructure/security/tokens/access-token-verifier.port';
import type { PersonnelAccessProblem } from './public/personnel.errors';
import type { PersonnelActor } from './public/personnel.types';

/**
 * Who may record, move, cancel or hand an event about a person, and who may not do it about themselves (`QĐ-87a`, `QĐ-87b`, `QĐ-87c`,
 * `QĐ-88b`). Pure: the service of each capability reads the facts and asks here, so the rule lives at the service
 * and a controller guard is only the outer layer.
 *
 * - Only the Super Admin writes an event of the personnel context (a transfer, a long leave, a departure) or handles a notice of a
 *   head. The IT Admin does the technical steps that follow and reads a minimal projection; it writes no event.
 * - The Super Admin never does it about themselves in the application: the person whose place changes is another person.
 * - The controlled procedure (`OPERATOR`) is accepted only for a person who holds the `SUPER_ADMIN` role: that is the one case the
 *   application cannot serve, and the command is never a way round the rule for anyone else.
 */
export const EVENT_WRITER_ROLE = 'SUPER_ADMIN';
export const TECHNICAL_ROLE = 'IT_ADMIN';

type Caller = Pick<AuthenticatedPrincipal, 'roles' | 'employeeId'>;

/** The refusal of a person who signed in to write an event about `subjectEmployeeId`; null when they may. */
export function userWriterRefusal(principal: Caller, subjectEmployeeId: string): PersonnelAccessProblem | null {
  if (!principal.roles.includes(EVENT_WRITER_ROLE)) return 'FORBIDDEN';

  return principal.employeeId === subjectEmployeeId ? 'SELF_CHANGE_FORBIDDEN' : null;
}

/** The refusal of the controlled procedure on a person: it serves only the one who holds the `SUPER_ADMIN` role. */
export function operatorSubjectRefusal(subjectHoldsSuperAdmin: boolean): PersonnelAccessProblem | null {
  return subjectHoldsSuperAdmin ? null : 'FORBIDDEN';
}

/** Both rules for either kind of actor. The facts about the roles of the subject are read only for the operator. */
export function personnelWriterRefusal(facts: {
  actor: PersonnelActor;
  subjectEmployeeId: string;
  subjectHoldsSuperAdmin: boolean;
}): PersonnelAccessProblem | null {
  return facts.actor.kind === 'USER'
    ? userWriterRefusal(facts.actor.principal, facts.subjectEmployeeId)
    : operatorSubjectRefusal(facts.subjectHoldsSuperAdmin);
}

/**
 * What a person who reads the events of the personnel context sees: the Super Admin reads everything; the IT Admin reads only
 * the minimal projection (who, which departments, the state and the days the technical work needs, never the basis or the check
 * of a notice) of the departments they are in charge of; nobody else reads them.
 */
export type ReadAccess = 'FULL' | 'MINIMAL' | 'NONE';

export function readAccessOf(principal: Pick<AuthenticatedPrincipal, 'roles'>): ReadAccess {
  if (principal.roles.includes(EVENT_WRITER_ROLE)) return 'FULL';

  return principal.roles.includes(TECHNICAL_ROLE) ? 'MINIMAL' : 'NONE';
}

/** The technical steps that follow an event (the lock of the account, the revocations, the closing) are the IT Admin's. */
export function technicalStepRefusal(principal: Pick<AuthenticatedPrincipal, 'roles'>): PersonnelAccessProblem | null {
  return principal.roles.includes(TECHNICAL_ROLE) ? null : 'FORBIDDEN';
}
