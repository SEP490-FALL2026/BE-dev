import type { ActivationState, AppUserStatus } from '../../identity-access/identity-access.types';
import { AppliedMigrationRow, InspectionProblem, MigrationReport } from './inspection.types';

/**
 * The audit actions a completed installation leaves, with how many of each (installation.service.ts, pinned by
 * installation-bootstrap-facts.integration-spec.ts). The trail is append-only, so these are the canonical record.
 */
export const BOOTSTRAP_ACTIONS: readonly { action: string; expected: number }[] = [
  { action: 'INSTALLATION.ORGANIZATION_CREATED', expected: 1 },
  { action: 'INSTALLATION.COST_CENTER_CREATED', expected: 1 },
  { action: 'INSTALLATION.DEPARTMENT_CREATED', expected: 1 },
  { action: 'INSTALLATION.JOB_TITLE_CREATED', expected: 1 },
  { action: 'INSTALLATION.EMPLOYEE_CREATED', expected: 2 },
  { action: 'INSTALLATION.SUPER_ADMIN_CREATED', expected: 1 },
];

/**
 * Committed folders against what `prisma migrate deploy` recorded. A migration is applied when one of its rows
 * finished and was not rolled back; failed when its only live row never finished; pending when neither.
 */
export function summarizeMigrations(committed: readonly string[], rows: AppliedMigrationRow[] | null): MigrationReport {
  const live = (rows ?? []).filter((row) => !row.rolledBack);
  const applied = new Set(live.filter((row) => row.finished).map((row) => row.name));
  const failed = new Set(live.filter((row) => !row.finished && !applied.has(row.name)).map((row) => row.name));
  const known = new Set(committed);

  return {
    committed: committed.length,
    applied: [...applied].filter((name) => known.has(name)).length,
    pending: committed.filter((name) => !applied.has(name) && !failed.has(name)),
    failed: [...failed].sort(),
    unknown: [...applied].filter((name) => !known.has(name)).sort(),
  };
}

/** The installation actions whose number of events is not the expected one, sorted. */
export function bootstrapMismatches(counts: ReadonlyMap<string, number>): string[] {
  return BOOTSTRAP_ACTIONS.filter(({ action, expected }) => (counts.get(action) ?? 0) !== expected)
    .map(({ action }) => action)
    .sort();
}

/**
 * The one identity `ops:inspect` prints: first character of the local part and of the domain, and the last domain
 * label, lowercased (`bao@acme.vn` → `b***@a***.vn`). Anything else becomes `***`.
 */
export function maskEmail(email: string): string {
  const match = /^([^\s@])[^\s@]*@([^\s@.])[^\s@]*\.([^\s@.]+)$/.exec(email.trim().toLowerCase());
  if (!match) return '***';
  const [, local, domain, label] = match;

  return `${local}***@${domain}***.${label}`;
}

/** What makes an installed organization incomplete, in a fixed order. */
export function problemsOf(facts: {
  migrations: MigrationReport;
  bootstrapMismatches: readonly string[];
  superAdmin: { holders: number; status: AppUserStatus; activationState: ActivationState } | null;
}): InspectionProblem[] {
  const problems: InspectionProblem[] = [];
  if (facts.migrations.pending.length > 0) problems.push('MIGRATIONS_PENDING');
  if (facts.migrations.failed.length > 0) problems.push('MIGRATIONS_FAILED');
  if (facts.migrations.unknown.length > 0) problems.push('MIGRATIONS_UNKNOWN');
  if (facts.bootstrapMismatches.length > 0) problems.push('BOOTSTRAP_RECORDS_INCOMPLETE');
  if (facts.superAdmin === null) problems.push('SUPER_ADMIN_MISSING');
  else if (facts.superAdmin.status !== 'ACTIVE' || facts.superAdmin.activationState !== 'ACTIVATED')
    problems.push('SUPER_ADMIN_NOT_USABLE');

  return problems;
}
