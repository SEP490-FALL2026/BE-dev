import { RecoveryTargetLabelsError } from './installation.errors';

/**
 * Which runtime image may serve this database again — the
 * way back of a deployment (the automatic recovery of scripts/ops/deploy-release.sh) or of a rollback by hand. A green readiness
 * probe does not say it: readiness pings the database, it reads no business row.
 *
 * A data representation is a shape of stored rows that this source writes and a runtime before it cannot read. Each release
 * declares in the label {@link DATA_READS_LABEL} of its image (Dockerfile, stage `runtime`) the representations its runtime
 * reads; an image built before the label declares none. `pnpm ops:preflight --recovery-target <labels>` counts the rows of
 * each representation this database holds: the image is a way back only when it declares every one that has rows, and only
 * to a database some release migrated (a database with no migration history ran no release, so no image is its way back).
 * A row written after the judgement is not covered: the deploy script stops the failed release before it judges.
 */

/**
 * The image label (Docker label naming: lower-case alphanumerics, `.` and `-`, reverse-DNS prefix) whose value lists,
 * space-separated, the representations the runtime of the image reads.
 */
export const DATA_READS_LABEL = 'io.github.baophipham.slm.data-reads';

/**
 * Every representation this source writes that a runtime before it cannot read, with what it is. The Dockerfile label of
 * this source lists exactly these (recovery-target.policy.spec.ts).
 */
export const DATA_REPRESENTATIONS = {
  // `QĐ-87g(2)`: a sent internal free request of a department that has no Cost Center keeps no Cost Center. The
  // compatibility image `fba4dfe` types the column as required, so it fails on the row (impact matrix 3.11).
  'access-request-null-cost-center': 'a sent request that has no Cost Center (internal free software, F91)',
  // `QĐ-93k(1)`: the conversion command closes a request, or a line, of the spending approver with the cause
  // `SPENDING_APPROVER_PARTY` and nobody who closed it (OD-6). A Prisma client of a release before it does not know the enum value.
  'access-request-cancel-spending-approver-party':
    'a request or a line closed because the spending approver is one of its parties (no employee closed it)',
  // `QĐ-93d(1)`: a need step of a department with no head waits as `NO_DEPARTMENT_HEAD`, and a step of the earlier rule can wait
  // as `SPENDING_APPROVER_IS_PARTY`; the response schema of a release before it lists neither, so a read of the step fails (500).
  'access-request-step-qd93-waiting-reason':
    'a step, or an alert of a wait, that waits as NO_DEPARTMENT_HEAD or SPENDING_APPROVER_IS_PARTY',
} as const;

export type DataRepresentation = keyof typeof DATA_REPRESENTATIONS;

const REPRESENTATIONS = Object.keys(DATA_REPRESENTATIONS) as DataRepresentation[];

/** What the judgement reads from the database, in the schema it has now. */
export interface RecoveryTargetFacts {
  /** A migration finished (and was not rolled back) on this database: some release ran on it. */
  migrated: boolean;
  /** The rows of each representation this database holds. */
  rows: Record<DataRepresentation, number>;
}

/**
 * COMPATIBLE: the image reads every row this database holds — it may serve it. INCOMPATIBLE: it cannot read rows this
 * database holds — never bring it back. NO_HISTORY: no migration was ever applied, so no release ran here and no image is
 * the way back of this database.
 */
export type RecoveryTargetStatus = 'COMPATIBLE' | 'INCOMPATIBLE' | 'NO_HISTORY';

export interface RecoveryTargetReport {
  status: RecoveryTargetStatus;
  /** What the image declares in its label, in order, duplicates removed. */
  reads: string[];
  /** Each representation this database holds rows of, with the count and whether the image declares it. */
  held: Array<{ representation: DataRepresentation; rows: number; readable: boolean }>;
}

/** The exit code of each status (`ops:preflight --recovery-target`); 1 stays the code of an error. */
export const RECOVERY_TARGET_EXIT: Record<RecoveryTargetStatus, number> = {
  COMPATIBLE: 0,
  INCOMPATIBLE: 2,
  NO_HISTORY: 3,
};

const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LABELS_EXPECTED =
  "--recovery-target takes the labels of the image, as `docker image inspect --format '{{json .Config.Labels}}' <image>` prints them";

/**
 * The representations an image declares, from `docker image inspect --format '{{json .Config.Labels}}'`: `null` when the
 * image has no label, otherwise an object of strings. Anything else is refused (the way back is then unknown, never assumed).
 */
export function readsOfLabels(json: string): string[] {
  let labels: unknown;
  try {
    labels = JSON.parse(json);
  } catch {
    throw new RecoveryTargetLabelsError(LABELS_EXPECTED);
  }
  if (labels === null) return [];
  if (typeof labels !== 'object' || Array.isArray(labels)) throw new RecoveryTargetLabelsError(LABELS_EXPECTED);
  const values = labels as Record<string, unknown>;
  if (Object.values(values).some((value) => typeof value !== 'string'))
    throw new RecoveryTargetLabelsError(LABELS_EXPECTED);
  if (!Object.prototype.hasOwnProperty.call(values, DATA_READS_LABEL)) return [];

  const reads = (values[DATA_READS_LABEL] as string).split(/\s+/).filter((name) => name !== '');
  if (reads.some((name) => name.length > 64 || !NAME.test(name))) {
    throw new RecoveryTargetLabelsError(
      `the label ${DATA_READS_LABEL} of the image holds a name that is not a representation`,
    );
  }

  return [...new Set(reads)];
}

/** Whether an image that declares `reads` can serve a database with these facts. */
export function judgeRecoveryTarget(facts: RecoveryTargetFacts, reads: readonly string[]): RecoveryTargetReport {
  const held = REPRESENTATIONS.filter((representation) => facts.rows[representation] > 0).map((representation) => ({
    representation,
    rows: facts.rows[representation],
    readable: reads.includes(representation),
  }));
  let status: RecoveryTargetStatus = 'COMPATIBLE';
  if (!facts.migrated) status = 'NO_HISTORY';
  else if (held.some((entry) => !entry.readable)) status = 'INCOMPATIBLE';

  return { status, reads: [...reads], held };
}

/** The report as one JSON object, newline-terminated. */
export function recoveryTargetJson(report: RecoveryTargetReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

/** The report as text: names and counts only, never a row id or a value. */
export function formatRecoveryTarget(report: RecoveryTargetReport): string {
  const lines: string[] = [];
  switch (report.status) {
    case 'COMPATIBLE':
      lines.push('Recovery target: COMPATIBLE — the image reads every row this database holds; it may serve it again.');
      break;
    case 'INCOMPATIBLE':
      lines.push(
        'Recovery target: INCOMPATIBLE — the image cannot read rows this database holds. Do not bring it back: fix forward ' +
          'with a release that reads them (restoring the pre-migrate dump into a new database is an operator decision that ' +
          'loses every write since).',
      );
      break;
    case 'NO_HISTORY':
      lines.push(
        'Recovery target: NO_HISTORY — no migration was ever applied to this database: no release ran on it, so no image ' +
          'is its way back.',
      );
      break;
  }
  lines.push(`The image declares: ${report.reads.length > 0 ? report.reads.join(' ') : 'none'}.`);
  for (const entry of report.held) {
    lines.push(
      `  - ${entry.representation}: ${entry.rows} row(s), ${entry.readable ? 'read by the image' : 'NOT read by the image'} ` +
        `(${DATA_REPRESENTATIONS[entry.representation]})`,
    );
  }

  return `${lines.join('\n')}\n`;
}
