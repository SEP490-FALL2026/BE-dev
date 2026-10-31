import { Injectable, OnModuleInit } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import {
  ApprovalRoleChangeListeners,
  type ApprovalRoleChangeListener,
} from '../../identity-access/public/identity-access.extension-points';
import type { ApprovalRoleChange } from '../../identity-access/public/identity-access.types';
import { StepReassignmentRepo } from '../step-routing/step-reassignment.repo';
import { StepReassignmentService } from './step-reassignment.service';

/**
 * What the steps of the requests do when the Super Admin changes who holds the spending approver, the substitute for a
 * conflict of interest or the fallback approver, or when the role of Finance is granted or taken (`FR-3.16`, `US-05-12` AC-4,
 * `US-05-11` AC-9), in the transaction of the change. The steps the one who held the role holds are looked at, and every step
 * that waits is tried again, since a role that was empty may now be held. Setting a role is configuration, never an approval
 * (`SoD-1`): nothing is decided here. It adds itself to the change listeners of the approval roles when the module starts, so
 * identity-access never imports this module.
 */
@Injectable()
export class RequestsApprovalRoleListener implements ApprovalRoleChangeListener, OnModuleInit {
  /** The extension points this class registers with (gate extension-wiring, R1). */
  static readonly binds = [ApprovalRoleChangeListeners] as const;

  constructor(
    private readonly repo: StepReassignmentRepo,
    private readonly reassignment: StepReassignmentService,
    private readonly roleChanges: ApprovalRoleChangeListeners,
  ) {}

  onModuleInit(): void {
    this.roleChanges.add('requests.step-reassignment', (tx, change) => this.onChange(tx, change));
  }

  async onChange(tx: DbTx, change: ApprovalRoleChange): Promise<void> {
    const heldByPrevious =
      change.fromEmployeeId === null ? [] : await this.repo.requestIdsHeldBy([change.fromEmployeeId], tx);
    const waiting = await this.repo.waitingRequestIds(tx);

    await this.reassignment.reconcileRequests(
      tx,
      [...heldByPrevious, ...waiting],
      { kind: 'ROLE_HOLDER_CHANGED', employeeId: change.fromEmployeeId },
      change.id,
      new Date(),
    );
  }
}
