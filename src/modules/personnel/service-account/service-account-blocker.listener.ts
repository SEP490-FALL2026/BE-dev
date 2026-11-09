import { Injectable, OnModuleInit } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { LicensingServiceAccountApi } from '../../licensing/public/licensing-service-account.api';
import { OffboardingBlockerContributions } from '../public/personnel.extension-points';
import { SERVICE_ACCOUNT_UNASSIGNED } from '../public/personnel.types';

/**
 * Keeps the record of a departure open while a service account still has the person who left to answer for it (`US-03-08` AC-1, AC-5,
 * `US-03-04` AC-17): the count is how many open service accounts the person answers for, read when the case is shown or closed. A
 * departure is recorded and takes effect all the same (`QĐ-75e`); only the closing waits.
 */
@Injectable()
export class ServiceAccountBlockerSource implements OnModuleInit {
  /** The extension points this class registers with (gate extension-wiring, R1). */
  static readonly binds = [OffboardingBlockerContributions] as const;

  constructor(
    private readonly blockers: OffboardingBlockerContributions,
    private readonly licensingServiceAccounts: LicensingServiceAccountApi,
  ) {}

  onModuleInit(): void {
    this.blockers.add(SERVICE_ACCOUNT_UNASSIGNED, {
      code: SERVICE_ACCOUNT_UNASSIGNED,
      countFor: (employeeId: string, tx?: DbTx) => this.countOf(employeeId, tx),
    });
  }

  /** How many open service accounts the person still answers for. */
  async countOf(employeeId: string, tx?: DbTx): Promise<number> {
    return (await this.licensingServiceAccounts.listServiceAccountDuties([employeeId], tx)).length;
  }
}
