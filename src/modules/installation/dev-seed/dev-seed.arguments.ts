import { parseArgs } from 'node:util';

export class DevSeedArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DevSeedArgumentError';
  }
}

export const DEV_SEED_USAGE = `Usage: pnpm dev:seed -- --confirm-local

Writes the local demo data (a demo department and job title, and three demo people with an activated account each:
IT_ADMIN, FINANCE, EMPLOYEE) through the same services and Audit Trail as the application. Local only: it runs when
NODE_ENV is development or test, the database host is localhost, 127.x.x.x or ::1, and --confirm-local is given.
It needs a completed installation (pnpm ops:bootstrap) and never touches the Super Admin.
A new account's password is generated and printed here once; it is not stored, logged or shown again.
A rerun creates nothing twice and resets no password; data that differs from the fixture is refused, not repaired.

Options
  --confirm-local   Required: confirms the target is this machine's database
  --help

Exit codes: 0 created · 2 everything already present (nothing written) · 3 refused (nothing written) · 1 error.`;

const OPTIONS = { 'confirm-local': { type: 'boolean' }, help: { type: 'boolean' } } as const;

export type ParsedDevSeedArguments = { help: true } | { help: false; confirmLocal: true };

/** `--confirm-local` is required; anything else is refused. A leading `--` (forwarded by pnpm) is ignored. */
export function parseDevSeedArguments(argv: readonly string[]): ParsedDevSeedArguments {
  const args = argv[0] === '--' ? argv.slice(1) : [...argv];
  let values: { 'confirm-local'?: boolean; help?: boolean };
  try {
    values = parseArgs({ args, options: OPTIONS, allowPositionals: false, strict: true }).values;
  } catch (error) {
    throw new DevSeedArgumentError(error instanceof Error ? error.message : String(error));
  }
  if (values.help) return { help: true };
  if (values['confirm-local'] !== true) {
    throw new DevSeedArgumentError('--confirm-local is required: it confirms the target is a local database.');
  }

  return { help: false, confirmLocal: true };
}
