import { Injectable } from '@nestjs/common';
import { businessDateAt, type BusinessDate } from '../../../core/business-date';
import { TransactionRunner, readSqlState, type DbTx } from '../../../infrastructure/database/transaction-runner';
import { isCheckViolation } from '../../../infrastructure/database/unique-violation';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { OrganizationHistoryApi } from '../../organization/public/organization-history.api';
import { EmployeeNotFoundError } from '../../organization/public/organization.errors';
import { OrganizationApi } from '../../organization/public/organization.api';
import { PersonnelAccessRefusedError } from '../public/personnel.errors';
import { technicalStepRefusal } from '../personnel-self-action.policy';
import type { PersonnelActor } from '../public/personnel.types';
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
}

interface FrameOptions {
  lockDepartment?: boolean;
  successorEmployeeId?: string | null;
}

/**
 * The frame the commands on a case share (the lock protocol): the case is read, the department (when the command moves its head)
 * and the employee are locked, a chosen successor is locked shared, and the case is read again under the locks; the command then
 * works in the one transaction. The database has the last word on the periods put back: a change someone made between the record and
 * now answers `CONCURRENT_CHANGE`, and nothing is saved. Two kinds of command: an event of the person (moving the last day,
 * cancelling, becoming `LEFT`), which only the Super Admin writes and never about themselves, and a technical step that follows it (the
 * lock of the account, the revocations, the closing), which is the IT Admin's.
 */
@Injectable()
export class OffboardingFrame {
  constructor(
    private readonly runner: TransactionRunner,
    private readonly organization: OrganizationApi,
    private readonly history: OrganizationHistoryApi,
    private readonly guard: TransferGuardService,
    private readonly repo: OffboardingRepo,
  ) {}

  /** An event of the person on a case. With `outer` it runs in the transaction of the caller (the controlled procedure). */
  runEvent<T>(
    actor: PersonnelActor,
    id: string,
    options: FrameOptions & { outer?: DbTx | undefined },
    apply: (tx: DbTx, context: OffboardingCommandContext) => Promise<T>,
  ): Promise<T> {
    return this.run(
      id,
      options,
      {
        beforeLocks: (seen) => this.guard.requireWriter(actor, seen.employeeId),
        afterLocks: (tx, seen) => this.guard.requireOperatorSubject(tx, actor, seen.employeeId),
      },
      apply,
    );
  }

  /** A technical step that follows the event: the IT Admin's, judged here and not only by the guard of the route. */
  runTechnical<T>(
    actor: AuthenticatedPrincipal,
    id: string,
    options: FrameOptions,
    apply: (tx: DbTx, context: OffboardingCommandContext) => Promise<T>,
  ): Promise<T> {
    return this.run(
      id,
      options,
      {
        beforeLocks: () => {
          const refused = technicalStepRefusal(actor);
          if (refused) throw new PersonnelAccessRefusedError(refused);
        },
      },
      apply,
    );
  }

  private async run<T>(
    id: string,
    options: FrameOptions & { outer?: DbTx | undefined },
    rules: {
      beforeLocks: (seen: OffboardingRecord) => void;
      afterLocks?: (tx: DbTx, seen: OffboardingRecord) => Promise<void>;
    },
    apply: (tx: DbTx, context: OffboardingCommandContext) => Promise<T>,
  ): Promise<T> {
    const seen = await this.repo.find(id, options.outer);
    if (!seen) throw new OffboardingRefusedError('NOT_FOUND');
    rules.beforeLocks(seen);

    const work = async (tx: DbTx): Promise<T> => {
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
      await rules.afterLocks?.(tx, seen);
      const zone = (await this.organization.getOrganization(tx))?.timeZone ?? 'UTC';

      return apply(tx, { held, today, recordedOn: businessDateAt(held.recordedAt, zone) });
    };

    return options.outer ? work(options.outer) : this.guarded(() => this.runner.run(work));
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
