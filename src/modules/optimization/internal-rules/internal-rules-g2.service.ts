import { Injectable, Logger } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import { describeForOperator } from '../../../infrastructure/observability/operator-error';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { LicensingGhostSeatApi } from '../../licensing/public/licensing-ghost-seat.api';
import type { RuleSeat } from '../../licensing/public/licensing-ghost-seat.types';
import { NotificationsApi } from '../../notifications/public/notifications.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { GhostSeatRepo } from '../ghost-seat/ghost-seat.repo';
import { GhostSeatService } from '../ghost-seat/ghost-seat.service';
import type { GhostSeatRecord, NewGhostSeat } from '../ghost-seat/ghost-seat.types';
import { decideG2, type ChainRecommendation, type G2Step, type SeatFacts } from './internal-rules.policy';
import type { RulePass } from './internal-rules.types';

const SYSTEM = { kind: 'SYSTEM' } as const;

/** What one pass of `G2` knows of the seats, the people and the names it judges and tells. */
interface Context {
  holderLeft: Set<string>;
  existing: Map<string, GhostSeatRecord>;
}

const chainOf = (record: GhostSeatRecord): ChainRecommendation => ({
  id: record.id,
  group: record.group,
  state: record.state,
  revocationTaskId: record.revocationTaskId,
  holderLeftOn: record.holderLeftOn,
});

const factsOf = (seat: RuleSeat, holderLeft: boolean): SeatFacts => ({
  kind: seat.kind,
  provisioningType: seat.provisioningType,
  pricingModel: seat.pricingModel,
  holderLeft,
  liveRevocation: seat.liveRevocation ? { taskId: seat.liveRevocation.taskId } : null,
  terminatingUntil: seat.terminatingUntil,
});

/**
 * `G2` (`US-10-01` AC-2, AC-4, AC-6, AC-10; `US-10-02` AC-11; `US-07-05` AC-12, AC-15): a pass over the seats that are open. The seat
 * of a person who left gets one `G2` for its chain (gate 8, `decideG2` in the policy); nothing here opens a revocation (`SoD-6`: the
 * IT Admin does), and a `G2` that is `OPEN` is told once to the IT Admin in charge. Each seat is judged in a transaction of its own.
 */
@Injectable()
export class InternalRulesG2Service {
  private readonly logger = new Logger(InternalRulesG2Service.name);

  constructor(
    private readonly runner: TransactionRunner,
    private readonly licensing: LicensingGhostSeatApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly notifications: NotificationsApi,
    private readonly repo: GhostSeatRepo,
    private readonly ghostSeats: GhostSeatService,
    private readonly catalog: CatalogApi,
    private readonly identity: IdentityAccessApi,
  ) {}

  /** Judges every open seat, then settles the recommendations whose seat or task moved (`DA6-23`: what the listener left to this pass). */
  async pass(pass: RulePass): Promise<void> {
    const seats = await this.licensing.listSeatsForRules({ asOf: pass.today });
    await this.detect(pass, seats);
    await this.settle(pass, seats);
  }

  private async detect(pass: RulePass, seats: readonly RuleSeat[]): Promise<void> {
    const personal = seats.filter((seat) => seat.kind === 'PERSONAL');
    const context = await this.contextOf(pass, personal);
    for (const seat of personal) {
      try {
        const decision = decideG2(factsOf(seat, context.holderLeft.has(seat.employeeId)), existingOf(context, seat));
        if (decision.skip) {
          pass.tally.skip({ subjectType: 'ASSIGNMENT', subjectId: seat.assignmentId, ...decision.skip });
        }
        if (decision.step.kind !== 'NONE') {
          const step = decision.step;
          await this.runner.run((tx) => this.apply(tx, pass, seat, step));
        }
      } catch (error) {
        pass.tally.failed();
        this.logger.error(`G2 of seat ${seat.assignmentId} failed: ${describeForOperator(error)}`);
      }
    }
  }

