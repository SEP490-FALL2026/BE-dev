import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  isEnvironmentValidationError,
  quietCliLogger,
  writeCliFailure as fail,
} from './infrastructure/cli/cli-runtime';
import {
  DIRECTION_USAGE,
  DirectionArgumentError,
  parseDirectionArguments,
} from './modules/organization/cost-center-direction/cost-center-direction.arguments';
import { DirectionRefusedError } from './modules/organization/cost-center-direction/cost-center-direction.errors';
import { CostCenterDirectionService } from './modules/organization/cost-center-direction/cost-center-direction.service';

/** Exit codes are part of the command's contract (see --help). */
const EXIT = { done: 0, failed: 1, nothingToDo: 2 } as const;

async function main(): Promise<number> {
  let parsed;
  try {
    parsed = parseDirectionArguments(process.argv.slice(2));
  } catch (error) {
    if (error instanceof DirectionArgumentError) return fail(`${error.message}\n\n${DIRECTION_USAGE}`);
    throw error;
  }
  if (parsed.help) {
    process.stdout.write(`${DIRECTION_USAGE}\n`);
    return EXIT.done;
  }

  let app: INestApplicationContext | undefined;
  try {
    // Loaded only now: the graph validates the database settings, which --help and argument errors must not need.
    const { CostCenterDirectionCliModule } = await import('./cost-center-direction-cli.module');
    app = await NestFactory.createApplicationContext(CostCenterDirectionCliModule, {
      logger: quietCliLogger,
      abortOnError: false,
    });
    const service = app.get(CostCenterDirectionService);

    if (parsed.mode === 'activate') {
      const result = await service.activate(parsed.command);
      process.stdout.write(
        [
          'mode:         activate',
          `organization: ${result.organizationId}`,
          `outcome:      ${result.outcome}`,
          result.outcome === 'ACTIVATED'
            ? 'The activation is recorded. A department can now be created without a Cost Center.'
            : 'This installation was already activated. Nothing was changed.',
          '',
        ].join('\n'),
      );

      return result.outcome === 'ACTIVATED' ? EXIT.done : EXIT.nothingToDo;
    }

    const result = await service.link(parsed.command);
    process.stdout.write(
      [
        'mode:         link',
        `cost-center:  ${result.costCenterId}`,
        `department:   ${result.departmentId}`,
        `outcome:      ${result.outcome}`,
        result.outcome === 'LINKED'
          ? 'The basis is recorded. The next preflight no longer lists this Cost Center.'
          : 'This Cost Center was already linked to that department. Nothing was changed.',
        '',
      ].join('\n'),
    );

    return result.outcome === 'LINKED' ? EXIT.done : EXIT.nothingToDo;
  } catch (error) {
    if (isEnvironmentValidationError(error)) return fail(error.message);
    if (error instanceof DirectionRefusedError) return fail(`Refused (${error.problem}). Nothing was changed.`);

    return fail(
      `The command failed; check the state before running it again: ${error instanceof Error ? error.name : 'unknown error'}`,
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
    process.stderr.write(`The command failed: ${error instanceof Error ? error.name : 'unknown error'}\n`);
    process.exitCode = EXIT.failed;
  },
);
