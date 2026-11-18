import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../../core/business-date';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { LicenseKeyAssignmentService } from '../../license-key/license-key-assignment.service';
import type { AccessState, ProvisioningKind } from '../../public/licensing.types';
import type { K1ChecklistPlan } from '../k1-checklist/provisioning-k1-checklist.policy';
import { ProvisioningK1Checklist } from '../k1-checklist/provisioning-k1-checklist.service';
import type { ProvisioningTaskRecord } from '../provisioning-task.types';
import { completionsFor, type CompletionInput, type KeyReturnPlan } from '../revocation.policy';
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
    private readonly checklists: ProvisioningK1Checklist,
  ) {}

  /** Whether the seat holds a key (a K4 seat granted before the key pool holds none), its row locked until commit. */
  holdsKey(tx: DbTx, assignmentId: string): Promise<boolean> {
    return this.keys.holdsKey(tx, assignmentId);
  }

  /**
   * The checklist a K1 completion stands on (`QĐ-111az`), judged and kept on the task before the task is marked completed (a completed task is
   * never changed again; a refusal after this rolls the transaction back). Null for any other kind, which refuses a checklist. A way that does
   * not fit the kind has none: `planCompletion` refuses it, so a wrong way is told as that and not as a missing checklist. Throws
   * RevocationCompletionError.
   */
  async keepChecklist(
    tx: DbTx,
    task: ProvisioningTaskRecord,
    type: ProvisioningKind,
    input: CompletionInput,
  ): Promise<K1ChecklistPlan | null> {
    if (!completionsFor(type).includes(input.completion)) return null;
    const plan = await this.checklists.plan(tx, task, { type, claim: input.k1Checklist, evidence: input.evidence });
    if (plan) await this.checklists.record(tx, task.id, plan);

    return plan;
  }

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
