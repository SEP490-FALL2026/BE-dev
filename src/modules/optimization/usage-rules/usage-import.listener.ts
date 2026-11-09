import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { describeForOperator } from '../../../infrastructure/observability/operator-error';
import { UsageImportListeners, type UsageImportConfirmedEvent } from '../../usage/public/usage.extension-points';
import { UsageNegationService } from './usage-negation.service';
import { UsageRulesRepo } from './usage-rules.repo';

const USAGE_IMPORT_LISTENER = 'optimization.usage-rules';

/**
 * What the confirmation of a report tells the recommendations of `G3`/`G4` (`US-10-04` AC-5): the usage it brings may disprove one, and that cannot wait
 * for the week. Runs in the transaction of the confirmation, behind a savepoint: a fault of the rules is logged and undone, never the import, and the
 * weekly pass reads the usage again. It only denies or flags: a recommendation is never made between two weekly passes (`US-10-03` AC-12).
 */
@Injectable()
export class UsageImportListener implements OnModuleInit {
  /** The extension points this class registers with (gate extension-wiring, R1). */
  static readonly binds = [UsageImportListeners] as const;
  private readonly logger = new Logger(UsageImportListener.name);

  constructor(
    private readonly negation: UsageNegationService,
    private readonly listeners: UsageImportListeners,
    private readonly rules: UsageRulesRepo,
  ) {}

  onModuleInit(): void {
    this.listeners.add(USAGE_IMPORT_LISTENER, (tx, event) => this.heard(tx, event));
  }

  private async heard(tx: DbTx, event: UsageImportConfirmedEvent): Promise<void> {
    if (event.moment !== 'CONFIRMED') return;
    const fenced = await this.rules.fenced(tx, async () => {
      await this.negation.negateForApplication(tx, event.applicationId, new Date());
    });
    if (!fenced.kept) {
      this.logger.error(
        `Denying the recommendations of application ${event.applicationId} after a report failed: ${describeForOperator(fenced.error)}`,
      );
    }
  }
}
