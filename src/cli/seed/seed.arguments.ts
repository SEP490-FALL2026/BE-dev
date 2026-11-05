import { parseArgs } from 'node:util';
import { InvalidEmailError, normalizeEmail } from '../../core/email';

export class SeedArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeedArgumentError';
  }
}

export const SEED_USAGE = `SEED_PROTOCOL 1
Usage: pnpm ops:seed <check|plan|apply> --environment LOCAL_TEST|SHARED [--fixture shared-demo-v3]
  [--api-url <origin>] [--operator-reference <reference>] [--allow-bootstrap] [--super-admin-email <email>]
  [--secrets-stdin] [--json]

check reads a runtime-role-safe snapshot without migration metadata. With --secrets-stdin, passwords are validated first.
plan reads the existing dataset through the API. apply resumes missing records and only bootstraps an EMPTY database with --allow-bootstrap.
--super-admin-email is the login and work email of the Super Admin the bootstrap creates (default: the fixture's); an installed
database keeps the Super Admin it has. The Super Admin password must differ from it.
Passwords are supplied only on stdin: SUPER_ADMIN_PASSWORD=... and DEMO_ACCOUNT_PASSWORD=... .
No database is deleted by this command. The wrappers handle reset confirmation.
Exit codes: 0 done or EMPTY; 2 unchanged or INSTALLED/INCOMPLETE check; 3 refused/NOT_MIGRATED; 4 conflict; 1 failure.`;

const OPTIONS = {
  fixture: { type: 'string' },
  'api-url': { type: 'string' },
  'operator-reference': { type: 'string' },
  'allow-bootstrap': { type: 'boolean' },
  'super-admin-email': { type: 'string' },
  environment: { type: 'string' },
  'secrets-stdin': { type: 'boolean' },
  json: { type: 'boolean' },
  help: { type: 'boolean' },
} as const;

export interface SeedCommandArguments {
  mode: 'check' | 'plan' | 'apply';
  fixture: string;
  apiUrl: string;
  operator: string;
  environment: 'LOCAL_TEST' | 'SHARED';
  json: boolean;
  allowBootstrap: boolean;
  secretsStdin: boolean;
  /** Absent: the fixture's address. */
  superAdminEmail?: string;
}

export type ParsedSeedArguments = { help: true } | { help: false; command: SeedCommandArguments };

/** An http(s) origin with no credentials, path, query or fragment; the API prefix is added by the command. */
function apiUrlOf(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new SeedArgumentError('--api-url must be a URL such as http://slm-api:3000.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new SeedArgumentError('--api-url must be http or https.');
  if (url.username || url.password) throw new SeedArgumentError('--api-url must not carry credentials.');
  if ((url.pathname !== '/' && url.pathname !== '') || url.search || url.hash) {
    throw new SeedArgumentError('--api-url is the origin only (no path, query or fragment).');
  }

  return url.origin;
}

export function parseSeedArguments(argv: readonly string[]): ParsedSeedArguments {
  const args = argv[0] === '--' ? argv.slice(1) : [...argv];
  let parsed: ReturnType<typeof parseArgs<{ options: typeof OPTIONS; allowPositionals: true }>>;
  try {
    parsed = parseArgs({ args, options: OPTIONS, allowPositionals: true, strict: true });
  } catch (error) {
    throw new SeedArgumentError(error instanceof Error ? error.message : String(error));
  }
  const { values, positionals } = parsed;
  if (values.help) return { help: true };
  // Never echo a positional: an operator who types a password as one must not see it printed back.
  if (positionals.length !== 1 || !['check', 'plan', 'apply'].includes(positionals[0])) {
    throw new SeedArgumentError('Name exactly one mode: check, plan or apply.');
  }
  if (positionals[0] !== 'check' && !values['secrets-stdin']) {
    throw new SeedArgumentError('--secrets-stdin is required: the passwords are read from standard input only.');
  }
  return commandOf(values, positionals[0] as SeedCommandArguments['mode']);
}

/** The address as given (trimmed), when it is one the installation accepts; absent stays absent. */
function superAdminEmailOf(value: string | undefined): string | undefined {
  const email = value?.trim();
  if (email === undefined) return undefined;
  try {
    if (email.length > 254) throw new InvalidEmailError();
    normalizeEmail(email);
  } catch (error) {
    if (error instanceof InvalidEmailError) throw new SeedArgumentError('--super-admin-email is not a valid email.');
    throw error;
  }

  return email;
}

function commandOf(
  values: ReturnType<typeof parseArgs<{ options: typeof OPTIONS }>>['values'],
  mode: SeedCommandArguments['mode'],
): ParsedSeedArguments {
  const text = (name: 'fixture' | 'api-url' | 'operator-reference' | 'environment'): string => {
    const value = values[name];
    if (typeof value !== 'string' || value.trim() === '') throw new SeedArgumentError(`--${name} is required.`);

    return value.trim();
  };
  const environment = text('environment');
  if (environment !== 'LOCAL_TEST' && environment !== 'SHARED') {
    throw new SeedArgumentError('--environment must be LOCAL_TEST or SHARED.');
  }
  const operator = mode === 'check' ? (values['operator-reference'] ?? '') : text('operator-reference');
  const superAdminEmail = superAdminEmailOf(values['super-admin-email']);
  const fixture = values.fixture?.trim() || 'shared-demo-v3';
  const maxReference = 100 - `SEED:${fixture}:`.length;
  if (operator.length > maxReference)
    throw new SeedArgumentError(`--operator-reference is at most ${maxReference} characters for this fixture.`);

  return {
    help: false,
    command: {
      mode,
      fixture,
      apiUrl: mode === 'check' ? '' : apiUrlOf(text('api-url')),
      operator,
      environment,
      json: values.json === true,
      allowBootstrap: values['allow-bootstrap'] === true,
      secretsStdin: values['secrets-stdin'] === true,
      ...(superAdminEmail ? { superAdminEmail } : {}),
    },
  };
}
