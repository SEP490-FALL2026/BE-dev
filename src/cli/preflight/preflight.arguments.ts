import { parseArgs } from 'node:util';
import { RecoveryTargetLabelsError } from '../../modules/installation/public/installation.errors';
import { readsOfLabels } from '../../modules/installation/public/recovery-target.policy';

export class PreflightArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PreflightArgumentError';
  }
}

export const PREFLIGHT_USAGE = `Usage: pnpm ops:preflight [--json]
       pnpm ops:preflight --recovery-target <labels> [--json]

Judges, before \`prisma migrate deploy\`, whether the migration history can carry this database to Cost Centers that are
Units only (migration 20261022120000_cost_centers_unit_only, kept as merged, and the forward migration
20261023100000_service_account_owner_on_recorded_day), and whether what the migrations of this release need is in place: the
expansion of the compatibility release, the owner department of every subscription, the department and the activation of
every Cost Center, no waiting row of a kind that is gone, and no budget proposal that cannot be reconciled. Each one that is
not is a blocker, named by id only. A database that is empty, or already fully migrated, is ready.
Changes nothing: every database session is read-only. Reads the database settings only (NODE_ENV, DATABASE_URL, DB_*).

Options
  --json    One JSON object instead of the text report (same status and rows)
  --recovery-target <labels>
            Judges something else (P04-CPE-04): whether the runtime image whose labels these are — the JSON that
            \`docker image inspect --format '{{json .Config.Labels}}' <image>\` prints — can serve this database as it is now,
            the way back of a deploy (scripts/ops/deploy-release.sh) or of a rollback by hand. An image declares in its label
            the data representations it reads; an image built before that label declares none. Prints each representation
            this database holds rows of, with the count. Exit 0 it can; 2 it cannot read rows this database holds — do not
            bring it back, fix forward; 3 no migration was ever applied here, so no release ran on this database and no image
            is its way back; 1 error.
  --help

Exit codes: 0 ready, deploy may run · 2 blocked, do not deploy (every blocked row is named) · 1 error.`;

const OPTIONS = {
  json: { type: 'boolean' },
  help: { type: 'boolean' },
  'recovery-target': { type: 'string' },
} as const;

export type ParsedPreflightArguments =
  { help: true } | { help: false; json: boolean } | { help: false; json: boolean; recoveryTarget: string[] };

/** `--json`, `--recovery-target <labels>`, `--help`; anything else is refused. A leading `--` (forwarded by pnpm) is ignored. */
export function parsePreflightArguments(argv: readonly string[]): ParsedPreflightArguments {
  const args = argv[0] === '--' ? argv.slice(1) : [...argv];
  let values: { json?: boolean; help?: boolean; 'recovery-target'?: string };
  try {
    values = parseArgs({ args, options: OPTIONS, allowPositionals: false, strict: true }).values;
  } catch (error) {
    throw new PreflightArgumentError(error instanceof Error ? error.message : String(error));
  }
  if (values.help) return { help: true };
  const json = values.json === true;
  if (values['recovery-target'] === undefined) return { help: false, json };

  try {
    return { help: false, json, recoveryTarget: readsOfLabels(values['recovery-target']) };
  } catch (error) {
    if (error instanceof RecoveryTargetLabelsError) throw new PreflightArgumentError(error.message);
    throw error;
  }
}
