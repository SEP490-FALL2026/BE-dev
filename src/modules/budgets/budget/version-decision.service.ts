import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditService } from '../../audit/audit.service';
import { BudgetDecisionRefusedError, BudgetVersionNotFoundError, BudgetYearEndedError } from './budget.errors';
import { checkVersionDecision, deciderOf, yearHasEnded } from './budget.policy';
import { BudgetChangeListeners } from './budget-change-listeners';
import { BudgetNotifierService } from './budget-notifier.service';
import { budgetAuditEvent, BudgetSupportService } from './budget-support.service';
import { BudgetYearLockRepo } from './budget-year-lock.repo';
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
 * (`US-06-07`); a version that is not approved attaches nothing, and the year stays without a budget (`AC-6`). A refusal leaves
 * the proposal behind the version reviewed, so Finance can make another version from it, or the head can send a proposal that
 * follows it (F63). The decision is written as a record that is never changed, in the transaction of the move, and nothing is
 * decided once the fiscal year has ended (`BUDGET.YEAR_ENDED`, F62). The versions of the Cost Center and year are locked by id and
 * then the year, the order of every writer of this context.
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
    private readonly yearLock: BudgetYearLockRepo,
    private readonly notifier: BudgetNotifierService,
    private readonly listeners: BudgetChangeListeners,
    private readonly audit: AuditService,
  ) {}

  /** Throws BudgetVersionNotFoundError, BudgetDecisionRefusedError and BudgetYearEndedError. */
  async decide(actor: AuthenticatedPrincipal, id: string, body: DecisionBodyDto): Promise<VersionWire> {
    const fiscalStart = await this.support.fiscalYearStartMonth();
    const decided = await this.runner.run(async (tx) => {
      const known = await this.versions.findById(id, tx);
      if (!known) throw new BudgetVersionNotFoundError();
      const siblings = await this.versions.lockAllOfYear(tx, known.costCenterId, known.year);
      const version = siblings.find((candidate) => candidate.id === id);
      if (!version) throw new BudgetVersionNotFoundError();
      // The approver who sent the proposal behind a version does not decide it: the substitute does (`US-06-08` AC-11).
      const holders = await this.support.holders(tx);
      const proposal = version.proposalId ? await this.proposals.findById(version.proposalId, tx) : null;
      const { employeeId: decider, approverIsParty } = deciderOf(holders, proposal?.submittedByEmployeeId ?? null);
      const refusal = checkVersionDecision({
        actorIsDecider: decider !== null && decider === actor.employeeId,
        actorHasConflict: approverIsParty && actor.employeeId === holders.spendingApproverEmployeeId,
        actorEmployeeId: actor.employeeId,
        createdByEmployeeId: version.createdByEmployeeId,
        sentByEmployeeId: version.sentByEmployeeId,
        state: version.state,
      });
      // Who may not decide is told first; then a year that has ended, whether or not its closure has run; then the state.
      if (refusal && refusal !== 'NOT_SENT') throw new BudgetDecisionRefusedError(refusal);
      const today = await this.support.today(new Date(), tx);
      if (yearHasEnded(version.year, today, fiscalStart)) throw new BudgetYearEndedError(version.year);
      if (refusal) throw new BudgetDecisionRefusedError(refusal);
      // The requests that wait on this budget are locked before the year, as every writer of the system does (F31).
      await this.listeners.lockWaiting(tx, { costCenterId: version.costCenterId, year: version.year });
      await this.yearLock.lock(tx, version.costCenterId, [version.year]);

      const outcome = OUTCOME[body.decision];
      const now = new Date();
      const previous =
        outcome.decision === 'APPROVED' ? siblings.find((other) => other.state === 'APPROVED') : undefined;
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

      // A refused version leaves its proposal as it is, `REVIEWED` (F63, `QĐ-92c`): Finance makes another version from it, or the
      // head sends a proposal that follows it.
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
      else await this.listeners.versionRefused(tx, actor, { ...event, decision: outcome.decision });

      const record = await this.versions.findById(id, tx);
      if (!record) throw new BudgetVersionNotFoundError();
      await this.notifier.versionDecided(
        tx,
        record,
        { decision: outcome.decision, reason: body.reason ?? null, at: now },
        today,
      );

      return record;
    });

    // Read once the decision is committed: the view reads the record of it, which is not visible before.
    return this.views.wire(decided);
  }
}
