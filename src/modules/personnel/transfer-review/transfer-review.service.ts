import { Injectable } from '@nestjs/common';
import { addDays } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { AuditService } from '../../audit/audit.service';
import { CatalogService } from '../../catalog/catalog.service';
import { LicensingService } from '../../licensing/licensing.service';
import { OperatingParametersService } from '../../operating-parameters/operating-parameters.service';
import { OrganizationService } from '../../organization/organization.service';
import type { OrganizationChange } from '../../organization/organization.types';
import { personnelSystemAuditEvent } from '../mappers/personnel-audit-event';
import { reviewDueOn, toolsOutsideStandard } from './transfer-review.policy';
import { TransferReviewRepo } from './transfer-review.repo';

const WORKING_DAYS = 'TRANSFER_REVIEW_WORKING_DAYS';
/** The parameter is at most thirty working days: ninety calendar days hold them with the holidays in between. */
const CALENDAR_WINDOW_DAYS = 90;

/**
 * Opens the review of the tools outside the standard toolset when a person is moved to another department (`US-03-07` AC-1, AC-2,
 * AC-8). It runs in the transaction of the change, once for each placement: a person whose tools are all in the toolset of the
 * department they came to, or who only changed job title in the same department, gets no review and their head no work. The seats
 * are never touched here: they stay as they were until the head decides.
 */
@Injectable()
export class TransferReviewService {
  constructor(
    private readonly reviews: TransferReviewRepo,
    private readonly licensing: LicensingService,
    private readonly catalog: CatalogService,
    private readonly parameters: OperatingParametersService,
    private readonly organization: OrganizationService,
    private readonly audit: AuditService,
  ) {}

  /** Idempotent: a placement that has a review has no second one, however many times the change is told. */
  async openFor(tx: DbTx, change: OrganizationChange): Promise<void> {
    if (change.kind !== 'PLACEMENT_START') return;
    // The first placement of a person is not a transfer, and a change of job title inside the department does not change what the
    // department's toolset says about the tools the person holds (`AC-8`).
    if (change.fromDepartmentId === null || change.fromDepartmentId === change.toDepartmentId) return;
    if (await this.reviews.findByPlacement(tx, change.placementId)) return;

    const employee = await this.organization.getEmployee(change.employeeId, tx);
    if (!employee || employee.status !== 'ACTIVE' || employee.workState === 'LEFT') return;

    await this.supersedeEarlier(tx, change);
    const seats = (await this.licensing.listPersonalSeatsOf(change.employeeId, change.effectiveOn, tx)).filter(
      // A seat already being taken away is not a tool the new head is asked about.
      (seat) => seat.revocation === null,
    );
    const standard = await this.catalog.getStandardToolsetPlanIds(change.toDepartmentId, change.toJobTitleId, tx);
    const outside = toolsOutsideStandard(seats, standard);
    if (outside.length === 0) return;

    const review = await this.reviews.insert(tx, {
      organizationId: employee.organizationId,
      employeeId: change.employeeId,
      transferId: await this.reviews.transferIdOfPlacement(tx, change.placementId),
      placementId: change.placementId,
      departmentId: change.toDepartmentId,
      jobTitleId: change.toJobTitleId,
      effectiveOn: change.effectiveOn,
      dueOn: await this.dueOn(change.effectiveOn),
      items: outside.map((seat) => ({
        assignmentId: seat.assignmentId,
        planId: seat.planId,
        grantReason: seat.grantReason,
      })),
    });
    if (!review) return;
    await this.audit.record(
      tx,
      personnelSystemAuditEvent(
        review.organizationId,
        'TRANSFER_REVIEW.OPENED',
        'TransferReview',
        review.id,
        change.id,
        null,
        {
          employeeId: review.employeeId,
          departmentId: review.departmentId,
          effectiveOn: review.effectiveOn,
          dueOn: review.dueOn,
          tools: outside.length,
          transferId: review.transferId,
        },
      ),
    );
  }

  /**
   * A person who has left is asked about no tool any more: the review that was open for them ends as superseded, so the head of the
   * department they came to is no longer reminded of a decision that cannot be made (`US-03-07`, `US-03-04` AC-3). Idempotent.
   */
  async supersedeForLeaver(tx: DbTx, change: Extract<OrganizationChange, { kind: 'EMPLOYEE_LEFT' }>): Promise<void> {
    for (const earlier of await this.reviews.supersedeAllOpenOf(tx, change.employeeId)) {
      await this.audit.record(
        tx,
        personnelSystemAuditEvent(
          earlier.organizationId,
          'TRANSFER_REVIEW.SUPERSEDED',
          'TransferReview',
          earlier.id,
          change.id,
          { status: 'OPEN' },
          { status: 'SUPERSEDED', employeeId: earlier.employeeId, reason: 'EMPLOYEE_LEFT' },
        ),
      );
    }
  }

  /** A review that was open for an earlier move of the person is obsolete: the tools are judged again against the new department. */
  private async supersedeEarlier(tx: DbTx, change: Extract<OrganizationChange, { kind: 'PLACEMENT_START' }>) {
    for (const earlier of await this.reviews.supersedeOpenOf(tx, change.employeeId, change.placementId)) {
      await this.audit.record(
        tx,
        personnelSystemAuditEvent(
          earlier.organizationId,
          'TRANSFER_REVIEW.SUPERSEDED',
          'TransferReview',
          earlier.id,
          change.id,
          { status: 'OPEN' },
          { status: 'SUPERSEDED', employeeId: earlier.employeeId, supersededByPlacementId: change.placementId },
        ),
      );
    }
  }

  private async dueOn(effectiveOn: string): Promise<string> {
    const days = Number(await this.parameters.getValue(WORKING_DAYS));
    const nonWorking = await this.parameters.getNonWorkingDates(
      effectiveOn,
      addDays(effectiveOn, CALENDAR_WINDOW_DAYS),
    );

    return reviewDueOn(effectiveOn, days, nonWorking);
  }
}
