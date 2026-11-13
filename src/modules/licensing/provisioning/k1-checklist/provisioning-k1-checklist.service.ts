import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import { CatalogApi } from '../../../catalog/public/catalog.api';
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
 * order it was done. The variant is the server's, read from the reasons that stand (a person who leaves, or not). The lock of the mailbox is
 * a step of the last K1 revocation of the person only: while another K1 revocation of the same person is not over, this one does not take it.
 */
@Injectable()
export class ProvisioningK1Checklist {
  constructor(
    private readonly checklists: ProvisioningK1ChecklistRepo,
    private readonly reasons: ProvisioningTaskReasonRepo,
    private readonly catalog: CatalogApi,
  ) {}

  /** The tasks of the K1 revocations still to do of each of these people (neither completed, cancelled nor closed as failed). */
  private async liveK1Of(employeeIds: readonly string[], tx?: DbTx): Promise<Map<string, string[]>> {
    const live = await this.checklists.liveRevocationsOf(employeeIds, tx);
    const planIds = [...new Set(live.map((row) => row.planId))];
    const plans = planIds.length > 0 ? await this.catalog.getPlanRevocationInfo(planIds, tx) : [];
    const k1 = new Set(plans.filter((plan) => plan.provisioningType === 'K1').map((plan) => plan.planId));
    const byPerson = new Map<string, string[]>();
    for (const row of live) {
      if (k1.has(row.planId)) byPerson.set(row.employeeId, [...(byPerson.get(row.employeeId) ?? []), row.taskId]);
    }

    return byPerson;
  }

  /**
   * What a completion stores of the checklist, or null for a kind other than K1 (which refuses one). Called under the lock of the task, before
   * it is completed. A K1 completion first takes the lock of the person, then reads whether another K1 revocation of the person is still to do,
   * so two that are completed at once are judged one after the other and exactly one is the last. Throws RevocationCompletionError
   * (`COMPLETION_NOT_ALLOWED`, `K1_CHECKLIST_INCOMPLETE`, `K1_CHECKLIST_OUT_OF_ORDER`).
   */
  async plan(
    tx: DbTx,
    task: {
      id: string;
      revocationSource: RevocationSource | null;
      createdAt: Date;
      assignment: { employeeId: string };
    },
    input: { type: ProvisioningKind; claim: K1ChecklistClaim | undefined; evidence: string },
  ): Promise<K1ChecklistPlan | null> {
    const opened = { openedAt: task.createdAt };
    if (input.type !== 'K1') return planK1Checklist({ ...input, ...opened, sources: [], lastOfPerson: true });

    const employeeId = task.assignment.employeeId;
    await this.checklists.lockPerson(tx, employeeId);
    const others = (await this.liveK1Of([employeeId], tx)).get(employeeId) ?? [];
    const sources = sourcesOf(await this.reasons.listOf([task.id], tx), task.revocationSource);

    return planK1Checklist({ ...input, ...opened, sources, lastOfPerson: others.every((id) => id === task.id) });
  }

  /** Keeps the checklist on the task, in the transaction of the completion and before the task is marked completed. */
  record(tx: DbTx, taskId: string, plan: K1ChecklistPlan): Promise<void> {
    return this.checklists.write(tx, taskId, { variant: plan.variant, items: plan.items });
  }

  /**
   * Which of these people have a completed K1 revocation whose checklist is the one of a departure with the lock of the mailbox ticked
   * (`MAILBOX_LOCKED`, which only the last K1 revocation of a person carries, D-62): what the personnel module reads to write the lock of the
   * mailbox for good when the revocation completed while it could not (`P28`, D-72). One query for any number of people.
   */
  async mailboxLockedAmong(employeeIds: readonly string[], tx?: DbTx): Promise<Set<string>> {
    const kept = await this.checklists.completedOf(employeeIds, tx);

    return new Set(
      [...kept]
        .filter(([, checklists]) =>
          checklists.some(
            (checklist) =>
              checklist.variant === 'DEPARTURE' && checklist.items.some((item) => item.code === 'MAILBOX_LOCKED'),
          ),
        )
        .map(([employeeId]) => employeeId),
    );
  }

  /**
   * The checklist on the card of each of these K1 revocations that shows one: the list to tick while the task is open, what was ticked once it
   * is completed. `reasons` are the ones that stand. Reads the completed tasks' checklists in one query and the K1 revocations still to do of
   * the people of the open tasks in another, to tell whether an open task is the last of its person (the steps it has depend on it).
   */
  async cardsOf(
    tasks: readonly {
      id: string;
      status: ProvisioningTaskStatus;
      employeeId: string;
      revocationSource: RevocationSource | null;
      reasons: readonly { source: RevocationSource }[];
    }[],
  ): Promise<Map<string, K1ChecklistCard>> {
    const kept = await this.checklists.readOf(
      tasks.filter((task) => task.status === 'COMPLETED').map((task) => task.id),
    );
    const shown = tasks.filter((task) => k1ChecklistShown(task.status, kept.has(task.id)));
    const open = shown.filter((task) => task.status !== 'COMPLETED');
    const live = await this.liveK1Of([...new Set(open.map((task) => task.employeeId))]);
    const cards = new Map<string, K1ChecklistCard>();
    for (const task of shown) {
      const variant = k1VariantOf(sourcesOf(task.reasons, task.revocationSource));
      const lastOfPerson = (live.get(task.employeeId) ?? []).every((id) => id === task.id);
      cards.set(task.id, k1ChecklistCard(variant, kept.get(task.id) ?? null, lastOfPerson));
    }

    return cards;
  }
}
