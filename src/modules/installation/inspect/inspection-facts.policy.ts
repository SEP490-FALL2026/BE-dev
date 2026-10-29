import type { ActivationState, AppUserStatus } from '../../identity-access/public/identity-access.types';
import {
  AppliedMigrationRow,
  ChangeAnnouncementGaps,
  InspectionProblem,
  MigrationReport,
} from '../public/inspection.types';

/**
 * The audit actions a completed installation leaves, with how many of each (installation.service.ts, pinned by
 * installation-bootstrap-facts.integration-spec.ts). The trail is append-only, so these are the canonical record. Since
 * `QĐ-87f` the command creates the organization, one department, the Super Admin's employee and the account: no Cost Center
 * and one employee. An installation made before it (an earlier installation: a Cost Center, an IT employee) keeps the events
 * it wrote and is accepted as the other set; an installation older still also has an `INSTALLATION.JOB_TITLE_CREATED`, which is
 * history and never counted.
 */
export const CURRENT_INSTALLATION_RECORDS: Readonly<Record<string, number>> = {
  'INSTALLATION.ORGANIZATION_CREATED': 1,
  'INSTALLATION.COST_CENTER_CREATED': 0,
  'INSTALLATION.DEPARTMENT_CREATED': 1,
  'INSTALLATION.EMPLOYEE_CREATED': 1,
  'INSTALLATION.SUPER_ADMIN_CREATED': 1,
};

/** What the command left before `QĐ-87f`: one Cost Center, and the IT employee beside the Super Admin's. */
export const EARLIER_INSTALLATION_RECORDS: Readonly<Record<string, number>> = {
  ...CURRENT_INSTALLATION_RECORDS,
  'INSTALLATION.COST_CENTER_CREATED': 1,
  'INSTALLATION.EMPLOYEE_CREATED': 2,
};

/** The installation actions `ops:inspect` counts. */
export const BOOTSTRAP_ACTIONS: readonly string[] = Object.keys(CURRENT_INSTALLATION_RECORDS);

/** The Cost Center event tells which set an installation is: it exists in the earlier one only. */
const COST_CENTER_ACTION = 'INSTALLATION.COST_CENTER_CREATED';

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

/**
 * The installation actions whose number of events is not the expected one, sorted. Both sets are accepted: one Cost Center
 * event means an earlier installation (expected against {@link EARLIER_INSTALLATION_RECORDS}), anything else the current one.
 */
export function bootstrapMismatches(counts: ReadonlyMap<string, number>): string[] {
  const expected = counts.get(COST_CENTER_ACTION) === 1 ? EARLIER_INSTALLATION_RECORDS : CURRENT_INSTALLATION_RECORDS;

  return BOOTSTRAP_ACTIONS.filter((action) => (counts.get(action) ?? 0) !== expected[action]).sort();
}

/** No change is left unmarked: what a database that never recorded the seeding migration reports (nothing is guessed). */
export const NO_ANNOUNCEMENT_GAPS: ChangeAnnouncementGaps = {
  PLACEMENT_START: 0,
  HEAD_PERIOD_START: 0,
  HEAD_PERIOD_END: 0,
};

/** The changes that took effect and are marked by no announcement, all kinds together (F47). */
export function announcementGapTotal(gaps: ChangeAnnouncementGaps): number {
  return gaps.PLACEMENT_START + gaps.HEAD_PERIOD_START + gaps.HEAD_PERIOD_END;
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
  changeAnnouncements: ChangeAnnouncementGaps;
  superAdmin: { holders: number; status: AppUserStatus; activationState: ActivationState } | null;
}): InspectionProblem[] {
  const problems: InspectionProblem[] = [];
  if (facts.migrations.pending.length > 0) problems.push('MIGRATIONS_PENDING');
  if (facts.migrations.failed.length > 0) problems.push('MIGRATIONS_FAILED');
  if (facts.migrations.unknown.length > 0) problems.push('MIGRATIONS_UNKNOWN');
  if (facts.bootstrapMismatches.length > 0) problems.push('BOOTSTRAP_RECORDS_INCOMPLETE');
  if (announcementGapTotal(facts.changeAnnouncements) > 0) problems.push('CHANGE_ANNOUNCEMENTS_MISSING');
  if (facts.superAdmin === null) problems.push('SUPER_ADMIN_MISSING');
  else if (facts.superAdmin.status !== 'ACTIVE' || facts.superAdmin.activationState !== 'ACTIVATED')
    problems.push('SUPER_ADMIN_NOT_USABLE');

  return problems;
}
