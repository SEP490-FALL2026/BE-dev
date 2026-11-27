import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../../core/business-date';
import { nextBillingBoundary } from '../../../../core/seat-month-cost';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import { SeatLedgerApi } from '../../../catalog/public/seat-ledger.api';
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
 * keeps the access of a K1 seat to the end of the paid period (`US-12-15` line 38). The line of a K2 seat is locked (`lockLine`) after the
 * subscription and before the assignment, and the key after the assignment the completion already holds; a K4 seat granted before the key pool holds no key, and the answer says so (null). No money
 * moves for a K4 key: its price was paid once.
 */
@Injectable()
export class RevocationAftermath {
  constructor(
    private readonly keys: LicenseKeyAssignmentService,
    private readonly leaverAlert: RevocationLeaverAlert,
    private readonly checklists: ProvisioningK1Checklist,
    private readonly seatLedger: SeatLedgerApi,
  ) {}

  /** Whether the seat holds a key (a K4 seat granted before the key pool holds none), its row locked until commit. */
  holdsKey(tx: DbTx, assignmentId: string): Promise<boolean> {
    return this.keys.holdsKey(tx, assignmentId);
  }

  /**
   * Locks the subscription period and then the line of the seat (tiers 6 and 6c), the lines the completion of a `K2` seat writes to in
   * `follow`, before the assignment is locked (tier 8): the order every writer of a line keeps. A seat with no period or no line locks nothing.
   */
  async lockLine(tx: DbTx, task: ProvisioningTaskRecord): Promise<void> {
    const subscriptionId = task.assignment.subscriptionId;
    if (!subscriptionId) return;
    const context = await this.seatLedger.findLineWithPeriodByPlan(subscriptionId, task.assignment.planId, tx);
    if (!context) return;
    await this.seatLedger.lockPeriodsAndLines(tx, [subscriptionId], [context.line.id]);
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
    await this.recordMemberReduction(tx, actor, input.task, input.today);

    return { licenseKeyId: taken?.licenseKeyId ?? null };
  }

  /** For `K2` `MEMBERS` revocations, records `MEMBER` `REDUCE -1` effective on the next monthly payment date. */
  private async recordMemberReduction(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    task: ProvisioningTaskRecord,
    today: BusinessDate,
  ): Promise<void> {
    if (!task.assignment.subscriptionId) return;
    const context = await this.seatLedger.findLineWithPeriodByPlan(
      task.assignment.subscriptionId,
      task.assignment.planId,
      tx,
    );
    if (!context || context.plan.provisioningType !== 'K2' || context.period.seatCounting !== 'MEMBERS') return;
    if (context.line.ledgerOpenedOn === null) return;
    const nextPaymentDate = nextBillingBoundary({
      billingCycle: 'MONTHLY',
      renewalDate: context.period.renewalDate,
      endDate: context.period.endDate,
      fromDate: today,
    });
    if (nextPaymentDate === null || nextPaymentDate < context.line.ledgerOpenedOn) return;
    if (context.line.closedOn !== null && nextPaymentDate > context.line.closedOn) return;

    await this.seatLedger.recordMember(tx, context.line, -1, nextPaymentDate, {
      recordedByEmployeeId: actor.employeeId,
    });
  }
}