  private async contextOf(pass: RulePass, personal: readonly RuleSeat[]): Promise<Context> {
    const holders = await this.organizationReads.getEmployees([...new Set(personal.map((seat) => seat.employeeId))]);
    const leftIds = new Set(holders.filter((holder) => holder.status !== 'ACTIVE').map((holder) => holder.id));

    return {
      holderLeft: leftIds,
      existing: new Map(
        (await this.repo.unclosedOfSeats(pass.organizationId)).flatMap((record) =>
          record.seatChainId ? [[record.seatChainId, record] as const] : [],
        ),
      ),
    };
  }

  private async apply(tx: DbTx, pass: RulePass, seat: RuleSeat, step: G2Step): Promise<void> {
    if (step.kind === 'LINK_TASK' || step.kind === 'MARK_HOLDER_LEFT') {
      const record = await this.repo.lock(tx, step.recommendationId);
      if (!record || record.state === 'CLOSED') return;
      if (step.kind === 'LINK_TASK') await this.ghostSeats.markReclaimDecided(tx, record, step.taskId, SYSTEM);
      else await this.ghostSeats.markHolderLeft(tx, record, pass.today, SYSTEM);
    } else if (step.kind === 'CREATE') {
      await this.createChecked(tx, pass, seat, step);
    }
  }

  /**
   * What the pass read before the lock may have moved (a head decided the reclaim of the `G3`/`G4` it would replace, a revocation began): the
   * recommendation it replaces is locked, the seat read again in the same transaction and judged again (`QĐ-108i`, `DA6-04`).
   */
  private async createChecked(
    tx: DbTx,
    pass: RulePass,
    seat: RuleSeat,
    step: Extract<G2Step, { kind: 'CREATE' }>,
  ): Promise<void> {
    const locked = step.supersedes ? await this.repo.lock(tx, step.supersedes) : null;
    const replaced = locked && locked.state !== 'CLOSED' ? locked : null;
    const seats = await this.licensing.listSeatsForRules({ asOf: pass.today, employeeIds: [seat.employeeId] }, tx);
    const fresh = seats.find((candidate) => candidate.assignmentId === seat.assignmentId);
    if (!fresh) return;
    const again = decideG2(factsOf(fresh, true), replaced ? chainOf(replaced) : null).step;
    if (again.kind === 'CREATE') await this.create(tx, pass, fresh, again, replaced);
    else if (again.kind !== 'NONE') await this.apply(tx, pass, fresh, again);
  }

  private async create(
    tx: DbTx,
    pass: RulePass,
    seat: RuleSeat,
    step: Extract<G2Step, { kind: 'CREATE' }>,
    replaced: GhostSeatRecord | null,
  ): Promise<void> {
    const departmentId = await this.departmentOf(tx, pass, seat);
    const input: NewGhostSeat = {
      organizationId: pass.organizationId,
      group: 'G2',
      state: step.state,
      tier: 'ACTION',
      applicationId: seat.applicationId,
      planId: seat.planId,
      subscriptionId: seat.subscriptionId,
      assignmentId: seat.assignmentId,
      seatChainId: seat.chainRootId,
      employeeId: seat.employeeId,
      departmentId,
      freeSeats: null,
      countsTowardVacantCost: null,
      revocationTaskId: step.revocationTaskId,
      evidence: {
        group: 'G2',
        employeeId: seat.employeeId,
        leftOn: null,
        planId: seat.planId,
        provisioningType: seat.provisioningType,
        terminatingAccess: step.terminatingUntil ? { until: step.terminatingUntil } : null,
      },
      createdRunId: pass.tally.run.id,
    };
    const made = replaced
      ? await this.ghostSeats.supersede(tx, replaced, input, SYSTEM, pass.now)
      : await this.ghostSeats.create(tx, input, SYSTEM);
    pass.tally.created();
    if (replaced) pass.tally.closed();
    if (made.state === 'OPEN') await this.tell(tx, pass, seat, made, departmentId);
  }

