import {
  ApplicationResponsibilityForbiddenError,
  ApplicationResponsibleNotItAdminError,
} from './application-responsibility.errors';

export interface TransferCaller {
  role: 'IT_ADMIN' | 'SUPER_ADMIN';
  employeeId: string;
}

/**
 * Whether an application is handed over, and to whom it may be (`QĐ-111g`, `QĐ-118f`, `QĐ-118l`), judged in this order: the authority
 * first, then the person named. Only the Super Admin changes who is responsible for an application; an IT Admin never does, not even the one
 * responsible and not even to take an application that needs a responsible IT Admin. The one named must be an IT Admin who works now.
 * Handing it to the one already responsible, who works, changes nothing.
 * Throws ApplicationResponsibilityForbiddenError and ApplicationResponsibleNotItAdminError.
 */
export function decideResponsibilityTransfer(input: {
  actor: TransferCaller;
  responsibleEmployeeId: string | null;
  /** Nobody is responsible, or the one named is no longer a working IT Admin. */
  needsResponsible: boolean;
  toEmployeeId: string;
  toIsUsableItAdmin: boolean;
}): 'CHANGE' | 'UNCHANGED' {
  const { actor, needsResponsible } = input;
  if (actor.role !== 'SUPER_ADMIN') throw new ApplicationResponsibilityForbiddenError();
  if (!input.toIsUsableItAdmin) throw new ApplicationResponsibleNotItAdminError();

  return !needsResponsible && input.toEmployeeId === input.responsibleEmployeeId ? 'UNCHANGED' : 'CHANGE';
}
