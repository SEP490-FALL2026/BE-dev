import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  isEnvironmentValidationError,
  quietCliLogger,
  writeCliFailure as fail,
} from './infrastructure/cli/cli-runtime';
import {
  ASSIGNMENT_USAGE,
  AssignmentArgumentError,
  parseAssignmentArguments,
} from './modules/catalog/subscription-owner-assignment/subscription-owner-assignment.arguments';
import { AssignmentRefusedError } from './modules/catalog/subscription-owner-assignment/subscription-owner-assignment.errors';
import { SubscriptionOwnerAssignmentService } from './modules/catalog/subscription-owner-assignment/subscription-owner-assignment.service';

/** Exit codes are part of the command's contract (see --help). */
const EXIT = { assigned: 0, failed: 1, nothingToDo: 2 } as const;

async function main(): Promise<number> {
  let parsed;
  try {
    parsed = parseAssignmentArguments(process.argv.slice(2));
  } catch (error) {
    if (error instanceof AssignmentArgumentError) return fail(`${error.message}\n\n${ASSIGNMENT_USAGE}`);
    throw error;
  }
  if (parsed.help) {
    process.stdout.write(`${ASSIGNMENT_USAGE}\n`);
    return EXIT.assigned;
  }

  let app: INestApplicationContext | undefined;
  try {
    // Loaded only now: the graph validates the database settings, which --help and argument errors must not need.
    const { SubscriptionOwnerAssignmentCliModule } = await import('./subscription-owner-assignment-cli.module');
    app = await NestFactory.createApplicationContext(SubscriptionOwnerAssignmentCliModule, {
      logger: quietCliLogger,
      abortOnError: false,
    });
    const result = await app.get(SubscriptionOwnerAssignmentService).assign(parsed.command);

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
  } catch (error) {
    if (isEnvironmentValidationError(error)) return fail(error.message);
    if (error instanceof AssignmentRefusedError) return fail(`Refused (${error.problem}). Nothing was changed.`);

    return fail(
      `The assignment failed; check the state before running it again: ${error instanceof Error ? error.name : 'unknown error'}`,
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
    process.stderr.write(`The assignment failed: ${error instanceof Error ? error.name : 'unknown error'}\n`);
    process.exitCode = EXIT.failed;
  },
);
