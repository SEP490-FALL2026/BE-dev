import { Injectable, OnModuleInit } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { RevocationListeners, type RevocationEvent } from '../../licensing/public/licensing.extension-points';
import { SeatReleaseService } from './seat-release.service';

/** The name the release by day takes among the listeners of a revocation. */
const SEAT_RELEASE_LISTENER = 'requests.seat-release';

/**
 * What the completion of a revocation tells the money a request holds for the seat (`RV-07`, `M-06`): the module of requests adds this to
 * licensing's `RevocationListeners` when it starts, so neither licensing nor budgets import it. Only the end of the work of a completed task
 * (`AFTER_WORK` with `COMPLETED`; the same moment when the task is taken is `IN_PROGRESS`) gives back, in the transaction of the completion;
 * every other moment, and a task closed as failed, gives back nothing. It does not depend on the order of the other listeners: it only
 * writes commitments, which none of them reads.
 */
@Injectable()
export class SeatRevocationHook implements OnModuleInit {
  /** The extension points this class registers with (gate extension-wiring, R1). */
  static readonly binds = [RevocationListeners] as const;

  constructor(
    private readonly seats: SeatReleaseService,
    private readonly revocation: RevocationListeners,
  ) {}

  onModuleInit(): void {
    this.revocation.add(SEAT_RELEASE_LISTENER, (tx, event) => this.heard(tx, event));
  }

  private heard(tx: DbTx, event: RevocationEvent): Promise<void> {
    if (event.moment !== 'AFTER_WORK') return Promise.resolve();

    return this.seats.afterRevocation(tx, event.task, event.now);
  }
}
