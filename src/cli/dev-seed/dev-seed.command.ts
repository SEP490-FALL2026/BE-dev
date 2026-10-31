import { DevSeedApi } from '../../modules/installation/public/dev-seed.api';
import { defineCommand, errorName, runInNestContext, writeCliFailure as fail } from '../run-command';
import { formatSeedResult } from './dev-seed-report';
import { DEV_SEED_USAGE, DevSeedArgumentError, parseDevSeedArguments } from './dev-seed.arguments';

/** Exit codes are part of the command's contract (see --help). */
const EXIT = { created: 0, failed: 1, alreadyPresent: 2, refused: 3 } as const;

/** `node dist/cli.js dev-seed` (`pnpm dev:seed`, alias `dist/dev-seed-cli.js`). */
export const devSeedCommand = defineCommand({
  usage: DEV_SEED_USAGE,
  parse: parseDevSeedArguments,
  argumentError: DevSeedArgumentError,
  crashed: (error) => `The seed failed: ${errorName(error)}`,
  execute: ({ confirmLocal }) =>
    runInNestContext({
      // The graph validates the database settings only.
      graph: () => import('../../modules/installation/dev-seed/dev-seed.module').then((m) => m.DevSeedModule),
      work: async (app) => {
        const result = await app.get(DevSeedApi).seed({ confirmLocal });
        const output = formatSeedResult(result);

        process.stdout.write(output.stdout);
        process.stderr.write(output.stderr);
        return result.outcome === 'CREATED'
          ? EXIT.created
          : result.outcome === 'ALREADY_PRESENT'
            ? EXIT.alreadyPresent
            : EXIT.refused;
      },
      // Anything else rolled back; it is reported by its name only (no URL, no stack, no password).
      failed: (error) => fail(`The seed failed and wrote nothing: ${errorName(error)}`),
    }),
});
