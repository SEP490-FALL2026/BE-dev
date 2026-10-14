import { parseArgs } from 'node:util';

export class InstallationArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InstallationArgumentError';
  }
}

export const INSTALLATION_USAGE = `Usage: pnpm ops:bootstrap [options]

Creates the first organization and the Super Admin account. Run once, by the person who will
hold the Super Admin role: the password is typed at a hidden prompt, never passed as an option.

Required
  --timezone <iana>            Organization time zone, e.g. Asia/Ho_Chi_Minh. Cannot be changed later.
  --organization-name <name>
  --cost-center-code <code>    --cost-center-name <name>     The first (UNIT) cost center
  --department-code <code>     --department-name <name>      The first department
  --job-title <name>           Job title for the two people below
  --admin-code <code>          --admin-name <name>           --admin-email <email>   Super Admin's employee record
  --it-code <code>             --it-name <name>              --it-email <email>      An IT employee (no account yet)
  --admin-hire-date <date>     --it-hire-date <date>         YYYY-MM-DD, not in the future
  --operator-reference <ref>   Ticket or approval reference, recorded in the audit trail
  --environment <env>          LOCAL_TEST or SHARED

Optional
  --currency <iso4217>         Reporting currency (default VND)
  --login-email <email>        Sign-in email (default: the Super Admin's work email)
  --admin-type <type>          --it-type <type>     STAFF (default), CONTRACTOR, FREELANCER, INTERN
  --help

Exit codes: 0 installed · 2 already installed (nothing changed) · 130 cancelled · 1 error.
Exit 1 does not prove nothing was written: if the failure happened while the database was answering COMMIT,
check the installation state before running again (a rerun that exits 2 means the first run did install).
Values must be real: placeholders such as "N/A" or "Chưa phân loại" are rejected.`;

const OPTIONS = {
  timezone: { type: 'string' },
  currency: { type: 'string' },
  'organization-name': { type: 'string' },
  'cost-center-code': { type: 'string' },
  'cost-center-name': { type: 'string' },
  'department-code': { type: 'string' },
  'department-name': { type: 'string' },
  'job-title': { type: 'string' },
  'admin-code': { type: 'string' },
  'admin-name': { type: 'string' },
  'admin-email': { type: 'string' },
  'admin-type': { type: 'string' },
  'admin-hire-date': { type: 'string' },
  'login-email': { type: 'string' },
  'it-code': { type: 'string' },
  'it-name': { type: 'string' },
  'it-email': { type: 'string' },
  'it-type': { type: 'string' },
  'it-hire-date': { type: 'string' },
  'operator-reference': { type: 'string' },
  environment: { type: 'string' },
  help: { type: 'boolean' },
} as const;

export type ParsedInstallationArguments = { help: true } | { help: false; input: Record<string, unknown> };

/**
 * Turns argv into the object the input schema validates. A password option is refused by name so
 * a secret cannot slip into shell history or the process list by accident.
 */
export function parseInstallationArguments(argv: readonly string[]): ParsedInstallationArguments {
  const forbidden = argv.find((arg) => /^--?(password|pass|pwd|secret)(=|$)/i.test(arg));
  if (forbidden) {
    throw new InstallationArgumentError('The password is never accepted as an option. It is typed at a hidden prompt.');
  }

  let values: Record<string, string | boolean | undefined>;
  try {
    values = parseArgs({ args: [...argv], options: OPTIONS, allowPositionals: false, strict: true }).values;
  } catch (error) {
    throw new InstallationArgumentError(error instanceof Error ? error.message : String(error));
  }
  if (values.help) return { help: true };

  const text = (key: string): string | undefined => values[key] as string | undefined;
  const person = (prefix: 'admin' | 'it') => ({
    employeeCode: text(`${prefix}-code`),
    fullName: text(`${prefix}-name`),
    workEmail: text(`${prefix}-email`),
    employmentType: text(`${prefix}-type`) ?? 'STAFF',
    hireDate: text(`${prefix}-hire-date`),
  });

  return {
    help: false,
    input: {
      timeZone: text('timezone'),
      reportingCurrency: text('currency') ?? 'VND',
      organizationName: text('organization-name'),
      costCenterCode: text('cost-center-code'),
      costCenterName: text('cost-center-name'),
      departmentCode: text('department-code'),
      departmentName: text('department-name'),
      jobTitleName: text('job-title'),
      superAdmin: person('admin'),
      ...(text('login-email') === undefined ? {} : { loginEmail: text('login-email') }),
      itAdmin: person('it'),
      operatorReference: text('operator-reference'),
      environment: text('environment'),
    },
  };
}
