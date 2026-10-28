import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  isEnvironmentValidationError,
  quietCliLogger,
  writeCliFailure as fail,
} from './infrastructure/cli/cli-runtime';
import { formatPreflight, preflightJson } from './modules/installation/migration-preflight/migration-preflight-report';
import {
  parsePreflightArguments,
  PREFLIGHT_USAGE,
  PreflightArgumentError,
} from './modules/installation/migration-preflight/migration-preflight.arguments';
import { MigrationPreflightService } from './modules/installation/migration-preflight/migration-preflight.service';
import {
  formatRecoveryTarget,
  RECOVERY_TARGET_EXIT,
  recoveryTargetJson,
} from './modules/installation/migration-preflight/recovery-target';

/**
 * Exit codes are part of the command's contract (see --help); the deploy workflow stops on anything but 0. With
 * --recovery-target they are those of RECOVERY_TARGET_EXIT (0, 2, 3), and 1 for an error.
 */
const EXIT = { ready: 0, failed: 1, blocked: 2 } as const;

async function main(): Promise<number> {
  let parsed;
  try {
    parsed = parsePreflightArguments(process.argv.slice(2));
  } catch (error) {
    if (error instanceof PreflightArgumentError) return fail(`${error.message}\n\n${PREFLIGHT_USAGE}`);
    throw error;
  }
  if (parsed.help) {
    process.stdout.write(`${PREFLIGHT_USAGE}\n`);
    return EXIT.ready;
  }

  let app: INestApplicationContext | undefined;
  try {
    // Loaded only now: the graph validates the database settings, which --help and argument errors must not need.
    const { MigrationPreflightModule } =
      await import('./modules/installation/migration-preflight/migration-preflight.module');
    app = await NestFactory.createApplicationContext(MigrationPreflightModule, {
      logger: quietCliLogger,
      abortOnError: false,
    });
    if ('recoveryTarget' in parsed) {
      // P04-CPE-04 (spec L.12): the way back of a deploy or a rollback, not the judgement before `migrate deploy`.
      const target = await app.get(MigrationPreflightService).recoveryTarget(parsed.recoveryTarget);
      process.stdout.write(parsed.json ? recoveryTargetJson(target) : formatRecoveryTarget(target));
      return RECOVERY_TARGET_EXIT[target.status];
    }
    const report = await app.get(MigrationPreflightService).judge();

    process.stdout.write(parsed.json ? preflightJson(report) : formatPreflight(report));
    return report.status === 'READY' ? EXIT.ready : EXIT.blocked;
  } catch (error) {
    if (isEnvironmentValidationError(error)) return fail(error.message);
    const code = (error as { code?: string }).code ? ` [${(error as { code: string }).code}]` : '';
    const message =
      error instanceof Error
        ? `: ${error.message.split('\n')[0].replace(/postgresql:\/\/[^@]+@/g, 'postgresql://***@')}`
        : '';
    return fail(`The preflight failed: ${error instanceof Error ? error.name : 'unknown error'}${code}${message}`);
  } finally {
    await app?.close();
  }
}

void main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    const code = (error as { code?: string }).code ? ` [${(error as { code: string }).code}]` : '';
    const message =
      error instanceof Error
        ? `: ${error.message.split('\n')[0].replace(/postgresql:\/\/[^@]+@/g, 'postgresql://***@')}`
        : '';
    process.stderr.write(
      `The preflight failed: ${error instanceof Error ? error.name : 'unknown error'}${code}${message}\n`,
    );
    process.exitCode = EXIT.failed;
  },
);
