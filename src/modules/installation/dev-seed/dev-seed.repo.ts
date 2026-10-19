import { Injectable } from '@nestjs/common';
import { DbTx } from '../../../infrastructure/database/transaction-runner';

/** Next to the installation's key (6_173_204_001): one local seed at a time. */
export const DEV_SEED_ADVISORY_LOCK_KEY = 6_173_204_002;

/** The seed's own lock. No table: every row it writes belongs to the module that owns it. */
@Injectable()
export class DevSeedRepo {
  async lockDevSeed(tx: DbTx): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${DEV_SEED_ADVISORY_LOCK_KEY}::bigint)`;
  }
}
