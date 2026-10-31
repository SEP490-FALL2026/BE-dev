import { Injectable } from '@nestjs/common';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { ServiceAccountDutyService } from '../assignment/service-account-duty/service-account-duty.service';
import type { ServiceAccountDuty } from './licensing-service-account.types';

/**
 * The licensing facade for the open service accounts a person answers for (`US-03-08`).
 */
@Injectable()
export class LicensingServiceAccountApi {
  constructor(private readonly serviceAccountDuties: ServiceAccountDutyService) {}

  /**
   * The open service accounts these people answer for (`US-03-08`): what a transfer or a departure leaves to be handed on, and what
   * keeps the record of either from being closed. A fixed number of statements however many people there are.
   */
  listServiceAccountDuties(employeeIds: readonly string[], tx?: DbTx): Promise<ServiceAccountDuty[]> {
    return this.serviceAccountDuties.openOf(employeeIds, tx);
  }
}
