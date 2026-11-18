import { PasswordPolicyError } from '../../modules/identity-access/public/identity-access.errors';
import { InstallationApi } from '../../modules/installation/public/installation.api';
import {
  AlreadyInstalledError,
  InstallationInputError,
  StdinPasswordError,
} from '../../modules/installation/public/installation.errors';
import { defineCommand, errorName, runInNestContext, writeCliFailure as fail } from '../run-command';
import { INSTALLATION_USAGE, InstallationArgumentError, parseInstallationArguments } from './bootstrap.arguments';
import { NoTerminalError, PasswordMismatchError, PromptCancelledError, readSuperAdminPassword } from './hidden-prompt';

/** Exit codes are part of the command's contract (see --help). */
const EXIT = { installed: 0, failed: 1, alreadyInstalled: 2, cancelled: 130 } as const;

/** `node dist/cli.js bootstrap` (`pnpm ops:bootstrap`, alias `dist/installation-cli.js`). */
export const bootstrapCommand = defineCommand({
  usage: INSTALLATION_USAGE,
  parse: parseInstallationArguments,
  argumentError: InstallationArgumentError,
  crashed: (error) => `Installation failed: ${errorName(error)}`,
  execute: (parsed) =>
    runInNestContext({
      // The graph validates the database settings and NODE_ENV, nothing else. It is loaded before the prompt so a
      // missing DATABASE_URL is reported without asking for a password first.
      graph: () => import('../../modules/installation/installation.module').then((m) => m.InstallationModule),
      work: async (app) => {
        // The password is the Super Admin's own (FR-8.11(b)): typed twice at a hidden prompt, or — only when the
        // operator opts in with --password-stdin — one bounded record on standard input. Held only in memory, never
        // logged. Without a terminal (and without the switch), or with a malformed record, the command stops before
        // touching anything.
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

        const result = await app.get(InstallationApi).install(parsed.input, password);
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
      },
      failed: (error) => {
        if (error instanceof AlreadyInstalledError) {
          process.stdout.write(`${error.message}\n`);
          return EXIT.alreadyInstalled;
        }
        if (error instanceof InstallationInputError) return fail(error.message);
        if (error instanceof PasswordPolicyError) {
          return fail(`The password does not meet the policy (${error.violation}): 12–128 characters, not the email.`);
        }
        // Anything else is unexpected. Report it without a stack that could carry connection details.
        return fail(`Installation failed; check the installation state before retrying: ${errorName(error)}`);
      },
    }),
});
