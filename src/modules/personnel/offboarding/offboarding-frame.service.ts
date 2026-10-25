import { Injectable } from '@nestjs/common';
import { businessDateAt, type BusinessDate } from '../../../core/business-date';
import { TransactionRunner, readSqlState, type DbTx } from '../../../infrastructure/database/transaction-runner';
import { isCheckViolation } from '../../../infrastructure/database/unique-violation';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { OrganizationHistoryService } from '../../organization/organization-history.service';
import { EmployeeNotFoundError } from '../../organization/organization.errors';
import { OrganizationService } from '../../organization/organization.service';
import type { SelfActionMode } from '../personnel-self-action.policy';
import { TransferGuardService } from '../transfer/transfer-guard.service';
import { OffboardingRefusedError } from './offboarding.errors';
import { OffboardingRepo } from './offboarding.repo';
import type { OffboardingRecord } from './offboarding.types';

/** What a command on a case that exists works with once it holds its locks. */
export interface OffboardingCommandContext {
  held: OffboardingRecord;
  today: BusinessDate;
  /** The day the case was written, in the calendar of the organization. */
  recordedOn: BusinessDate;
  selfMode: SelfActionMode;
}

/**
 * The frame the commands on a case share (the lock protocol): the case is read, the department (when the command moves its head)
 * and the employee are locked, a chosen successor is locked shared, and the case is read again under the locks; the command then
 * works in the one transaction. The database has the last word on the periods put back: a change someone made between the record and
 * now answers `CONCURRENT_CHANGE`, and nothing is saved.
 */
@Injectable()
export class OffboardingFrame {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly organization: OrganizationService,
    private readonly history: OrganizationHistoryService,
    private readonly guard: TransferGuardService,
    private readonly repo: OffboardingRepo,
  ) {}

  async run<T>(
    actor: AuthenticatedPrincipal,
    id: string,
    options: { lockDepartment?: boolean; successorEmployeeId?: string | null },
    apply: (tx: DbTx, context: OffboardingCommandContext) => Promise<T>,
  ): Promise<T> {
    const seen = await this.repo.find(id);
    if (!seen) throw new OffboardingRefusedError('NOT_FOUND');
    const selfMode = await this.guard.selfMode(actor, seen.employeeId);

    return this.guarded(() =>
      this.runner.run(async (tx) => {
        const today = await this.organization.businessToday(new Date(), tx);
        if (options.lockDepartment) {
          await this.history.lockDepartments(tx, { updateIds: [seen.departmentId], shareIds: [] });
        }
        await this.organization.lockEmployeeForUpdate(tx, seen.employeeId);
        const chosen = options.successorEmployeeId ?? null;
        if (chosen) await this.lockShared(tx, chosen);
        const held = await this.repo.lock(tx, id);
        if (!held) throw new OffboardingRefusedError('NOT_FOUND');
        const earlier = held.headHandover?.successorEmployeeId ?? null;
        if (options.lockDepartment && earlier && earlier !== chosen) await this.lockShared(tx, earlier);
        const zone = (await this.organization.getOrganization(tx))?.timeZone ?? 'UTC';

        return apply(tx, { held, today, recordedOn: businessDateAt(held.recordedAt, zone), selfMode });
      }),
    );
  }

  private async lockShared(tx: DbTx, employeeId: string): Promise<void> {
    try {
      await this.organization.lockEmployeeForShare(tx, employeeId);
    } catch (error) {
      if (!(error instanceof EmployeeNotFoundError)) throw error;
    }
  }

  /** The database refused the periods put back or a step off the life of the case: someone changed them meanwhile. */
  async guarded<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      const state = readSqlState(error);
      if (state === '23P01' || state === '55000' || isCheckViolation(error))
        throw new OffboardingRefusedError('CONCURRENT_CHANGE');
      throw error;
    }
  }
}
