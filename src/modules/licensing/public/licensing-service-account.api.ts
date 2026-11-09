import { Injectable } from '@nestjs/common';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { ServiceAccountDutyService } from '../assignment/service-account-duty/service-account-duty.service';
import type { PendingPersonnelFile, ServiceAccountDuty } from './licensing-service-account.types';

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

  /**
   * Tells the IT Admin in charge of each department that owns one of these accounts, in the caller's transaction, that the person who
   * answers for them has a file that takes effect on `file.dueOn` (`US-03-08` AC-1, AC-5): once for the file and the day. Returns how
   * many notices were new; a department with nobody in charge tells nobody.
   */
  remindServiceAccountDuties(
    tx: DbTx,
    input: { organizationId: string; file: PendingPersonnelFile; duties: readonly ServiceAccountDuty[] },
  ): Promise<number> {
    return this.serviceAccountDuties.remind(tx, input.organizationId, input.file, input.duties);
  }
}
