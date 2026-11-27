import { normalizeDisplayName } from '../../../core/display-name';
import {
  WorkspaceAdminsTooFewError,
  WorkspaceLimitExceededError,
  WorkspaceNotResponsibleError,
  WorkspacePrimaryOwnerNotAdminError,
  WorkspaceResponsibleNotItAdminError,
  WorkspaceTextInvalidError,
} from './workspace.errors';
import type { WorkspaceAdminRecord, WorkspaceFlag } from './workspace.types';

/** The fewest different IT Admins who administer a workspace (`QĐ-110k`): one may leave and the vendor account is still reachable. */
export const MIN_WORKSPACE_ADMINS = 2;

/** The longest free text a workspace keeps (the note, the procedure of transfer of ownership). */
export const MAX_WORKSPACE_TEXT_LENGTH = 2000;

/** A free-text field of a workspace: nothing or blanks is null, blanks inside collapse; at most 2000 characters. Throws WorkspaceTextInvalidError. */
export function cleanWorkspaceText(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const text = normalizeDisplayName(raw);
  if (text.length > MAX_WORKSPACE_TEXT_LENGTH) throw new WorkspaceTextInvalidError();

  return text === '' ? null : text;
}

/**
 * The shape of the administrators of a workspace, judged in a fixed order: at least two different people, the primary owner is one of them with the
 * role OWNER, and the owners and the administrators stay within the limits the vendor sets. Whether each person is an IT Admin who works is judged
 * apart, on the accounts. Throws WorkspaceAdminsTooFewError, WorkspacePrimaryOwnerNotAdminError and WorkspaceLimitExceededError.
 */
export function assertAdminsShape(input: {
  admins: readonly WorkspaceAdminRecord[];
  primaryOwnerEmployeeId: string;
  ownerLimit: number | null;
  adminLimit: number | null;
}): void {
  const given = new Set(input.admins.map((admin) => admin.employeeId)).size;
  if (given < MIN_WORKSPACE_ADMINS) throw new WorkspaceAdminsTooFewError(given, MIN_WORKSPACE_ADMINS);
  const primary = input.admins.find((admin) => admin.employeeId === input.primaryOwnerEmployeeId);
  if (!primary || primary.role !== 'OWNER') throw new WorkspacePrimaryOwnerNotAdminError();

  assertWithinLimits(input.admins, input.ownerLimit, input.adminLimit);
}

/** The owners and the administrators named stay within the limits the vendor sets (none: no limit). Throws WorkspaceLimitExceededError. */
export function assertWithinLimits(
  admins: readonly WorkspaceAdminRecord[],
  ownerLimit: number | null,
  adminLimit: number | null,
): void {
  const owners = admins.filter((admin) => admin.role === 'OWNER').length;
  if (ownerLimit !== null && owners > ownerLimit) throw new WorkspaceLimitExceededError('OWNER');
  if (adminLimit !== null && admins.length - owners > adminLimit) throw new WorkspaceLimitExceededError('ADMIN');
}

/** Only the IT Admin who answers for the workspace changes it (`QĐ-118f`); a workspace nobody answers for is changed by nobody. Throws WorkspaceNotResponsibleError. */
export function assertResponsible(actorEmployeeId: string, responsibleEmployeeId: string | null): void {
  if (responsibleEmployeeId === null || responsibleEmployeeId !== actorEmployeeId)
    throw new WorkspaceNotResponsibleError();
}

/**
 * What naming an IT Admin to answer for a workspace does (`QĐ-118f`, `QĐ-118l`): the one named must be an IT Admin who works now, judged first;
 * naming the one who already answers changes nothing. Throws WorkspaceResponsibleNotItAdminError.
 */
export function judgeResponsibleChange(input: {
  currentEmployeeId: string | null;
  toEmployeeId: string;
  toIsUsableItAdmin: boolean;
}): 'CHANGE' | 'UNCHANGED' {
  if (!input.toIsUsableItAdmin) throw new WorkspaceResponsibleNotItAdminError();

  return input.currentEmployeeId === input.toEmployeeId ? 'UNCHANGED' : 'CHANGE';
}

/** What a reader of a workspace is warned of: too few administrators who work, no email of the company account that owns it, nobody in charge. */
export function workspaceFlags(input: {
  workingAdminCount: number;
  ownerAccountEmail: string | null;
  responsibleItAdminEmployeeId: string | null;
}): WorkspaceFlag[] {
  const flags: WorkspaceFlag[] = [];
  if (input.workingAdminCount < MIN_WORKSPACE_ADMINS) flags.push('ADMINS_BELOW_MINIMUM');
  if (input.ownerAccountEmail === null) flags.push('NO_OWNER_EMAIL');
  if (input.responsibleItAdminEmployeeId === null) flags.push('NO_RESPONSIBLE');

  return flags;
}

/**
 * The people a departure does not refuse yet (`QĐ-110k`): everyone who has no block, and whoever's block begins after `today` (a block refuses the
 * first day it begins). The flag of a workspace falls from the block, before the person has left.
 */
export function notYetBlocked(
  people: ReadonlySet<string>,
  blockedFrom: ReadonlyMap<string, string>,
  today: string,
): Set<string> {
  return new Set([...people].filter((id) => (blockedFrom.get(id) ?? '9999-12-31') > today));
}
