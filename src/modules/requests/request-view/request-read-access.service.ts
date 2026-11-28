import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { BudgetsApi } from '../../budgets/public/budgets.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { canReadRequest, viewFactsOf, type ReadAccess, type ViewFacts } from '../access-request/access-request.policy';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { RequestTicketNotFoundError } from '../request-ticket/request-ticket.errors';
import { orderByPosition } from '../request-ticket/request-ticket.policy';
import { RequestTicketRepo } from '../request-ticket/request-ticket.repo';
import { RequestReadRepo } from './request-read.repo';

/** What a reader of one request is judged on before the facts that cost a read are loaded. */
export interface ReadSubject extends ViewFacts {
  id: string;
  isGroup: boolean;
  departmentId: string;
  /** Known already by the caller (the steps it read); loaded here when absent. */
  spendStepOpened?: boolean;
}

export interface VisibleTicket {
  ticket: { id: string; requesterEmployeeId: string };
  items: { requestId: string; position: number }[];
  records: AccessRequestRecord[];
  visibleIds: Set<string>;
}

/**
 * Who reads one request (its detail, its time, its people, its history), by `canReadRequest`. The facts that cost a read are loaded
 * only for a caller whose role could open the request through them: the department headed today for a head, how far the request went
 * for a spending approver or Finance. Finance also reads a request that holds a commitment the way the budgets module tells it.
 */
@Injectable()
export class RequestReadAccessService {
  constructor(
    private readonly repo: RequestReadRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly budgets: BudgetsApi,
    private readonly runner: TransactionRunner,
    private readonly tickets: RequestTicketRepo,
    private readonly requests: AccessRequestRepo,
  ) {}

  async accessOf(actor: AuthenticatedPrincipal, subject: ReadSubject, tx?: DbTx): Promise<ReadAccess> {
    const facts = {
      ...subject,
      actorHeadsDepartmentId: null,
      spendStepOpened: subject.spendStepOpened ?? false,
      spendApproved: false,
    };
    const first = canReadRequest(actor, facts);
    if (first.read && first.onlyLineOf === null) return first;

    const { roles } = actor;
    const heads = roles.includes('MANAGER')
      ? await this.organizationReads.getHeadedDepartment(actor.employeeId, undefined, tx)
      : null;
    const money = roles.includes('SPENDING_APPROVER') || roles.includes('FINANCE');
    const spend = money
      ? await this.repo.spendFactsOf(subject.id, tx)
      : { spendStepOpened: false, spendApproved: false };
    const spendApproved =
      spend.spendApproved || (roles.includes('FINANCE') && (await this.budgets.requestHoldsCommitment(subject.id)));

    return canReadRequest(actor, {
      ...facts,
      actorHeadsDepartmentId: heads?.departmentId ?? null,
      spendStepOpened: facts.spendStepOpened || spend.spendStepOpened,
      spendApproved,
    });
  }

  /** Returns the IDs of the records visible to `actor` under `accessOf`. */
  async visibleItemIds(
    actor: AuthenticatedPrincipal,
    records: readonly AccessRequestRecord[],
    tx?: DbTx,
  ): Promise<Set<string>> {
    const visible = new Set<string>();
    for (const record of records) {
      const access = await this.accessOf(
        actor,
        {
          ...viewFactsOf(record),
          id: record.id,
          isGroup: record.type === 'GROUP_GRANT',
          departmentId: record.departmentId,
        },
        tx,
      );
      if (access.read) visible.add(record.id);
    }
    return visible;
  }

  /**
   * Loads a ticket's items, request records, and caller-visible item IDs inside one consistent transaction.
   * Throws RequestTicketNotFoundError when the ticket has no items or none are visible to the caller.
   */
  async visibleTicket(actor: AuthenticatedPrincipal, ticketId: string, tx?: DbTx): Promise<VisibleTicket> {
    const load = async (t: DbTx): Promise<VisibleTicket> => {
      const ticket = await this.tickets.summaryWithItems(t, ticketId);
      if (!ticket || ticket.items.length === 0) throw new RequestTicketNotFoundError();
      const ordered = orderByPosition(ticket.items);
      const records = await this.requests.findByIds(
        ordered.map((item) => item.requestId),
        t,
      );
      if (records.length === 0) throw new RequestTicketNotFoundError();
      const visibleIds = await this.visibleItemIds(actor, records, t);
      if (visibleIds.size === 0) throw new RequestTicketNotFoundError();

      return {
        ticket: { id: ticket.id, requesterEmployeeId: ticket.requesterEmployeeId },
        items: ordered,
        records,
        visibleIds,
      };
    };

    return tx ? load(tx) : this.runner.run(load);
  }
}
