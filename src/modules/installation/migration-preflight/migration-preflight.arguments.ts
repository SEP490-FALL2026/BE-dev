import { parseArgs } from 'node:util';

export class PreflightArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PreflightArgumentError';
  }
}

export const PREFLIGHT_USAGE = `Usage: pnpm ops:preflight [--json]

Judges, before \`prisma migrate deploy\`, whether the migration history can carry this database to Cost Centers that are
Units only (migration 20261022120000_cost_centers_unit_only, kept as merged, and the forward migration
20261023100000_service_account_owner_on_recorded_day). Changes nothing: every database session is read-only.
Reads the database settings only (NODE_ENV, DATABASE_URL, DB_*).

Options
  --json    One JSON object instead of the text report (same status and rows)
  --help

Exit codes: 0 ready, deploy may run · 2 blocked, do not deploy (every blocked row is named) · 1 error.`;

const OPTIONS = { json: { type: 'boolean' }, help: { type: 'boolean' } } as const;

export type ParsedPreflightArguments = { help: true } | { help: false; json: boolean };

/** `--json`, `--help`; anything else is refused. A leading `--` (forwarded by pnpm) is ignored. */
export function parsePreflightArguments(argv: readonly string[]): ParsedPreflightArguments {
  const args = argv[0] === '--' ? argv.slice(1) : [...argv];
  let values: { json?: boolean; help?: boolean };
  try {
    values = parseArgs({ args, options: OPTIONS, allowPositionals: false, strict: true }).values;
  } catch (error) {
    throw new PreflightArgumentError(error instanceof Error ? error.message : String(error));
  }

  return values.help ? { help: true } : { help: false, json: values.json === true };
}
