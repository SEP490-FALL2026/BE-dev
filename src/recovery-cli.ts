import type { INestApplicationContext, LoggerService } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { EnvironmentValidationError } from './infrastructure/config/env-schema';
import {
  RECOVERY_USAGE,
  RecoveryArgumentError,
  parseRecoveryArguments,
} from './modules/identity-access/recovery.arguments';
import { RecoveryRefusedError } from './modules/identity-access/recovery.errors';
import { RecoveryResult, RecoveryService } from './modules/identity-access/recovery.service';

/** Exit codes are part of the command's contract (see --help). */
const EXIT = { done: 0, failed: 1, nothingToDo: 2 } as const;

function fail(message: string): number {
  process.stderr.write(`${message}\n`);
  return EXIT.failed;
}

/** Warnings only: the errors Nest would log carry stacks, and main() reports every failure itself. */
const cliLogger: LoggerService = {
  log: () => undefined,
  error: () => undefined,
  warn: (message: unknown) => {
    process.stderr.write(`warning: ${typeof message === 'string' ? message : 'unexpected warning'}\n`);
  },
};

function isEnvironmentValidationError(error: unknown): error is Error {
  return (
    error instanceof EnvironmentValidationError ||
    (error instanceof Error && error.name === 'EnvironmentValidationError')
  );
}

const NEXT_STEP: Record<RecoveryResult['outcome'], string> = {
  LINK_SENT: 'One link was queued for the mailbox. The holder sets the new password with it; you never see it.',
  LINK_ALREADY_SENT: 'A link for this ticket is already on its way and still works. Nothing was sent again.',
  ALREADY_COMPLETED: 'This ticket was already completed. Nothing was changed.',
  UNLOCKED: 'The account is open again. No role changed.',
  NOTHING_TO_UNLOCK: 'The account was not locked. Nothing was changed.',
  ACCOUNT_CREATED:
    'The successor has an account with no role and an invitation. When they have activated it, run this ticket again.',
  INVITATION_REISSUED:
    'The earlier invitation no longer worked; a new one was queued. Run this ticket again after they activate.',
  INVITATION_ALREADY_SENT:
    'The invitation is still on its way and works. Run this ticket again after the successor activates.',
  ROLE_TRANSFERRED: 'The role moved in one step. Exactly one account holds it now.',
};

async function main(): Promise<number> {
  let parsed;
  try {
    parsed = parseRecoveryArguments(process.argv.slice(2));
  } catch (error) {
    if (error instanceof RecoveryArgumentError) return fail(`${error.message}\n\n${RECOVERY_USAGE}`);
    throw error;
  }
  if (parsed.help) {
    process.stdout.write(`${RECOVERY_USAGE}\n`);
    return EXIT.done;
  }

  let app: INestApplicationContext | undefined;
  try {
    // Loaded only now: the module graph validates the whole environment, which --help and argument errors must not need.
    const { RecoveryCliModule } = await import('./recovery-cli.module');
    app = await NestFactory.createApplicationContext(RecoveryCliModule, { logger: cliLogger, abortOnError: false });
    const recovery = app.get(RecoveryService);

    const { command } = parsed;
    const result =
      command.mode === 'reset-credentials'
        ? await recovery.resetCredentials(command.context, {
            accountEmail: command.accountEmail,
            ...(command.newLoginEmail ? { newLoginEmail: command.newLoginEmail } : {}),
          })
        : command.mode === 'unlock'
          ? await recovery.unlock(command.context, { accountEmail: command.accountEmail })
          : await recovery.transferRole(command.context, {
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
  } catch (error) {
    if (isEnvironmentValidationError(error)) return fail(error.message);
    if (error instanceof RecoveryRefusedError) return fail(`Refused (${error.problem}). Nothing was changed.`);

    return fail(
      `The recovery failed; check the state before running it again: ${error instanceof Error ? error.name : 'unknown error'}`,
    );
  } finally {
    await app?.close();
  }
}

void main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    process.stderr.write(`The recovery failed: ${error instanceof Error ? error.name : 'unknown error'}\n`);
    process.exitCode = EXIT.failed;
  },
);
