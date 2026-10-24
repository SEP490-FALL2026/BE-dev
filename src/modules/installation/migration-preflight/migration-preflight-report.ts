import { PreflightBlocker, PreflightReport } from './migration-preflight.types';

/** The report as one JSON object, newline-terminated. */
export function preflightJson(report: PreflightReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

/**
 * What each blocker means and the decision it needs. No command here repairs data: the merged migration cannot be
 * changed (`P29-MIGRATION=B-FORWARD`), and the application has no operation that writes a department for a day the
 * records do not cover or moves recorded cost-allocation history; inventing one would invent HR or finance history.
 */
const DECISION: Record<PreflightBlocker['code'], string> = {
  MIGRATION_FAILED:
    'Prisma recorded a failed attempt and refuses every later deploy. The attempt rolled back (no data changed); the ' +
    'Owner decides how this database continues (restore the pre-deploy backup, or recreate it).',
  COST_ALLOCATION_NAMES_COMPANY:
    'A recorded cost allocation (history that never changes) gives a share to a COMPANY Cost Center. The merged ' +
    'migration cannot delete that Cost Center while it is named, and QĐ-86 gives the share no deterministic Unit: ' +
    'Owner/data decision (recreate this database, or keep it on the code before the unit-only migration).',
  DEPARTMENT_CHARGED_TO_COMPANY:
    'A department is charged to a COMPANY Cost Center, which the application never allowed: Owner/data decision on ' +
    "the department's Unit before deploying.",
  SERVICE_ACCOUNT_WITHOUT_DEPARTMENT_ON_START:
    'The merged migration owns a service account by the department of its responsible person on the day the seat ' +
    'started, and the records place the person in no department that day (an employee import places people from the ' +
    'day of the import). Owner/data decision: recreate this database, or record the department of that day on an ' +
    'authoritative HR basis outside this command.',
  SERVICE_ACCOUNT_WITHOUT_DEPARTMENT_ON_RECORDED_DAY:
    'The responsible person is in no department on the day the service account was recorded, so QĐ-86c gives it no ' +
    'owning department: Owner/data decision.',
};

/** The text report: the verdict, what a deploy would change, and each blocked row with the decision it needs. */
export function formatPreflight(report: PreflightReport): string {
  const lines = [`Preflight: ${report.status} (${report.history})`];
  if (report.status === 'BLOCKED') {
    lines.push('Do not run `prisma migrate deploy` on this database. Blocked rows:');
    for (const code of [...new Set(report.blockers.map((blocker) => blocker.code))]) {
      lines.push(`  ${code}`, `    ${DECISION[code]}`);
      for (const blocker of report.blockers.filter((item) => item.code === code))
        lines.push(`    - ${rowText(blocker)}`);
    }
  } else {
    lines.push('`prisma migrate deploy` may run. Back up the database first (the deploy workflow does).');
  }
  if (report.corrections.length > 0) {
    lines.push('The forward migration moves these service accounts to their recorded-day department (audited):');
    for (const item of report.corrections) {
      lines.push(
        `  - ${item.assignmentId}: ${item.fromDepartment} -> ${item.toDepartment} (recorded ${item.recordedOn})`,
      );
    }
  }
  if (report.companyCostCentersRemoved.length > 0) {
    lines.push(
      'The merged migration deletes these COMPANY Cost Centers and the COMPANY kind; only the backup keeps them:',
      ...report.companyCostCentersRemoved.map((center) => `  - ${center.code} (${center.status})`),
    );
  }

  return `${lines.join('\n')}\n`;
}

function rowText(blocker: PreflightBlocker): string {
  switch (blocker.code) {
    case 'MIGRATION_FAILED':
      return `migration ${blocker.migration}`;
    case 'COST_ALLOCATION_NAMES_COMPANY':
      return `allocation version ${blocker.versionId} (version ${blocker.version}) names ${blocker.costCenter}`;
    case 'DEPARTMENT_CHARGED_TO_COMPANY':
      return `department ${blocker.department} charged to ${blocker.costCenter}`;
    case 'SERVICE_ACCOUNT_WITHOUT_DEPARTMENT_ON_START':
      return `assignment ${blocker.assignmentId} of ${blocker.employeeCode}, started ${blocker.validFrom}`;
    case 'SERVICE_ACCOUNT_WITHOUT_DEPARTMENT_ON_RECORDED_DAY':
      return `assignment ${blocker.assignmentId} of ${blocker.employeeCode}, recorded ${blocker.recordedOn}`;
  }
}
