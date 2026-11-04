import { DemoAccountsApi } from '../../modules/installation/public/demo-accounts.api';
import { defineCommand, runInNestContext, writeCliFailure as fail } from '../run-command';
import { DemoRunClock, describeDemoFailure } from './demo-failure';
import { formatDemoReport, formatDemoReportJson } from './seed-report';
import { runSeed } from './seed-run';
import { DemoSecretsError, readDemoSecrets } from './seed-secrets';
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
      secrets = await readDemoSecrets(process.stdin);
    } catch (error) {
      if (error instanceof DemoSecretsError) {
        process.stderr.write(`refused: ${error.message}\n`);
        return REFUSED;
      }
      throw error;
    }

    // In production the graph runs the runtime-role check, the first database query of the run.
    clock.enter('startup');
    return runInNestContext({
      // The graph validates the database settings only; the dataset itself goes through the HTTP API.
      graph: () => import('../../modules/installation/seed/seed-cli.module').then((m) => m.SeedCliModule),
      work: async (app) => {
        const outcome = await runSeed({ args, secrets, accounts: app.get(DemoAccountsApi), clock });
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
