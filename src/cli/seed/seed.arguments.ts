import { parseArgs } from 'node:util';

export class SeedArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeedArgumentError';
  }
}

export const SEED_USAGE = `Usage: pnpm ops:seed <plan|apply> --fixture <id> --organization <name> --api-url <url> --operator <reference> --environment LOCAL_TEST|SHARED --secrets-stdin [--json]

Writes a versioned demo dataset (made-up people, departments, catalog, budget and requests) next to the data of an
installation, for a shared demo or test server. Every record is written through the HTTP API of the running installation,
as the role the business rules name (the Super Admin, Finance, an IT Admin, a head, the spending approver, an employee),
and so passes every check of the application; only the sign-in accounts of the demo people are written by this command
itself (activated, one direct role, audited as an operator action), because an invitation would mail a demo mailbox.

  plan    writes no record of the dataset: says, step by step, what is there, what apply would write and what
          conflicts. To read through the API it signs in, which writes sign-in sessions and their audit events (ended
          at the end): the database is not left byte for byte unchanged.
  apply   writes what is missing, step by step, and brings each scenario request to its state. Run again, it writes
          nothing that is there already; stopped half-way, it goes on from where it stopped. Nothing is ever deleted,
          reset or overwritten: a code, a name or a role that something outside the dataset holds, or a record of the
          dataset changed since, is a conflict. One apply at a time per database (a second is refused while one runs);
          apply writes from 1 January to 30 November of the dataset's year only, plan reads any day of that year.

Options
  --fixture <id>           The dataset: shared-demo-v2.
  --organization <name>    The name of the installed organization, exactly: the command refuses another database.
  --api-url <url>          The base URL of the API serving that database (http or https, no path), for example
                           http://slm-api:3000 inside the Compose network. The command checks it is the same installation.
  --operator <reference>   Who runs it (a reference, never a password): kept in the Audit Trail of the demo accounts.
  --environment <name>     LOCAL_TEST or SHARED.
  --secrets-stdin          Required. Reads two lines from standard input: SUPER_ADMIN_PASSWORD=… and
                           DEMO_ACCOUNT_PASSWORD=… (12 to 128 characters). Never an argument or an environment variable.
  --json                   Print the report as JSON (no password, no token).
  --help

Reads the database settings only (NODE_ENV, DATABASE_URL, DB_*) and runs with the runtime role of the API (checked
before any work when NODE_ENV is production).

Exit codes: 0 done (apply) or planned (plan) · 2 nothing to change (apply: every step was there) · 4 some step is in
conflict or blocked (the others ran; see the report) · 3 refused before anything was written · 1 failed (the report says
which steps were done; run again after fixing the cause).`;

const OPTIONS = {
  fixture: { type: 'string' },
  organization: { type: 'string' },
  'api-url': { type: 'string' },
  operator: { type: 'string' },
  environment: { type: 'string' },
  'secrets-stdin': { type: 'boolean' },
  json: { type: 'boolean' },
  help: { type: 'boolean' },
} as const;

export interface SeedCommandArguments {
  mode: 'plan' | 'apply';
  fixture: string;
  organization: string;
  apiUrl: string;
  operator: string;
  environment: 'LOCAL_TEST' | 'SHARED';
  json: boolean;
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
  if (positionals.length !== 1 || !['plan', 'apply'].includes(positionals[0])) {
    throw new SeedArgumentError('Name exactly one mode: plan or apply.');
  }
  if (!values['secrets-stdin']) {
    throw new SeedArgumentError('--secrets-stdin is required: the passwords are read from standard input only.');
  }
  const text = (name: 'fixture' | 'organization' | 'api-url' | 'operator' | 'environment'): string => {
    const value = values[name];
    if (typeof value !== 'string' || value.trim() === '') throw new SeedArgumentError(`--${name} is required.`);

    return value.trim();
  };
  const environment = text('environment');
  if (environment !== 'LOCAL_TEST' && environment !== 'SHARED') {
    throw new SeedArgumentError('--environment must be LOCAL_TEST or SHARED.');
  }
  const operator = text('operator');
  if (operator.length > 100) throw new SeedArgumentError('--operator is at most 100 characters.');

  return {
    help: false,
    command: {
      mode: positionals[0] as 'plan' | 'apply',
      fixture: text('fixture'),
      organization: text('organization'),
      apiUrl: apiUrlOf(text('api-url')),
      operator,
      environment,
      json: values.json === true,
    },
  };
}
