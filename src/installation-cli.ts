import { NestFactory } from '@nestjs/core';
import { PasswordPolicyError } from './modules/identity-access/errors/identity-access.errors';
import { NoTerminalError, PromptCancelledError, readHiddenLine } from './modules/installation/hidden-prompt';
import {
  INSTALLATION_USAGE,
  InstallationArgumentError,
  parseInstallationArguments,
} from './modules/installation/installation.arguments';
import { InstallationModule } from './modules/installation/installation.module';
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

  const app = await NestFactory.createApplicationContext(InstallationModule, { logger: ['error', 'warn'] });
  try {
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
      `Installation failed and nothing was written: ${error instanceof Error ? error.name : 'unknown error'}`,
    );
  } finally {
    await app.close();
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
