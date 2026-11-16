import { Injectable } from '@nestjs/common';
import { checkTermMonths, termRuleOf, type TermKind } from '../../../core/term-limit';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { AssessmentReadRepo } from '../access-request/assessment-read.repo';
import { AssessmentTermNotFitError } from './assessment.errors';

/** The request as it is priced and granted from now on, and the months a plan bought once cleared from it (null when none were cleared). */
export interface FittedTerm {
  request: AccessRequestRecord;
  termMonthsCleared: number | null;
}

/**
 * The one place that judges the time of use of a proposal by the kind of grant that is concluded for it (`QĐ-111i`): a proposal took the rule
 * of `K2` because the kind of plan was not known, so the kind the IT Admin concludes (`fit`) and the kind of the plan the request is linked
 * to (`fitToLinkedPlan`) both say again whether the months it gave still hold. A plan bought once (`K4`) asks no months, so those the person
 * gave are cleared (the audit says how many); any other time of use that does not fit (`K1` takes 1 to 9 months and never none, a person with a
 * term takes no right with no end, a contract that ended) is refused and nothing is written.
 */
@Injectable()
export class AssessmentTermFitService {
  constructor(
    private readonly requests: AccessRequestRepo,
    private readonly assessmentReads: AssessmentReadRepo,
    private readonly organizationReads: OrganizationReadApi,
  ) {}

  /** Throws AssessmentTermNotFitError. */
  async fit(tx: DbTx, request: AccessRequestRecord, kind: TermKind, now: Date): Promise<FittedTerm> {
    const [beneficiaryId] = request.beneficiaryEmployeeIds;
    const person = beneficiaryId === undefined ? null : await this.organizationReads.getEmployee(beneficiaryId, tx);
    const contractEndDate = person?.contractEndDate ?? null;
    const months = kind === 'K4' ? null : request.termMonths;
    const refusal = checkTermMonths({
      kind,
      termMonths: months,
      fixedTermPerson: (person?.employmentType ?? 'STAFF') !== 'STAFF',
      contractEndKnown: contractEndDate !== null,
      contractEndDate,
      termStart: await this.organizationReads.businessToday(now, tx),
    });
    if (refusal !== null) {
      throw new AssessmentTermNotFitError(refusal, kind, request.termMonths, termRuleOf(kind).maxMonths);
    }
    if (request.termMonths === months) return { request, termMonthsCleared: null };
    await this.requests.setTermMonths(tx, request.id, months);

    return { request: { ...request, termMonths: months }, termMonthsCleared: request.termMonths };
  }

  /**
   * The request is linked to a plan of kind `planKind` after its assessment was completed: the months are judged again only when that kind is
   * not the one the assessment concluded, since the ones it concluded were judged when it was completed. An assessment that concluded no kind
   * has nothing to differ from.
   * Throws AssessmentTermNotFitError.
   */
  async fitToLinkedPlan(tx: DbTx, request: AccessRequestRecord, planKind: TermKind, now: Date): Promise<FittedTerm> {
    const concluded = (await this.assessmentReads.findAssessment(request.id, tx))?.provisioningType ?? null;
    if (concluded === null || concluded === planKind) return { request, termMonthsCleared: null };

    return this.fit(tx, request, planKind, now);
  }
}
