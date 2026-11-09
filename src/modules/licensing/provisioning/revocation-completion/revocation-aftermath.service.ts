import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../../core/business-date';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { LicenseKeyAssignmentService } from '../../license-key/license-key-assignment.service';
import type { AccessState } from '../../public/licensing.types';
import type { ProvisioningTaskRecord } from '../provisioning-task.types';
import type { KeyReturnPlan } from '../revocation.policy';
import { RevocationLeaverAlert } from './revocation-leaver-alert.service';

/**
 * What follows the completion of a revocation in its transaction, once the assignment is ended: the key of a K4 seat goes back to the
 * store, or back and withdrawn from it (`US-07-05` AC-6, AC-7, `QĐ-103d`), and the IT Admin in charge is told when a person who leaves
 * keeps the access of a K1 seat to the end of the paid period (`US-12-15` line 38). The key is locked after the subscription and the
 * assignment the completion already holds; a K4 seat granted before the key pool holds no key, and the answer says so (null). No money
 * moves for a K4 key: its price was paid once.
 */
@Injectable()
export class RevocationAftermath {
  constructor(
    private readonly keys: LicenseKeyAssignmentService,
    private readonly leaverAlert: RevocationLeaverAlert,
  ) {}

  async follow(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: {
      organizationId: string;
      task: ProvisioningTaskRecord;
      key: KeyReturnPlan | null;
      accessState: AccessState | null;
      accessUntil: BusinessDate;
      today: BusinessDate;
      now: Date;
    },
  ): Promise<{ licenseKeyId: string | null }> {
    let taken: { licenseKeyId: string } | null = null;
    if (input.key !== null) {
      taken = await this.keys.takeBack(tx, actor, {
        organizationId: input.organizationId,
        assignmentId: input.task.assignmentId,
        disposition: input.key.disposition,
        withdrawalReason: input.key.withdrawalReason,
        now: input.now,
      });
    }
    await this.leaverAlert.tell(tx, {
      organizationId: input.organizationId,
      task: input.task,
      accessState: input.accessState,
      accessUntil: input.accessUntil,
      today: input.today,
    });

    return { licenseKeyId: taken?.licenseKeyId ?? null };
  }
}
