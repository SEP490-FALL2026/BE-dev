import { InstallationInspectionApi } from '../../modules/installation/public/inspection.api';
import { defineCommand, errorName, runInNestContext, writeCliFailure as fail } from '../run-command';
import { INSPECTION_USAGE, InspectionArgumentError, parseInspectionArguments } from './inspect.arguments';
import { formatInspection, inspectionJson } from './inspect-report';

/** Exit codes are part of the command's contract (see --help). */
const EXIT = { installed: 0, failed: 1, notInstalledOrIncomplete: 2 } as const;

/** `node dist/cli.js inspect` (`pnpm ops:inspect`, alias `dist/inspect-cli.js`). */
export const inspectCommand = defineCommand({
  usage: INSPECTION_USAGE,
  parse: parseInspectionArguments,
  argumentError: InspectionArgumentError,
  crashed: (error) => `The inspection failed: ${errorName(error)}`,
  execute: ({ json }) =>
    runInNestContext({
      // The graph validates the database settings only.
      graph: () => import('../../modules/installation/inspect/inspection.module').then((m) => m.InspectionModule),
      work: async (app) => {
        const inspection = await app.get(InstallationInspectionApi).inspect();

        process.stdout.write(json ? inspectionJson(inspection) : formatInspection(inspection));
        return inspection.status === 'INSTALLED' ? EXIT.installed : EXIT.notInstalledOrIncomplete;
      },
      // Anything else (an unreachable database included) is reported by its name only: no URL, no stack.
      failed: (error) => fail(`The inspection failed: ${errorName(error)}`),
    }),
});
