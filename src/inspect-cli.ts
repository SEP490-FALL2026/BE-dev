import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  isEnvironmentValidationError,
  quietCliLogger,
  writeCliFailure as fail,
} from './infrastructure/cli/cli-runtime';
import { formatInspection, inspectionJson } from './modules/installation/inspect/inspection-report';
import {
  INSPECTION_USAGE,
  InspectionArgumentError,
  parseInspectionArguments,
} from './modules/installation/inspect/inspection.arguments';
import { InstallationInspectionService } from './modules/installation/inspect/inspection.service';

/** Exit codes are part of the command's contract (see --help). */
const EXIT = { installed: 0, failed: 1, notInstalledOrIncomplete: 2 } as const;

async function main(): Promise<number> {
  let parsed;
  try {
    parsed = parseInspectionArguments(process.argv.slice(2));
  } catch (error) {
    if (error instanceof InspectionArgumentError) return fail(`${error.message}\n\n${INSPECTION_USAGE}`);
    throw error;
  }
  if (parsed.help) {
    process.stdout.write(`${INSPECTION_USAGE}\n`);
    return EXIT.installed;
  }

  let app: INestApplicationContext | undefined;
  try {
    // Loaded only now: the graph validates the database settings, which --help and argument errors must not need.
    const { InspectionModule } = await import('./modules/installation/inspect/inspection.module');
    app = await NestFactory.createApplicationContext(InspectionModule, { logger: quietCliLogger, abortOnError: false });
    const inspection = await app.get(InstallationInspectionService).inspect();

    process.stdout.write(parsed.json ? inspectionJson(inspection) : formatInspection(inspection));
    return inspection.status === 'INSTALLED' ? EXIT.installed : EXIT.notInstalledOrIncomplete;
  } catch (error) {
    if (isEnvironmentValidationError(error)) return fail(error.message);
    // Anything else (an unreachable database included) is reported by its name only: no URL, no stack.
    return fail(`The inspection failed: ${error instanceof Error ? error.name : 'unknown error'}`);
  } finally {
    await app?.close();
  }
}

void main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    process.stderr.write(`The inspection failed: ${error instanceof Error ? error.name : 'unknown error'}\n`);
    process.exitCode = EXIT.failed;
  },
);
