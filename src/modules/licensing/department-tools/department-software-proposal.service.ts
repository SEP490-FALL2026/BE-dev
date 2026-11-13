import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { licensingAuditEvent } from '../licensing-audit-event.mapper';
import { ToolsDepartmentNotFoundError, ToolsDepartmentOutOfScopeError } from '../public/licensing.errors';
import { DepartmentSoftwareAccessService } from './department-software-access.service';
import { DepartmentSoftwareNotice } from './department-software-notice.service';
import { DepartmentSoftwareViewService } from './department-software-view.service';
import type { SoftwareProposalWire } from './department-software.dto';
import {
  DepartmentSoftwareAlreadyListedError,
  DepartmentSoftwareProposalDecidedError,
  DepartmentSoftwareProposalNotFoundError,
  DepartmentSoftwareProposalOpenError,
} from './department-software.errors';
import {
  decisionRefusal,
  mayChangeList,
  proposerDepartment,
  type DepartmentSoftwareItem,
} from './department-software.policy';
import { DepartmentSoftwareRepo } from './department-software.repo';
import type { SoftwareEntry, SoftwareProposal } from './department-software.types';

const place = (item: DepartmentSoftwareItem) => ({ applicationId: item.applicationId, planId: item.planId });

/**
 * The proposals of the head of a department to add software to its list (`QĐ-110t`, `QĐ-111c`, SPEC P18). Only the head proposes, for the
 * department they lead, and only a place the catalog offers; one open proposal for each place is decided by the unique index, so a second is
 * a conflict and nothing is checked before the insert. The IT Admin in charge accepts (the place goes in the list, at once and once) or rejects
 * with a reason; a proposal is decided once, by whoever's update finds it still open. A proposal an IT Admin is not in charge of is not found. Each
 * step is one transaction with its Audit Trail event and its notice: the IT Admin is told of a proposal, the head of its decision.
 */
