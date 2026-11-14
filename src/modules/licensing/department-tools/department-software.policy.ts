/**
 * The rules of the list of software of a department and of the proposals to add to it (`QĐ-110s`, `QĐ-110t`, `QĐ-111c`, SPEC P16 to
 * P18). Pure: the services read the facts and this file judges them. The list only guides (the person who asks for software sees it
 * first); it grants nothing.
 */

/** One place of the list: an application of the catalog, alone or with one of its plans. */
export interface DepartmentSoftwareItem {
  applicationId: string;
  planId: string | null;
}

/** The facts of the catalog about the items a request names: the applications and plans that exist, as far as they do. */
export interface CatalogFacts {
  applications: ReadonlyMap<string, { retired: boolean }>;
  plans: ReadonlyMap<string, { applicationId: string }>;
}

export type CatalogRefusal = 'NOT_IN_CATALOG';

/** The key the unique index of the table has: an application alone is one place, each of its plans another. */
export function entryKey(item: DepartmentSoftwareItem): string {
  return `${item.applicationId}:${item.planId ?? ''}`;
}

/** The first item that appears twice in one request, or null: the database would refuse the second with its unique index. */
export function repeatedItem<T extends DepartmentSoftwareItem>(items: readonly T[]): T | null {
  const seen = new Set<string>();
  for (const item of items) {
    const key = entryKey(item);
    if (seen.has(key)) return item;
    seen.add(key);
  }

  return null;
}

/**
 * Only what the catalog offers goes in the list or is proposed for it (`QĐ-110t`): an application that exists and is not retired, and,
 * when a plan is named, a plan of that application. What the catalog does not have is asked for as new software (case B), never listed.
 */
export function catalogRefusal(item: DepartmentSoftwareItem, facts: CatalogFacts): CatalogRefusal | null {
  const application = facts.applications.get(item.applicationId);
  if (!application || application.retired) return 'NOT_IN_CATALOG';
  if (item.planId === null) return null;

  return facts.plans.get(item.planId)?.applicationId === item.applicationId ? null : 'NOT_IN_CATALOG';
}

/**
 * Who reads the list of a department: the people placed in it, its head, every IT Admin (the technical work of all departments) and the
 * Super Admin. Anybody else is out of scope.
 */
export function mayReadList(who: { roles: readonly string[]; isMember: boolean; isHead: boolean }): boolean {
  return who.isMember || who.isHead || who.roles.includes('IT_ADMIN') || who.roles.includes('SUPER_ADMIN');
}

/**
 * Who changes the list and decides on proposals: only an IT Admin in charge of the department (`QĐ-110s`; the scope is the one of
 * `US-01-11`, so a department no IT Admin who can act is in charge of falls to every IT Admin). The Super Admin and the head read and
 * propose, they do not write the list (`QĐ-87`).
 */
export function mayChangeList(who: { roles: readonly string[]; inItAdminScope: boolean }): boolean {
  return who.roles.includes('IT_ADMIN') && who.inItAdminScope;
}

/** The department a proposal is made for: the one its author heads today (`QĐ-110t`, only the head proposes); null when they head none. */
export function proposerDepartment(proposer: { headedDepartmentId: string | null }): string | null {
  return proposer.headedDepartmentId;
}

export type DecisionRefusal = 'NOT_PENDING';

/** A proposal is decided once: accepted into the list or rejected with a reason. A decided one is not decided again. */
export function decisionRefusal(state: 'PENDING' | 'ACCEPTED' | 'REJECTED'): DecisionRefusal | null {
  return state === 'PENDING' ? null : 'NOT_PENDING';
}

/** The longest note a place of the list keeps (the CHECK of `department_software_entries`, and the schema of the routes). */
export const SOFTWARE_NOTE_MAX = 500;

export type NoteRefusal = 'TOO_LONG' | 'ILLEGAL_CHARACTER';

/**
 * A note as the table keeps it, judged before the insert: trimmed, no note when nothing is left, and refused when the database would refuse it
 * (over `SOFTWARE_NOTE_MAX` characters, or a NUL no text column keeps). A statement the CHECK or the column refuses aborts the whole transaction
 * of whoever called the facade, so the refusal is a business answer here, never a database error.
 */
export function normalizedNote(note: string | null | undefined): { note: string | null } | { refusal: NoteRefusal } {
  if (note === null || note === undefined) return { note: null };
  if (note.includes('\u0000')) return { refusal: 'ILLEGAL_CHARACTER' };
  const trimmed = note.trim();
  if (trimmed.length > SOFTWARE_NOTE_MAX) return { refusal: 'TOO_LONG' };

  return { note: trimmed === '' ? null : trimmed };
}
