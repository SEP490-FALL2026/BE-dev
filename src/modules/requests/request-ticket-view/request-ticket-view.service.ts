import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { TicketWire } from '../request-ticket/request-ticket.dto';
import { RequestTicketNotFoundError } from '../request-ticket/request-ticket.errors';
import { toTicketWire } from '../request-ticket/request-ticket.mapper';
import { RequestTicketRepo } from '../request-ticket/request-ticket.repo';
import type {
  RequestTicketItemRawView,
  RequestTicketRawView,
  RequestTicketView,
} from '../request-ticket/request-ticket.types';
import { RequestReadAccessService } from '../request-view/request-read-access.service';

function toItemView(
  item: RequestTicketItemRawView,
  employeeMap: ReadonlyMap<string, { id: string; fullName: string }>,
  planMap: ReadonlyMap<string, { planId: string; planName: string }>,
) {
  const plan = planMap.get(item.planId);
  if (!plan) throw new Error(`The plan ${item.planId} of ticket item ${item.requestId} does not exist.`);

  const author = item.latestReply ? employeeMap.get(item.latestReply.authorEmployeeId) : undefined;
  if (item.latestReply && !author) {
    throw new Error(`The reply author ${item.latestReply.authorEmployeeId} of ${item.requestId} does not exist.`);
  }

  return {
    position: item.position,
    requestId: item.requestId,
    plan: { id: plan.planId, name: plan.planName },
    state: item.state,
    termMonths: item.termMonths,
    routingMode: item.routingMode,
    latestReply:
      item.latestReply && author
        ? {
            kind: item.latestReply.kind,
            note: item.latestReply.note,
            author: { id: author.id, name: author.fullName },
            createdAt: item.latestReply.createdAt,
          }
        : null,
  };
}

/**
 * Ticket detail reader: returns the ticket with only the items the caller may read, while preserving ticket-wide status.
 * Lock order: read-only service, acquires no row locks.
 */
@Injectable()
export class RequestTicketViewService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly tickets: RequestTicketRepo,
    private readonly readAccess: RequestReadAccessService,
    private readonly organizationReads: OrganizationReadApi,
    private readonly catalog: CatalogApi,
  ) {}

  async get(actor: AuthenticatedPrincipal, ticketId: string): Promise<TicketWire> {
    const { rawView, visibleIds } = await this.runner.run(async (tx) => {
      const rawView = await this.tickets.view(tx, ticketId);
      if (!rawView) throw new RequestTicketNotFoundError();
      const { visibleIds } = await this.readAccess.visibleTicket(actor, ticketId, tx);
      return { rawView, visibleIds };
    });

    return toTicketWire(await this.assembleView(rawView), visibleIds);
  }

  private async assembleView(raw: RequestTicketRawView): Promise<RequestTicketView> {
    const employeeIds = [
      ...new Set([
        raw.requesterEmployeeId,
        ...raw.items.flatMap((item) => (item.latestReply ? [item.latestReply.authorEmployeeId] : [])),
      ]),
    ];
    const planIds = [...new Set(raw.items.map((item) => item.planId))];
    const [employees, department, plans] = await Promise.all([
      this.organizationReads.getEmployees(employeeIds),
      this.organizationReads.getDepartmentBrief(raw.departmentId),
      planIds.length === 0 ? Promise.resolve([]) : this.catalog.getPlanSummaries(planIds),
    ]);

    const employeeMap = new Map(employees.map((employee) => [employee.id, employee]));
    const planMap = new Map(plans.map((plan) => [plan.planId, plan]));
    const requester = employeeMap.get(raw.requesterEmployeeId);
    if (!requester || !department) {
      throw new Error(`The ticket ${raw.id} points at a missing requester or department.`);
    }

    return {
      id: raw.id,
      requester: {
        employeeId: requester.id,
        employeeCode: requester.employeeCode,
        fullName: requester.fullName,
      },
      department: { id: department.id, code: department.code, name: department.name },
      submittedAt: raw.submittedAt,
      items: raw.items.map((item) => toItemView(item, employeeMap, planMap)),
    };
  }
}
