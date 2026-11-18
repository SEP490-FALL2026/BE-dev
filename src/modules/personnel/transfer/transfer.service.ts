import { Injectable } from '@nestjs/common';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { PersonnelActor } from '../public/personnel.types';
import { TransferPreconditions } from './transfer-preconditions.service';
import { TransferRecorder } from './transfer-recorder.service';
import { TransferGuardService } from './transfer-guard.service';
import type { RecordTransferInput, TransferRecord } from './transfer.types';

/**
 * Records a change of department with the day it takes effect and the basis it rests on (`US-03-01` AC-1, AC-2,
 * AC-4 -> AC-8, AC-11, AC-13 -> AC-18, AC-22). The periods are written ahead, in this transaction: the one the person has ends
 * on the day, the new one begins on it, and the head of the department they leave is handed over or left empty by choice. No
 * seat is touched and no step of a request is moved here: the listeners of the organization act on the day.
 */
@Injectable()
export class TransferService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly organizationReads: OrganizationReadApi,
    private readonly guard: TransferGuardService,
    private readonly preconditions: TransferPreconditions,
    private readonly recorder: TransferRecorder,
  ) {}

  /** Throws TransferRefusedError for everything the policy or the database refuses, and PersonnelAccessRefusedError for the actor. */
  async record(actor: PersonnelActor, input: RecordTransferInput): Promise<TransferRecord> {
    this.guard.requireWriter(actor, input.employeeId);

    return this.guard.guarded(() => this.runner.run((tx) => this.recordInTx(tx, actor, input)));
  }

  /** The same in the transaction of the caller (the writes that start from a notice of the head, later). */
  async recordInTx(tx: DbTx, actor: PersonnelActor, input: RecordTransferInput): Promise<TransferRecord> {
    this.guard.requireWriter(actor, input.employeeId);
    const organization = await this.guard.requireOrganization();
    const today = await this.organizationReads.businessToday(new Date(), tx);

    const { seen, held } = await this.preconditions.require(tx, actor, input, today);

    return this.recorder.write(tx, actor, input, { seen, held, organizationId: organization.id, today });
  }
}
