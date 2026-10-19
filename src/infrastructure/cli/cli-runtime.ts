import type { LoggerService } from '@nestjs/common';
import { EnvironmentValidationError } from '../config/env-schema';

/**
 * What the out-of-HTTP commands (`pnpm ops:bootstrap`, `pnpm ops:recover`) share at their composition root (ROOT.1):
 * one failure writer, one Nest logger that keeps errors (and their stacks) off the terminal, and one way to recognise
 * an environment that does not validate. Each command keeps its own exit codes and messages.
 */

/** The exit code of a failed command. */
export const CLI_FAILURE_EXIT_CODE = 1;

/** Writes the message as one line to stderr and returns the failure exit code. */
export function writeCliFailure(message: string): number {
  process.stderr.write(`${message}\n`);

  return CLI_FAILURE_EXIT_CODE;
}

/**
 * Warnings only. The errors Nest would log carry stacks (possibly with connection details), and each command reports
 * every failure itself, by message or by error name.
 */
export const quietCliLogger: LoggerService = {
  log: () => undefined,
  error: () => undefined,
  warn: (message: unknown) => {
    process.stderr.write(`warning: ${typeof message === 'string' ? message : 'unexpected warning'}\n`);
  },
};

/**
 * The environment did not validate: the command reports the validator's message, which names keys and never values.
 * Recognised by class: the commands load their module graph with a dynamic import of the same compiled files, so the
 * class the validator throws is this one.
 */
export function isEnvironmentValidationError(error: unknown): error is EnvironmentValidationError {
  return error instanceof EnvironmentValidationError;
}
