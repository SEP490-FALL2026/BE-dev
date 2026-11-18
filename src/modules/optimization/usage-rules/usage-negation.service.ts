import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { LicensingUsageApi } from '../../licensing/public/licensing-usage.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { UsageEvidenceApi } from '../../usage/public/usage-evidence.api';
import { GhostSeatDecisionRepo } from '../ghost-seat/ghost-seat-decision.repo';
import { GhostSeatRepo } from '../ghost-seat/ghost-seat.repo';
import { GhostSeatService } from '../ghost-seat/ghost-seat.service';
import type { GhostSeatRecord } from '../ghost-seat/ghost-seat.types';
import { UNDECIDED_STATES } from '../ghost-seat/ghost-seat-state.policy';
import { daysOfChain, personEvidenceOf, reactionToActivity } from './usage-assessment.policy';

const SYSTEM = { kind: 'SYSTEM' } as const;

/** What a day of activity did to a recommendation. */
export type Reaction = 'NEGATED' | 'FLAGGED' | 'NONE';

/**
 * A recommendation nobody decided on is denied by activity after the day it rests on (`US-10-04` AC-5): it closes `NEGATED` with no notice. One whose reclaim
 * was decided is not closed by the system; the row is flagged with the first day of activity after the decision (`Q-92`). Used by the weekly pass, and
 * by the confirmation of a report, which cannot wait for the week.
 */
@Injectable()
export class UsageNegationService {
  constructor(
    private readonly repo: GhostSeatRepo,
    private readonly decisions: GhostSeatDecisionRepo,
    private readonly ghostSeats: GhostSeatService,
    private readonly usage: UsageEvidenceApi,
    private readonly licensingUsage: LicensingUsageApi,
    private readonly organizationReads: OrganizationReadApi,
  ) {}

  /** Applies the reaction to a recommendation already locked in `tx`; `activeDates` are the days of the chain (from its first usable day). */
  async react(tx: DbTx, record: GhostSeatRecord, activeDates: readonly BusinessDate[], now: Date): Promise<Reaction> {
    if (record.state !== 'RECLAIM_DECIDED' && !UNDECIDED_STATES.includes(record.state)) return 'NONE';
    const decidedOn =
      record.state === 'RECLAIM_DECIDED'
        ? ((await this.decisions.latestReclaimOf(record.id, tx))?.decidedOn ?? null)
        : null;
    const reaction = reactionToActivity(
      { state: record.state, lastActiveDate: record.usage?.lastActiveDate ?? null },
      activeDates,
      decidedOn,
    );
    if (reaction.kind === 'NEGATE') {
      await this.ghostSeats.close(tx, record, 'NEGATED', SYSTEM, now);

      return 'NEGATED';
    }
    if (reaction.kind === 'FLAG') {
      await this.ghostSeats.flagActivityAfterDecision(tx, record, reaction.firstDay, SYSTEM);

      return 'FLAGGED';
    }

    return 'NONE';
  }

  /** The report of an application was just confirmed: reads its usage again for the people with a recommendation and applies the reaction. Returns how many closed. */
  async negateForApplication(tx: DbTx, applicationId: string, now: Date): Promise<number> {
    const organization = await this.organizationReads.getOrganization(tx);
    if (!organization) return 0;
    const records = await this.repo.unclosedUsageOfApplication(organization.id, applicationId, tx);
    const people = [...new Set(records.flatMap((record) => record.employeeId ?? []))];
    if (people.length === 0) return 0;
    const today = await this.organizationReads.businessToday(now, tx);
    const evidence = await this.usage.evidenceFor({ applicationId, employeeIds: people, asOf: today }, tx);
    const intervals = await this.licensingUsage.listAssignmentIntervals(
      { applicationId, employeeIds: people, from: today, to: today },
      tx,
    );
    const usableOn = new Map(intervals.map((interval) => [interval.chainRootId, interval.usableOn] as const));
    let closed = 0;
    for (const listed of records) {
      const record = await this.repo.lock(tx, listed.id);
      if (!record || record.state === 'CLOSED' || !record.employeeId || !record.seatChainId) continue;
      const since = usableOn.get(record.seatChainId);
      if (!since) continue;
      const days = daysOfChain(personEvidenceOf(evidence.sources, record.employeeId).activeDates, since);
      if ((await this.react(tx, record, days, now)) === 'NEGATED') closed += 1;
    }

    return closed;
  }
}
