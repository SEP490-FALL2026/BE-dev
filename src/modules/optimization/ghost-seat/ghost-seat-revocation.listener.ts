import { Injectable, OnModuleInit } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { LicensingGhostSeatApi } from '../../licensing/public/licensing-ghost-seat.api';
import { RevocationListeners, type RevocationEvent } from '../../licensing/public/licensing.extension-points';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { GhostSeatRepo } from './ghost-seat.repo';
import { GhostSeatService } from './ghost-seat.service';

/** The name the recommendations take among the listeners of a revocation. */
const GHOST_SEAT_REVOCATION_LISTENER = 'optimization.ghost-seat';

/**
 * What the revocation of a seat tells the `G2` recommendation that holds it (`US-07-05` AC-12, AC-15; `DA6-02`): the module adds this
 * to licensing's `RevocationListeners` when it starts, so licensing never imports it. Only a task that is completed (the claim also
 * announces `AFTER_WORK`, with the task still in progress, and changes nothing here) and a task closed as failed matter. A
 * completed task whose seat ended closes the recommendation (`ACCEPTED` when the task carries its reason, else `SEAT_ENDED`), one whose
 * seat still holds (a K1 access that runs on) leaves it decided; a task closed as failed puts the `G2` back to open.
 *
 * It runs in the transaction of licensing, which already holds the task, so it picks the recommendation `FOR UPDATE SKIP LOCKED` and
 * never waits for one that another transaction holds: the daily run settles that one later from the status of its task (`DA6-23`).
 */
@Injectable()
export class GhostSeatRevocationListener implements OnModuleInit {
  /** The extension points this class registers with (gate extension-wiring, R1). */
  static readonly binds = [RevocationListeners] as const;

  constructor(
    private readonly repo: GhostSeatRepo,
    private readonly ghostSeats: GhostSeatService,
    private readonly licensing: LicensingGhostSeatApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly revocation: RevocationListeners,
  ) {}

  onModuleInit(): void {
    this.revocation.add(GHOST_SEAT_REVOCATION_LISTENER, (tx, event) => this.heard(tx, event));
  }

  private async heard(tx: DbTx, event: RevocationEvent): Promise<void> {
    if (event.moment === 'AFTER_WORK' && event.task.status !== 'COMPLETED') return;
    if (event.moment !== 'AFTER_WORK' && event.moment !== 'CLOSED_FAILED') return;
    const records = (await this.repo.lockUnclosedOfTask(tx, event.task.id)).filter((record) => record.group === 'G2');
    if (records.length === 0) return;
    const today = await this.organizationReads.businessToday(event.now, tx);
    const seats = await this.licensing.listSeatsForRules({ asOf: today, employeeIds: [event.task.employeeId] }, tx);
    const standings = await this.licensing.getRevocationTaskStatuses([event.task.id], tx);
    const openChains = new Set(seats.map((seat) => seat.chainRootId));
    const referencedIds = new Set(standings.get(event.task.id)?.referencedIds ?? []);

    for (const record of records) {
      await this.ghostSeats.settle(
        tx,
        record,
        {
          seatStillOpen: record.seatChainId !== null && openChains.has(record.seatChainId),
          task: { status: event.task.status, referencesRecommendation: referencedIds.has(record.id) },
        },
        { kind: 'USER', principal: event.actor },
        event.now,
      );
    }
  }
}
