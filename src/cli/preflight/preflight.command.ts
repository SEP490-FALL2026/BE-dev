import { formatPreflight, preflightJson } from '../../modules/installation/public/migration-preflight-report.mapper';
import { MigrationPreflightApi } from '../../modules/installation/public/migration-preflight.api';
import {
  formatRecoveryTarget,
  RECOVERY_TARGET_EXIT,
  recoveryTargetJson,
} from '../../modules/installation/public/recovery-target.policy';
import { defineCommand, errorName, runInNestContext, writeCliFailure as fail } from '../run-command';
import { parsePreflightArguments, PREFLIGHT_USAGE, PreflightArgumentError } from './preflight.arguments';

/**
 * Exit codes are part of the command's contract (see --help); the deploy workflow stops on anything but 0. With
 * --recovery-target they are those of RECOVERY_TARGET_EXIT (0, 2, 3), and 1 for an error.
 */
const EXIT = { ready: 0, failed: 1, blocked: 2 } as const;

/** The error's name, its code and its first line, with the credentials of a PostgreSQL URL masked. */
function describeFailure(error: unknown): string {
  const code = (error as { code?: string }).code ? ` [${(error as { code: string }).code}]` : '';
  const message =
    error instanceof Error
      ? `: ${error.message.split('\n')[0].replace(/postgresql:\/\/[^@]+@/g, 'postgresql://***@')}`
      : '';
  return `The preflight failed: ${errorName(error)}${code}${message}`;
}

/** `node dist/cli.js preflight` (`pnpm ops:preflight`, alias `dist/migration-preflight-cli.js`). */
export const preflightCommand = defineCommand({
  usage: PREFLIGHT_USAGE,
  parse: parsePreflightArguments,
  argumentError: PreflightArgumentError,
  crashed: describeFailure,
  execute: (parsed) =>
    runInNestContext({
      // The graph validates the database settings only.
      graph: () =>
        import('../../modules/installation/migration-preflight/migration-preflight-cli.module').then(
          (m) => m.MigrationPreflightCliModule,
        ),
      work: async (app) => {
        if ('recoveryTarget' in parsed) {
          // P04-CPE-04 (spec L.12): the way back of a deploy or a rollback, not the judgement before `migrate deploy`.
          const target = await app.get(MigrationPreflightApi).recoveryTarget(parsed.recoveryTarget);
          process.stdout.write(parsed.json ? recoveryTargetJson(target) : formatRecoveryTarget(target));
          return RECOVERY_TARGET_EXIT[target.status];
        }
        const report = await app.get(MigrationPreflightApi).judge();

        process.stdout.write(parsed.json ? preflightJson(report) : formatPreflight(report));
        return report.status === 'READY' ? EXIT.ready : EXIT.blocked;
      },
      failed: (error) => fail(describeFailure(error)),
    }),
});
