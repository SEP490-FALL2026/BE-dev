import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { OpenRequestService } from '../access-request/open-request/open-request.service';
import type { OpenRequestOfBeneficiary } from './requests.types';

/**
 * The facade of the requests context that other contexts call. It answers what the personnel context shows beside the record of a
 * departure: the requests of the person that are still open (`US-03-04` AC-24). Nothing it reads is changed by reading it; the one act on
 * a request that follows a departure is the IT Admin's route to close it.
 */
@Injectable()
export class RequestsApi {
  constructor(private readonly open: OpenRequestService) {}

  /**
   * The requests the person is the beneficiary of that are not over (a request of their own that has not ended, or the person's share of
   * a request for a group that has not ended), oldest first, with how many there are in all. The requests that wait for the IT Admin to
   * close the task of a withdrawal are not among them. The cost of a page is the same whatever its size. `filter.departmentId` keeps
   * only the requests that were sent from that department: a person who changed department keeps the open requests of the old one
   * out of the answer of the new head.
   */
  listOpenOfBeneficiary(
    employeeId: string,
    page: { skip: number; take: number },
    tx?: DbTx,
    filter: { departmentId?: string } = {},
  ): Promise<{ items: OpenRequestOfBeneficiary[]; total: number }> {
    return this.open.pageOf(employeeId, page, tx, filter);
  }
}
