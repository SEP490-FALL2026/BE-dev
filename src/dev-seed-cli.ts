import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  isEnvironmentValidationError,
  quietCliLogger,
  writeCliFailure as fail,
} from './infrastructure/cli/cli-runtime';
import { formatSeedResult } from './modules/installation/dev-seed/dev-seed-report';
import {
  DEV_SEED_USAGE,
  DevSeedArgumentError,
  parseDevSeedArguments,
} from './modules/installation/dev-seed/dev-seed.arguments';
import { DevSeedService } from './modules/installation/dev-seed/dev-seed.service';

/** Exit codes are part of the command's contract (see --help). */
const EXIT = { created: 0, failed: 1, alreadyPresent: 2, refused: 3 } as const;

async function main(): Promise<number> {
  let parsed;
  try {
    parsed = parseDevSeedArguments(process.argv.slice(2));
  } catch (error) {
    if (error instanceof DevSeedArgumentError) return fail(`${error.message}\n\n${DEV_SEED_USAGE}`);
    throw error;
  }
  if (parsed.help) {
    process.stdout.write(`${DEV_SEED_USAGE}\n`);
    return EXIT.created;
  }

  let app: INestApplicationContext | undefined;
  try {
    // Loaded only now: the graph validates the database settings, which --help and argument errors must not need.
    const { DevSeedModule } = await import('./modules/installation/dev-seed/dev-seed.module');
    app = await NestFactory.createApplicationContext(DevSeedModule, { logger: quietCliLogger, abortOnError: false });
    const result = await app.get(DevSeedService).seed({ confirmLocal: parsed.confirmLocal });
    const output = formatSeedResult(result);

    process.stdout.write(output.stdout);
    process.stderr.write(output.stderr);
    return result.outcome === 'CREATED'
      ? EXIT.created
      : result.outcome === 'ALREADY_PRESENT'
        ? EXIT.alreadyPresent
        : EXIT.refused;
  } catch (error) {
    if (isEnvironmentValidationError(error)) return fail(error.message);
    // Anything else rolled back; it is reported by its name only (no URL, no stack, no password).
    return fail(`The seed failed and wrote nothing: ${error instanceof Error ? error.name : 'unknown error'}`);
  } finally {
    await app?.close();
  }
}

void main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    process.stderr.write(`The seed failed: ${error instanceof Error ? error.name : 'unknown error'}\n`);
    process.exitCode = EXIT.failed;
  },
);
