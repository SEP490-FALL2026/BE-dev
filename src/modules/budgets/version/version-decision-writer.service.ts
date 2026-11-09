import { Injectable } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { AuditApi } from '../../audit/public/audit.api';
import type { DecisionBodyDto } from '../budget/budget.dto';
import { BudgetVersionNotFoundError } from '../budget/budget.errors';
import { commitmentAttachedAfter, decisionOutcomeOf, versionDecidedDetail } from '../budget/budget.policy';
import { BudgetNotifierService } from '../budget/budget-notifier.service';
import { budgetAuditEvent } from '../budget/budget-facts.service';
import { CommitmentRepo } from '../budget/commitment.repo';
import { DecisionRepo } from '../budget/decision.repo';
import { VersionRepo, type VersionRecord } from '../budget/version.repo';
import type { JudgedDecision } from './version-decision-judge.service';

/**
 * Writes the decision of the spending approver on a version once it was judged (`US-06-11`): the version becomes the current budget of its
 * Cost Center and year and replaces the one that was current (INV-21), or is refused or sent back; the decision is a record that is never
 * changed; the commitments that waited for a budget are attached to an approved version (`US-06-07`); whoever waits on this budget and the
 * people concerned hear of it in the same transaction.
 */
@Injectable()
export class VersionDecisionWriter {
  constructor(
    private readonly versions: VersionRepo,
    private readonly decisions: DecisionRepo,
    private readonly commitments: CommitmentRepo,
    private readonly notifier: BudgetNotifierService,
    private readonly audit: AuditApi,
  ) {}

  async write(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    judged: JudgedDecision,
    body: DecisionBodyDto,
  ): Promise<VersionRecord> {
    const { version, siblings, today } = judged;
    const id = version.id;
    const outcome = decisionOutcomeOf(body.decision);
    const now = new Date();
    const previous = outcome.decision === 'APPROVED' ? siblings.find((other) => other.state === 'APPROVED') : undefined;
    // One current version at a time (INV-21): the one it replaces goes first, then this one becomes current.
    if (previous) await this.versions.setState(tx, previous.id, 'SUPERSEDED');
    await this.versions.setState(tx, id, outcome.state);
    await this.decisions.insert(tx, {
      organizationId: version.organizationId,
      versionId: id,
      decision: outcome.decision,
      decidedByEmployeeId: actor.employeeId,
      deciderRole: 'SPENDING_APPROVER',
      reason: body.reason ?? null,
      totalMinor: version.totalMinor,
      previousTotalMinor: previous?.totalMinor ?? null,
      currency: version.currency,
      decidedAt: now,
    });

    // A refused version leaves its proposal as it is, `REVIEWED` (`QĐ-92c`): Finance makes another version from it, or the
    // head sends a proposal that follows it.
    await this.audit.record(
      tx,
      budgetAuditEvent(
        actor,
        version.organizationId,
        `BUDGET_VERSION.${outcome.decision}`,
        'BUDGET_VERSION',
        id,
        versionDecidedDetail(version, previous, body.reason),
      ),
    );
    if (outcome.decision === 'APPROVED') await this.attachWaiting(tx, version, now);

    const record = await this.versions.findById(id, tx);
    if (!record) throw new BudgetVersionNotFoundError();
    await this.notifier.versionDecided(
      tx,
      record,
      { decision: outcome.decision, reason: body.reason ?? null, at: now },
      today,
    );

    return record;
  }

  /** The commitments of the Cost Center and year that waited for a budget are attached to the version that was approved. */
  private async attachWaiting(tx: DbTx, version: VersionRecord, now: Date): Promise<void> {
    const attached = await this.commitments.attachWaiting(tx, {
      costCenterId: version.costCenterId,
      year: version.year,
      versionId: version.id,
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
        after: commitmentAttachedAfter(commitment, {
          versionId: version.id,
          costCenterId: version.costCenterId,
          year: version.year,
        }),
        correlationId: version.id,
      });
    }
  }
}
