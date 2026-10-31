import type { INestApplicationContext, LoggerService, Type } from '@nestjs/common';
import { EnvironmentValidationError } from '../infrastructure/config/env-schema';

/**
 * What every out-of-HTTP command (`node dist/cli.js <command>`, `pnpm ops:*`, `pnpm dev:seed`) shares: `--help`, an
 * argument error printed with the usage, the Nest graph loaded only when the command runs (so `--help` and argument errors
 * need no database settings), a quiet logger, an environment that does not validate reported by its message, any other
 * failure reported by the command (by error name: no URL, no stack), `app.close()`. Each command keeps its own exit
 * codes and messages; `src/cli.ts` sets `process.exitCode`.
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

/** The name of an error, never its message or stack (either may carry connection details). */
export function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown error';
}

/** A command as `src/cli.ts` runs it: the words after the command name in, the exit code out. Never rejects. */
export interface Command {
  run(argv: readonly string[]): Promise<number>;
}

type Parsed = { help: true } | { help: false };

export interface CommandDefinition<A extends Parsed> {
  /** What `--help` prints, and what follows an argument error. */
  usage: string;
  /** Turns the words after the command name into its arguments; throws `argumentError` for a bad command line. */
  parse(argv: readonly string[]): A;
  /** The error `parse` throws for a bad command line: its message and the usage go to stderr, exit 1. */
  argumentError: abstract new (...args: never[]) => Error;
  /** Runs the command on parsed arguments (not `--help`) and returns its exit code. */
  execute(args: Exclude<A, { help: true }>): Promise<number>;
  /** The one line written when the command throws outside its own error handling (exit 1). */
  crashed(error: unknown): string;
}

/** `--help` exits with 0: every command's success code. */
const HELP_EXIT_CODE = 0;

export function defineCommand<A extends Parsed>(definition: CommandDefinition<A>): Command {
  return {
    run: (argv) =>
      main(definition, argv).catch((error: unknown) => {
        process.stderr.write(`${definition.crashed(error)}\n`);
        return CLI_FAILURE_EXIT_CODE;
      }),
  };
}

async function main<A extends Parsed>(definition: CommandDefinition<A>, argv: readonly string[]): Promise<number> {
  let parsed: A;
  try {
    parsed = definition.parse(argv);
  } catch (error) {
    if (error instanceof definition.argumentError) return writeCliFailure(`${error.message}\n\n${definition.usage}`);
    throw error;
  }
  if (parsed.help) {
    process.stdout.write(`${definition.usage}\n`);
    return HELP_EXIT_CODE;
  }

  return definition.execute(parsed as Exclude<A, { help: true }>);
}

export interface NestCommandRun {
  /**
   * The command's Nest module, imported only now: the graph validates the environment, which `--help` and argument
   * errors must not need. `ConfigModule.forRoot` is asynchronous, so a validation error surfaces from
   * `createApplicationContext`: `abortOnError: false` hands it to this runner instead of letting Nest print a stack and
   * exit, and the quiet logger drops Nest's own error output for the same reason.
   */
  graph: () => Promise<Type<unknown>>;
  /** What the command does in its application context; returns the exit code. */
  work: (app: INestApplicationContext) => Promise<number>;
  /** Any failure but an environment that does not validate (printed as it is, exit 1): what to print, the exit code. */
  failed: (error: unknown) => number;
}

/** Opens the command's application context, runs `work` in it and always closes it. */
export async function runInNestContext({ graph, work, failed }: NestCommandRun): Promise<number> {
  let app: INestApplicationContext | undefined;
  try {
    const { NestFactory } = await import('@nestjs/core');
    app = await NestFactory.createApplicationContext(await graph(), { logger: quietCliLogger, abortOnError: false });

    return await work(app);
  } catch (error) {
    if (isEnvironmentValidationError(error)) return writeCliFailure(error.message);

    return failed(error);
  } finally {
    await app?.close();
  }
}
