import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  isEnvironmentValidationError,
  quietCliLogger,
  writeCliFailure as fail,
} from './infrastructure/cli/cli-runtime';
import { PasswordPolicyError } from './modules/identity-access/identity-access.errors';
import {
  NoTerminalError,
  PasswordMismatchError,
  PromptCancelledError,
  readSuperAdminPassword,
} from './modules/installation/hidden-prompt';
import {
  INSTALLATION_USAGE,
  InstallationArgumentError,
  parseInstallationArguments,
} from './modules/installation/installation.arguments';
import {
  AlreadyInstalledError,
  InstallationInputError,
  StdinPasswordError,
} from './modules/installation/installation.errors';
import { InstallationService } from './modules/installation/installation.service';

/** Exit codes are part of the command's contract (see --help). */
const EXIT = { installed: 0, failed: 1, alreadyInstalled: 2, cancelled: 130 } as const;

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
      logger: quietCliLogger,
      abortOnError: false,
    });

    // The password is the Super Admin's own (FR-8.11(b)): typed twice at a hidden prompt, or — only when the operator
    // opts in with --password-stdin — one bounded record on standard input. Held only in memory, never logged.
    // Without a terminal (and without the switch), or with a malformed record, the command stops before touching anything.
    let password: string;
    try {
      password = await readSuperAdminPassword({
        passwordStdin: parsed.passwordStdin,
        input: process.stdin,
        output: process.stdout,
      });
    } catch (error) {
      if (error instanceof NoTerminalError || error instanceof PasswordMismatchError) return fail(error.message);
      if (error instanceof StdinPasswordError) return fail(`${error.message} Nothing was changed.`);
      if (error instanceof PromptCancelledError) return EXIT.cancelled;
      throw error;
    }

    const result = await app.get(InstallationService).install(parsed.input, password);
    process.stdout.write(
      [
        'Installation complete.',
        `  organizationId:        ${result.organizationId}`,
        `  superAdminAppUserId:   ${result.superAdminAppUserId}`,
        `  correlationId:         ${result.correlationId}`,
        'Next: sign in as the Super Admin. The first department has no Cost Center, head or IT Admin in charge yet: ' +
          'create the other departments, people and accounts in the application; Finance creates a Cost Center for each department.',
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
