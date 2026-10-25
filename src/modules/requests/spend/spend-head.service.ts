import { Injectable } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { OrganizationService } from '../../organization/organization.service';
import { SpendNotHeadError } from './spend.errors';

/** Who is the head of a department today: the only person who keeps its queue and sends its requests on (`US-06-14` AC-10). */
@Injectable()
export class SpendHeadService {
  constructor(private readonly organization: OrganizationService) {}

  /** The department the caller heads today. Throws SpendNotHeadError. */
  async departmentOf(actor: AuthenticatedPrincipal, now: Date = new Date()): Promise<string> {
    const today = await this.organization.businessToday(now);
    const headed = await this.organization.getHeadedDepartment(actor.employeeId, today);
    if (!headed) throw new SpendNotHeadError();

    return headed.departmentId;
  }
}
