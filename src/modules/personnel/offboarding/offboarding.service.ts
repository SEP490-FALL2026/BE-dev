import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { PersonnelActor } from '../public/personnel.types';
import { TransferGuardService } from '../transfer/transfer-guard.service';
import { OffboardingCaseWriter } from './offboarding-case-writer.service';
import { OffboardingEndings } from './offboarding-endings.service';
import { OffboardingFrame } from './offboarding-frame.service';
import { OffboardingPreconditions } from './offboarding-preconditions.service';
import type { OffboardingRecord, RecordOffboardingInput } from './offboarding.types';

/**
 * Records a person who leaves: a planned handover with the last working day and the basis it rests on, or an abrupt departure that
 * is `LEFT` at once (`US-03-04` AC-2, AC-8, AC-18, AC-19, AC-23, AC-29, `US-03-03` AC-6, `US-03-01` AC-21). One transaction under the
 * locks of the protocol (the departments by id, the employee, a chosen successor, the accounts): the transfer that would still wait
 * is cancelled, a long leave ends, the head of the department the person leaves is handed over (never a reason to refuse, `QĐ-77k`),
 * the placement ends the day after the last working day, and the confirmation of the handover is opened for every tool. No seat is
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
  ) {}

  /** Throws OffboardingRefusedError for everything the policy or the database refuses, and PersonnelAccessRefusedError for the actor. */
  record(actor: PersonnelActor, input: RecordOffboardingInput): Promise<OffboardingRecord> {
    this.guard.requireWriter(actor, input.employeeId);

    return this.frame.guarded(() => this.runner.run((tx) => this.recordInTx(tx, actor, input)));
  }

  /** The same in the transaction of the caller (the write that starts from a notice of the head, or from the controlled procedure). */
  async recordInTx(tx: DbTx, actor: PersonnelActor, input: RecordOffboardingInput): Promise<OffboardingRecord> {
    this.guard.requireWriter(actor, input.employeeId);
    const organization = await this.guard.requireOrganization();
    const today = await this.organizationReads.businessToday(new Date(), tx);

    const { seen, held } = await this.preconditions.require(tx, actor, input, today);
    const scheduled = await this.endings.end(tx, actor, input, { seen, held, organizationId: organization.id, today });

    return this.writer.write(tx, actor, input, { seen, held, scheduled, organizationId: organization.id, today });
  }
}
