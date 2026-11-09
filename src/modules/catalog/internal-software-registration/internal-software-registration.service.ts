import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { PlanService } from '../plan/plan.service';
import { ApplicationBusinessOwnerInvalidError, ApplicationNameTakenError } from '../catalog-entry/application.errors';
import { ApplicationService } from '../catalog-entry/application.service';

export type InternalRegistration =
  | { status: 'REGISTERED'; applicationId: string; planId: string }
  | { status: 'REFUSED'; reason: 'BUSINESS_OWNER_INVALID' | 'NAME_TAKEN' };

/**
 * Registering software the company built itself in the catalog on behalf of a request (`US-05-20`): the application, with
 * its Business Owner who still works (`US-04-01` AC-4), and one plan of the kind that is granted by hand and has no pricing
 * model (`K5`). It writes in the transaction of the caller, so it is committed or undone together with the request that
 * asked for it, and it creates no vendor, contract, subscription, invoice or seat (`US-05-20` AC-5).
 */
@Injectable()
export class InternalSoftwareRegistrationService {
  constructor(
    private readonly applications: ApplicationService,
    private readonly plans: PlanService,
  ) {}

  /** A refusal is an answer, not an error: the caller rolls its transaction back when it gets one. */
  async register(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: { name: string; businessOwnerEmployeeId: string; dataSensitivity: 'LOW' | 'MEDIUM' | 'HIGH' },
  ): Promise<InternalRegistration> {
    try {
      const application = await this.applications.declareRecord(
        actor,
        {
          name: input.name,
          kind: 'INTERNAL',
          dataSensitivity: input.dataSensitivity,
          businessOwnerEmployeeId: input.businessOwnerEmployeeId,
          communication: { personToPersonMessaging: false, callsOrMeetings: false, mailbox: false },
        },
        tx,
      );
      const plan = await this.plans.declare(
        actor,
        { applicationId: application.id, name: input.name, provisioningType: 'K5' },
        tx,
      );

      return { status: 'REGISTERED', applicationId: application.id, planId: plan.id };
    } catch (error) {
      if (error instanceof ApplicationBusinessOwnerInvalidError) {
        return { status: 'REFUSED', reason: 'BUSINESS_OWNER_INVALID' };
      }
      if (error instanceof ApplicationNameTakenError) return { status: 'REFUSED', reason: 'NAME_TAKEN' };

      throw error;
    }
  }
}
