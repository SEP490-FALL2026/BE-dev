import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { AccessRequestNotFoundError } from '../access-request/access-request.errors';
import { viewFactsOf } from '../access-request/access-request.policy';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import { PricingViewService } from '../request-view/pricing-view.service';
import { RequestReadAccessService } from '../request-view/request-read-access.service';
import { SpendStepRepo } from '../spend/spend-step.repo';
import type { GroupLineWire } from '../group-request/group-request.dto';
import { PRICED_LINE_STATES, pricedPeople } from '../access-request/group-request.types';
import { LineAmountRepo } from '../group-request/line-amount.repo';
import { LineDecisionRepo, type LineDecisionRecord } from '../group-request/line-decision.repo';
import { RequestLineRepo } from '../group-request/request-line.repo';

/**
 * What a reader sees of the people of a request for a group (`US-05-17` AC-4, AC-6, AC-9): each one with the state of their own, the
 * step that holds them, what was decided for them at each stage, and, once the spend is approved, the share of the commitment they
 * stand for. Whoever reads the whole request (`canReadRequest`) sees every line; a person the request is for sees only their own.
 */
@Injectable()
export class GroupLineQueryService {
  constructor(
    private readonly requests: AccessRequestRepo,
    private readonly lines: RequestLineRepo,
    private readonly decisions: LineDecisionRepo,
    private readonly amounts: LineAmountRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly money: PricingViewService,
    private readonly steps: SpendStepRepo,
    private readonly readAccess: RequestReadAccessService,
  ) {}

  /** Throws AccessRequestNotFoundError for a request that is not for a group, or that the caller has no part in. */
  async page(
    actor: AuthenticatedPrincipal,
    requestId: string,
    query: { page: number; pageSize: number },
  ): Promise<Page<GroupLineWire>> {
    const request = await this.requests.findById(requestId);
    // The person who holds the spend step reads the people they decide too, with what each costs (`US-06-01` AC-15).
    const spendStep = await this.steps.findLatest(requestId, 'SPEND_APPROVAL');
    const spender = spendStep?.assigneeEmployeeId === actor.employeeId;
    if (!request || request.type !== 'GROUP_GRANT') throw new AccessRequestNotFoundError();
    const access = spender
      ? { read: true as const, onlyLineOf: null }
      : await this.readAccess.accessOf(actor, {
          ...viewFactsOf(request),
          id: request.id,
          isGroup: true,
          departmentId: request.departmentId,
          spendStepOpened: spendStep !== null,
        });
    if (!access.read) throw new AccessRequestNotFoundError();

    const { items, total } = await this.lines.page(
      requestId,
      access.onlyLineOf,
      (query.page - 1) * query.pageSize,
      query.pageSize,
    );
    const [decisions, shares] = await Promise.all([this.decisions.of(requestId), this.amounts.of(requestId, null)]);
    const stepOf = new Map(request.needSteps.map((step) => [step.id, step]));
    const people = new Map(
      (
        await this.organizationReads.getEmployees([
          ...new Set(
            [
              ...items.flatMap((line) => [line.employeeId, line.endedByEmployeeId]),
              ...request.needSteps.map((step) => step.assigneeEmployeeId),
              ...decisions.map((decision) => decision.decidedByEmployeeId),
            ].filter((id): id is string => id !== null),
          ),
        ])
      ).map((person) => [
        person.id,
        { employeeId: person.id, employeeCode: person.employeeCode, fullName: person.fullName },
      ]),
    );
    const person = (id: string) => {
      const found = people.get(id);
      if (!found) throw new Error(`The employee ${id} of the request ${requestId} does not exist.`);

      return found;
    };
    const decisionView = (record: LineDecisionRecord | undefined) =>
      record === undefined
        ? null
        : {
            decision: record.decision,
            reason: record.reason,
            decidedBy: person(record.decidedByEmployeeId),
            deciderRole: record.deciderRole === 'MANAGER' ? ('MANAGER' as const) : ('SPENDING_APPROVER' as const),
            decidedAt: record.decidedAt.toISOString(),
          };

    const priced = pricedPeople(request.lines.map((line) => line.state));
    const { amount } = request.pricing;
    const wires: GroupLineWire[] = [];
    for (const line of items) {
      const mine = decisions.filter((decision) => decision.employeeId === line.employeeId);
      const held = shares.filter((share) => share.employeeId === line.employeeId);
      const step = stepOf.get(line.needStepId);
      if (!step) throw new Error(`The line of ${line.employeeId} points at a missing step.`);
      wires.push({
        employee: person(line.employeeId),
        position: line.position,
        state: line.state,
        needStep: {
          id: step.id,
          state: step.state,
          assignee: step.assigneeEmployeeId === null ? null : person(step.assigneeEmployeeId),
        },
        expectedEndDate: line.expectedEndDate,
        cost:
          amount === null || priced === 0 || !PRICED_LINE_STATES.includes(line.state)
            ? null
            : await this.money.moneyView({
                amountMinor: amount.amountMinor / BigInt(priced),
                currency: amount.currency,
              }),
        needDecision: decisionView(mine.find((decision) => decision.stage === 'NEED')),
        spendDecision: decisionView(mine.find((decision) => decision.stage === 'SPEND')),
        share:
          held.length === 0
            ? null
            : await this.money.moneyView({
                amountMinor: held.reduce((sum, share) => sum + share.amountMinor, 0n),
                currency: held[0].currency,
              }),
        endedAt: line.endedAt?.toISOString() ?? null,
        endedBy: line.endedByEmployeeId === null ? null : person(line.endedByEmployeeId),
        endReason: line.endReason,
        cancelCause: line.cancelCause,
      });
    }

    return pageOf(wires, total, query.page, query.pageSize);
  }
}
