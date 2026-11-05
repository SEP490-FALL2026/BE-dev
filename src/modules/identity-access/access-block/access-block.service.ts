import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { DbTx } from '../../../infrastructure/database/transaction-runner';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import type { AccessBlockCause, AccessBlockRecord, PendingBlockOutcome } from '../public/identity-access.types';
import { AccessBlockRepo } from './access-block.repo';
import { AccessBlockNotReleasableError } from './access-block.errors';
import { isBlockInForce } from './access-block.policy';

/** The writes and reads of the block a departure puts on the access of an employee; personnel calls them through the facade. */
@Injectable()
export class AccessBlockService {
  constructor(
    private readonly blocks: AccessBlockRepo,
    private readonly organizationReads: OrganizationReadApi,
  ) {}

  find(employeeId: string, tx?: DbTx): Promise<AccessBlockRecord | null> {
    return this.blocks.find(employeeId, tx);
  }

  async findMany(employeeIds: readonly string[]): Promise<Map<string, AccessBlockRecord>> {
    return this.blocks.findMany(employeeIds);
  }

  /** Whether a block refuses the employee on `today` (whether the employee has left is the status's to say). */
  async isBlockedOn(employeeId: string, today: BusinessDate, tx?: DbTx): Promise<boolean> {
    return isBlockInForce(await this.blocks.find(employeeId, tx), today);
  }

  /** Whether a block is in force for the employee now, on the organization's business day (the day is asked only when a block exists). */
  async isBlockedNow(employeeId: string, tx?: DbTx): Promise<boolean> {
    const block = await this.blocks.find(employeeId, tx);
    if (block === null) return false;

    return isBlockInForce(block, await this.organizationReads.businessToday(new Date(), tx));
  }

  async set(
    tx: DbTx,
    input: { employeeId: string; cause: AccessBlockCause; blockedFrom: BusinessDate; caseId: string },
  ): Promise<void> {
    const employee = await this.organizationReads.getEmployee(input.employeeId, tx);
    if (!employee) throw new Error(`The employee ${input.employeeId} to block was not found.`);
    // A block already in force is never pushed later by a new departure: whoever was refused yesterday is still refused today.
    const today = await this.organizationReads.businessToday(new Date(), tx);
    const current = await this.blocks.find(input.employeeId, tx);
    const blockedFrom =
      current && isBlockInForce(current, today) && current.blockedFrom < input.blockedFrom
        ? current.blockedFrom
        : input.blockedFrom;
    await this.blocks.upsert(tx, { ...input, blockedFrom, organizationId: employee.organizationId });
  }

  /**
   * The unlock of an account asks what to do with the block of its employee (`QĐ-100q`, `QĐ-81`): one the departure left in force after it
   * was cancelled is lifted (true); one whose departure is still alive is not the Super Admin's to lift (throws); none, or one that has
   * not begun, changes nothing (false).
   */
  async releaseForUnlock(tx: DbTx, employeeId: string): Promise<boolean> {
    const block = await this.blocks.find(employeeId, tx);
    if (!block) return false;
    const today = await this.organizationReads.businessToday(new Date(), tx);
    if (!isBlockInForce(block, today)) return false;
    if (!block.releasable) throw new AccessBlockNotReleasableError();
    await this.blocks.delete(tx, employeeId);

    return true;
  }

  /** Only a block that follows the last working day moves with it (R-11): a block set to act now keeps its day. */
  async move(tx: DbTx, employeeId: string, blockedFrom: BusinessDate): Promise<void> {
    await this.blocks.moveLastDayBlock(tx, employeeId, blockedFrom);
  }

  /**
   * The departure is cancelled: a block that has not taken effect is dropped; one that has stays, and only the Super Admin
   * can lift it with a reason (`QĐ-100q`).
   */
  async clearPending(tx: DbTx, employeeId: string, today: BusinessDate): Promise<PendingBlockOutcome> {
    const block = await this.blocks.find(employeeId, tx);
    if (block === null) return 'NONE';
    if (isBlockInForce(block, today)) {
      await this.blocks.markReleasable(tx, employeeId);

      return 'IN_FORCE';
    }
    await this.blocks.delete(tx, employeeId);

    return 'CLEARED';
  }
}
