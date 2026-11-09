import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { AuditApi } from '../../audit/public/audit.api';
import type { AuditValue } from '../../audit/public/audit.types';
import { ghostSeatAuditEvent, type GhostSeatActor } from '../optimization-audit-event.mapper';
import { GhostSeatRepo } from './ghost-seat.repo';
import { canMove, settlementOf, type SettlementInput } from './ghost-seat-state.policy';
import type { GhostSeatCloseReason, GhostSeatRecord, NewGhostSeat } from './ghost-seat.types';

const snapshot = (record: GhostSeatRecord): { [key: string]: AuditValue } => ({
  group: record.group,
  state: record.state,
  closeReason: record.closeReason,
  freeSeats: record.freeSeats,
  revocationTaskId: record.revocationTaskId,
});

/**
 * The acts on a recommendation, each in the transaction of the caller and each audited: make it, change the free seats of a `G1`,
 * close it, replace it by another (`QĐ-108i`), tie it to a reclaim, put it back to open when the reclaim failed, and mark that the
 * holder of a seat already decided on has left. A caller that also calls licensing locks the recommendation first (`DA6-23`).
 */
@Injectable()
export class GhostSeatService {
  constructor(
    private readonly repo: GhostSeatRepo,
    private readonly audit: AuditApi,
  ) {}

  async create(tx: DbTx, input: NewGhostSeat, actor: GhostSeatActor): Promise<GhostSeatRecord> {
    const record = await this.repo.insert(tx, input);
    await this.audit.record(
      tx,
      ghostSeatAuditEvent(actor, record.organizationId, 'GHOST_SEAT.CREATED', record.id, null, snapshot(record)),
    );

    return record;
  }

  /** The free seats of an open `G1` changed (`US-10-01` AC-7): the evidence of the day it was made stays as it was. */
  async updateFreeSeats(tx: DbTx, record: GhostSeatRecord, freeSeats: number, actor: GhostSeatActor): Promise<void> {
    const updated = await this.repo.update(tx, record.id, { freeSeats });
    await this.audit.record(
      tx,
      ghostSeatAuditEvent(
        actor,
        record.organizationId,
        'GHOST_SEAT.G1_UPDATED',
        record.id,
        snapshot(record),
        snapshot(updated),
      ),
    );
  }

  async close(
    tx: DbTx,
    record: GhostSeatRecord,
    reason: GhostSeatCloseReason,
    actor: GhostSeatActor,
    now: Date = new Date(),
  ): Promise<void> {
    if (!canMove(record.state, 'CLOSED')) return;
    const updated = await this.repo.update(tx, record.id, {
      state: 'CLOSED',
      closeReason: reason,
      closedAt: now,
      closedByAppUserId: actor.kind === 'USER' ? actor.principal.appUserId : null,
    });
    await this.audit.record(
      tx,
      ghostSeatAuditEvent(
        actor,
        record.organizationId,
        'GHOST_SEAT.CLOSED',
        record.id,
        snapshot(record),
        snapshot(updated),
      ),
    );
  }

  /**
   * Closes `record` as replaced and makes `replacement` in its place, in one transaction (`QĐ-108i`, `Q-82`): the old one names the new
   * one's id before it exists (the key is checked at commit), so gate 8 never sees two unclosed ones for a seat.
   */
  async supersede(
    tx: DbTx,
    record: GhostSeatRecord,
    replacement: NewGhostSeat,
    actor: GhostSeatActor,
    now: Date = new Date(),
  ): Promise<GhostSeatRecord> {
    const replacementId = randomUUID();
    const closed = await this.repo.update(tx, record.id, {
      state: 'CLOSED',
      closeReason: 'SUPERSEDED',
      closedAt: now,
      closedByAppUserId: null,
      supersededById: replacementId,
    });
    await this.audit.record(
      tx,
      ghostSeatAuditEvent(actor, record.organizationId, 'GHOST_SEAT.SUPERSEDED', record.id, snapshot(record), {
        ...snapshot(closed),
        supersededById: replacementId,
      }),
    );

    return this.create(tx, { ...replacement, id: replacementId }, actor);
  }

  /** Applies `settlementOf` to a recommendation about a seat: closes it, puts it back to open, or leaves it. Returns what it did. */
  async settle(
    tx: DbTx,
    record: GhostSeatRecord,
    facts: Pick<SettlementInput, 'seatStillOpen' | 'task'>,
    actor: GhostSeatActor,
    now: Date = new Date(),
  ): Promise<'KEPT' | 'CLOSED' | 'REOPENED'> {
    const settlement = settlementOf({ group: record.group, state: record.state, ...facts });
    if (settlement.kind === 'CLOSE') {
      await this.close(tx, record, settlement.reason, actor, now);

      return 'CLOSED';
    }
    if (settlement.kind === 'REOPEN') {
      await this.reopen(tx, record, actor);

      return 'REOPENED';
    }

    return 'KEPT';
  }

  /** The reclaim of a `G2` was opened (by the IT Admin) or found under way (by a run): the recommendation holds the task. */
  async markReclaimDecided(
    tx: DbTx,
    record: GhostSeatRecord,
    taskId: string,
    actor: GhostSeatActor,
    byInCharge?: boolean,
  ): Promise<void> {
    const updated = await this.repo.update(tx, record.id, { state: 'RECLAIM_DECIDED', revocationTaskId: taskId });
    await this.audit.record(
      tx,
      ghostSeatAuditEvent(actor, record.organizationId, 'GHOST_SEAT.RECLAIM_OPENED', record.id, snapshot(record), {
        ...snapshot(updated),
        ...(byInCharge === undefined ? {} : { byInCharge }),
      }),
    );
  }

  /** The reclaim the recommendation waited for was closed as failed: the seat stays as it was, so the `G2` is open again (`US-07-05` AC-15). */
  async reopen(tx: DbTx, record: GhostSeatRecord, actor: GhostSeatActor): Promise<void> {
    if (!canMove(record.state, 'OPEN')) return;
    const updated = await this.repo.update(tx, record.id, { state: 'OPEN', revocationTaskId: null });
    await this.audit.record(
      tx,
      ghostSeatAuditEvent(
        actor,
        record.organizationId,
        'GHOST_SEAT.REOPENED',
        record.id,
        snapshot(record),
        snapshot(updated),
      ),
    );
  }

  /** The holder of a seat a head already decided on has left: said once, on the day the run found it (`DA6-04`). */
  async markHolderLeft(tx: DbTx, record: GhostSeatRecord, day: BusinessDate, actor: GhostSeatActor): Promise<void> {
    if (record.holderLeftOn) return;
    await this.repo.update(tx, record.id, { holderLeftOn: day });
    await this.audit.record(
      tx,
      ghostSeatAuditEvent(actor, record.organizationId, 'GHOST_SEAT.HOLDER_LEFT_MARKED', record.id, snapshot(record), {
        ...snapshot(record),
        holderLeftOn: day,
      }),
    );
  }
}
