import { AiPurgeRefusedError } from '../../modules/ai-assist/public/ai-purge.errors';
import { AiPurgeApi } from '../../modules/ai-assist/public/ai-purge.api';
import { defineCommand, errorName, runInNestContext, writeCliFailure as fail } from '../run-command';
import { AI_PURGE_USAGE, AiPurgeArgumentError, parseAiPurgeArguments } from './ai-purge.arguments';

/** Exit codes are part of the command's contract (see --help). */
const EXIT = { done: 0, failed: 1, nothingToDelete: 2 } as const;

/** `node dist/cli.js ai-purge` (`pnpm ops:ai-purge`, alias `dist/ai-purge-cli.js`). */
export const aiPurgeCommand = defineCommand({
  usage: AI_PURGE_USAGE,
  parse: parseAiPurgeArguments,
  argumentError: AiPurgeArgumentError,
  crashed: (error) => `The purge failed: ${errorName(error)}`,
  execute: ({ command }) =>
    runInNestContext({
      // The graph validates the database settings only.
      graph: () => import('./ai-purge-cli.module').then((m) => m.AiPurgeCliModule),
      work: async (app) => {
        const result = await app.get(AiPurgeApi).purge(command);
        const dry = result.mode === 'DRY_RUN';

        process.stdout.write(
          [
            `mode:     ${dry ? 'DRY RUN' : 'APPLIED'}`,
            `through:  ${result.through}`,
            `contents: ${result.contentCount}`,
            result.contentCount === 0
              ? 'Nothing to delete.'
              : dry
                ? 'Nothing was deleted. Run again with --apply and --operator to delete them.'
                : 'The contents are deleted; the calls are kept.',
            '',
          ].join('\n'),
        );

        return result.contentCount === 0 ? EXIT.nothingToDelete : EXIT.done;
      },
      failed: (error) => {
        if (error instanceof AiPurgeRefusedError) return fail(`Refused (${error.problem}). Nothing was deleted.`);

        return fail(`The purge failed; nothing was deleted: ${errorName(error)}`);
      },
    }),
});
