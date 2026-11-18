import { Injectable } from '@nestjs/common';
import { DbTx } from '../../infrastructure/database/transaction-runner';

/** Fixed key so two installers, anywhere, queue on the same lock. */
const INSTALLATION_ADVISORY_LOCK_KEY = 6_173_204_001;

/**
 * The installation's own database access. It owns no table: it holds only the transaction-scoped advisory lock that
 * makes two installers run one after the other. The rows the installation writes belong to the modules that own them.
 */
@Injectable()
export class InstallationRepo {
  /** Waits for, then takes, the installation lock until the transaction ends (`pg_advisory_xact_lock`). */
  async lockInstallation(tx: DbTx): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${INSTALLATION_ADVISORY_LOCK_KEY}::bigint)`;
  }
}
