import { Injectable } from '@nestjs/common';
import { CatalogApi } from '../../../catalog/public/catalog.api';
import type { SeatTarget } from '../../../catalog/public/catalog.types';
import { OperatingParametersApi } from '../../../operating-parameters/public/operating-parameters.api';
import { OrganizationReadApi } from '../../../organization/public/organization-read.api';
import type { BusinessDate } from '../../../../core/business-date';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import {
  GrantRequestRefusedError,
  ProvisioningResponsibleInvalidError,
  SeatTargetNotFoundError,
} from '../../public/licensing.errors';
import { GrantRequestGateHook } from '../../public/licensing.extension-points';
import { maxAttempts as maxAttemptsFor } from '../failure.policy';
import {
  assertGrantableType,
  assertItAdmin,
  assertSubscriptionChoice,
  chooseServiceIdentifier,
} from '../provisioning.policy';

/** What the grant of the seat of a request is asked to do, before anything is locked or written. */
export interface GrantInput {
  requestId: string;
  subscriptionId?: string;
  accountIdentifier?: string;
  expectedEndDate?: BusinessDate;
  responsibleEmployeeId?: string;
  /** The person of a request for a group this grant is for; a request for one person has none to name. */
  beneficiaryEmployeeId?: string;
}

/**
 * What the grant of a seat is judged on before the transaction that writes it (`US-07-01`, `QĐ-89a`): who asks, what the request gate says
 * of it, the plan and its provisioning type, the identifier of a service account, who is in charge by default, and the most tries. Nothing is
 * locked or written. Throws ProvisioningItAdminRequiredError, GrantRequestRefusedError, SeatTargetNotFoundError and the errors of the policy.
 */
@Injectable()
export class ProvisioningGrantPlanner {
  constructor(
    private readonly gate: GrantRequestGateHook,
    private readonly catalog: CatalogApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly parameters: OperatingParametersApi,
  ) {}

  async plan(actor: AuthenticatedPrincipal, input: GrantInput) {
    assertItAdmin(actor);
    const answer = await this.gate.get().check(input.requestId, input.beneficiaryEmployeeId);
    if (answer.status !== 'GRANTABLE') throw new GrantRequestRefusedError(answer.status);
    // Only a service account has a person to name, and its identifier is the IT Admin's to give: nothing is locked or written yet.
    if (answer.seat === 'PERSONAL' && input.responsibleEmployeeId !== undefined) {
      throw new ProvisioningResponsibleInvalidError('NOT_SERVICE_ACCOUNT');
    }
    const serviceIdentifier = answer.seat === 'SERVICE' ? chooseServiceIdentifier(input.accountIdentifier) : null;

    const plan: SeatTarget | null = await this.catalog.findSeatTarget({ planId: answer.planId });
    if (!plan) throw new SeatTargetNotFoundError('PLAN');
    assertGrantableType(plan.provisioningType);
    assertSubscriptionChoice(plan.provisioningType, input.subscriptionId);

    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('A provisioning task was made before installation');
    const today = await this.organizationReads.businessToday();
    const inCharge = await this.organizationReads.getItAdminInCharge(
      input.responsibleEmployeeId ?? answer.employeeId,
      today,
    );
    // The most tries are fixed here: a parameter changed later reaches only the tasks made after it (US-01-04 AC-13).
    const maxAttempts = maxAttemptsFor(Number(await this.parameters.getValue('PROVISIONING_RETRY_COUNT')));

    return { answer, plan, serviceIdentifier, organization, today, inCharge, maxAttempts };
  }
}
