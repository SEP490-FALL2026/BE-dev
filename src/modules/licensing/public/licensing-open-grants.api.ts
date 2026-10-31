import { Injectable } from '@nestjs/common';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { OpenGrantTaskService } from '../provisioning/open-grants/open-grant-task.service';
import type { OpenGrantTask } from './licensing-open-grants.types';

/**
 * The licensing facade for the grant tasks of a person that are not finished (`US-03-04` AC-24).
 */
@Injectable()
export class LicensingOpenGrantsApi {
  constructor(private readonly openGrants: OpenGrantTaskService) {}

  /**
   * The grant tasks of a person that are not finished (queued, waiting for a retry, being worked or failed), oldest first, with the
   * plan of each and the total (`US-03-04` AC-24). Nothing here changes a task. The cost of a page is the same whatever its size.
   */
  listOpenGrantTasksOfBeneficiary(
    employeeId: string,
    page: { skip: number; take: number },
    tx?: DbTx,
  ): Promise<{ items: OpenGrantTask[]; total: number }> {
    return this.openGrants.pageOf(employeeId, page, tx);
  }
}
