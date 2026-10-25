import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { BoundaryVerdict } from './service-account-request.policy';

export interface NewServiceAccountDetail {
  requestId: string;
  purpose: string;
  expectedIdentifier: string;
  responsibleEmployeeId: string;
}

/**
 * The one writer of `access_request_service_accounts`: the detail a request for a service account adds to its request, and
 * the verdict of the IT Admin on its boundary. The database keeps the rest (a verdict is written once, and the detail exists
 * for the requests of this kind and for no other). The request itself is written by the repository of requests, in the same
 * transaction.
 */
@Injectable()
export class ServiceAccountRequestRepo {
  async insert(tx: DbTx, input: NewServiceAccountDetail): Promise<void> {
    await tx.accessRequestServiceAccount.create({
      data: {
        requestId: input.requestId,
        purpose: input.purpose,
        expectedIdentifier: input.expectedIdentifier,
        responsibleEmployeeId: input.responsibleEmployeeId,
      },
    });
  }

  /** Writes the verdict once; the caller holds the lock of the request and has judged that the verdict is still to be given. */
  async recordVerdict(
    tx: DbTx,
    requestId: string,
    verdict: BoundaryVerdict,
    by: { employeeId: string; at: Date; selfExecuted: boolean },
  ): Promise<void> {
    await tx.accessRequestServiceAccount.update({
      where: { requestId },
      data: {
        boundaryState: verdict.state,
        boundaryReason: verdict.reason,
        boundaryDecidedByEmployeeId: by.employeeId,
        boundaryDecidedAt: by.at,
        boundarySelfExecuted: by.selfExecuted,
      },
    });
  }
}
