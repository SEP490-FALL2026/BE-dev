import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { RepricingService } from '../assessment/repricing.service';
import { RequestFactsService } from '../access-request/request-facts.service';
import { SpendEntryService } from '../spend/spend-entry.service';
import { SpendStepRepo } from '../spend/spend-step.repo';
import { summarizeGroup, type GroupStage } from './group-resolution.policy';
import { pricedPeople } from '../access-request/group-request.types';
import { GroupResolutionEnding } from './group-resolution-ending.service';

/** The states of a request before its spend is approved: while it is in one of them it costs what its people cost. */
const BEFORE_APPROVAL: readonly string[] = [
  'PENDING',
  'WAITING_CONTROLLED',
  'AWAITING_SPEND_SUBMISSION',
  'AWAITING_FINANCE_REVIEW',
  'AWAITING_BUDGET',
  'AWAITING_SPEND_DECISION',
];

/** What the caller moved: the request after the lines changed, and whether it ended. */
export interface Resolved {
  stage: GroupStage;
  request: AccessRequestRecord;
}

/**
 * The one place that changes the state of a request for a group because its lines changed (`US-05-17`, `US-05-03` AC-14): the
 * request is a summary of its lines. While a line waits for its need the request waits; when none waits and some are confirmed
 * it is priced again for the people who remain and goes on to be sent as spend, the head's queue or the check at once, as a single
 * request does; while people are being granted it is being carried out; when every line has ended it ends with the outcome of the
 * most that was done. A caller that changed a line calls this in the same transaction, the request locked, and writes nothing of
 * the request's state itself.
 */
@Injectable()
export class GroupResolutionService {
  constructor(
    private readonly requests: AccessRequestRepo,
    private readonly repricing: RepricingService,
    private readonly assessment: RequestFactsService,
    private readonly organizationReads: OrganizationReadApi,
    private readonly entry: SpendEntryService,
    private readonly steps: SpendStepRepo,
    private readonly ending: GroupResolutionEnding,
  ) {}

  /** Reads the lines now and moves the request where they say; `actor` is null when the system moves it (the grant gate). */
  async resolve(tx: DbTx, actor: AuthenticatedPrincipal | null, requestId: string, now: Date): Promise<Resolved> {
    const request = await this.reread(tx, requestId);
    const stage = summarizeGroup(
      request.lines.map((line) => line.state),
      request.state,
    );
    if (stage.stage !== 'ENDED' && BEFORE_APPROVAL.includes(request.state)) {
      await this.steps.closeNeedStepsWithoutPeople(tx, request.id, now);
      await this.keepPriceInStep(tx, request, now);
    }

    switch (stage.stage) {
      case 'WAITING_NEED':
        await this.keepWaiting(tx, request);
        break;
      case 'READY_FOR_SPEND':
        if (request.state === 'PENDING' || request.state === 'WAITING_CONTROLLED') {
          await this.sendOnToSpend(tx, actor, request);
        }
        break;
      case 'GRANTING':
        if (request.state !== stage.state) await this.requests.setState(tx, request.id, stage.state);
        break;
      case 'ENDED':
        await this.ending.end(tx, actor, request, stage.state, now);
        break;
    }

    return { stage, request: await this.reread(tx, requestId) };
  }

  /**
   * Before the spend is approved the request costs what its people cost: when one of them is refused or withdrawn the amount is
   * made again for those who remain, so that what is checked, sent on and decided is always what the people left cost.
   */
  private async keepPriceInStep(tx: DbTx, request: AccessRequestRecord, now: Date): Promise<void> {
    const { pricing } = request;
    const people = pricedPeople(request.lines.map((line) => line.state));
    if (pricing.status !== 'PRICED' || pricing.unitPrice === null || pricing.schedule === null || people === 0) return;
    const first = pricing.schedule[0];
    if (
      !first ||
      pricing.expectedSpendOn === null ||
      first.amountMinor / pricing.unitPrice.amountMinor === BigInt(people)
    )
      return;

    const settings = await this.assessment.settings();
    const repriced = await this.repricing.reprice(tx, request, pricing.expectedSpendOn, {
      today: await this.organizationReads.businessToday(now, tx),
      fiscalYearStartMonth: settings.fiscalYearStartMonth,
    });
    await this.requests.setPricing(tx, request.id, repriced);
  }

  /** A request that waits keeps the state its steps give it: under control when every open step waits for somebody. */
  private async keepWaiting(tx: DbTx, request: AccessRequestRecord): Promise<void> {
    const open = request.needSteps.filter((step) => step.state === 'PENDING' || step.state === 'WAITING');
    const state = open.length > 0 && open.every((step) => step.state === 'WAITING') ? 'WAITING_CONTROLLED' : 'PENDING';
    if (request.state !== state && (request.state === 'PENDING' || request.state === 'WAITING_CONTROLLED')) {
      await this.requests.setState(tx, request.id, state);
    }
  }

  /**
   * No line waits for its need any more and some are confirmed: the request is priced again for the people who remain, goes to
   * the queue of the head or, when the person who decided cannot send it on, is checked at once (`US-06-14` AC-8).
   */
  private async sendOnToSpend(
    tx: DbTx,
    actor: AuthenticatedPrincipal | null,
    request: AccessRequestRecord,
  ): Promise<void> {
    const confirmed = request.lines.filter((line) => line.state === 'NEED_CONFIRMED');
    await this.requests.setState(tx, request.id, 'AWAITING_SPEND_SUBMISSION');
    if (actor === null) return;

    // The way in to the spend is the one of whoever decided the people that remain: the step of the first of them.
    const stepOf = request.needSteps.find((step) => step.id === confirmed[0]?.needStepId);
    const fresh = await this.reread(tx, request.id);
    await this.entry.enter(tx, actor, { ...fresh, needDecision: stepOf?.decision ?? fresh.needDecision });
  }

  private async reread(tx: DbTx, requestId: string): Promise<AccessRequestRecord> {
    const request = await this.requests.findById(requestId, tx);
    if (!request) throw new Error(`The request ${requestId} was not found after its lines changed.`);

    return request;
  }
}
