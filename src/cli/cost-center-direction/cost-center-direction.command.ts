import { CostCenterDirectionApi } from '../../modules/organization/public/cost-center-direction.api';
import { DirectionRefusedError } from '../../modules/organization/public/cost-center-direction.errors';
import { defineCommand, errorName, runInNestContext, writeCliFailure as fail } from '../run-command';
import { DIRECTION_USAGE, DirectionArgumentError, parseDirectionArguments } from './cost-center-direction.arguments';

/** Exit codes are part of the command's contract (see --help). */
const EXIT = { done: 0, failed: 1, nothingToDo: 2 } as const;

/** `node dist/cli.js cost-center-direction` (`pnpm ops:cost-center-direction`, alias `dist/cost-center-direction-cli.js`). */
export const costCenterDirectionCommand = defineCommand({
  usage: DIRECTION_USAGE,
  parse: parseDirectionArguments,
  argumentError: DirectionArgumentError,
  crashed: (error) => `The command failed: ${errorName(error)}`,
  execute: (parsed) =>
    runInNestContext({
      // The graph validates the database settings only.
      graph: () => import('./cost-center-direction-cli.module').then((m) => m.CostCenterDirectionCliModule),
      work: async (app) => {
        const service = app.get(CostCenterDirectionApi);

        if (parsed.mode === 'activate') {
          const result = await service.activate(parsed.command);
          process.stdout.write(
            [
              'mode:         activate',
              `organization: ${result.organizationId}`,
              `outcome:      ${result.outcome}`,
              result.outcome === 'ACTIVATED'
                ? 'The activation is recorded. A department can now be created without a Cost Center.'
                : 'This installation was already activated. Nothing was changed.',
              '',
            ].join('\n'),
          );

          return result.outcome === 'ACTIVATED' ? EXIT.done : EXIT.nothingToDo;
        }

        const result = await service.link(parsed.command);
        process.stdout.write(
          [
            'mode:         link',
            `cost-center:  ${result.costCenterId}`,
            `department:   ${result.departmentId}`,
            `outcome:      ${result.outcome}`,
            result.outcome === 'LINKED'
              ? 'The basis is recorded. The next preflight no longer lists this Cost Center.'
              : 'This Cost Center was already linked to that department. Nothing was changed.',
            '',
          ].join('\n'),
        );

        return result.outcome === 'LINKED' ? EXIT.done : EXIT.nothingToDo;
      },
      failed: (error) => {
        if (error instanceof DirectionRefusedError) return fail(`Refused (${error.problem}). Nothing was changed.`);

        return fail(`The command failed; check the state before running it again: ${errorName(error)}`);
      },
    }),
});
