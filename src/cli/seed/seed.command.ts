import { InstallationInspectionApi } from '../../modules/installation/public/installation-inspection.api';
import { InstallationApi } from '../../modules/installation/public/installation.api';
import { INSTALLATION } from './fixture/shared-demo-v2/installation';
import type { SeedCommandArguments } from './seed.arguments';
import type { DemoSecrets } from './seed-secrets';
import { DemoAccountsApi } from '../../modules/installation/public/demo-accounts.api';
import { defineCommand, runInNestContext, writeCliFailure as fail } from '../run-command';
import { DemoRunClock, describeDemoFailure } from './demo-failure';
import { formatDemoReport, formatDemoReportJson } from './seed-report';
import { runSeed } from './seed-run';
import { DemoSecretsError, readDemoSecrets, seedSecretsProblem } from './seed-secrets';
import { SEED_USAGE, SeedArgumentError, parseSeedArguments } from './seed.arguments';

/** Exit codes are part of the command's contract (see --help). */
const REFUSED = 3;

/** `node dist/cli.js seed` (`pnpm ops:seed`, alias `dist/seed-cli.js`). */
export const seedCommand = defineCommand({
  usage: SEED_USAGE,
  parse: parseSeedArguments,
  argumentError: SeedArgumentError,
  crashed: (error) => `The demo dataset run failed: ${describeDemoFailure(error)}`,
  execute: async ({ command: args }) => {
    const clock = new DemoRunClock();
    clock.enter('secrets');
    let secrets;
    try {
      secrets = args.secretsStdin ? await readDemoSecrets(process.stdin) : undefined;
      const problem = secrets ? seedSecretsProblem(secrets) : null;
      if (problem) {
        process.stdout.write(`REFUSED\tSECRETS\t${problem}\n`);
        return REFUSED;
      }
    } catch (error) {
      if (error instanceof DemoSecretsError) {
        process.stdout.write(`REFUSED\tSECRETS\tFORMAT\n`);
        return REFUSED;
      }
      throw error;
    }

    // In production the graph runs the runtime-role check, the first database query of the run.
    if (args.mode === 'check') return check(secrets !== undefined);
    if (!secrets) return REFUSED;
    const passwords = secrets;
    clock.enter('startup');
    return runInNestContext({
      // The graph validates the database settings only; the dataset itself goes through the HTTP API.
      graph: () => import('../../modules/installation/seed/seed-cli.module').then((m) => m.SeedCliModule),
      work: async (app) => {
        const outcome = await runSeed({
          args,
          secrets: passwords,
          accounts: app.get(DemoAccountsApi),
          clock,
          bootstrap: () => bootstrap(args, passwords),
        });
        for (const warning of outcome.warnings ?? []) process.stderr.write(`warning: ${warning}\n`);
        if ('refused' in outcome) {
          process.stderr.write(`refused: ${outcome.refused}\n`);
          return REFUSED;
        }
        process.stdout.write(args.json ? formatDemoReportJson(outcome.report) : formatDemoReport(outcome.report));

        return outcome.report.exitCode;
      },
      // Phase, time, kind, code and the fixed pg message only: no URL, no message of the error, no stack, no password.
      failed: (error) => fail(clock.failureLine(error)),
    });
  },
});

async function bootstrap(args: SeedCommandArguments, secrets: DemoSecrets): Promise<void> {
  await runInNestContext({
    graph: () => import('../../modules/installation/installation.module').then((m) => m.InstallationModule),
    work: async (app) => {
      await app.get(InstallationApi).install(
        {
          ...INSTALLATION,
          environment: args.environment,
          operatorReference: `SEED:${args.fixture}:${args.operator}`,
        },
        secrets.superAdminPassword,
      );
      return 0;
    },
    failed: (error) => {
      throw error;
    },
  });
}

async function check(checkedSecrets: boolean): Promise<number> {
  return runInNestContext({
    graph: () => import('../../modules/installation/inspect/inspection-cli.module').then((m) => m.InspectionCliModule),
    work: async (app) => {
      const snapshot = await app.get(InstallationInspectionApi).seedCheck();
      const name = snapshot.organization?.replace(/[\t\r\n]/g, ' ') ?? '-';
      const environment =
        snapshot.environment === 'LOCAL_TEST' || snapshot.environment === 'SHARED' ? snapshot.environment : 'UNKNOWN';
      process.stdout.write(
        `STATE\t${snapshot.state}\nORGANIZATION\t${name}\nFIXTURE_ORGANIZATION\t${snapshot.organization === INSTALLATION.organizationName ? 'yes' : 'no'}\nENVIRONMENT\t${environment}\nCOUNTS\tdepartments=${snapshot.departments}\taccounts=${snapshot.accounts}\nSECRETS\t${checkedSecrets ? 'ok' : 'not-checked'}\n`,
      );
      return snapshot.state === 'EMPTY' ? 0 : snapshot.state === 'NOT_MIGRATED' ? 3 : 2;
    },
    failed: (error) => fail(describeDemoFailure(error)),
  });
}
