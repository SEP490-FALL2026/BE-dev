import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { OrganizationApi } from '../../organization/public/organization.api';
import { RequestOutcomeListeners, type RequestOutcomeEvent } from '../public/requests.extension-points';

/** The request an outcome is about: only what the listeners are told of it. */
export interface OutcomeSubject {
  id: string;
  organizationId: string;
  /** The department the request was sent from. */
  departmentId: string;
  planId: string | null;
}

/**
 * Tells the contexts that listen how a request ended for its people (`RequestOutcomeListeners`), in the transaction of the end.
 * Every service that ends a request, or one line of a request for a group, tells it here in the same transaction: the grant that
 * completes says `granted`, every other end says `ended`. With nobody listening nothing is read and nothing is written. A request for
 * one person is one event; a request for a group is one event for each person whose line ends, each naming only that person.
 */
@Injectable()
export class RequestOutcomeService {
  constructor(
    private readonly listeners: RequestOutcomeListeners,
    private readonly organization: OrganizationApi,
  ) {}

  /** The grant of the request completed for these people: the seat is real. */
  granted(tx: DbTx, request: OutcomeSubject, employeeIds: readonly string[], now: Date): Promise<void> {
    return this.tell(tx, request, employeeIds, 'GRANTED', now);
  }

  /** The request ended for these people without a grant: refused, withdrawn, cancelled, failed, left out or closed for a transfer. */
  ended(tx: DbTx, request: OutcomeSubject, employeeIds: readonly string[], now: Date): Promise<void> {
    return this.tell(tx, request, employeeIds, 'ENDED_WITHOUT_GRANT', now);
  }

  private async tell(
    tx: DbTx,
    request: OutcomeSubject,
    employeeIds: readonly string[],
    outcome: RequestOutcomeEvent['outcome'],
    now: Date,
  ): Promise<void> {
    if (this.listeners.names().length === 0 || employeeIds.length === 0) return;

    await this.listeners.emit(tx, {
      organizationId: request.organizationId,
      requestId: request.id,
      departmentId: request.departmentId,
      planId: request.planId,
      beneficiaryEmployeeIds: [...new Set(employeeIds)].sort(),
      outcome,
      endedOn: await this.organization.businessToday(now, tx),
    });
  }
}
