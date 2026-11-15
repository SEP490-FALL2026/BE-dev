import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { policiesEvent } from '../policies-audit-event.mapper';
import { PolicyDraftNotFoundError, PolicyNotFoundError, PolicyNotPublishedError } from './library.errors';
import { draftValuesOf, type DraftChange } from './library.policy';
import { LibraryRepo } from './library.repo';
import type { DraftValues, PolicyVersionRecord } from './library.types';

const valuesOf = (version: PolicyVersionRecord): DraftValues => ({
  title: version.title,
  content: version.content,
  applicableRoles: version.applicableRoles,
});

/**
 * The draft of a policy (`QĐ-111bi`): at most one, opened as a copy of the version in force and changed in place until the Super Admin
 * publishes or discards it. Every write takes the row of the policy first, so two writes and a publication of one policy follow each other.
 */
@Injectable()
export class LibraryDraftService {
  constructor(
    private readonly repo: LibraryRepo,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
    private readonly runner: TransactionRunner,
  ) {}

  /** Throws PolicyNotFoundError and PolicyDraftNotFoundError. */
  async read(code: string): Promise<PolicyVersionRecord> {
    const organization = await this.requireOrganization();
    const policy = await this.repo.findPolicy(organization.id, code);
    if (!policy) throw new PolicyNotFoundError();
    const draft = await this.repo.draft(policy.id);
    if (!draft) throw new PolicyDraftNotFoundError();

    return draft;
  }

  /**
   * Opens the draft as a copy of the version in force when there is none, then puts what was given over it. Throws PolicyNotFoundError and
   * PolicyNotPublishedError (a policy with nothing in force and no draft has nothing to copy).
   */
  async write(actor: AuthenticatedPrincipal, code: string, change: DraftChange): Promise<PolicyVersionRecord> {
    const organization = await this.requireOrganization();

    return this.runner.run(async (tx) => {
      const policy = await this.repo.lockPolicy(tx, organization.id, code);
      if (!policy) throw new PolicyNotFoundError();
      const draft = await this.repo.draft(policy.id, tx);
      const base = draft ?? (await this.repo.current(policy.id, tx));
      if (!base) throw new PolicyNotPublishedError();
      const values = draftValuesOf(valuesOf(base), change);
      const saved = draft
        ? await this.repo.updateDraft(tx, draft.id, values)
        : await this.repo.insertDraft(tx, {
            ...values,
            organizationId: organization.id,
            policyId: policy.id,
            draftedByAppUserId: actor.appUserId,
          });
      await this.audit.record(
        tx,
        policiesEvent(actor, organization.id, 'POLICY_DRAFT.SAVED', 'PolicyVersion', saved.id, null, {
          policyCode: code,
          title: saved.title,
          openedNow: draft === null,
        }),
      );

      return saved;
    });
  }

  /** Throws PolicyNotFoundError and PolicyDraftNotFoundError. */
  async discard(actor: AuthenticatedPrincipal, code: string): Promise<void> {
    const organization = await this.requireOrganization();
    await this.runner.run(async (tx) => {
      const policy = await this.repo.lockPolicy(tx, organization.id, code);
      if (!policy) throw new PolicyNotFoundError();
      const draft = await this.repo.draft(policy.id, tx);
      if (!draft) throw new PolicyDraftNotFoundError();
      await this.repo.deleteDraft(tx, draft.id);
      await this.audit.record(
        tx,
        policiesEvent(actor, organization.id, 'POLICY_DRAFT.DISCARDED', 'PolicyVersion', draft.id, null, {
          policyCode: code,
        }),
      );
    });
  }

  private async requireOrganization() {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('The policy library was used before installation');

    return organization;
  }
}
