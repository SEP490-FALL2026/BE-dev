import { parseArgs } from 'node:util';
import type { DirectionEnvironment, ParsedDirectionArguments } from './cost-center-direction.types';

export class DirectionArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DirectionArgumentError';
  }
}

export const DIRECTION_USAGE = `Usage:
  pnpm ops:cost-center-direction activate --release-evidence <reference> --approved-by <reference> --operator <reference> --environment LOCAL_TEST|SHARED
  pnpm ops:cost-center-direction link --cost-center <id> --department <code> --basis <reference> --approved-by <reference> --operator <reference> --environment LOCAL_TEST|SHARED

Every Cost Center belongs to exactly one department (QĐ-87d(1)). Two procedures serve the move from the previous release:

  activate  Records, once, that this installation runs the compatibility release (the previous release can no longer be the one that
            runs). Run it ONLY after the deployment host reports the compatibility release ready (releases/current-image names its
            image) and the release record carries that image. From then on a department can be created without a Cost Center.
            --release-evidence  The deployment attempt and image of the compatibility release (2 to 200 characters).
  link      Gives ONE Cost Center that has no department its department, on the basis Finance approved. Nothing is inferred from a
            name or a code and there is no bulk form; a department that does not exist is created first by the Super Admin
            (departmentCreate). Nothing is retired or deleted.
            --cost-center       The Cost Center (UUID), as \`pnpm ops:preflight\` lists it.
            --department        The code of the department that owns it.
            --basis             The authoritative reference Finance approved (2 to 200 characters).

Common options (all required)
  --approved-by <reference>  Who approved it, in writing: the release owner for activate, Finance for link (a reference, never a secret).
  --operator <reference>     Who runs the command (a reference, never a password or a token). In SHARED it differs from --approved-by.
  --environment <name>       LOCAL_TEST or SHARED.
  --help

Prints only the ids and the outcome. Changes one record in one transaction, with an Audit Trail event; reads the database settings
only (NODE_ENV, DATABASE_URL, DB_*).

Exit codes: 0 done · 2 nothing to do (already activated, or already linked to that department) · 1 refused or failed (nothing was changed).`;

const COMMON = {
  'approved-by': { type: 'string' },
  operator: { type: 'string' },
  environment: { type: 'string' },
  help: { type: 'boolean' },
} as const;
const ACTIVATE_OPTIONS = { ...COMMON, 'release-evidence': { type: 'string' } } as const;
const LINK_OPTIONS = {
  ...COMMON,
  'cost-center': { type: 'string' },
  department: { type: 'string' },
  basis: { type: 'string' },
} as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ENVIRONMENTS = ['LOCAL_TEST', 'SHARED'] as const;

type Values = Record<string, string | boolean | undefined>;

const parseValues = (args: string[], options: typeof ACTIVATE_OPTIONS | typeof LINK_OPTIONS): Values => {
  try {
    return parseArgs({ args, options, allowPositionals: false, strict: true }).values as Values;
  } catch (error) {
    throw new DirectionArgumentError(error instanceof Error ? error.message : String(error));
  }
};

const text = (values: Values, name: string): string => {
  const value = values[name];
  if (typeof value !== 'string' || value.trim() === '') throw new DirectionArgumentError(`--${name} is required.`);

  return value.trim();
};

const environmentOf = (values: Values): DirectionEnvironment => {
  const environment = text(values, 'environment');
  if (!(ENVIRONMENTS as readonly string[]).includes(environment)) {
    throw new DirectionArgumentError('--environment must be LOCAL_TEST or SHARED.');
  }

  return environment as DirectionEnvironment;
};

/**
 * One mode and its options, all required, nothing else; a leading `--` (forwarded by pnpm) is ignored. A secret in an option
 * is refused by name before anything is loaded: the command takes no password, token or code as an option.
 */
export function parseDirectionArguments(argv: readonly string[]): ParsedDirectionArguments {
  const args = argv[0] === '--' ? argv.slice(1) : [...argv];
  const secret = args.find((arg) => /^--?(password|pass|pwd|secret|token|code)(=|$)/i.test(arg));
  if (secret) throw new DirectionArgumentError('The command takes no password, token or code as an option.');

  if (args.length === 0) throw new DirectionArgumentError('A mode is required: activate or link.');
  if (args[0] === '--help' || args[0] === '-h') return { help: true };
  const [mode, ...rest] = args;
  if (mode !== 'activate' && mode !== 'link') {
    throw new DirectionArgumentError(`Unknown mode ${mode}: use activate or link.`);
  }

  const values = parseValues(rest, mode === 'activate' ? ACTIVATE_OPTIONS : LINK_OPTIONS);
  if (values.help) return { help: true };
  const common = {
    approvedBy: text(values, 'approved-by'),
    operator: text(values, 'operator'),
    environment: environmentOf(values),
  };

  if (mode === 'activate') {
    return { help: false, mode, command: { releaseEvidence: text(values, 'release-evidence'), ...common } };
  }
  const costCenterId = text(values, 'cost-center');
  if (!UUID.test(costCenterId)) throw new DirectionArgumentError('--cost-center must be a UUID.');

  return {
    help: false,
    mode,
    command: {
      costCenterId,
      departmentCode: text(values, 'department'),
      basis: text(values, 'basis'),
      ...common,
    },
  };
}
