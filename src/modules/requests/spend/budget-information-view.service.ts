import { Injectable } from '@nestjs/common';
import { Page, pageOf } from '../../../core/application/pagination';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import {
  BudgetInformationRepo,
  type BudgetInformationRecord,
  type BudgetInformationState,
} from './budget-information.repo';
import type { BudgetInformationWire } from './budget-information.dto';
import { BudgetInformationNotFoundError } from './spend.errors';
import { SpendReadSupport } from './spend-read.support';
import { SpendStepRepo } from './spend-step.repo';

/** How the questions to Finance are written for a reader, one read of the people for all of them. */
@Injectable()
export class BudgetInformationViewService {
  constructor(
    private readonly questions: BudgetInformationRepo,
    private readonly support: SpendReadSupport,
    private readonly steps: SpendStepRepo,
  ) {}

  async wire(records: readonly BudgetInformationRecord[]): Promise<BudgetInformationWire[]> {
    const people = await this.support.people(
      records.flatMap((record) => [record.askedByEmployeeId, record.answeredByEmployeeId]),
    );
    const person = (id: string) => people.get(id) as NonNullable<ReturnType<typeof people.get>>;

    return records.map((record): BudgetInformationWire => {
      const answered =
        record.answer !== null && record.answeredByEmployeeId !== null && record.answeredAt !== null
          ? {
              value: record.answer,
              note: record.answerNote,
              answeredBy: person(record.answeredByEmployeeId),
              answeredAt: record.answeredAt.toISOString(),
              responseSeconds: Math.floor((record.answeredAt.getTime() - record.askedAt.getTime()) / 1000),
            }
          : null;

      return {
        id: record.id,
        requestId: record.requestId,
        stepId: record.stepId,
        question: record.question,
        askedBy: person(record.askedByEmployeeId),
        askedAt: record.askedAt.toISOString(),
        state: record.state,
        answer: answered,
        closedAt: record.closedAt?.toISOString() ?? null,
        closeReason: record.closeReason,
      };
    });
  }

  async latestOfRequest(requestId: string): Promise<BudgetInformationWire | null> {
    const latest = await this.questions.latestOfRequest(requestId);

    return latest ? (await this.wire([latest]))[0] : null;
  }

  /** The questions Finance reads, the oldest first. */
  async page(query: {
    state?: BudgetInformationState;
    page: number;
    pageSize: number;
  }): Promise<Page<BudgetInformationWire>> {
    const { rows, total } = await this.questions.page(
      { state: query.state },
      (query.page - 1) * query.pageSize,
      query.pageSize,
    );

    return pageOf(await this.wire(rows), total, query.page, query.pageSize);
  }

  /** What one request was asked, the oldest first, for Finance and for the person its spend step is given to. */
  async pageOfRequest(
    actor: AuthenticatedPrincipal,
    requestId: string,
    query: { page: number; pageSize: number },
  ): Promise<Page<BudgetInformationWire>> {
    const step = await this.steps.findLatest(requestId, 'SPEND_APPROVAL');
    const holds = step !== null && step.assigneeEmployeeId === actor.employeeId;
    if (!holds && !actor.roles.includes('FINANCE')) throw new BudgetInformationNotFoundError();

    const { rows, total } = await this.questions.page({ requestId }, (query.page - 1) * query.pageSize, query.pageSize);

    return pageOf(await this.wire(rows), total, query.page, query.pageSize);
  }
}
