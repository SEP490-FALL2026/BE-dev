import type { DemoAccountsApi } from '../../modules/installation/public/demo-accounts.api';
import type { DemoDatasetCommandArguments } from './demo-dataset.arguments';
import { DemoApiClient, DemoApiError, DemoApiUnreachableError, FetchLike } from './demo-api-client';
import { businessYearOf, calendarRefusal } from './demo-dataset-calendar';
import { exitCodeOf, runDemoSteps } from './demo-dataset-runner';
import type { DemoReport } from './demo-dataset-report';
import type { DemoSecrets } from './demo-dataset-secrets';
import { DEMO_FIXTURES, demoSteps } from './demo-dataset-steps';
import { emptyIds, DemoRunContext } from './demo-run.types';
import type { DemoFixture } from './fixture/demo-fixture.types';

export type DemoRunOutcome = { refused: string } | { report: DemoReport };

export interface DemoRunInput {
  args: DemoDatasetCommandArguments;
  secrets: DemoSecrets;
  accounts: DemoAccountsApi;
  fetch?: FetchLike;
}

const API_PREFIX = '/api/v1';

/**
 * One run of `ops:demo-dataset`. Before anything is written it proves the target: the database holds an installation of
 * the organization named on the command line, priced in the fixture's currency, and the API at `--api-url` serves that
 * very database (its Super Admin, signed in with the password given, is the holder this database records). It then checks
 * the calendar (`demo-dataset-calendar.ts`) and, for `apply`, holds the apply lock of the fixture on this database, so a
 * second `apply` at the same time is refused. Any doubt is a refusal, with no record of the dataset written.
 */
export async function runDemoDataset(input: DemoRunInput): Promise<DemoRunOutcome> {
  const { args } = input;
  const fixture = DEMO_FIXTURES[args.fixture];
  if (!fixture) return { refused: `Unknown fixture ${args.fixture}; known: ${Object.keys(DEMO_FIXTURES).join(', ')}.` };
  const facts = await installationFacts(input, fixture);
  if ('refused' in facts) return facts;
  const lock = args.mode === 'apply' ? await input.accounts.holdApplyLock(fixture.id) : null;
  if (args.mode === 'apply' && !lock) {
    return {
      refused: 'Another apply of this fixture is running against this database (its lock is held): nothing written.',
    };
  }
  try {
    return await runAgainst(input, fixture, facts);
  } finally {
    await lock?.release();
  }
}

type Facts = NonNullable<Awaited<ReturnType<DemoAccountsApi['inspect']>>> & {
  superAdmin: { appUserId: string; employeeId: string; loginEmail: string };
};

/** The installation the database holds, refused unless it is the one named, in the fixture's currency, with a Super Admin. */
async function installationFacts(input: DemoRunInput, fixture: DemoFixture): Promise<Facts | { refused: string }> {
  const length = [...input.secrets.demoAccountPassword].length;
  if (length < 12 || length > 128) return { refused: 'DEMO_ACCOUNT_PASSWORD must be 12 to 128 characters.' };
  const facts = await input.accounts.inspect();
  if (!facts) return { refused: 'The database holds no installation: bootstrap it first.' };
  if (facts.organizationName !== input.args.organization) {
    return {
      refused: 'The installed organization is not the one named by --organization: wrong database, nothing written.',
    };
  }
  if (facts.reportingCurrency !== fixture.currency) {
    return {
      refused: `The fixture is priced in ${fixture.currency}, the installation reports in ${facts.reportingCurrency}.`,
    };
  }
  if (!facts.superAdmin) return { refused: 'The installation has no usable Super Admin to drive the API as.' };

  return { ...facts, superAdmin: facts.superAdmin };
}

