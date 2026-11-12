import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { PersonnelActor } from '../public/personnel.types';
import { DepartureImpactService } from '../departure-deadline/departure-impact.service';
import { TransferGuardService } from '../transfer/transfer-guard.service';
import { OffboardingCaseWriter } from './offboarding-case-writer.service';
import { OffboardingEndings } from './offboarding-endings.service';
import { OffboardingFrame } from './offboarding-frame.service';
import { OffboardingPreconditions } from './offboarding-preconditions.service';
import { lastWorkingDayOf } from './offboarding.policy';
import type { OffboardingRecord, RecordOffboardingInput } from './offboarding.types';

/**
 * Records a person who leaves: a planned handover with the last working day and the basis it rests on, or an abrupt departure that
 * is `LEFT` at once (`US-03-04` AC-2, AC-8, AC-18, AC-19, AC-23, AC-29, `US-03-03` AC-6, `US-03-01` AC-21). One transaction under the
 * locks of the protocol (the departments by id, the employee, a chosen successor, the accounts): the transfer that would still wait
 * is cancelled, a long leave ends, the head of the department the person leaves is handed over (never a reason to refuse, `QĐ-77k`),
 * the placement ends the day after the last working day. No seat is
 * taken away and no task is made here (`AC-5`).
 */
@Injectable()
export class OffboardingService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly organizationReads: OrganizationReadApi,
    private readonly guard: TransferGuardService,
    private readonly frame: OffboardingFrame,
    private readonly preconditions: OffboardingPreconditions,
    private readonly endings: OffboardingEndings,
    private readonly writer: OffboardingCaseWriter,
    private readonly impact: DepartureImpactService,
  ) {}

  /** Throws OffboardingRefusedError for everything the policy or the database refuses, and PersonnelAccessRefusedError for the actor. */
  record(actor: PersonnelActor, input: RecordOffboardingInput): Promise<OffboardingRecord> {
    this.guard.requireWriter(actor, input.employeeId);

    return this.frame.guarded(() => this.runner.run((tx) => this.recordInTx(tx, actor, input)));
  }

  /** The same in the transaction of the caller (the write that starts from a notice of the head, or from the controlled procedure). */
  async recordInTx(tx: DbTx, actor: PersonnelActor, given: RecordOffboardingInput): Promise<OffboardingRecord> {
    this.guard.requireWriter(actor, given.employeeId);
    const organization = await this.guard.requireOrganization();
    const today = await this.organizationReads.businessToday(new Date(), tx);
    // A departure blocked now works to the end of the day it is recorded: a last working day left out is today (`QĐ-110b`).
    const input = { ...given, lastWorkingDay: lastWorkingDayOf(given.accessBlockMode, given.lastWorkingDay, today) };

    const { seen, held } = await this.preconditions.require(tx, actor, input, today);
    // What the departure will do, read before anything is written and shared with the preview, is kept with the record (`MF2-B.3`).
    const impact = await this.impact.impactOf(tx, {
      employeeId: input.employeeId,
      today,
      lastWorkingDay: input.lastWorkingDay as BusinessDate,
      headSuccessorRequired: seen.leavesAsHead,
    });
    const scheduled = await this.endings.end(tx, actor, input, { seen, held, organizationId: organization.id, today });

    return this.writer.write(tx, actor, input, {
      seen,
      held,
      scheduled,
      impact,
      organizationId: organization.id,
      today,
    });
  }
}
