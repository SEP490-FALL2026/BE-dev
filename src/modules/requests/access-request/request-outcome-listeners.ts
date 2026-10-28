import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { OrganizationService } from '../../organization/organization.service';
import type { RequestOutcomeEvent, RequestOutcomeListener } from '../requests.types';

/** The request an outcome is about: only what the listeners are told of it. */
export interface OutcomeSubject {
  id: string;
  organizationId: string;
  /** The department the request was sent from. */
  departmentId: string;
  planId: string | null;
}

/**
 * The contexts that hear how a request ended for its people, told in the transaction of the end (`RequestOutcomeListener`, F43). The
 * personnel context registers its listener through the facade `RequestsService.registerOutcomeListener` when it starts, so requests
 * never import it. Every service that ends a request, or one line of a request for a group, tells it here in the same transaction:
 * the grant that completes says `granted`, every other end says `ended`. With nobody listening nothing is read and nothing is
 * written. A request for one person is one event; a request for a group is one event for each person whose line ends, each naming
 * only that person.
 */
@Injectable()
export class RequestOutcomeListeners {
  private readonly listeners: RequestOutcomeListener[] = [];

  constructor(private readonly organization: OrganizationService) {}

  register(listener: RequestOutcomeListener): void {
    this.listeners.push(listener);
  }

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
    if (this.listeners.length === 0 || employeeIds.length === 0) return;

    const event: RequestOutcomeEvent = {
      organizationId: request.organizationId,
      requestId: request.id,
      departmentId: request.departmentId,
      planId: request.planId,
      beneficiaryEmployeeIds: [...new Set(employeeIds)].sort(),
      outcome,
      endedOn: await this.organization.businessToday(now, tx),
    };
    for (const listener of this.listeners) await listener.requestOutcome(tx, event);
  }
}