async function runAgainst(input: DemoRunInput, fixture: DemoFixture, facts: Facts): Promise<DemoRunOutcome> {
  const { args, secrets } = input;
  const api = new DemoApiClient(`${args.apiUrl}${API_PREFIX}`, { fetch: input.fetch });
  try {
    const proven = await proveSameInstallation(api, facts.superAdmin, secrets.superAdminPassword);
    if (proven !== null) return { refused: proven };
    const calendar = calendarRefusal({
      mode: args.mode,
      today: facts.today,
      fiscalYearStartMonth: await fiscalYearStartMonth(api, facts.superAdmin.loginEmail),
      datasetYear: await datasetYear(api, facts, fixture.id),
    });
    if (calendar !== null) return { refused: calendar };
    const steps = await runDemoSteps(context(input, fixture, api, facts), demoSteps(fixture));

    return {
      report: {
        fixture: fixture.id,
        mode: args.mode,
        organization: facts.organizationName,
        today: facts.today,
        steps,
        exitCode: exitCodeOf(args.mode, steps),
      },
    };
  } finally {
    await api.signOutAll();
  }
}

/** The operating parameter `FISCAL_YEAR_START_MONTH`, read as the Super Admin. */
async function fiscalYearStartMonth(api: DemoApiClient, email: string): Promise<number> {
  const data = await api.call<{ items: { key: string; value: unknown }[] }>(email, 'GET', '/operating-parameters');

  return Number(data.items.find((item) => item.key === 'FISCAL_YEAR_START_MONTH')?.value);
}

/**
 * The business year the fixture first wrote a demo account in on this database, from the Audit Trail, in the
 * organization's time zone; null when it never did.
 */
async function datasetYear(api: DemoApiClient, facts: Facts, fixtureId: string): Promise<number | null> {
  const email = facts.superAdmin.loginEmail;
  const prefix = `DEMO_DATASET:${fixtureId}:`;
  let first: string | null = null;
  for (let page = 1; ; page++) {
    const data = await api.call<{
      items: { occurredAt: string; operatorReference: string | null }[];
      pagination: { totalPages: number };
    }>(email, 'GET', `/audit-events?action=DEMO_DATASET.ACCOUNT_CREATED&page=${page}&pageSize=100`);
    for (const item of data.items)
      if (item.operatorReference?.startsWith(prefix) && (first === null || item.occurredAt < first))
        first = item.occurredAt;
    if (page >= data.pagination.totalPages) break;
  }

  return first === null ? null : businessYearOf(first, facts.timeZone);
}

/** Null when the API signs the Super Admin of this database in; otherwise why the run is refused. */
async function proveSameInstallation(
  api: DemoApiClient,
  superAdmin: { appUserId: string; loginEmail: string },
  password: string,
): Promise<string | null> {
  try {
    await api.signIn(superAdmin.loginEmail, password);
    const me = await api.call<{ appUserId: string }>(superAdmin.loginEmail, 'GET', '/me');
    if (me.appUserId === superAdmin.appUserId) return null;
    await api.signOutAll();

    return 'The API at --api-url serves another installation than this database: nothing written.';
  } catch (error) {
    if (error instanceof DemoApiUnreachableError) return 'The API at --api-url cannot be reached: nothing written.';
    if (error instanceof DemoApiError && error.status === 401) {
      return 'The API refused the Super Admin password (or serves another installation): nothing written.';
    }
    throw error;
  }
}

function context(
  input: DemoRunInput,
  fixture: DemoFixture,
  api: DemoApiClient,
  facts: { organizationId: string; today: string; superAdmin: { loginEmail: string } | null },
): DemoRunContext {
  const attribution = {
    operatorReference: `DEMO_DATASET:${fixture.id}:${input.args.operator}`,
    environment: input.args.environment,
  };

  return {
    mode: input.args.mode,
    fixture,
    api,
    today: facts.today,
    superAdminEmail: facts.superAdmin?.loginEmail ?? '',
    demoPassword: input.secrets.demoAccountPassword,
    ids: emptyIds(),
    accounts: {
      findEmployees: (codes) => input.accounts.findEmployees(codes),
      describe: (specs) => input.accounts.describe(facts.organizationId, specs),
      create: (specs) =>
        input.accounts.create(facts.organizationId, specs, input.secrets.demoAccountPassword, attribution),
    },
  };
}
