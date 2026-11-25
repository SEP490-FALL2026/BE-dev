import { Injectable } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { LicenseLotApi } from '../../catalog/public/license-lot.api';
import type { CreateLicenseLotInput } from '../../catalog/public/license-lot.types';
import { ProvisioningTaskRepo } from '../provisioning/provisioning-task.repo';
import { ProvisioningTaskFrame } from '../provisioning/provisioning-task-frame.service';
import { LicenseKeyLotRequestNotOpenError } from '../license-key/license-key.errors';

/** Grant tasks that are over: a lot cannot be bought for them any more. */
const OVER = new Set(['COMPLETED', 'CANCELLED', 'CLOSED_FAILED']);

/**
 * Makes a lot of licenses (W3-24): for a request, only for the IT Admin who acts for the department of the person the grant task of that request is for; for any
 * other purpose, any IT Admin. The catalog writes the lot and the IT Admin who makes it answers for it; what only licensing knows (the open grant task of a request
 * and its beneficiary) is judged here, before.
 */
@Injectable()
export class LicenseLotCreateService {
  constructor(
    private readonly lots: LicenseLotApi,
    private readonly tasks: ProvisioningTaskRepo,
    private readonly frame: ProvisioningTaskFrame,
  ) {}

  /**
   * Returns the id of the lot. Throws LicenseKeyLotRequestNotOpenError (a lot for a request without an open grant task for the plan), ProvisioningNotInChargeError (the
   * caller does not act for the department of the beneficiary), and the `ApiException`s of the catalog (the plan, the purpose, the workspace, the contract, the money).
   */
  async create(actor: AuthenticatedPrincipal, input: CreateLicenseLotInput): Promise<{ id: string }> {
    if (input.purpose === 'REQUEST') await this.assertRequestLot(actor, input);

    return this.lots.createLot(actor, input);
  }

  private async assertRequestLot(actor: AuthenticatedPrincipal, input: CreateLicenseLotInput): Promise<void> {
    const task = input.requestId ? await this.tasks.findGrantOf(input.requestId) : null;
    if (!task || OVER.has(task.status) || task.assignment.planId !== input.planId) {
      throw new LicenseKeyLotRequestNotOpenError();
    }
    await this.frame.requireActingItAdmin(undefined, actor, {
      beneficiaryEmployeeId: task.assignment.employeeId,
      taskId: task.id,
    });
  }
}
