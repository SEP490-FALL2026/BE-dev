import { Injectable } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { AccessRequestRecord } from '../access-request/access-request.types';
import type { AssessmentRejectionBodyDto } from '../assessment/assessment.dto';
import { AssessmentRejectionService } from '../assessment/assessment-rejection.service';
import { AssessmentReturnService } from './assessment-return.service';

/**
 * What the IT Admin does at the gate of the assessment besides completing it (`US-05-18`, `QĐ-111ap`, R-24): refuse the proposal, which ends
 * the request, or send it back to the person who asked, who adds what is missing and sends it again. One route takes both, by `decision`.
 */
@Injectable()
export class AssessmentDecisionService {
  constructor(
    private readonly rejections: AssessmentRejectionService,
    private readonly returns: AssessmentReturnService,
  ) {}

  /** Throws what `AssessmentRejectionService.reject` and `AssessmentReturnService.send` throw. */
  decide(
    actor: AuthenticatedPrincipal,
    requestId: string,
    body: AssessmentRejectionBodyDto,
  ): Promise<AccessRequestRecord> {
    return body.decision === 'RETURN'
      ? this.returns.send(actor, requestId, body)
      : this.rejections.reject(actor, requestId, body);
  }
}
