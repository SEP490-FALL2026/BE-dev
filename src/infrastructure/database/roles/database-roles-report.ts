import { DatabaseRoleReport } from './database-role-provisioning';

/** The report of `ops:db-roles`: role and database names, counts and finding codes only; never a URL or a password. */
export function formatDatabaseRoles(report: DatabaseRoleReport): string {
  const created = (role: string): string => (report.createdRoles.includes(role) ? ' (created)' : '');
  const lines = [
    `ops:db-roles ${report.command}: ${report.outcome}`,
    `  database:             ${report.database}`,
    `  deploy role:          ${report.deployRole}${created(report.deployRole)}`,
    `  runtime role:         ${report.runtimeRole}${created(report.runtimeRole)}`,
  ];
  if (report.command === 'provision') {
    lines.push(
      `  database owner:       ${report.databaseOwnerChanged ? `changed to ${report.deployRole}` : 'unchanged'}`,
      `  objects transferred:  ${report.transferredObjects}`,
    );
  }
  if (report.findings.length === 0) {
    lines.push('  findings:             none');
  } else {
    lines.push(`  findings (${report.findings.length}):`);
    lines.push(
      ...report.findings.map((finding) => `    - ${finding.code}${finding.subject ? `: ${finding.subject}` : ''}`),
    );
    if (report.outcome !== 'DONE' && report.outcome !== 'CONSISTENT') lines.push('  nothing was written');
  }
  return `${lines.join('\n')}\n`;
}

export function databaseRolesJson(report: DatabaseRoleReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}
