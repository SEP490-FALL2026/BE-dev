import { Injectable } from '@nestjs/common';
import { addDays } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { AuditApi } from '../../audit/public/audit.api';
import { LicensingApi } from '../../licensing/public/licensing.api';
import { OperatingParametersApi } from '../../operating-parameters/public/operating-parameters.api';
import { OrganizationApi } from '../../organization/public/organization.api';
import type { OrganizationChange } from '../../organization/public/organization.types';
import { PersonnelNotifier } from '../event-notice/personnel-notifier.service';
import { personnelSystemAuditEvent } from '../personnel-audit-event.mapper';
import { reviewDueOn } from './transfer-review.policy';
import { TransferReviewRepo } from './transfer-review.repo';

const WORKING_DAYS = 'TRANSFER_REVIEW_WORKING_DAYS';
/** The parameter is at most thirty working days: ninety calendar days hold them with the holidays in between. */
const CALENDAR_WINDOW_DAYS = 90;

/**
 * Opens the review of the tools a person brought when they are moved to another department (`US-03-07` AC-1, AC-2, `QĐ-89b`,
 * `QĐ-90b`): one line for every personal seat they hold, paid or internal, whatever any list says. It runs in the transaction of the
 * change, once for each placement: a person who holds no seat gets no review and their head no work. The seats are never touched
 * here: they stay as they were until the head decides. The head of the department the person came to is told the deadline in the same
 * transaction; a department that has no head yet keeps the notice for the first one (`QĐ-62c`).
 */
@Injectable()
export class TransferReviewService {
  constructor(
    private readonly reviews: TransferReviewRepo,
    private readonly licensing: LicensingApi,
    private readonly parameters: OperatingParametersApi,
    private readonly organization: OrganizationApi,
    private readonly audit: AuditApi,
    private readonly notifier: PersonnelNotifier,
  ) {}

  /** Idempotent: a placement that has a review has no second one, however many times the change is told. */
  async openFor(tx: DbTx, change: OrganizationChange): Promise<void> {
    if (change.kind !== 'PLACEMENT_START') return;
    // The first placement of a person is not a transfer, and staying in the department is none either (`AC-8`).
    if (change.fromDepartmentId === null || change.fromDepartmentId === change.toDepartmentId) return;
    if (await this.reviews.findByPlacement(tx, change.placementId)) return;

    const employee = await this.organization.getEmployee(change.employeeId, tx);
    if (!employee || employee.status !== 'ACTIVE' || employee.workState === 'LEFT') return;

    await this.supersedeEarlier(tx, change);
    const seats = (await this.licensing.listPersonalSeatsOf(change.employeeId, change.effectiveOn, tx)).filter(
      // A seat already being taken away is not a tool the new head is asked about.
      (seat) => seat.revocation === null,
    );
    if (seats.length === 0) return;

    const review = await this.reviews.insert(tx, {
      organizationId: employee.organizationId,
      employeeId: change.employeeId,
      transferId: await this.reviews.transferIdOfPlacement(tx, change.placementId),
      placementId: change.placementId,
      departmentId: change.toDepartmentId,
      effectiveOn: change.effectiveOn,
      dueOn: await this.dueOnAfter(change.effectiveOn),
      items: seats.map((seat) => ({
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
          tools: seats.length,
          transferId: review.transferId,
        },
      ),
    );
    await this.tellHead(tx, review);
  }

  /** The head of the department of the review (or the first head it gets) is told the deadline, in the transaction that opened it. */
  async tellHead(
    tx: DbTx,
    review: { id: string; organizationId: string; employeeId: string; departmentId: string; dueOn: string },
  ): Promise<void> {
    const today = await this.organization.businessToday(new Date(), tx);
    // The department is taken FOR SHARE before its head is read: the assignment of a first head holds it FOR UPDATE and hands
    // over the notices kept before it commits, so a notice is never kept for a department that has a head by then.
    await this.organization.lockDepartmentShared(tx, review.departmentId);
    const head = (await this.organization.getDepartmentHeads([review.departmentId], today, tx)).get(
      review.departmentId,
    );
    await this.notifier.reviewDue(tx, {
      organizationId: review.organizationId,
      employeeId: review.employeeId,
      departmentId: review.departmentId,
      reviewId: review.id,
      dueOn: review.dueOn,
      headEmployeeId: head?.employeeId ?? null,
    });
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

  /** The last day to decide a review that opens on `effectiveOn`: the working days of the parameter after it, the day itself not counted. */
  async dueOnAfter(effectiveOn: string): Promise<string> {
    const days = Number(await this.parameters.getValue(WORKING_DAYS));
    const nonWorking = await this.parameters.getNonWorkingDates(
      effectiveOn,
      addDays(effectiveOn, CALENDAR_WINDOW_DAYS),
    );

    return reviewDueOn(effectiveOn, days, nonWorking);
  }
}
