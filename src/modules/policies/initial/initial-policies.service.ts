import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { LibraryRepo } from '../library/library.repo';
import { INITIAL_POLICIES } from './initial-policies.policy';

export interface InitialPoliciesResult {
  /** Policies that did not exist and were added. */
  policiesCreated: number;
  /** First versions written: for a new policy, or for one that has none yet. */
  versionsPublished: number;
}

/**
 * Writes the fixed set of policies and the first version of each in the transaction of the caller (the installation, the demo dataset).
 * Safe to run again: a policy that exists is kept, a version that exists is never touched, so nothing the Super Admin published is lost.
 */
@Injectable()
export class InitialPoliciesService {
  constructor(private readonly repo: LibraryRepo) {}

  async seed(
    tx: DbTx,
    organizationId: string,
    changeNote: string,
    now: Date = new Date(),
  ): Promise<InitialPoliciesResult> {
    let policiesCreated = 0;
    let versionsPublished = 0;
    for (const initial of INITIAL_POLICIES) {
      let policy = await this.repo.findPolicy(organizationId, initial.code, tx);
      if (!policy) {
        policy = { ...(await this.repo.insertPolicy(tx, organizationId, initial.code)), code: initial.code };
        policiesCreated += 1;
      }
      if (await this.repo.current(policy.id, tx)) continue;
      await this.repo.insertPublished(tx, {
        organizationId,
        policyId: policy.id,
        versionNumber: 1,
        title: initial.title,
        content: initial.content,
        applicableRoles: initial.applicableRoles,
        changeNote,
        publishedAt: now,
      });
      versionsPublished += 1;
    }

    return { policiesCreated, versionsPublished };
  }
}
