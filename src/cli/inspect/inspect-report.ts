import { InstallationInspection, MigrationReport } from '../../modules/installation/public/inspection.types';

const counts = (values: Record<string, number>): string =>
  Object.entries(values)
    .map(([key, count]) => `${key} ${count}`)
    .join(', ');

/** The migration totals, then one line for each list that is not empty. */
function migrationLines(migrations: MigrationReport): string[] {
  return [
    `Migrations: ${migrations.committed} committed, ${migrations.applied} applied, ${migrations.pending.length} pending, ` +
      `${migrations.failed.length} failed, ${migrations.unknown.length} unknown`,
    ...(migrations.pending.length > 0 ? [`  pending: ${migrations.pending.join(', ')}`] : []),
    ...(migrations.failed.length > 0 ? [`  failed: ${migrations.failed.join(', ')}`] : []),
    ...(migrations.unknown.length > 0 ? [`  unknown: ${migrations.unknown.join(', ')}`] : []),
  ];
}

/** No organization yet: what to run next, the migrations first when some are not applied. */
function absentOrganizationLines(migrations: MigrationReport): string[] {
  return [
    'Organization: absent',
    migrations.applied < migrations.committed
      ? 'Next: apply the migrations (pnpm db:migrate:deploy), then see pnpm ops:bootstrap --help.'
      : 'Next: see pnpm ops:bootstrap --help.',
  ];
}

/** What the bootstrap wrote: its records, the change announcements and the Super Admin. */
function recordLines({ bootstrapRecords, changeAnnouncements, superAdmin }: InstallationInspection): string[] {
  return [
    `Bootstrap records: ${bootstrapRecords?.complete ? 'complete' : `mismatched ${bootstrapRecords?.mismatched.join(', ')}`}`,
    `Change announcements: ${changeAnnouncements?.complete ? 'complete' : `missing ${counts(changeAnnouncements?.missing ?? {})}`}`,
    `Super Admin: ${
      superAdmin === null
        ? 'none'
        : `${superAdmin.holders} holder, ${superAdmin.status}, ${superAdmin.activationState}, ${superAdmin.maskedEmail}`
    }`,
  ];
}

/** The counts: accounts by state, roles, and the departments without a head or a usable IT Admin. */
function countLines({ accounts, directRoles, departments }: InstallationInspection): string[] {
  return [
    `Accounts: ${accounts?.total} (${counts(accounts?.byState ?? {})})`,
    `Direct roles: ${counts(directRoles ?? {})}`,
    `Departments: ${departments?.active} active, ${departments?.withoutCurrentHead} without a current head, ` +
      `${departments?.withoutUsableItAdmin} without a usable IT Admin`,
  ];
}

/**
 * The human form of the report. Same status, problems and numbers as the JSON form, in a fixed order and without any
 * time, so two runs on an unchanged database print the same bytes.
 */
export function formatInspection(inspection: InstallationInspection): string {
  const { migrations, organization } = inspection;
  const lines = [
    `Installation: ${inspection.status}`,
    `Problems: ${inspection.problems.length === 0 ? 'none' : inspection.problems.join(', ')}`,
    ...migrationLines(migrations),
  ];

  if (organization === null) {
    lines.push(...absentOrganizationLines(migrations));
  } else {
    lines.push(
      `Organization: present (${organization.timeZone}, ${organization.reportingCurrency})`,
      ...recordLines(inspection),
      ...countLines(inspection),
    );
  }

  return `${lines.join('\n')}\n`;
}

/** The machine form: the whole report as one JSON object, keys in a fixed order. */
export function inspectionJson(inspection: InstallationInspection): string {
  return `${JSON.stringify(inspection, null, 2)}\n`;
}
