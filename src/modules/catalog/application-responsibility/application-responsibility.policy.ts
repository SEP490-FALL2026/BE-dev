import {
  ApplicationResponsibilityForbiddenError,
  ApplicationResponsibleNotItAdminError,
} from './application-responsibility.errors';

export interface TransferCaller {
  role: 'IT_ADMIN' | 'SUPER_ADMIN';
  employeeId: string;
}

/**
 * Whether an application is handed over, and to whom it may be (`QĐ-111g`, `R-26`, `US-04-06` AC-7, AC-8), judged in this order:
 * the authority first, then the person named. The IT Admin responsible for it hands it to another; while it needs one (nobody is
 * named, or the one named no longer works as an IT Admin) any IT Admin takes it, for themselves only; the Super Admin names any.
 * The one named must be an IT Admin who works now. Handing it to the one already responsible, who works, changes nothing.
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
  const mayHandOver =
    actor.role === 'SUPER_ADMIN' || (!needsResponsible && actor.employeeId === input.responsibleEmployeeId);
  const mayTake = actor.role === 'IT_ADMIN' && needsResponsible && input.toEmployeeId === actor.employeeId;
  if (!mayHandOver && !mayTake) throw new ApplicationResponsibilityForbiddenError();
  if (!input.toIsUsableItAdmin) throw new ApplicationResponsibleNotItAdminError();

  return !needsResponsible && input.toEmployeeId === input.responsibleEmployeeId ? 'UNCHANGED' : 'CHANGE';
}
