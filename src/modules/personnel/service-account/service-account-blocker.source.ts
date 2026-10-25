import { Injectable, OnModuleInit } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { LicensingService } from '../../licensing/licensing.service';
import { OffboardingBlockerRegistry } from '../offboarding/offboarding-blocker.registry';
import { SERVICE_ACCOUNT_UNASSIGNED } from '../personnel.types';

/**
 * Keeps the record of a departure open while a service account still has the person who left to answer for it (`US-03-08` AC-1, AC-5,
 * `US-03-04` AC-17): the count is how many open service accounts the person answers for, read when the case is shown or closed. A
 * departure is recorded and takes effect all the same (`QĐ-75e`); only the closing waits.
 */
@Injectable()
export class ServiceAccountBlockerSource implements OnModuleInit {
  constructor(
    private readonly registry: OffboardingBlockerRegistry,
    private readonly licensing: LicensingService,
  ) {}

  onModuleInit(): void {
    this.registry.registerBlocker({
      code: SERVICE_ACCOUNT_UNASSIGNED,
      countFor: (employeeId: string, tx?: DbTx) => this.countOf(employeeId, tx),
    });
  }

  /** How many open service accounts the person still answers for. */
  async countOf(employeeId: string, tx?: DbTx): Promise<number> {
    return (await this.licensing.listServiceAccountDuties([employeeId], tx)).length;
  }
}
