import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  isEnvironmentValidationError,
  quietCliLogger,
  writeCliFailure as fail,
} from './infrastructure/cli/cli-runtime';
import {
  SUPER_ADMIN_EVENT_USAGE,
  SuperAdminEventArgumentError,
  parseSuperAdminEventArguments,
} from './modules/personnel/super-admin-event/super-admin-event.arguments';
import { SuperAdminEventRefusedError } from './modules/personnel/super-admin-event/super-admin-event.errors';
import { SuperAdminEventService } from './modules/personnel/super-admin-event/super-admin-event.service';

/** Exit codes are part of the command's contract (see --help). */
const EXIT = { done: 0, failed: 1, nothingToDo: 2 } as const;

const NEXT_STEP = {
  RECORDED:
    'Recorded under this ticket, with the notices of it. No role, password, session or account lock changed. To hand the Super Admin role on, run `pnpm ops:recover transfer-role` under its own ticket.',
  ALREADY_RECORDED: 'This ticket was already recorded with these parameters. Nothing was changed.',
} as const;

async function main(): Promise<number> {
  let parsed;
  try {
    parsed = parseSuperAdminEventArguments(process.argv.slice(2));
  } catch (error) {
    if (error instanceof SuperAdminEventArgumentError) return fail(`${error.message}\n\n${SUPER_ADMIN_EVENT_USAGE}`);
    throw error;
  }
  if (parsed.help) {
    process.stdout.write(`${SUPER_ADMIN_EVENT_USAGE}\n`);
    return EXIT.done;
  }

  let app: INestApplicationContext | undefined;
  try {
    // Loaded only now: the graph validates the whole environment, which --help and argument errors must not need.
    const { SuperAdminEventCliModule } = await import('./super-admin-event-cli.module');
    app = await NestFactory.createApplicationContext(SuperAdminEventCliModule, {
      logger: quietCliLogger,
      abortOnError: false,
    });
    const result = await app.get(SuperAdminEventService).run(parsed.command);

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
  } catch (error) {
    if (isEnvironmentValidationError(error)) return fail(error.message);
    if (error instanceof SuperAdminEventRefusedError) return fail(`Refused (${error.problem}). Nothing was changed.`);

    return fail(
      `The command failed; nothing was changed, check the state before running it again: ${error instanceof Error ? error.name : 'unknown error'}`,
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
    process.stderr.write(`The command failed: ${error instanceof Error ? error.name : 'unknown error'}\n`);
    process.exitCode = EXIT.failed;
  },
);
