import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { ProvisioningKind, ProvisioningTaskStatus, RevocationSource } from '../../public/licensing.types';
import { ProvisioningTaskReasonRepo } from '../provisioning-task-reason.repo';
import { ProvisioningK1ChecklistRepo } from './provisioning-k1-checklist.repo';
import {
  k1ChecklistCard,
  k1ChecklistShown,
  k1VariantOf,
  planK1Checklist,
  type K1ChecklistCard,
  type K1ChecklistClaim,
  type K1ChecklistPlan,
} from './provisioning-k1-checklist.policy';

/** The sources the reasons that stand give a K1 revocation, and the one that opened it for a task whose reasons are not known. */
const sourcesOf = (
  reasons: readonly { source: RevocationSource }[],
  opened: RevocationSource | null,
): RevocationSource[] => (reasons.length > 0 ? reasons.map((reason) => reason.source) : opened ? [opened] : []);

/**
 * The checklist of the revocation of a K1 seat (`QĐ-111az`, P25): which steps the IT Admin ticks, judged when the revocation is completed,
 * kept with it and shown on the card. The system controls neither Google nor Microsoft 365: it asks for what the IT Admin says was done, in the
 * order it was done. The variant is the server's, read from the reasons that stand (a person who leaves, or not).
 */
@Injectable()
export class ProvisioningK1Checklist {
  constructor(
    private readonly checklists: ProvisioningK1ChecklistRepo,
    private readonly reasons: ProvisioningTaskReasonRepo,
  ) {}

  /**
   * What a completion stores of the checklist, or null for a kind other than K1 (which refuses one). Called under the lock of the task, before
   * it is completed. Throws RevocationCompletionError (`COMPLETION_NOT_ALLOWED`, `K1_CHECKLIST_INCOMPLETE`, `K1_CHECKLIST_OUT_OF_ORDER`).
   */
  async plan(
    tx: DbTx,
    task: { id: string; revocationSource: RevocationSource | null },
    input: { type: ProvisioningKind; claim: K1ChecklistClaim | undefined; evidence: string },
  ): Promise<K1ChecklistPlan | null> {
    const sources =
      input.type === 'K1' ? sourcesOf(await this.reasons.listOf([task.id], tx), task.revocationSource) : [];

    return planK1Checklist({ ...input, sources });
  }

  /** Keeps the checklist on the task, in the transaction of the completion and before the task is marked completed. */
  record(tx: DbTx, taskId: string, plan: K1ChecklistPlan): Promise<void> {
    return this.checklists.write(tx, taskId, { variant: plan.variant, items: plan.items });
  }

  /**
   * The checklist on the card of each of these K1 revocations that shows one: the list to tick while the task is open, what was ticked once it
   * is completed. `reasons` are the ones that stand. Reads the completed tasks' checklists in one query.
   */
  async cardsOf(
    tasks: readonly {
      id: string;
      status: ProvisioningTaskStatus;
      revocationSource: RevocationSource | null;
      reasons: readonly { source: RevocationSource }[];
    }[],
  ): Promise<Map<string, K1ChecklistCard>> {
    const kept = await this.checklists.readOf(
      tasks.filter((task) => task.status === 'COMPLETED').map((task) => task.id),
    );
    const cards = new Map<string, K1ChecklistCard>();
    for (const task of tasks) {
      const stored = kept.get(task.id) ?? null;
      if (!k1ChecklistShown(task.status, stored !== null)) continue;
      cards.set(task.id, k1ChecklistCard(k1VariantOf(sourcesOf(task.reasons, task.revocationSource)), stored));
    }

    return cards;
  }
}
