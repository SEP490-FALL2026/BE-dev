import { Injectable } from '@nestjs/common';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { HandoverService } from '../handover/handover.service';
import type {
  CancelHandoverInput,
  HandoverDutyBrief,
  OpenedHandoverDuties,
  OpenHandoverDutiesInput,
  ReconcileHandoverInput,
} from './licensing-handover.types';

/**
 * The licensing facade for the handover confirmation of the personal seats of a person who leaves: it opens, moves and cancels the
 * duties of a case, and answers where each stands.
 */
@Injectable()
export class LicensingHandoverApi {
  constructor(private readonly handovers: HandoverService) {}

  /**
   * Opens the handover confirmation of every personal seat of a person who leaves, as soon as the departure is recorded and before
   * any revocation task exists: the head of their department (a successor to a head who leaves) confirms each tool, and the tool
   * is held until it is confirmed or the deadline `dueOn`, which the caller counts in working days (the last working day less one
   * for a planned departure). A seat that has a duty waiting or a confirmation that answers it gets none. Creates and completes no
   * task. The other sources open theirs through the revocation they open.
   */
  openHandoverDuties(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: OpenHandoverDutiesInput,
  ): Promise<OpenedHandoverDuties> {
    return this.handovers.open(tx, actor, input);
  }

  /** The deadline of the case that opened duties moved: the duties still waiting take it and the reminder starts over. */
  reconcileHandoverDuties(tx: DbTx, actor: AuthenticatedPrincipal, input: ReconcileHandoverInput): Promise<number> {
    return this.handovers.reconcile(tx, actor, input);
  }

  /** The case that opened duties was cancelled: the duties still waiting are cancelled with the reason; confirmed ones stay. */
  cancelHandoverDuties(tx: DbTx, actor: AuthenticatedPrincipal, input: CancelHandoverInput): Promise<number> {
    return this.handovers.cancelByCase(tx, actor, input);
  }

  /**
   * Where the handover confirmation of each of these seats stands (the latest duty of each, a live one before a cancelled one): who it
   * falls to now, until when, and whether the work went on without it. A fixed number of statements however many seats there are.
   */
  getHandoverDutiesOf(assignmentIds: readonly string[], tx?: DbTx): Promise<HandoverDutyBrief[]> {
    return this.handovers.briefsOf(assignmentIds, tx);
  }
}
