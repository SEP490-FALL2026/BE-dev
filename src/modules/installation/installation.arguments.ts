import { parseArgs } from 'node:util';

export class InstallationArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InstallationArgumentError';
  }
}

export const INSTALLATION_USAGE = `Usage: pnpm ops:bootstrap [options]

Creates the first organization, its first department and the Super Admin account. Run once, by the person who will
hold the Super Admin role: the password is typed at a hidden prompt, never passed as an option. The first department
has no Cost Center, head or IT Admin in charge; nothing else is created (no Cost Center, no job title, no IT employee).

Required
  --timezone <iana>            Organization time zone, e.g. Asia/Ho_Chi_Minh. Cannot be changed later.
  --organization-name <name>
  --department-code <code>     --department-name <name>      The first department
  --admin-code <code>          --admin-name <name>           --admin-email <email>   Super Admin's employee record
  --admin-hire-date <date>     YYYY-MM-DD, not in the future
  --operator-reference <ref>   Ticket or approval reference, recorded in the audit trail
  --environment <env>          LOCAL_TEST or SHARED

Optional
  --currency <iso4217>         Reporting currency (default VND)
  --login-email <email>        Sign-in email (default: the Super Admin's work email)
  --admin-type <type>          STAFF (default), CONTRACTOR, FREELANCER, INTERN
  --help

Exit codes: 0 installed · 2 already installed (nothing changed) · 130 cancelled · 1 error.
Exit 1 does not prove nothing was written: if the failure happened while the database was answering COMMIT,
check the installation state before running again (a rerun that exits 2 means the first run did install).
Values must be real: placeholders such as "N/A" or "Chưa phân loại" are rejected.`;

const OPTIONS = {
  timezone: { type: 'string' },
  currency: { type: 'string' },
  'organization-name': { type: 'string' },
  'department-code': { type: 'string' },
  'department-name': { type: 'string' },
  'admin-code': { type: 'string' },
  'admin-name': { type: 'string' },
  'admin-email': { type: 'string' },
  'admin-type': { type: 'string' },
  'admin-hire-date': { type: 'string' },
  'login-email': { type: 'string' },
  'operator-reference': { type: 'string' },
  environment: { type: 'string' },
  help: { type: 'boolean' },
} as const;

export type ParsedInstallationArguments = { help: true } | { help: false; input: Record<string, unknown> };

/**
 * Turns argv into the object the input schema validates. A password option is refused by name so
 * a secret cannot slip into shell history or the process list by accident. An option of the earlier command (a Cost Center,
 * a job title, an IT employee) is not known any more and is refused like any other unknown option.
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

  return {
    help: false,
    input: {
      timeZone: text('timezone'),
      reportingCurrency: text('currency') ?? 'VND',
      organizationName: text('organization-name'),
      departmentCode: text('department-code'),
      departmentName: text('department-name'),
      superAdmin: {
        employeeCode: text('admin-code'),
        fullName: text('admin-name'),
        workEmail: text('admin-email'),
        employmentType: text('admin-type') ?? 'STAFF',
        hireDate: text('admin-hire-date'),
      },
      ...(text('login-email') === undefined ? {} : { loginEmail: text('login-email') }),
      operatorReference: text('operator-reference'),
      environment: text('environment'),
    },
  };
}
