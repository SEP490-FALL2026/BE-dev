import { parseArgs } from 'node:util';

export class InspectionArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InspectionArgumentError';
  }
}

export const INSPECTION_USAGE = `Usage: pnpm ops:inspect [--json]

Reports the installation state without changing anything: migrations, organization, the installation records,
the Super Admin account (email masked), account and role counts, approval roles and department gaps.
Reads the database settings only (NODE_ENV, DATABASE_URL, DB_*); every database session is read-only.

Options
  --json    One JSON object instead of the text report (same status and numbers)
  --help

Exit codes: 0 installed and consistent · 2 not installed or incomplete (see "Installation:" / "status") · 1 error.`;

const OPTIONS = { json: { type: 'boolean' }, help: { type: 'boolean' } } as const;

export type ParsedInspectionArguments = { help: true } | { help: false; json: boolean };

/** `--json`, `--help`; anything else is refused. A leading `--` (forwarded by pnpm) is ignored. */
export function parseInspectionArguments(argv: readonly string[]): ParsedInspectionArguments {
  const args = argv[0] === '--' ? argv.slice(1) : [...argv];
  let values: { json?: boolean; help?: boolean };
  try {
    values = parseArgs({ args, options: OPTIONS, allowPositionals: false, strict: true }).values;
  } catch (error) {
    throw new InspectionArgumentError(error instanceof Error ? error.message : String(error));
  }

  return values.help ? { help: true } : { help: false, json: values.json === true };
}
