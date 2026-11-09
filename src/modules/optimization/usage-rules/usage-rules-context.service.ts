import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { CatalogApi } from '../../catalog/public/catalog.api';
import type { RuleSeat } from '../../licensing/public/licensing-ghost-seat.types';
import { LicensingUsageApi } from '../../licensing/public/licensing-usage.api';
import { OperatingParametersApi } from '../../operating-parameters/public/operating-parameters.api';
import { PersonnelApi } from '../../personnel/public/personnel.api';
import type { TransferFact } from '../../personnel/public/personnel.types';
import { UsageEvidenceApi } from '../../usage/public/usage-evidence.api';
import { GhostSeatDecisionRepo } from '../ghost-seat/ghost-seat-decision.repo';
import { GhostSeatRepo } from '../ghost-seat/ghost-seat.repo';
import type { GhostSeatRecord } from '../ghost-seat/ghost-seat.types';
import type { RulePass } from '../internal-rules/internal-rules.types';
import { thresholdsOf } from './usage-assessment.policy';
import { verdictOfSources } from './usage-gates.policy';
import { UsageRulesRepo } from './usage-rules.repo';
import type { LeaveSpan, UsageApplicationContext, UsageRunContext } from './usage-rules.types';

export const NEW_ASSIGNMENT_GRACE_PARAMETER = 'GHOST_SEAT_NEW_ASSIGNMENT_GRACE_DAYS';
export const DETECTION_THRESHOLD_PARAMETER = 'DETECTION_THRESHOLD_DAYS';
const DEFAULT_GRACE_DAYS = 14;

type Price = Awaited<ReturnType<UsageApplicationContext['price']>>;

const personalPeople = (seats: readonly RuleSeat[]): string[] => [
  ...new Set(seats.filter((seat) => seat.kind === 'PERSONAL').map((seat) => seat.employeeId)),
];

/**
 * What the weekly pass of `G3`/`G4` reads before it judges a seat, each in a fixed number of statements: for the whole run the people handing over,
 * the transfers in overlap, the exemptions, the recommendations that exist and the ones a head kept; for one application its evidence, what the
 * sources let the rule conclude, its thresholds, when each seat could be used, who was on leave and the price of a seat.
 */
@Injectable()
export class UsageRulesContextService {
  constructor(
    private readonly parameters: OperatingParametersApi,
    private readonly personnel: PersonnelApi,
    private readonly usage: UsageEvidenceApi,
    private readonly licensingUsage: LicensingUsageApi,
    private readonly catalog: CatalogApi,
    private readonly repo: GhostSeatRepo,
    private readonly decisions: GhostSeatDecisionRepo,
    private readonly rules: UsageRulesRepo,
  ) {}

  async runContextOf(pass: RulePass, seats: readonly RuleSeat[]): Promise<UsageRunContext> {
    const people = personalPeople(seats);
    const chains = [...new Set(seats.map((seat) => seat.chainRootId))];
    const transfers = new Map<string, TransferFact>();
    for (const transfer of await this.personnel.getTransfersInOverlap(people, pass.today)) {
      if (!transfers.has(transfer.employeeId)) transfers.set(transfer.employeeId, transfer);
    }
    const existing = new Map<string, GhostSeatRecord>(
      (await this.repo.unclosedOfSeats(pass.organizationId)).flatMap((record) =>
        record.seatChainId && record.group !== 'G2' ? [[record.seatChainId, record] as const] : [],
      ),
    );
    const grace = await this.parameters.getValue(NEW_ASSIGNMENT_GRACE_PARAMETER);

    return {
      ...pass,
      graceDays: typeof grace === 'number' ? grace : DEFAULT_GRACE_DAYS,
      handingOver: new Set((await this.personnel.getHandingOverCases(people)).map((entry) => entry.employeeId)),
      transfers,
      exemptions: await this.decisions.runningExemptionOf(chains, pass.today),
      existing,
      previous: await this.repo.lastKeptOrExemptedOf(chains),
    };
  }

  async applicationOf(
    run: UsageRunContext,
    applicationId: string,
    seats: readonly RuleSeat[],
  ): Promise<UsageApplicationContext> {
    const people = personalPeople(seats);
    const evidence = await this.usage.evidenceFor({ applicationId, employeeIds: people, asOf: run.today });
    const intervals = await this.licensingUsage.listAssignmentIntervals({
      applicationId,
      employeeIds: people,
      from: run.today,
      to: run.today,
    });
    const usableOn = new Map<string, BusinessDate>();
    for (const interval of intervals) {
      const known = usableOn.get(interval.chainRootId);
      if (!known || interval.usableOn < known) usableOn.set(interval.chainRootId, interval.usableOn);
    }
    const prices = new Map<string, Promise<Price>>();

    return {
      applicationId,
      evidence,
      verdict: verdictOfSources(evidence.sources),
      thresholds: await this.thresholdsOfApplication(applicationId),
      usableOn,
      leaves: await this.leavesOf(people, [...usableOn.values()].sort()[0] ?? run.today, run.today),
      price: (planId) => {
        const known = prices.get(planId) ?? this.priceOf(planId);
        prices.set(planId, known);

        return known;
      },
    };
  }

  private async thresholdsOfApplication(applicationId: string): Promise<UsageApplicationContext['thresholds']> {
    const row = (await this.rules.thresholdsOf([applicationId])).get(applicationId);
    const organization = await this.parameters.getValue(DETECTION_THRESHOLD_PARAMETER);

    return thresholdsOf(
      row ? { monitor: row.monitorDays, review: row.reviewDays, action: row.actionDays } : null,
      Array.isArray(organization) ? organization : null,
    );
  }

  private async leavesOf(
    people: readonly string[],
    from: BusinessDate,
    to: BusinessDate,
  ): Promise<Map<string, LeaveSpan[]>> {
    const leaves = new Map<string, LeaveSpan[]>();
    for (const leave of await this.personnel.getLeaveIntervals(people, from, to)) {
      leaves.set(leave.employeeId, [
        ...(leaves.get(leave.employeeId) ?? []),
        { startedOn: leave.startedOn, endedOn: leave.endedOn },
      ]);
    }

    return leaves;
  }

  private async priceOf(planId: string): Promise<Price> {
    const priced = await this.catalog.getPlanPrice(planId, '');
    if (!priced || priced.kind !== 'RECURRING') return null;

    return {
      amountMinor: priced.unitPrice.amountMinor,
      currency: priced.unitPrice.currency,
      billingCycle: priced.billingCycle,
    };
  }
}
