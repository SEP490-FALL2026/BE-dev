import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { AppliedMigrationRow } from '../public/inspection.types';

/** The migration that marked what the organization already had as told, with the date of the database session. */
export const CHANGE_ANNOUNCEMENTS_MIGRATION = '20261024140100_organization_change_announcements';

/** `prisma/migrations` of this checkout or image: four levels up from both `src/modules/...` and `dist/modules/...`. */
export const MIGRATIONS_DIRECTORY = join(__dirname, '..', '..', '..', '..', 'prisma', 'migrations');

/**
 * Reads what `prisma migrate deploy` recorded. `_prisma_migrations` belongs to Prisma, not to a business module, so
 * no module owns it; this repository only reads it.
 */
@Injectable()
export class MigrationStateRepo {
  /** The committed migration folders, sorted (their names start with the timestamp). */
  committedMigrations(directory: string = MIGRATIONS_DIRECTORY): string[] {
    return readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  }

  /** The rows of `_prisma_migrations`, or null when no migration was ever applied (the table does not exist). */
  async appliedMigrations(tx: DbTx): Promise<AppliedMigrationRow[] | null> {
    const [table] = await tx.$queryRaw<{ present: boolean }[]>`
      SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS present`;
    if (!table.present) return null;

    return tx.$queryRaw<AppliedMigrationRow[]>`
      SELECT migration_name AS name, finished_at IS NOT NULL AS finished, rolled_back_at IS NOT NULL AS "rolledBack"
      FROM _prisma_migrations
      ORDER BY migration_name, started_at`;
  }

  /**
   * When {@link CHANGE_ANNOUNCEMENTS_MIGRATION} finished, or null when `_prisma_migrations` or a finished, not rolled back row
   * of it is not there: a database that never recorded it (baselined) gets no finding, nothing is guessed. The roll-forward
   * migration reads the same row.
   */
  async changeAnnouncementsSeededAt(tx: DbTx): Promise<Date | null> {
    const [table] = await tx.$queryRaw<{ present: boolean }[]>`
      SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS present`;
    if (!table.present) return null;

    const rows = await tx.$queryRaw<{ finishedAt: Date }[]>`
      SELECT finished_at AS "finishedAt" FROM _prisma_migrations
       WHERE migration_name = ${CHANGE_ANNOUNCEMENTS_MIGRATION} AND finished_at IS NOT NULL AND rolled_back_at IS NULL
       ORDER BY finished_at DESC LIMIT 1`;

    return rows[0]?.finishedAt ?? null;
  }
}
