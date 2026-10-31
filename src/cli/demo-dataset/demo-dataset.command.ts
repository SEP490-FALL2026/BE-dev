import { DemoAccountsApi } from '../../modules/installation/public/demo-accounts.api';
import { defineCommand, errorName, runInNestContext, writeCliFailure as fail } from '../run-command';
import { formatDemoReport, formatDemoReportJson } from './demo-dataset-report';
import { runDemoDataset } from './demo-dataset-run';
import { DemoSecretsError, readDemoSecrets } from './demo-dataset-secrets';
import { DEMO_DATASET_USAGE, DemoDatasetArgumentError, parseDemoDatasetArguments } from './demo-dataset.arguments';

/** Exit codes are part of the command's contract (see --help). */
const REFUSED = 3;

/** `node dist/cli.js demo-dataset` (`pnpm ops:demo-dataset`, alias `dist/demo-dataset-cli.js`). */
export const demoDatasetCommand = defineCommand({
  usage: DEMO_DATASET_USAGE,
  parse: parseDemoDatasetArguments,
  argumentError: DemoDatasetArgumentError,
  crashed: (error) => `The demo dataset run failed: ${errorName(error)}`,
  execute: async ({ command: args }) => {
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

    return runInNestContext({
      // The graph validates the database settings only; the dataset itself goes through the HTTP API.
      graph: () =>
        import('../../modules/installation/demo-dataset/demo-dataset.module').then((m) => m.DemoDatasetModule),
      work: async (app) => {
        const outcome = await runDemoDataset({ args, secrets, accounts: app.get(DemoAccountsApi) });
        if ('refused' in outcome) {
          process.stderr.write(`refused: ${outcome.refused}\n`);
          return REFUSED;
        }
        process.stdout.write(args.json ? formatDemoReportJson(outcome.report) : formatDemoReport(outcome.report));

        return outcome.report.exitCode;
      },
      // Reported by its name only: no URL, no stack, no password.
      failed: (error) => fail(`The demo dataset run failed: ${errorName(error)}`),
    });
  },
});
