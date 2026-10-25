import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { RequestStatusRecipientsService } from './request-status-recipients.service';
import { needsOf, ruleFor, subjectIdOf } from './request-status.policy';
import { RequestStatusRepo } from './request-status.repo';
import { NO_FACTS, type StatusEvent, type StatusFacts } from './request-status.types';

/** Why an event cannot be judged: it names nothing it is about, or what it is about is gone. */
export type FactsRefusal = 'NO_SUBJECT' | 'SUBJECT_MISSING';

/**
 * Reads, for one audit event, the facts its rule asked for. They come from the data committed after the event, never from the
 * order in which a service wrote its audit event and its rows, and only the facts the rule asked for are read.
 */
@Injectable()
export class RequestStatusFactsService {
  constructor(
    private readonly repo: RequestStatusRepo,
    private readonly recipients: RequestStatusRecipientsService,
  ) {}

  async load(tx: DbTx, event: StatusEvent, today: BusinessDate): Promise<StatusFacts | FactsRefusal> {
    const rule = ruleFor(event.action);
    const subjectId = subjectIdOf(event);
    if (rule === null || subjectId === null) return 'NO_SUBJECT';
    const needs = needsOf(event.action);
    const facts: StatusFacts = { ...NO_FACTS };

    if (rule.subject === 'ACCESS_REQUEST' && needs.includes('REQUEST')) {
      facts.request = await this.repo.requestFacts(tx, subjectId);
      if (facts.request === null) return 'SUBJECT_MISSING';
    }
    if (rule.subject === 'RETURN_REQUEST' && needs.includes('RETURN')) {
      facts.returnRequest = await this.repo.returnRequestOf(tx, subjectId);
      if (facts.returnRequest === null) return 'SUBJECT_MISSING';
    }
    if (needs.includes('DECISION')) facts.decision = await this.repo.decisionOf(tx, event.resourceId);
    if (needs.includes('IT_REJECTION') || needs.includes('EQUIVALENT_PLAN')) {
      const assessment = await this.repo.assessmentOf(tx, subjectId);
      facts.itRejection = assessment.itRejection;
      facts.equivalentPlanId = assessment.equivalentPlanId;
    }
    if (needs.includes('HOMEPAGE')) facts.homepageUrl = await this.repo.homepageOf(tx, subjectId);
    if (needs.includes('CLOSED_STEP_HOLDERS'))
      facts.closedStepHolders = await this.repo.closedStepHolders(tx, subjectId);
    if (needs.includes('ASSESSMENT_HOLDER') && facts.request?.branch === 'NEW_SOFTWARE') {
      facts.assessmentHolderEmployeeId = await this.repo.assessmentHolderOf(tx, subjectId);
    }
    if (needs.includes('SERVICE_ACCOUNT')) facts.serviceAccount = await this.repo.serviceAccountOf(tx, subjectId);
    if (needs.includes('SPEND_DECIDER')) facts.spendDeciderEmployeeId = await this.repo.spendDeciderOf(tx, subjectId);

    return { ...facts, ...(await this.recipients.holdersOf(needs, facts.request, today)) };
  }
}
