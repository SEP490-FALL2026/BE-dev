import { Injectable, Logger } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import { describeForOperator, traceForOperator } from '../../../infrastructure/observability/operator-error';
import { AuditApi } from '../../audit/public/audit.api';
import { AssignmentNotOpenError } from '../../licensing/public/licensing.errors';
import { LicensingApi } from '../../licensing/public/licensing.api';
import type { SystemActor } from '../../licensing/public/licensing.types';
import { OrganizationApi } from '../../organization/public/organization.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { PersonnelNotifier } from '../event-notice/personnel-notifier.service';
import { personnelSystemAuditEvent } from '../personnel-audit-event.mapper';
import { TransferGraceRepo } from './transfer-grace.repo';
import { heldOnOrBefore } from './transfer-grace.policy';
import type { HeldTransfer, SweptRef } from './transfer-grace.types';
import { snapshotRightOf } from './transfer-snapshot.json';
import { revocationDue, rightsToTakeBack, sweptOf } from './transfer-sweep.policy';

/** How many transfers are read in one statement. */
const PAGE = 200;

/** What one pass did: the transfers whose rights it started to take back, the tasks it made or added a reason to, and the transfers it could not handle (tried again next pass). */
export interface RevocationPass {
  transfers: number;
  rights: number;
  failed: number;
}

/** What taking back the rights of one transfer did. */
export interface TransfersRevoked {
  created: number;
  reasonAdded: number;
}

/**
 * The grace is over: the system takes back the rights the person held from before the transfer (`QĐ-110p`, SPEC MF3-C.1). The day after the last day
 * of the grace, for every personal right held from the day the transfer took effect or before that is still in force, it asks the one gate of
 * licensing (`openRevocation`) for a revocation with the source `TRANSFER`, the system as the actor and the transfer as the reference, so the task is
 * in the queue of the IT Admin in charge of the new department (the department of the person today). Idempotent by the gate itself: asking again
 * for the same source and reference changes nothing, and a seat that has a live task of another source is given the reason besides, never a second
 * task (`provisioning_tasks_one_live_revocation_per_assignment`). A right that was asked for again on the same subscription in the grace was ended by the
 * grant (R-49) and is no longer in force, so it is left out by what it is, not by a list.
 *
 * Each transfer has a transaction of its own that locks the employee, then the transfer, reads it again and acts; one that fails is logged and tried
 * again at the next pass without stopping the others. The picture of the rights is kept now for a transfer that took effect before the grace existed
 * (m-17), which has none, so the closing can say what became of each right.
 */
@Injectable()
export class TransferRevocationService {
  private readonly logger = new Logger(TransferRevocationService.name);

  constructor(
    private readonly runner: TransactionRunner,
    private readonly graces: TransferGraceRepo,
    private readonly organization: OrganizationApi,
    private readonly organizationReads: OrganizationReadApi,
    private readonly licensing: LicensingApi,
    private readonly audit: AuditApi,
    private readonly notifier: PersonnelNotifier,
  ) {}

  async sweep(now: Date = new Date()): Promise<RevocationPass> {
    const today = await this.organizationReads.businessToday(now);
    const pass: RevocationPass = { transfers: 0, rights: 0, failed: 0 };
    let afterId: string | null = null;
    for (;;) {
      const page: SweptRef[] = await this.graces.pageGraceOver(today, { afterId, take: PAGE });
      for (const ref of page) {
        try {
          const done = await this.runner.run((tx) => this.withinTransaction(tx, ref, today, now));
          if (done !== null && done.created + done.reasonAdded > 0) {
            pass.transfers += 1;
            pass.rights += done.created + done.reasonAdded;
          }
        } catch (error) {
          pass.failed += 1;
          this.logger.error(
            `Taking back the rights of transfer ${ref.id} failed: ${describeForOperator(error)}`,
            traceForOperator(error),
          );
        }
      }
      if (page.length < PAGE) break;
      afterId = page[page.length - 1].id;
    }

    return pass;
  }

  /** The transfer, in a transaction of the caller that holds nothing yet: null when the transfer is not due (closed meanwhile, or the grace is not over). */
  private async withinTransaction(
    tx: DbTx,
    ref: SweptRef,
    today: BusinessDate,
    now: Date,
  ): Promise<TransfersRevoked | null> {
    await this.organization.lockEmployeeForUpdate(tx, ref.employeeId);
    const held = await this.graces.lock(tx, ref.id);
    if (!held || !revocationDue(sweptOf(held), today)) return null;

    return this.takeBack(tx, held, today, now);
  }

  /** Opens the revocation of every right of the held transfer, in the caller's transaction, which holds the employee and the transfer. */
  async takeBack(tx: DbTx, held: HeldTransfer, today: BusinessDate, now: Date): Promise<TransfersRevoked> {
    const seats = await this.licensing.listPersonalSeatsOf(held.employeeId, today, tx);
    if (held.snapshotBefore === null) await this.keepPicture(tx, held, seats, today);
    const system: SystemActor = { kind: 'SYSTEM', correlationId: `transfer-grace:${held.id}` };
    const done: TransfersRevoked = { created: 0, reasonAdded: 0 };
    for (const right of rightsToTakeBack(seats, held.effectiveOn)) {
      try {
        const opened = await this.licensing.openRevocation(tx, system, {
          assignmentId: right.assignmentId,
          source: 'TRANSFER',
          // The decision is the one of the process of the transfer, not of a person: the rights are taken back because the grace is over.
          decision: {
            decidedRole: 'TRANSFER_PROCESS',
            referenceKind: 'DEPARTMENT_TRANSFER',
            referenceId: held.id,
          },
          context: { departmentId: held.toDepartmentId },
          now,
        });
        if (opened.created) done.created += 1;
        else if (opened.reasonAdded) done.reasonAdded += 1;
      } catch (error) {
        // The right ended between the reading and the asking (a return, a grant that replaced it): there is nothing left to take back.
        if (!(error instanceof AssignmentNotOpenError)) throw error;
      }
    }
    if (done.created + done.reasonAdded > 0) await this.tell(tx, held, done);

    return done;
  }

  private async keepPicture(
    tx: DbTx,
    held: HeldTransfer,
    seats: Awaited<ReturnType<LicensingApi['listPersonalSeatsOf']>>,
    today: BusinessDate,
  ): Promise<void> {
    await this.graces.keepSnapshot(tx, held.id, {
      takenOn: today,
      rights: heldOnOrBefore(seats, held.effectiveOn).map(snapshotRightOf),
      commitmentsReleased: [],
      requestsCancelled: 0,
      requestsToCheck: 0,
    });
  }

  private async tell(tx: DbTx, held: HeldTransfer, done: TransfersRevoked): Promise<void> {
    await this.audit.record(
      tx,
      personnelSystemAuditEvent(
        held.organizationId,
        'DEPARTMENT_TRANSFER.REVOCATION_OPENED',
        'DepartmentTransfer',
        held.id,
        `transfer-grace:${held.id}`,
        null,
        { employeeId: held.employeeId, tasksCreated: done.created, reasonsAdded: done.reasonAdded },
      ),
    );
    await this.notifier.transferRightsRevoking(tx, {
      organizationId: held.organizationId,
      transferId: held.id,
      employeeId: held.employeeId,
      toDepartmentId: held.toDepartmentId,
      rightCount: done.created + done.reasonAdded,
    });
  }
}
