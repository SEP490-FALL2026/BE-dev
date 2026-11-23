import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../../core/business-date';
import type { DbTx } from '../../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../../infrastructure/security/tokens/access-token-verifier.port';
import type { SeatTarget } from '../../../catalog/public/catalog.types';
import { AssignmentService } from '../../assignment/assignment.service';
import { AssignmentConflictError } from '../../public/licensing.errors';
import { GrantRequestGateHook } from '../../public/licensing.extension-points';
import { NO_LONGER_APPLIES, type GrantRequestAnswer } from '../../public/licensing.types';
import { ProvisioningTaskReasonRepo } from '../provisioning-task-reason.repo';
import { ProvisioningTaskRepo } from '../provisioning-task.repo';
import type { ProvisioningTaskRecord } from '../provisioning-task.types';
import { ForRevocationWithdrawalService } from '../revocation-withdrawal/for-revocation-withdrawal.service';
import { revocationActionForRegrant } from './provisioning-grant.policy';

/**
 * Handles locking and ending a replaced personal assignment during a regrant: withdraws queued transfer-only
 * revocations before ending the old right, or refuses with an overlap conflict when another revocation holds it.
 */
@Injectable()
export class ProvisioningReplacementService {
  constructor(
    private readonly tasks: ProvisioningTaskRepo,
    private readonly reasons: ProvisioningTaskReasonRepo,
    private readonly withdrawals: ForRevocationWithdrawalService,
    private readonly assignments: AssignmentService,
    private readonly gate: GrantRequestGateHook,
  ) {}

  lockLiveRevocation(tx: DbTx, assignmentId: string): Promise<ProvisioningTaskRecord | null> {
    return this.tasks.lockLiveRevocation(tx, assignmentId);
  }

  async endReplacedRight(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    facts: {
      claimed: Extract<GrantRequestAnswer, { status: 'GRANTABLE' }>;
      target: SeatTarget;
      requestId: string;
      today: BusinessDate;
      organizationId: string;
      lockedRevocation: ProvisioningTaskRecord | null;
    },
  ): Promise<string | null> {
    const { claimed, target, requestId, today, organizationId, lockedRevocation } = facts;
    if (claimed.seat !== 'PERSONAL' || !claimed.replacesAssignmentId) return null;

    const replacesAssignmentId = claimed.replacesAssignmentId;
    const canEnd = await this.assignments.canEndReplacedByGrant(tx, {
      employeeId: claimed.employeeId,
      replacesAssignmentId,
      target,
      today,
    });
    if (!canEnd) return null;

    // The lock taken before the grant sees only the tasks of revocation that were committed then. One that another transaction (a reclaim, a return) committed
    // since is seen here, with the subscription held: the right is then that task's to end, and a grant that ended it too would leave the task working an account the
    // new right uses.
    if (lockedRevocation === null && (await this.tasks.hasLiveRevocation(tx, replacesAssignmentId))) {
      throw new AssignmentConflictError('OVERLAP', 0, undefined, replacesAssignmentId);
    }
    await this.resolveRevocation(tx, actor, replacesAssignmentId, lockedRevocation);

    const ended = await this.assignments.endReplacedByGrant(tx, actor, {
      organizationId,
      requestId,
      employeeId: claimed.employeeId,
      replacesAssignmentId,
      target,
      today,
      revocationUnderWay: false,
    });
    if (ended !== null) {
      await this.gate.get().reportRightReplaced(tx, {
        assignmentId: ended,
        provisioningType: target.provisioningType,
        endedOn: today,
        now: new Date(),
      });
    }

    return ended;
  }

  private async resolveRevocation(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    assignmentId: string,
    lockedRevocation: ProvisioningTaskRecord | null,
  ): Promise<void> {
    if (lockedRevocation === null) return;
    const standing = await this.reasons.listOf([lockedRevocation.id], tx);
    const action = revocationActionForRegrant(
      lockedRevocation,
      standing.map((reason) => reason.source),
    );
    if (action === 'BLOCK') {
      throw new AssignmentConflictError('OVERLAP', 0, undefined, assignmentId, {
        revocationTaskId: lockedRevocation.id,
        revocationStatus: lockedRevocation.status,
      });
    }
    if (action === 'WITHDRAW_TRANSFER') {
      for (const reason of standing) {
        await this.withdrawals.withdraw(tx, actor, {
          assignmentId,
          source: 'TRANSFER',
          referenceId: reason.referenceId,
          cause: NO_LONGER_APPLIES,
        });
      }
    }
  }
}
