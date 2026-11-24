import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { NotificationsApi } from '../../notifications/public/notifications.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { VendorAccountReviewRepo } from './vendor-account-review.repo';
import type { OutOfProcessCaseRecord } from './vendor-account-review.types';

/** What opened the differences a notice tells of: a confirmed report of a vendor, an invoice Finance suspects, a batch of the collector. */
export type DiscrepancyBatchSource = 'USAGE_IMPORT' | 'INVOICE_DIFFERENCE' | 'COLLECTOR_UNLISTED';

/**
 * Tells of the review of the accounts at the vendors (`SBF-08` step 4, `SBF-07a` §5.1, `QĐ-103m`): the IT Admin when differences are opened and the
 * person, with the head of their department, when a case about them is closed as a report only. Every notice is written in the transaction of the
 * change it follows, so it exists exactly when that commits, and once for each recipient and occasion however many times it is looked at. They carry
 * ids and the source, never the identifier of an account.
 */
@Injectable()
export class VendorAccountReviewNotifier {
  constructor(
    private readonly notifications: NotificationsApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly identity: IdentityAccessApi,
    private readonly catalog: CatalogApi,
    private readonly repo: VendorAccountReviewRepo,
  ) {}

  /** The day of `now` in the calendar of the organization: the occasion of the batches the collector reports, one notice a day. */
  businessDay(tx: DbTx, now: Date): Promise<BusinessDate> {
    return this.organizationReads.businessToday(now, tx);
  }

  /**
   * One notice for the whole occasion (the report, the invoice, the day of the collector) when it opened `newCount` differences that were not
   * there: to the usable IT Admin in charge of the application when assigned, else to the usable Super Admin. An occasion with no
   * new difference tells nobody.
   */
  async opened(
    tx: DbTx,
    input: {
      organizationId: string;
      applicationId: string | null;
      vendorId: string | null;
      source: DiscrepancyBatchSource;
      newCount: number;
      occasion: string;
    },
  ): Promise<void> {
    if (input.newCount <= 0) return;
    for (const recipientEmployeeId of await this.itAdminsOf(tx, input.applicationId)) {
      await this.notifications.notifyInApp(tx, {
        organizationId: input.organizationId,
        recipientEmployeeId,
        code: 'VENDOR_ACCOUNT_DISCREPANCY_OPENED',
        subject: null,
        params: {
          applicationId: input.applicationId,
          vendorId: input.vendorId,
          source: input.source,
          newCount: input.newCount,
        },
        eventKey: `VENDOR_ACCOUNT_DISCREPANCY_OPENED:${input.source}:${input.occasion}`,
      });
    }
  }

  /**
   * The person the case is about and the head, today, of the department they last worked in (a person who has left is still told, and so is the
   * head of where they worked last). A department with no head yet keeps the notice for the first one named (`SBF-07a` §5.1). A case about nobody
   * in particular, such as an identifier nobody owns, tells nobody.
   */
  async caseReported(tx: DbTx, closed: OutOfProcessCaseRecord, now: Date): Promise<void> {
    const employeeId = await this.repo.employeeIdOfDiscrepancy(tx, closed.discrepancyId);
    if (employeeId === null) return;
    const today = await this.organizationReads.businessToday(now, tx);
    const placement = await this.organizationReads.getLastPlacement(employeeId, today, tx);
    // Locked before the head is read: a notice kept for a department that gets a head meanwhile would be left undelivered.
    if (placement) await this.organizationReads.lockDepartmentShared(tx, placement.departmentId);
    const head = placement
      ? (await this.organizationReads.getDepartmentHeads([placement.departmentId], today, tx)).get(
          placement.departmentId,
        )
      : undefined;
    const notice = {
      organizationId: closed.organizationId,
      code: 'OUT_OF_PROCESS_CASE_REPORTED',
      subject: { type: 'OUT_OF_PROCESS_CASE', id: closed.id },
      params: {
        caseId: closed.id,
        applicationId: closed.applicationId,
        vendorId: closed.vendorId,
        employeeId,
      },
      eventKey: `OUT_OF_PROCESS_CASE_REPORTED:${closed.id}`,
    } as const;
    const recipients = new Set([employeeId, ...(head ? [head.employeeId] : [])]);
    for (const recipientEmployeeId of recipients) {
      await this.notifications.notifyInApp(tx, { ...notice, recipientEmployeeId });
    }
    if (placement && !head) {
      await this.notifications.holdForDepartment(tx, { ...notice, departmentId: placement.departmentId });
    }
  }

  /** The usable IT Admin in charge of the application; otherwise the usable Super Admin. */
  private async itAdminsOf(tx: DbTx, applicationId: string | null): Promise<string[]> {
    const inCharge = applicationId ? await this.catalog.getApplicationResponsibleItAdminId(applicationId, tx) : null;
    if (inCharge !== null && (await this.identity.findUsableItAdminEmployeeIds([inCharge], tx)).has(inCharge)) {
      return [inCharge];
    }

    const superAdmin = await this.identity.findUsableSuperAdminEmployeeId(tx);
    return superAdmin !== null ? [superAdmin] : [];
  }
}
