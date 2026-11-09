import { Injectable } from '@nestjs/common';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import type { SeatTarget, SeatTargetRef } from '../../catalog/public/catalog.types';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { AssignmentService } from '../assignment/assignment.service';
import type {
  AssignmentRecord,
  BaselineFacts,
  BaselineProgress,
  NewBaselineAssignment,
  SeatHolder,
} from './licensing.types';
import { SeatBaselineService } from '../seat-baseline/seat-baseline.service';

/**
 * The licensing facade other modules call for the seat baseline (`data-import` for the import of it): it answers what a baseline import
 * must know to judge a file, and writes the rows the import confirmed.
 */
@Injectable()
export class LicensingSeatBaselineApi {
  constructor(
    private readonly assignments: AssignmentService,
    private readonly baseline: SeatBaselineService,
    private readonly organizationReads: OrganizationReadApi,
  ) {}

  /** The target a baseline is for: exactly one subscription or one internal plan. Throws SeatTargetInvalidError. */
  seatTargetRef(input: { subscriptionId?: string; planId?: string }): SeatTargetRef {
    return this.assignments.targetRef(input);
  }

  /**
   * The target of a baseline (one subscription or one internal plan) read without a lock, for a preview. Throws
   * SeatTargetNotFoundError, SeatPlanNotSupportedError, SeatTargetInvalidError and SeatQuantityUnknownError.
   */
  resolveBaselineTarget(ref: SeatTargetRef, tx?: DbTx): Promise<SeatTarget> {
    return this.assignments.resolveBaselineTarget(ref, tx);
  }

  /** The same, locked until the transaction ends: the subscription `FOR UPDATE`, an internal plan `FOR SHARE`. */
  lockBaselineTarget(tx: DbTx, ref: SeatTargetRef): Promise<SeatTarget> {
    return this.assignments.lockBaselineTarget(tx, ref);
  }

  /** The people who hold a seat today and how many, for the review of a people file that leaves them out (`US-02-02` AC-4). */
  openSeatHolders(): Promise<SeatHolder[]> {
    return this.assignments.openHolders();
  }

  /** Whether the baseline is closed and how many assignments it has produced, for the onboarding checklist. */
  async getBaselineProgress(): Promise<BaselineProgress> {
    const state = await this.baseline.state();

    return { closed: state.closed, closedAt: state.closedAt, assignments: await this.assignments.countBaseline() };
  }

  /** Whether the baseline is closed, the day rows without a grant date are recorded from, and what is already kept. */
  async baselineFacts(target: SeatTarget, tx?: DbTx): Promise<BaselineFacts> {
    const recordedOn = await this.organizationReads.businessToday(new Date(), tx);
    const state = await this.baseline.state(tx);
    const existing = await this.assignments.existingOf(target, tx);

    return { target, recordedOn, closed: state.closed, existing };
  }

  /**
   * Writes the assignments of the rows a baseline import confirmed, each with its audit event, in the caller transaction.
   * Holds the baseline state `FOR SHARE` first, so a closing waits for it. Throws SeatBaselineClosedError and
   * AssignmentConflictError (the row the database refused, which means the data changed since the preview).
   */
  async createBaselineAssignments(
    tx: DbTx,
    actor: AuthenticatedPrincipal,
    input: { importId: string; target: SeatTarget; rows: readonly NewBaselineAssignment[] },
  ): Promise<AssignmentRecord[]> {
    const organization = await this.organizationReads.getOrganization(tx);
    if (!organization) throw new Error('A baseline was written before installation');
    await this.baseline.lockOpen(tx);

    return this.assignments.createBaseline(tx, actor, { organizationId: organization.id, ...input });
  }
}
