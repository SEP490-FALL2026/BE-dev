import { InstallationInspection } from './inspection.types';

const counts = (values: Record<string, number>): string =>
  Object.entries(values)
    .map(([key, count]) => `${key} ${count}`)
    .join(', ');

/**
 * The human form of the report. Same status, problems and numbers as the JSON form, in a fixed order and without any
 * time, so two runs on an unchanged database print the same bytes.
 */
export function formatInspection(inspection: InstallationInspection): string {
  const { migrations } = inspection;
  const lines = [
    `Installation: ${inspection.status}`,
    `Problems: ${inspection.problems.length === 0 ? 'none' : inspection.problems.join(', ')}`,
    `Migrations: ${migrations.committed} committed, ${migrations.applied} applied, ${migrations.pending.length} pending, ` +
      `${migrations.failed.length} failed, ${migrations.unknown.length} unknown`,
    ...(migrations.pending.length > 0 ? [`  pending: ${migrations.pending.join(', ')}`] : []),
    ...(migrations.failed.length > 0 ? [`  failed: ${migrations.failed.join(', ')}`] : []),
    ...(migrations.unknown.length > 0 ? [`  unknown: ${migrations.unknown.join(', ')}`] : []),
  ];

  if (inspection.organization === null) {
    lines.push(
      'Organization: absent',
      migrations.applied < migrations.committed
        ? 'Next: apply the migrations (pnpm db:migrate:deploy), then see pnpm ops:bootstrap --help.'
        : 'Next: see pnpm ops:bootstrap --help.',
    );
    return `${lines.join('\n')}\n`;
  }

  const { organization, bootstrapRecords, superAdmin, accounts, directRoles, approvalRoles, departments } = inspection;
  lines.push(
    `Organization: present (${organization.timeZone}, ${organization.reportingCurrency})`,
    `Bootstrap records: ${bootstrapRecords?.complete ? 'complete' : `mismatched ${bootstrapRecords?.mismatched.join(', ')}`}`,
    `Super Admin: ${
      superAdmin === null
        ? 'none'
        : `${superAdmin.holders} holder, ${superAdmin.status}, ${superAdmin.activationState}, ${superAdmin.maskedEmail}`
    }`,
    `Accounts: ${accounts?.total} (${counts(accounts?.byState ?? {})})`,
    `Direct roles: ${counts(directRoles ?? {})}`,
    `Approval roles: ${counts(approvalRoles ?? {})}`,
    `Departments: ${departments?.active} active, ${departments?.withoutCurrentHead} without a current head, ` +
      `${departments?.withoutUsableItAdmin} without a usable IT Admin`,
  );

  return `${lines.join('\n')}\n`;
}

/** The machine form: the whole report as one JSON object, keys in a fixed order. */
export function inspectionJson(inspection: InstallationInspection): string {
  return `${JSON.stringify(inspection, null, 2)}\n`;
}
