import { SubscriptionOwnerAssignmentApi } from '../../modules/catalog/public/subscription-owner-assignment.api';
import { AssignmentRefusedError } from '../../modules/catalog/public/subscription-owner-assignment.errors';
import { defineCommand, errorName, runInNestContext, writeCliFailure as fail } from '../run-command';
import {
  ASSIGNMENT_USAGE,
  AssignmentArgumentError,
  parseAssignmentArguments,
} from './assign-subscription-owner.arguments';

/** Exit codes are part of the command's contract (see --help). */
const EXIT = { assigned: 0, failed: 1, nothingToDo: 2 } as const;

/** `node dist/cli.js assign-subscription-owner` (`pnpm ops:assign-subscription-owner`, alias `dist/subscription-owner-assignment-cli.js`). */
export const assignSubscriptionOwnerCommand = defineCommand({
  usage: ASSIGNMENT_USAGE,
  parse: parseAssignmentArguments,
  argumentError: AssignmentArgumentError,
  crashed: (error) => `The assignment failed: ${errorName(error)}`,
  execute: ({ command }) =>
    runInNestContext({
      // The graph validates the database settings only.
      graph: () => import('./assign-subscription-owner-cli.module').then((m) => m.AssignSubscriptionOwnerCliModule),
      work: async (app) => {
        const result = await app.get(SubscriptionOwnerAssignmentApi).assign(command);

        process.stdout.write(
          [
            `subscription: ${result.subscriptionId}`,
            `department:   ${result.departmentId}`,
            `outcome:      ${result.outcome}`,
            result.outcome === 'ASSIGNED'
              ? 'The basis is recorded. The next preflight no longer lists this subscription.'
              : 'This subscription was already assigned to that department. Nothing was changed.',
            '',
          ].join('\n'),
        );

        return result.outcome === 'ASSIGNED' ? EXIT.assigned : EXIT.nothingToDo;
      },
      failed: (error) => {
        if (error instanceof AssignmentRefusedError) return fail(`Refused (${error.problem}). Nothing was changed.`);

        return fail(`The assignment failed; check the state before running it again: ${errorName(error)}`);
      },
    }),
});
