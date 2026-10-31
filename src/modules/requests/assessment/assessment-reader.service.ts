import { Injectable } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { OrganizationApi } from '../../organization/public/organization.api';
import { AccessRequestNotFoundError } from '../access-request/access-request.errors';
import { canViewRequest, viewFactsOf } from '../access-request/access-request.policy';
import { AccessRequestRepo } from '../access-request/access-request.repo';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import { AssessmentReadRepo } from '../access-request/assessment-read.repo';
import type { AssessmentRecord } from '../access-request/assessment-record.types';
import type { AssessmentWire } from './assessment.dto';
import { AssessmentViewService } from './assessment-view.service';

/** Reading the assessment of a proposal (`BM-02`): for the people who may see it, and nobody else (`US-05-06`). */
@Injectable()
export class AssessmentReader {
  constructor(
    private readonly requests: AccessRequestRepo,
    private readonly assessmentReads: AssessmentReadRepo,
    private readonly organization: OrganizationApi,
    private readonly identity: IdentityAccessApi,
    private readonly views: AssessmentViewService,
  ) {}

  /** Throws AccessRequestNotFoundError: a request that is not a proposal, or one the caller has no part in. */
  async get(actor: AuthenticatedPrincipal, requestId: string): Promise<AssessmentWire> {
    const request = await this.requests.findById(requestId);
    const assessment = request && (await this.assessmentReads.findAssessment(requestId));
    if (!request || !assessment || !(await this.mayRead(actor, request, assessment))) {
      throw new AccessRequestNotFoundError();
    }

    return this.views.of(request, assessment);
  }

  /** The people who see the assessment (`BM-02`): the request's own people, the head, an IT Admin, and the spending approver once it is done. */
  private async mayRead(
    actor: AuthenticatedPrincipal,
    request: AccessRequestRecord,
    assessment: AssessmentRecord,
  ): Promise<boolean> {
    if (canViewRequest(actor, viewFactsOf(request))) {
      return true;
    }
    const headed = await this.organization.getHeadedDepartment(actor.employeeId);
    if (headed?.departmentId === request.departmentId) return true;
    if (assessment.status !== 'COMPLETED') return false;

    return (await this.identity.getApprovalRoleHolders()).spendingApproverEmployeeId === actor.employeeId;
  }
}
