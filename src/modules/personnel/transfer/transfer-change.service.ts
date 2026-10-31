import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { TransactionRunner, type DbTx } from '../../../infrastructure/database/transaction-runner';
import { OrganizationHistoryApi } from '../../organization/public/organization-history.api';
import { EmployeeNotFoundError } from '../../organization/public/organization.errors';
import { OrganizationApi } from '../../organization/public/organization.api';
import type { PersonnelActor } from '../public/personnel.types';
import { TransferRefusedError } from './transfer.errors';
import { TransferChangeWriter } from './transfer-change-writer.service';
import { TransferGuardService } from './transfer-guard.service';
import { TransferRepo } from './transfer.repo';
import { TransferSettlementService } from './transfer-settlement.service';
import type { ChangeTransferInput, TransferRecord } from './transfer.types';

/**
 * Moves the day of a transfer that has not taken effect, or cancels it (`US-03-01` AC-19, AC-20, AC-21). Both need a reason and
 * a basis, and both only while the day has not come. The head handover of the old department moves or is taken back with it, and
 * is judged again on the new day: when the successor cannot take it, the whole command is refused and nothing is saved.
 */
@Injectable()
export class TransferChangeService {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly organization: OrganizationApi,
    private readonly history: OrganizationHistoryApi,
    private readonly guard: TransferGuardService,
    private readonly transfers: TransferRepo,
    private readonly settlement: TransferSettlementService,
    private readonly writer: TransferChangeWriter,
  ) {}

  /**
   * Moves the day. Throws TransferRefusedError and PersonnelAccessRefusedError. With `outer` it runs in the transaction of the
   * caller (the controlled procedure writes its ticket in the same one) and the caller guards the race.
   */
  async reschedule(
    actor: PersonnelActor,
    id: string,
    input: ChangeTransferInput,
    outer?: DbTx,
  ): Promise<TransferRecord> {
    const newEffectiveOn = input.newEffectiveOn;
    if (newEffectiveOn === undefined) throw new TransferRefusedError('NO_CHANGE');

    return this.change(actor, id, input, outer, (tx, held, today) =>
      this.writer.reschedule(tx, actor, held, today, { ...input, newEffectiveOn }),
    );
  }

  /** Cancels the transfer: the person keeps the department, the head of the department keeps being head. */
  async cancel(actor: PersonnelActor, id: string, input: ChangeTransferInput, outer?: DbTx): Promise<TransferRecord> {
    return this.change(actor, id, input, outer, async (tx, held, today) => {
      const cancelled = await this.writer.applyCancel(tx, actor, held, today, input);
      await this.writer.tell(tx, held, 'TRANSFER_CANCELLED', held.effectiveOn);

      return cancelled;
    });
  }

  /** The transfer of the person that waits, as it is now and without taking a lock: what the record of a departure takes its locks from. */
  peekPendingOf(tx: DbTx, employeeId: string): Promise<TransferRecord | null> {
    return this.transfers.findPendingOf(tx, employeeId);
  }

  /**
   * The transfer of the person that waits, after those whose day has come were settled (`US-03-04` AC-8, `US-03-01` AC-21): what
   * the record of a departure judges before it takes its locks. Null when none waits.
   */
  async pendingOf(tx: DbTx, employeeId: string, today: BusinessDate): Promise<TransferRecord | null> {
    await this.settlement.settleDueOf(tx, employeeId, today);

    return this.transfers.findPendingOf(tx, employeeId);
  }

  /**
   * Cancels the transfer that waits because the person is to leave before its day, inside the transaction of the record of the
   * departure, which holds the departments and the employee (`US-03-01` AC-21). The basis of the cancellation is the basis of the
   * departure. Answers what the transfer refused instead of throwing it, so the caller says it in its own words.
   */
  async cancelForDeparture(
    tx: DbTx,
    actor: PersonnelActor,
    transferId: string,
    input: ChangeTransferInput,
    today: BusinessDate,
  ): Promise<{ refused: { code: string; details?: Record<string, unknown> } | null }> {
    try {
      const held = await this.transfers.lock(tx, transferId);
      if (!held) throw new TransferRefusedError('NOT_FOUND');
      await this.writer.applyCancel(tx, actor, held, today, input);

      return { refused: null };
    } catch (error) {
      if (error instanceof TransferRefusedError) return { refused: { code: error.code, details: error.details } };
      throw error;
    }
  }

  /**
   * The frame both commands share: the transfer is read, the locks are taken in the order of the protocol (the departments by
   * id, the employee, the successor), the transfer is read again under them, and `apply` does the rest in the transaction.
   */
  private async change(
    actor: PersonnelActor,
    id: string,
    input: ChangeTransferInput,
    outer: DbTx | undefined,
    apply: (tx: DbTx, held: TransferRecord, today: BusinessDate) => Promise<TransferRecord>,
  ): Promise<TransferRecord> {
    const seen = await this.transfers.find(id, outer);
    if (!seen) throw new TransferRefusedError('NOT_FOUND');
    this.guard.requireWriter(actor, seen.employeeId);

    const work = async (tx: DbTx): Promise<TransferRecord> => {
      const today = await this.organization.businessToday(new Date(), tx);
      await this.history.lockDepartments(tx, {
        updateIds: seen.headHandover ? [seen.fromDepartmentId] : [],
        shareIds: [seen.fromDepartmentId, seen.toDepartmentId],
      });
      await this.organization.lockEmployeeForUpdate(tx, seen.employeeId);
      const chosenId = input.successor?.kind === 'EMPLOYEE' ? input.successor.employeeId : null;
      if (chosenId) await this.lockSuccessor(tx, chosenId);
      const held = await this.transfers.lock(tx, id);
      if (!held) throw new TransferRefusedError('NOT_FOUND');
      if (held.headHandover?.successorEmployeeId && held.headHandover.successorEmployeeId !== chosenId) {
        await this.lockSuccessor(tx, held.headHandover.successorEmployeeId);
      }
      await this.guard.requireOperatorSubject(tx, actor, seen.employeeId);

      return apply(tx, held, today);
    };

    return outer ? work(outer) : this.guard.guarded(() => this.runner.run(work));
  }

  private async lockSuccessor(tx: DbTx, employeeId: string): Promise<void> {
    try {
      await this.organization.lockEmployeeForShare(tx, employeeId);
    } catch (error) {
      if (!(error instanceof EmployeeNotFoundError)) throw error;
    }
  }
}
