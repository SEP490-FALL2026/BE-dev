import { HolderRecoveryApi } from '../../modules/identity-access/public/holder-recovery.api';
import { RecoveryRefusedError } from '../../modules/identity-access/public/recovery.errors';
import type { RecoveryResult } from '../../modules/identity-access/public/recovery.types';
import { RoleTransferRecoveryApi } from '../../modules/identity-access/public/role-transfer-recovery.api';
import { defineCommand, errorName, runInNestContext, writeCliFailure as fail } from '../run-command';
import { RECOVERY_USAGE, RecoveryArgumentError, parseRecoveryArguments } from './recover.arguments';

/** Exit codes are part of the command's contract (see --help). */
const EXIT = { done: 0, failed: 1, nothingToDo: 2 } as const;

const NEXT_STEP: Record<RecoveryResult['outcome'], string> = {
  LINK_SENT: 'One link was queued for the mailbox. The holder sets the new password with it; you never see it.',
  LINK_ALREADY_SENT: 'A link for this ticket is already on its way and still works. Nothing was sent again.',
  ALREADY_COMPLETED: 'This ticket was already completed. Nothing was changed.',
  UNLOCKED: 'The account is open again. No role changed.',
  NOTHING_TO_UNLOCK: 'The account was not locked. Nothing was changed.',
  ACCOUNT_CREATED:
    'The successor has an account with EMPLOYEE and an invitation. When they have activated it, run this ticket again.',
  INVITATION_REISSUED:
    'The earlier invitation no longer worked; a new one was queued. Run this ticket again after they activate.',
  INVITATION_ALREADY_SENT:
    'The invitation is still on its way and works. Run this ticket again after the successor activates.',
  ROLE_TRANSFERRED: 'The role moved in one step. Exactly one account holds it now.',
};

/** `node dist/cli.js recover` (`pnpm ops:recover`, alias `dist/recovery-cli.js`). */
export const recoverCommand = defineCommand({
  usage: RECOVERY_USAGE,
  parse: parseRecoveryArguments,
  argumentError: RecoveryArgumentError,
  crashed: (error) => `The recovery failed: ${errorName(error)}`,
  execute: ({ command }) =>
    runInNestContext({
      // The graph validates the whole environment.
      graph: () => import('./recover-cli.module').then((m) => m.RecoveryCliModule),
      work: async (app) => {
        const holder = app.get(HolderRecoveryApi);
        const result =
          command.mode === 'reset-credentials'
            ? await holder.resetCredentials(command.context, {
                accountEmail: command.accountEmail,
                ...(command.newLoginEmail ? { newLoginEmail: command.newLoginEmail } : {}),
              })
            : command.mode === 'unlock'
              ? await holder.unlock(command.context, { accountEmail: command.accountEmail })
              : await app.get(RoleTransferRecoveryApi).transferRole(command.context, {
                  successorEmployeeCode: command.successorEmployeeCode,
                  ...(command.holderEmail ? { holderEmail: command.holderEmail } : {}),
                });

        process.stdout.write(
          [
            `ticket:   ${result.ticketRef}`,
            `mode:     ${result.mode}`,
            `outcome:  ${result.outcome}`,
            ...(result.sentTo ? [`sent to:  ${result.sentTo}`] : []),
            NEXT_STEP[result.outcome],
            '',
          ].join('\n'),
        );

        return result.outcome === 'ALREADY_COMPLETED' ||
          result.outcome === 'LINK_ALREADY_SENT' ||
          result.outcome === 'INVITATION_ALREADY_SENT' ||
          result.outcome === 'NOTHING_TO_UNLOCK'
          ? EXIT.nothingToDo
          : EXIT.done;
      },
      failed: (error) => {
        if (error instanceof RecoveryRefusedError) return fail(`Refused (${error.problem}). Nothing was changed.`);

        return fail(`The recovery failed; check the state before running it again: ${errorName(error)}`);
      },
    }),
});
