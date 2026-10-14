import type { INestApplicationContext, LoggerService } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { EnvironmentValidationError } from './infrastructure/config/env-schema';
import { PasswordPolicyError } from './modules/identity-access/errors/identity-access.errors';
import { NoTerminalError, PromptCancelledError, readHiddenLine } from './modules/installation/hidden-prompt';
import {
  INSTALLATION_USAGE,
  InstallationArgumentError,
  parseInstallationArguments,
} from './modules/installation/installation.arguments';
import {
  AlreadyInstalledError,
  InstallationInputError,
  InstallationService,
} from './modules/installation/installation.service';

/** Exit codes are part of the command's contract (see --help). */
const EXIT = { installed: 0, failed: 1, alreadyInstalled: 2, cancelled: 130 } as const;

function fail(message: string): number {
  process.stderr.write(`${message}\n`);
  return EXIT.failed;
}

/**
 * Warnings only. The errors Nest would log carry stacks (possibly with connection details), and
 * main() reports every failure itself, by message or by error name.
 */
const cliLogger: LoggerService = {
  log: () => undefined,
  error: () => undefined,
  warn: (message: unknown) => {
    process.stderr.write(`warning: ${typeof message === 'string' ? message : 'unexpected warning'}\n`);
  },
};

/** The error can come from a second copy of the module graph, so the name is checked as well as the class. */
function isEnvironmentValidationError(error: unknown): error is Error {
  return (
    error instanceof EnvironmentValidationError ||
    (error instanceof Error && error.name === 'EnvironmentValidationError')
  );
}

async function main(): Promise<number> {
  let parsed;
  try {
    parsed = parseInstallationArguments(process.argv.slice(2));
  } catch (error) {
    if (error instanceof InstallationArgumentError) return fail(`${error.message}\n\n${INSTALLATION_USAGE}`);
    throw error;
  }
  if (parsed.help) {
    process.stdout.write(`${INSTALLATION_USAGE}\n`);
    return EXIT.installed;
  }

  let app: INestApplicationContext | undefined;
  try {
    // Loaded only now: the module graph validates the environment (the database settings and
    // NODE_ENV, nothing else), which --help and argument errors must not need. It happens before
    // the prompt so a missing DATABASE_URL is reported without asking for a password first.
    // ConfigModule.forRoot is asynchronous, so a validation error surfaces from
    // createApplicationContext: abortOnError false hands it to the catch below instead of letting
    // Nest print a stack and exit, and the logger below drops Nest's own error output for the same reason.
    const { InstallationModule } = await import('./modules/installation/installation.module');
    app = await NestFactory.createApplicationContext(InstallationModule, {
      logger: cliLogger,
      abortOnError: false,
    });

    // The password is the Super Admin's own (FR-8.11(b)): typed twice at a hidden prompt, held only
    // in memory, never logged. Without a terminal the command stops before touching anything.
    let password: string;
    try {
      process.stdout.write('You are creating the Super Admin account. Choose its password now.\n');
      password = await readHiddenLine(process.stdin, process.stdout, 'Password: ');
      const confirmation = await readHiddenLine(process.stdin, process.stdout, 'Repeat password: ');
      if (password !== confirmation) return fail('The two passwords do not match. Nothing was changed.');
    } catch (error) {
      if (error instanceof NoTerminalError) return fail(error.message);
      if (error instanceof PromptCancelledError) return EXIT.cancelled;
      throw error;
    }

    const result = await app.get(InstallationService).install(parsed.input, password);
    process.stdout.write(
      [
        'Installation complete.',
        `  organizationId:        ${result.organizationId}`,
        `  superAdminAppUserId:   ${result.superAdminAppUserId}`,
        `  itEmployeeId:          ${result.itAdminEmployeeId}`,
        `  correlationId:         ${result.correlationId}`,
        'Next: sign in as the Super Admin; the IT employee has no account yet.',
        '',
      ].join('\n'),
    );
    return EXIT.installed;
  } catch (error) {
    if (isEnvironmentValidationError(error)) return fail(error.message);
    if (error instanceof AlreadyInstalledError) {
      process.stdout.write(`${error.message}\n`);
      return EXIT.alreadyInstalled;
    }
    if (error instanceof InstallationInputError) return fail(error.message);
    if (error instanceof PasswordPolicyError) {
      return fail(`The password does not meet the policy (${error.violation}): 12–128 characters, not the email.`);
    }
    // Anything else is unexpected. Report it without a stack that could carry connection details.
    return fail(
      `Installation failed; check the installation state before retrying: ${error instanceof Error ? error.name : 'unknown error'}`,
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
    process.stderr.write(`Installation failed: ${error instanceof Error ? error.name : 'unknown error'}\n`);
    process.exitCode = EXIT.failed;
  },
);
