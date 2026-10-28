import { Injectable, OnModuleInit } from '@nestjs/common';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { AuditService } from '../../audit/audit.service';
import type {
  SeatBaselineClosedEvent,
  SeatBaselineClosedListener,
} from '../../licensing/licensing-seat-baseline.types';
import { LicensingService } from '../../licensing/licensing.service';
import { OrganizationHistoryService } from '../../organization/organization-history.service';
import { OrganizationService } from '../../organization/organization.service';
import { personnelSystemAuditEvent } from '../mappers/personnel-audit-event';
import { TransferReviewRepo } from './transfer-review.repo';
import { TransferReviewService } from './transfer-review.service';

/**
 * The review after the setup (F21, `QĐ-89e`): when the IT Admin closes the seat baseline, every person who holds a seat on a
 * subscription that ANOTHER department owns gets a review of those seats, decided by the head of the department of the HOLDER today,
 * with the same deadline, the same reminders and the same rule as the review after a transfer: nothing is revoked by itself, a late
 * review is only told, and a tool no longer needed opens a revocation whose source is `POST_SETUP_REVIEW`. It reuses the model of the
 * review after a transfer with no transfer behind it (`transfer_id` empty); the review is anchored on the placement the person has
 * the day the baseline closes, and a placement that has a review already has no second one. It runs in the transaction that closes the
 * baseline, so there is never a closed baseline without its reviews. It is the `SeatBaselineClosedListener` of licensing, registered
 * when the module starts, so licensing never imports personnel.
 */
@Injectable()
export class PostSetupReviewService implements SeatBaselineClosedListener, OnModuleInit {
  constructor(
    private readonly reviews: TransferReviewRepo,
    private readonly opening: TransferReviewService,
    private readonly licensing: LicensingService,
    private readonly organization: OrganizationService,
    private readonly history: OrganizationHistoryService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit(): void {
    this.licensing.registerSeatBaselineClosedListener(this);
  }

  async baselineClosed(tx: DbTx, event: SeatBaselineClosedEvent): Promise<void> {
    const dueOn = await this.opening.dueOnAfter(event.closedOn);
    for (const holder of event.holders) {
      const foreign = new Set(
        holder.assignments
          .filter((assignment) => assignment.owningDepartmentId !== holder.employeeDepartmentId)
          .map((assignment) => assignment.assignmentId),
      );
      if (foreign.size === 0) continue;
      const employee = await this.organization.getEmployee(holder.employeeId, tx);
      if (!employee || employee.status !== 'ACTIVE' || employee.workState === 'LEFT') continue;
      const placement = await this.history.getPlacementInForce(tx, holder.employeeId, event.closedOn);
      if (!placement) continue;
      const seats = (await this.licensing.listPersonalSeatsOf(holder.employeeId, event.closedOn, tx)).filter(
        (seat) => foreign.has(seat.assignmentId) && seat.revocation === null,
      );
      if (seats.length === 0) continue;

      const review = await this.reviews.insert(tx, {
        organizationId: event.organizationId,
        employeeId: holder.employeeId,
        transferId: null,
        placementId: placement.placementId,
        departmentId: holder.employeeDepartmentId,
        effectiveOn: event.closedOn,
        dueOn,
        items: seats.map((seat) => ({
          assignmentId: seat.assignmentId,
          planId: seat.planId,
          grantReason: seat.grantReason,
        })),
      });
      if (!review) continue;
      await this.audit.record(
        tx,
        personnelSystemAuditEvent(
          review.organizationId,
          'TRANSFER_REVIEW.OPENED',
          'TransferReview',
          review.id,
          review.id,
          null,
          {
            employeeId: review.employeeId,
            departmentId: review.departmentId,
            effectiveOn: review.effectiveOn,
            dueOn: review.dueOn,
            tools: seats.length,
            origin: 'POST_SETUP',
          },
        ),
      );
      await this.opening.tellHead(tx, review);
    }
  }
}