@Injectable()
export class DepartmentSoftwareProposalService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly repo: DepartmentSoftwareRepo,
    private readonly access: DepartmentSoftwareAccessService,
    private readonly view: DepartmentSoftwareViewService,
    private readonly notice: DepartmentSoftwareNotice,
    private readonly organizationReads: OrganizationReadApi,
    private readonly audit: AuditApi,
  ) {}

  /**
   * Throws ToolsDepartmentOutOfScopeError (the caller heads no department), DepartmentSoftwareNotInCatalogError,
   * DepartmentSoftwareAlreadyListedError and DepartmentSoftwareProposalOpenError.
   */
  async propose(
    actor: AuthenticatedPrincipal,
    input: { applicationId: string; planId: string | null; reason: string },
  ): Promise<SoftwareProposalWire> {
    const departmentId = proposerDepartment({ headedDepartmentId: await this.access.headedDepartment(actor) });
    if (departmentId === null) throw new ToolsDepartmentOutOfScopeError();
    const item = { applicationId: input.applicationId, planId: input.planId };
    await this.view.assertInCatalog([item]);
    const organization = await this.requireOrganization();

    const made = await this.runner.run(async (tx) => {
      if (!(await this.organizationReads.lockDepartmentShared(tx, departmentId)))
        throw new ToolsDepartmentNotFoundError();
      if (await this.repo.findEntryByPlace(tx, departmentId, item))
        throw new DepartmentSoftwareAlreadyListedError([item]);
      const proposal = await this.repo.insertProposal(tx, {
        organizationId: organization,
        departmentId,
        item,
        reason: input.reason,
        proposedByEmployeeId: actor.employeeId,
      });
      if (!proposal) throw new DepartmentSoftwareProposalOpenError();
      await this.audit.record(
        tx,
        licensingAuditEvent(
          actor,
          organization,
          'DEPARTMENT_SOFTWARE.PROPOSED',
          'DepartmentSoftwareProposal',
          proposal.id,
          null,
          {
            departmentId,
            ...place(item),
          },
        ),
      );
      await this.notice.proposed(tx, proposal);

      return proposal;
    });

    return (await this.view.proposals([made]))[0];
  }

  /**
   * Accepts the proposal: the place goes in the list (nothing to write when an IT Admin put it there meanwhile) and the head is told. A place
   * the catalog no longer offers is refused: the IT Admin rejects it. Throws DepartmentSoftwareProposalNotFoundError,
   * DepartmentSoftwareNotInCatalogError and DepartmentSoftwareProposalDecidedError.
   */
  async accept(
    actor: AuthenticatedPrincipal,
    proposalId: string,
  ): Promise<{ proposal: SoftwareProposalWire; entryId: string }> {
    const proposal = await this.inCharge(actor, proposalId);
    const item = { applicationId: proposal.applicationId, planId: proposal.planId };
    await this.view.assertInCatalog([item]);
    const organization = await this.requireOrganization();

    const done = await this.runner.run(async (tx) => {
      await this.lockDepartment(tx, proposal.departmentId);
      const decided = await this.decide(tx, actor, proposal, { state: 'ACCEPTED', reason: null });
      const { entry, created } = await this.listed(tx, organization, actor.appUserId, proposal.departmentId, item);
      await this.recordDecision(tx, actor, organization, proposal, 'ACCEPTED');
      if (created) {
        await this.audit.record(
          tx,
          licensingAuditEvent(
            actor,
            organization,
            'DEPARTMENT_SOFTWARE.ENTRY_ADDED',
            'DepartmentSoftwareEntry',
            entry.id,
            null,
            {
              departmentId: proposal.departmentId,
              ...place(item),
            },
          ),
        );
      }
      await this.notice.decided(tx, decided, { state: 'ACCEPTED', reason: null });

      return { decided, entryId: entry.id };
    });

    return { proposal: (await this.view.proposals([done.decided]))[0], entryId: done.entryId };
  }

  /** Rejects the proposal with the reason the head reads (`QĐ-110t`). Throws DepartmentSoftwareProposalNotFoundError and DepartmentSoftwareProposalDecidedError. */
  async reject(actor: AuthenticatedPrincipal, proposalId: string, reason: string): Promise<SoftwareProposalWire> {
    const proposal = await this.inCharge(actor, proposalId);
    const organization = await this.requireOrganization();

    const decided = await this.runner.run(async (tx) => {
      await this.lockDepartment(tx, proposal.departmentId);
      const rejected = await this.decide(tx, actor, proposal, { state: 'REJECTED', reason });
      await this.recordDecision(tx, actor, organization, proposal, 'REJECTED');
      await this.notice.decided(tx, rejected, { state: 'REJECTED', reason });

      return rejected;
    });

    return (await this.view.proposals([decided]))[0];
  }

  /** The proposal, for an IT Admin in charge of its department: one of another department is not found, as one that is not there. */
  private async inCharge(actor: AuthenticatedPrincipal, proposalId: string): Promise<SoftwareProposal> {
    const proposal = await this.repo.findProposal(proposalId);
    if (!proposal) throw new DepartmentSoftwareProposalNotFoundError();
    const inItAdminScope = (await this.access.itAdminScope(actor)).has(proposal.departmentId);
    if (!mayChangeList({ roles: actor.roles, inItAdminScope })) throw new DepartmentSoftwareProposalNotFoundError();

    return proposal;
  }

  /** Decides the open proposal; the update holds the row, so two IT Admins who decide together leave one decision and DepartmentSoftwareProposalDecidedError for the other. */
  private async decide(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    proposal: SoftwareProposal,
    decision: { state: 'ACCEPTED' | 'REJECTED'; reason: string | null },
  ): Promise<SoftwareProposal> {
    if (decisionRefusal(proposal.state) !== null) throw new DepartmentSoftwareProposalDecidedError();
    const won = await this.repo.decide(tx, proposal.id, { ...decision, byAppUserId: actor.appUserId, at: new Date() });
    if (!won) throw new DepartmentSoftwareProposalDecidedError();
    const after = await this.repo.findProposal(proposal.id, tx);
    if (!after) throw new DepartmentSoftwareProposalNotFoundError();

    return after;
  }

  /** The entry of the place in the list, written now or already there; twice at most, as an entry taken out between the two reads is a fault of timing, not of data. */
  private async listed(
    tx: DbTx,
    organizationId: string,
    addedByAppUserId: string,
    departmentId: string,
    item: DepartmentSoftwareItem,
  ): Promise<{ entry: SoftwareEntry; created: boolean }> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const [written] = await this.repo.insertEntries(tx, {
        organizationId,
        departmentId,
        addedByAppUserId,
        items: [{ ...item, note: null }],
      });
      if (written) return { entry: written, created: true };
      const existing = await this.repo.findEntryByPlace(tx, departmentId, item);
      if (existing) return { entry: existing, created: false };
    }
    throw new Error('The place of an accepted proposal could be neither written nor found in the list.');
  }

  private async recordDecision(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    organizationId: string,
    proposal: SoftwareProposal,
    state: 'ACCEPTED' | 'REJECTED',
  ): Promise<void> {
    await this.audit.record(
      tx,
      licensingAuditEvent(
        actor,
        organizationId,
        state === 'ACCEPTED' ? 'DEPARTMENT_SOFTWARE.PROPOSAL_ACCEPTED' : 'DEPARTMENT_SOFTWARE.PROPOSAL_REJECTED',
        'DepartmentSoftwareProposal',
        proposal.id,
        { state: 'PENDING' },
        { state, departmentId: proposal.departmentId, ...place(proposal) },
      ),
    );
  }

  private async lockDepartment(tx: DbTx, departmentId: string): Promise<void> {
    if (!(await this.organizationReads.lockDepartmentShared(tx, departmentId)))
      throw new ToolsDepartmentNotFoundError();
  }

  private async requireOrganization(): Promise<string> {
    const organization = await this.organizationReads.getOrganization();
    if (!organization)
      throw new Error('A proposal for the list of software of a department was made before installation');

    return organization.id;
  }
}
