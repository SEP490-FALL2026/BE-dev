import { Injectable, Logger } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import { describeForOperator, traceForOperator } from '../../../infrastructure/observability/operator-error';
import { LicensingApi } from '../../licensing/public/licensing.api';
import { OrganizationApi } from '../../organization/public/organization.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { PersonnelNotifier } from '../event-notice/personnel-notifier.service';
import { TransferGraceRepo } from './transfer-grace.repo';
import { heldOnOrBefore } from './transfer-grace.policy';
import type { SweptRef } from './transfer-grace.types';
import { snapshotRightOf } from './transfer-snapshot.json';
import { legacyAnnouncementDue, pictureIdsOf, reminderDue, rightsToTakeBack, sweptOf } from './transfer-sweep.policy';

/** How many transfers are read in one statement. */
const PAGE = 200;

/** What one pass did: the people told, and the transfers it could not look at (each is tried again at the next pass). */
export interface TellingPass {
  told: number;
  failed: number;
}

/**
 * What the sweep tells the person who moved while the grace of the old rights lasts (`QĐ-110p`, SPEC MF3-C.1). Two works, each with a transaction
 * for every transfer that locks the employee and then the transfer, reads it again and writes once, so two instances, a pass run again or a
 * command at the same time never both act:
 *
 * - the reminder, `TRANSFER_GRACE_ENDING`, from the day `grace_reminder_on` to the last day of the grace, once for the transfer (`reminded_at`
 *   is claimed first, whether or not the person still holds anything; a person who holds nothing to lose is not told);
 * - the start of the grace for a transfer the migration of m-17 gave one (it took effect before the grace existed, so nobody was told on day 1):
 *   `TRANSFER_GRACE_STARTED` for the person, both heads and the IT Admin of each department, and the picture of the rights that the settlement
 *   of the day would have taken, so the claim of the picture is also what makes the telling happen once.
 */
@Injectable()
export class TransferTellingService {
  private readonly logger = new Logger(TransferTellingService.name);

  constructor(
    private readonly runner: TransactionRunner,
    private readonly graces: TransferGraceRepo,
    private readonly organization: OrganizationApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly licensing: LicensingApi,
    private readonly notifier: PersonnelNotifier,
  ) {}

  /** The people told once more that their rights are about to be taken back. */
  async remind(now: Date = new Date()): Promise<TellingPass> {
    const today = await this.organizationReads.businessToday(now);

    return this.eachOf(
      (page) => this.graces.pageReminderDue(today, page),
      (ref) => this.remindOne(ref, today, now),
    );
  }

  /** The people of a transfer from before the grace existed, told that the grace has begun (and the picture of their rights taken). */
  async announceUnannounced(now: Date = new Date()): Promise<TellingPass> {
    const today = await this.organizationReads.businessToday(now);

    return this.eachOf(
      (page) => this.graces.pageUnannounced(today, page),
      (ref) => this.announceOne(ref, today),
    );
  }

  private async eachOf(
    pageOf: (page: { afterId: string | null; take: number }) => Promise<SweptRef[]>,
    act: (ref: SweptRef) => Promise<boolean>,
  ): Promise<TellingPass> {
    const pass: TellingPass = { told: 0, failed: 0 };
    let afterId: string | null = null;
    for (;;) {
      const page: SweptRef[] = await pageOf({ afterId, take: PAGE });
      for (const ref of page) {
        try {
          if (await act(ref)) pass.told += 1;
        } catch (error) {
          pass.failed += 1;
          this.logger.error(
            `Telling for transfer ${ref.id} failed: ${describeForOperator(error)}`,
            traceForOperator(error),
          );
        }
      }
      if (page.length < PAGE) break;
      afterId = page[page.length - 1].id;
    }

    return pass;
  }

  private remindOne(ref: SweptRef, today: BusinessDate, now: Date): Promise<boolean> {
    return this.runner.run(async (tx) => {
      await this.organization.lockEmployeeForUpdate(tx, ref.employeeId);
      const held = await this.graces.lock(tx, ref.id);
      if (!held || !reminderDue(sweptOf(held), today) || held.graceEndsOn === null) return false;
      if (!(await this.graces.claimReminder(tx, held.id, now))) return false;
      const seats = await this.licensing.listPersonalSeatsOf(held.employeeId, today, tx);
      if (rightsToTakeBack(seats, { effectiveOn: held.effectiveOn, pictureIds: pictureIdsOf(held) }).length === 0)
        return false;

      return this.notifier.transferGraceEnding(tx, {
        organizationId: held.organizationId,
        transferId: held.id,
        employeeId: held.employeeId,
        graceEndsOn: held.graceEndsOn,
      });
    });
  }

  private announceOne(ref: SweptRef, today: BusinessDate): Promise<boolean> {
    return this.runner.run(async (tx) => {
      await this.organization.lockEmployeeForUpdate(tx, ref.employeeId);
      const held = await this.graces.lock(tx, ref.id);
      if (!held || !legacyAnnouncementDue(sweptOf(held), today) || held.graceEndsOn === null) return false;
      const seats = heldOnOrBefore(
        await this.licensing.listPersonalSeatsOf(held.employeeId, today, tx),
        held.effectiveOn,
      );
      // No money was given back and no request closed that day: the picture says so by saying nothing of them.
      const kept = await this.graces.keepSnapshot(tx, held.id, {
        takenOn: today,
        rights: seats.map(snapshotRightOf),
        commitmentsReleased: [],
        requestsCancelled: 0,
        requestsToCheck: 0,
      });
      if (!kept) return false;
      await this.notifier.transferGraceStarted(tx, {
        organizationId: held.organizationId,
        transferId: held.id,
        employeeId: held.employeeId,
        fromDepartmentId: held.fromDepartmentId,
        toDepartmentId: held.toDepartmentId,
        graceEndsOn: held.graceEndsOn,
        today,
      });

      return true;
    });
  }
}