  /**
   * The department a `G2` answers to: the one the holder last worked in (a seat granted from the shared pool has no owning department), else
   * the department that owns the seat.
   */
  private async departmentOf(tx: DbTx, pass: RulePass, seat: RuleSeat): Promise<string | null> {
    const last = await this.organizationReads.getLastPlacement(seat.employeeId, pass.today, tx);

    return last?.departmentId ?? seat.owningDepartmentId;
  }

  /**
   * Who is told of a `G2` (BRD MF-5: straight to the IT Admin; `US-10-01` AC-2): the IT Admin in charge of the department the holder last
   * worked in, else of the department that owns the seat, else the IT Admin responsible for the subscription while still usable, else the
   * first usable IT Admin. Nobody only when the organization has no usable IT Admin at all.
   */
  private async recipientOf(tx: DbTx, seat: RuleSeat, departmentId: string | null): Promise<string | null> {
    for (const department of new Set([departmentId, seat.owningDepartmentId])) {
      const inCharge = department ? await this.organizationReads.getItAdminInChargeOfDepartment(department, tx) : null;
      if (inCharge) return inCharge;
    }
    const responsible = seat.subscriptionId
      ? await this.catalog.getSubscriptionResponsibleItAdmin(seat.subscriptionId, tx)
      : null;
    if (responsible && (await this.identity.findUsableItAdminEmployeeIds([responsible], tx)).has(responsible)) {
      return responsible;
    }

    return this.identity.findFirstUsableItAdminEmployeeId(tx);
  }

  /** The IT Admin who answers for the seat is told once (`eventKey`). */
  private async tell(
    tx: DbTx,
    pass: RulePass,
    seat: RuleSeat,
    made: GhostSeatRecord,
    departmentId: string | null,
  ): Promise<void> {
    const recipient = await this.recipientOf(tx, seat, departmentId);
    if (!recipient) return;
    await this.notifications.notifyInApp(tx, {
      organizationId: pass.organizationId,
      recipientEmployeeId: recipient,
      code: 'GHOST_SEAT_G2_DETECTED',
      subject: { type: 'GHOST_SEAT_RECOMMENDATION', id: made.id },
      params: {
        recommendationId: made.id,
        employeeId: seat.employeeId,
        applicationId: seat.applicationId,
      },
      eventKey: `GHOST_SEAT_G2:${made.id}`,
    });
  }

  /**
   * Closes a recommendation whose seat chain holds no seat any more, and puts a `G2` back to open when the task it waited for was
   * closed as failed, reading the status of the task: what the listener could not do because another transaction held the
   * recommendation (`DA6-23`), and the seats that ended another way (`SEAT_ENDED`). A paused one is the head's (`DA6-38`).
   */
  private async settle(pass: RulePass, seats: readonly RuleSeat[]): Promise<void> {
    const openChains = new Set(seats.map((seat) => seat.chainRootId));
    const records = (await this.repo.unclosedOfSeats(pass.organizationId)).filter(
      (record) => record.state !== 'PAUSED',
    );
    const standings = await this.licensing.getRevocationTaskStatuses(
      records.flatMap((record) => (record.revocationTaskId ? [record.revocationTaskId] : [])),
    );
    for (const listed of records) {
      try {
        await this.runner.run(async (tx) => {
          const record = await this.repo.lock(tx, listed.id);
          if (!record || record.state === 'CLOSED') return;
          const standing = record.revocationTaskId ? standings.get(record.revocationTaskId) : undefined;
          const done = await this.ghostSeats.settle(
            tx,
            record,
            {
              seatStillOpen: record.seatChainId !== null && openChains.has(record.seatChainId),
              task: standing
                ? { status: standing.status, referencesRecommendation: standing.referencedIds.includes(record.id) }
                : null,
            },
            SYSTEM,
            pass.now,
          );
          if (done === 'CLOSED') pass.tally.closed();
        });
      } catch (error) {
        pass.tally.failed();
        this.logger.error(`Settling ${listed.id} failed: ${describeForOperator(error)}`);
      }
    }
  }
}

function existingOf(context: Context, seat: RuleSeat): ChainRecommendation | null {
  const record = context.existing.get(seat.chainRootId);

  return record ? chainOf(record) : null;
}
