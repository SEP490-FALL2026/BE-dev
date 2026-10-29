import { SuperAdminEventApi } from '../../modules/personnel/public/super-admin-event.api';
import { SuperAdminEventRefusedError } from '../../modules/personnel/public/super-admin-event.errors';
import { defineCommand, errorName, runInNestContext, writeCliFailure as fail } from '../run-command';
import {
  SUPER_ADMIN_EVENT_USAGE,
  SuperAdminEventArgumentError,
  parseSuperAdminEventArguments,
} from './record-super-admin-event.arguments';

/** Exit codes are part of the command's contract (see --help). */
const EXIT = { done: 0, failed: 1, nothingToDo: 2 } as const;

const NEXT_STEP = {
  RECORDED:
    'Recorded under this ticket, with the notices of it. No role, password, session or account lock changed. To hand the Super Admin role on, run `pnpm ops:recover transfer-role` under its own ticket.',
  ALREADY_RECORDED: 'This ticket was already recorded with these parameters. Nothing was changed.',
} as const;

/** `node dist/cli.js record-super-admin-event` (`pnpm ops:record-super-admin-event`, alias `dist/super-admin-event-cli.js`). */
export const recordSuperAdminEventCommand = defineCommand({
  usage: SUPER_ADMIN_EVENT_USAGE,
  parse: parseSuperAdminEventArguments,
  argumentError: SuperAdminEventArgumentError,
  crashed: (error) => `The command failed: ${errorName(error)}`,
  execute: ({ command }) =>
    runInNestContext({
      // The graph validates the whole environment.
      graph: () => import('./record-super-admin-event-cli.module').then((m) => m.SuperAdminEventCliModule),
      work: async (app) => {
        const result = await app.get(SuperAdminEventApi).run(command);

        // Only the ticket, the mode, the outcome and the id of the record: never a name, an email, a code of a person, a basis or a reason.
        process.stdout.write(
          [
            `ticket:   ${result.ticketRef}`,
            `mode:     ${result.mode}`,
            `outcome:  ${result.outcome}`,
            `record:   ${result.recordId}`,
            NEXT_STEP[result.outcome],
            '',
          ].join('\n'),
        );

        return result.outcome === 'RECORDED' ? EXIT.done : EXIT.nothingToDo;
      },
      failed: (error) => {
        if (error instanceof SuperAdminEventRefusedError)
          return fail(`Refused (${error.problem}). Nothing was changed.`);

        return fail(
          `The command failed; nothing was changed, check the state before running it again: ${errorName(error)}`,
        );
      },
    }),
});
