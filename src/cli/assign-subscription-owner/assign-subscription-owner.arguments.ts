import { parseArgs } from 'node:util';
import type { AssignmentCommand } from '../../modules/catalog/public/subscription-owner-assignment.types';

export class AssignmentArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssignmentArgumentError';
  }
}

export const ASSIGNMENT_USAGE = `Usage: pnpm ops:assign-subscription-owner --subscription <id> --department <code> --basis <reference> --operator <reference> --environment LOCAL_TEST|SHARED

Records the owner department of ONE existing subscription on a stated basis (the purchase order or contract that places the
purchase in that department). The release after this one requires every subscription to have an owner department; nothing is
inferred from a plan, a seat or a price, and there is no way to assign in bulk or by rule. The record is kept as the evidence.

Options (all required)
  --subscription <id>      The subscription (UUID), as \`pnpm ops:preflight\` lists it.
  --department <code>      The code of an ACTIVE department that owns the purchase.
  --basis <reference>      The purchase or contract reference that is the basis (2 to 200 characters).
  --operator <reference>   Who runs the command (a reference, never a password or a token).
  --environment <name>     LOCAL_TEST or SHARED.
  --help

Prints only the subscription and department ids and the outcome. Changes one subscription's record in one transaction, with an
Audit Trail event; reads the database settings only (NODE_ENV, DATABASE_URL, DB_*).

Exit codes: 0 assigned · 2 nothing to do (this subscription is already assigned to that department) · 1 refused or failed (nothing was changed).`;

const OPTIONS = {
  subscription: { type: 'string' },
  department: { type: 'string' },
  basis: { type: 'string' },
  operator: { type: 'string' },
  environment: { type: 'string' },
  help: { type: 'boolean' },
} as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ENVIRONMENTS = ['LOCAL_TEST', 'SHARED'] as const;

export type ParsedAssignmentArguments = { help: true } | { help: false; command: AssignmentCommand };

/** The five options, all required, nothing else; a leading `--` (forwarded by pnpm) is ignored. */
export function parseAssignmentArguments(argv: readonly string[]): ParsedAssignmentArguments {
  const args = argv[0] === '--' ? argv.slice(1) : [...argv];
  let values: Partial<Record<keyof typeof OPTIONS, string | boolean>>;
  try {
    values = parseArgs({ args, options: OPTIONS, allowPositionals: false, strict: true }).values;
  } catch (error) {
    throw new AssignmentArgumentError(error instanceof Error ? error.message : String(error));
  }
  if (values.help) return { help: true };

  const text = (name: Exclude<keyof typeof OPTIONS, 'help'>): string => {
    const value = values[name];
    if (typeof value !== 'string' || value.trim() === '') throw new AssignmentArgumentError(`--${name} is required.`);

    return value.trim();
  };
  const subscriptionId = text('subscription');
  if (!UUID.test(subscriptionId)) throw new AssignmentArgumentError('--subscription must be a UUID.');
  const basis = text('basis');
  if (basis.length < 2 || basis.length > 200) {
    throw new AssignmentArgumentError('--basis must be 2 to 200 characters.');
  }
  const environment = text('environment');
  if (!(ENVIRONMENTS as readonly string[]).includes(environment)) {
    throw new AssignmentArgumentError('--environment must be LOCAL_TEST or SHARED.');
  }

  return {
    help: false,
    command: {
      subscriptionId,
      departmentCode: text('department').toUpperCase(),
      basis,
      operator: text('operator'),
      environment: environment as AssignmentCommand['environment'],
    },
  };
}
