import type { Command } from './run-command';

/**
 * The out-of-HTTP commands: the one list `src/cli.ts` dispatches on and `scripts/build/emit-cli-aliases.mjs` writes the
 * old entry files from. A command's code lives in `src/cli/<name>/`; `load` imports it only when it runs, so
 * reading this table loads no command, module graph or environment.
 */
export interface CommandEntry {
  /** `node dist/cli.js <name>`; also `pnpm ops:<name>` (`pnpm dev:seed` for dev-seed). */
  readonly name: string;
  /** One line for `node dist/cli.js --help`. */
  readonly description: string;
  /**
   * The old entry `dist/<alias>.js`, written at build time and kept forever: images, `scripts/ops/*.sh` and the
   * operations guides call it inside running images, older ones included.
   */
  readonly alias: string;
  readonly load: () => Promise<Command>;
}

export const COMMANDS: readonly CommandEntry[] = [
  {
    name: 'bootstrap',
    description: 'Create the first organization, its first department and the Super Admin, once.',
    alias: 'installation-cli',
    load: () => import('./bootstrap/bootstrap.command').then((m) => m.bootstrapCommand),
  },
  {
    name: 'recover',
    description: 'Recover the Super Admin role outside the application, under an approved ticket.',
    alias: 'recovery-cli',
    load: () => import('./recover/recover.command').then((m) => m.recoverCommand),
  },
  {
    name: 'record-super-admin-event',
    description: 'Record a personnel event about the Super Admin, under an approved ticket.',
    alias: 'super-admin-event-cli',
    load: () =>
      import('./record-super-admin-event/record-super-admin-event.command').then((m) => m.recordSuperAdminEventCommand),
  },
  {
    name: 'inspect',
    description: 'Report the installation state, read-only.',
    alias: 'inspect-cli',
    load: () => import('./inspect/inspect.command').then((m) => m.inspectCommand),
  },
  {
    name: 'preflight',
    description: 'Judge whether the database may be migrated, or served again by an image; read-only.',
    alias: 'migration-preflight-cli',
    load: () => import('./preflight/preflight.command').then((m) => m.preflightCommand),
  },
  {
    name: 'assign-subscription-owner',
    description: 'Give one existing subscription its owner department, on an approved basis.',
    alias: 'subscription-owner-assignment-cli',
    load: () =>
      import('./assign-subscription-owner/assign-subscription-owner.command').then(
        (m) => m.assignSubscriptionOwnerCommand,
      ),
  },
  {
    name: 'cost-center-direction',
    description: 'Activate the Cost Center direction, or link one Cost Center to its department.',
    alias: 'cost-center-direction-cli',
    load: () =>
      import('./cost-center-direction/cost-center-direction.command').then((m) => m.costCenterDirectionCommand),
  },
  {
    name: 'ai-purge',
    description: 'Delete the content of the AI calls up to a day, keeping the calls (dry run unless --apply).',
    alias: 'ai-purge-cli',
    load: () => import('./ai-purge/ai-purge.command').then((m) => m.aiPurgeCommand),
  },
  {
    name: 'db-roles',
    description: 'Provision, reconcile or verify the PostgreSQL roles (H7).',
    alias: 'database-roles-cli',
    load: () => import('./db-roles/db-roles.command').then((m) => m.dbRolesCommand),
  },
  {
    name: 'demo-dataset',
    description: 'Write a versioned demo dataset through the API of a running installation (plan, then apply).',
    alias: 'demo-dataset-cli',
    load: () => import('./demo-dataset/demo-dataset.command').then((m) => m.demoDatasetCommand),
  },
  {
    name: 'dev-seed',
    description: 'Write the local demo data (local databases only, --confirm-local).',
    alias: 'dev-seed-cli',
    load: () => import('./dev-seed/dev-seed.command').then((m) => m.devSeedCommand),
  },
];
