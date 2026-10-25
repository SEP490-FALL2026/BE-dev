import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { BudgetDecisionRefusedError, BudgetVersionNotFoundError } from './budget.errors';
import { checkVersionDecision } from './budget.policy';
import { BudgetChangeListeners } from './budget-change-listeners';
import { budgetAuditEvent, BudgetSupportService } from './budget-support.service';
import { CommitmentRepo } from './commitment.repo';
import { DecisionRepo, type DecisionKind } from './decision.repo';
import { ProposalRepo } from './proposal.repo';
import { VersionRepo, type VersionState } from './version.repo';
import { VersionViewService } from './version-view.service';
import type { DecisionBodyDto, VersionWire } from './budget.dto';

const OUTCOME: Readonly<Record<DecisionBodyDto['decision'], { decision: DecisionKind; state: VersionState }>> = {
  APPROVE: { decision: 'APPROVED', state: 'APPROVED' },
  REJECT: { decision: 'REJECTED', state: 'REJECTED' },
  REQUEST_CHANGES: { decision: 'CHANGES_REQUESTED', state: 'CHANGES_REQUESTED' },
};

/**
 * The decision of the spending approver on a version of a budget (`US-06-11`): approve it, refuse it with a reason, or send
 * it back to Finance with a reason. Only the approver decides, never a version they built or sent, and nobody changes a
 * figure here (`QĐ-82f`). Approving makes the version the current budget of its Cost Center and year, replaces the one
 * that was current, and attaches the commitments of that Cost Center and year that were waiting for a budget
 * (`US-06-07`); a version that is not approved attaches nothing, and the year stays without a budget (`AC-6`). The
 * decision is written as a record that is never changed, in the transaction of the move.
 */
@Injectable()
export class VersionDecisionService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly versions: VersionRepo,
    private readonly proposals: ProposalRepo,
    private readonly decisions: DecisionRepo,
    private readonly commitments: CommitmentRepo,
    private readonly views: VersionViewService,
    private readonly support: BudgetSupportService,
    private readonly listeners: BudgetChangeListeners,
    private readonly audit: AuditService,
  ) {}

  /** Throws BudgetVersionNotFoundError and BudgetDecisionRefusedError. */
  async decide(actor: AuthenticatedPrincipal, id: string, body: DecisionBodyDto): Promise<VersionWire> {
    const decided = await this.runner.run(async (tx) => {
      const version = await this.versions.lockById(tx, id);
      if (!version) throw new BudgetVersionNotFoundError();
      // The approver who sent the proposal behind a version does not decide it: the substitute does (`US-06-08` AC-11).
      const holders = await this.support.holders(tx);
      const proposal = version.proposalId ? await this.proposals.findById(version.proposalId, tx) : null;
      const approverIsParty =
        proposal !== null &&
        holders.spendingApproverEmployeeId !== null &&
        proposal.submittedByEmployeeId === holders.spendingApproverEmployeeId;
      const decider = approverIsParty ? holders.conflictSubstituteEmployeeId : holders.spendingApproverEmployeeId;
      const refusal = checkVersionDecision({
        actorIsDecider: decider !== null && decider === actor.employeeId,
        actorHasConflict: approverIsParty && actor.employeeId === holders.spendingApproverEmployeeId,
        actorEmployeeId: actor.employeeId,
        createdByEmployeeId: version.createdByEmployeeId,
        sentByEmployeeId: version.sentByEmployeeId,
        state: version.state,
      });
      if (refusal) throw new BudgetDecisionRefusedError(refusal);

      const outcome = OUTCOME[body.decision];
      const now = new Date();
      const previous =
        outcome.decision === 'APPROVED' ? await this.versions.current(version.costCenterId, version.year, tx) : null;
      // One current version at a time (INV-21): the one it replaces goes first, then this one becomes current.
      if (previous) await this.versions.setState(tx, previous.id, 'SUPERSEDED');
      await this.versions.setState(tx, id, outcome.state);
      await this.decisions.insert(tx, {
        organizationId: version.organizationId,
        versionId: id,
        decision: outcome.decision,
        decidedByEmployeeId: actor.employeeId,
        deciderRole: approverIsParty ? 'CONFLICT_SUBSTITUTE' : 'SPENDING_APPROVER',
        reason: body.reason ?? null,
        totalMinor: version.totalMinor,
        previousTotalMinor: previous?.totalMinor ?? null,
        currency: version.currency,
        decidedAt: now,
      });

      if (outcome.decision === 'REJECTED' && version.proposalId) {
        // A first version that is refused gives the proposal back to the head with the reason, so that they can correct
        // it and send it again; otherwise the Cost Center would wait for ever behind a proposal nobody can move.
        await this.proposals.setReturned(tx, version.proposalId, {
          reason: body.reason ?? '',
          byEmployeeId: actor.employeeId,
          now,
        });
      }
      await this.audit.record(
        tx,
        budgetAuditEvent(actor, version.organizationId, `BUDGET_VERSION.${outcome.decision}`, 'BUDGET_VERSION', id, {
          costCenterId: version.costCenterId,
          year: version.year,
          totalMinor: version.totalMinor.toString(),
          previousTotalMinor: previous?.totalMinor.toString() ?? null,
          ...(body.reason ? { reason: body.reason } : {}),
        }),
      );

      if (outcome.decision === 'APPROVED') {
        const attached = await this.commitments.attachWaiting(tx, {
          costCenterId: version.costCenterId,
          year: version.year,
          versionId: id,
          now,
        });
        for (const commitment of attached) {
          await this.audit.record(tx, {
            organizationId: version.organizationId,
            actorKind: 'SYSTEM',
            action: 'BUDGET_COMMITMENT.ATTACHED',
            resourceType: 'BUDGET_COMMITMENT',
            resourceId: commitment.id,
            before: null,
            after: {
              requestId: commitment.requestId,
              versionId: id,
              costCenterId: version.costCenterId,
              year: version.year,
              amountMinor: commitment.amountMinor.toString(),
            },
            correlationId: id,
          });
        }
      }

      // Whoever waits on this budget hears of it in the same transaction, after the commitments are attached (`US-06-13` AC-11).
      const event = { costCenterId: version.costCenterId, year: version.year, versionId: id };
      if (outcome.decision === 'APPROVED') await this.listeners.versionApproved(tx, actor, event);
      else await this.listeners.versionRefused(tx, actor, event);

      const record = await this.versions.findById(id, tx);
      if (!record) throw new BudgetVersionNotFoundError();

      return record;
    });

    // Read once the decision is committed: the view reads the record of it, which is not visible before.
    return this.views.wire(decided);
  }
}
