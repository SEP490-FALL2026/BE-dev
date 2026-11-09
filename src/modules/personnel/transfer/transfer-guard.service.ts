import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import { readSqlState, type DbTx } from '../../../infrastructure/database/transaction-runner';
import { isCheckViolation } from '../../../infrastructure/database/unique-violation';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { PersonnelAccessRefusedError } from '../public/personnel.errors';
import { operatorSubjectRefusal, userWriterRefusal } from '../personnel-self-action.policy';
import type { PersonnelActor } from '../public/personnel.types';
import { TransferRefusedError } from './transfer.errors';
import { TransferRepo } from './transfer.repo';
import { successorRefusal, type SuccessorFacts, type TransferRefusal } from './transfer.policy';
import type { SuccessorChoice } from './transfer.types';

/** What the writes of a transfer judge alike: who the actor is to the person moved, and how the next head of a department stands. */
@Injectable()
export class TransferGuardService {
  constructor(
    private readonly organizationReads: OrganizationReadApi,
    private readonly identity: IdentityAccessApi,
    private readonly transfers: TransferRepo,
  ) {}

  /** The installation's organization; a transfer before installation is a programming error. */
  async requireOrganization(): Promise<{ id: string }> {
    const organization = await this.organizationReads.getOrganization();
    if (!organization) throw new Error('A transfer was recorded before installation');

    return organization;
  }

  /**
   * The first rule of every write of an event: only the Super Admin writes, and never about themselves. It needs no
   * database, so it is judged before any lock; a person who signed in is judged here in full. Throws PersonnelAccessRefusedError.
   */
  requireWriter(actor: PersonnelActor, subjectEmployeeId: string): void {
    if (actor.kind !== 'USER') return;
    const problem = userWriterRefusal(actor.principal, subjectEmployeeId);
    if (problem) throw new PersonnelAccessRefusedError(problem);
  }

  /**
   * The second rule, for the controlled procedure only: it serves a person who holds the `SUPER_ADMIN` role. The account is
   * read `FOR SHARE`, so call it after the employee is locked (the lock protocol: the employee, then the account). Nothing for a
   * person who signed in. Throws PersonnelAccessRefusedError.
   */
  async requireOperatorSubject(tx: DbTx, actor: PersonnelActor, subjectEmployeeId: string): Promise<void> {
    if (actor.kind !== 'OPERATOR') return;
    const account = await this.identity.inspectEmployeeAccount(tx, subjectEmployeeId);
    const problem = operatorSubjectRefusal(account.roles.includes('SUPER_ADMIN'));
    if (problem) throw new PersonnelAccessRefusedError(problem);
  }

  /**
   * How the head of the department a person leaves is provided for on `day` (`US-03-01` AC-8): whether one is needed, what was
   * chosen, and for a chosen employee whether they are a member of the old department that day, still work, and are not a
   * Super Admin. The caller holds the department; the account is read `FOR SHARE` after the employee (the lock protocol).
   */
  async successorFacts(
    tx: DbTx,
    input: {
      required: boolean;
      chosen: SuccessorChoice | undefined;
      transfereeId: string;
      oldDepartmentId: string;
      day: BusinessDate;
    },
  ): Promise<SuccessorFacts> {
    const { required, chosen } = input;
    if (!required || chosen?.kind !== 'EMPLOYEE') return { required, chosen, candidate: null };
    const candidateId = chosen.employeeId;
    const employee = await this.organizationReads.getEmployee(candidateId, tx);
    if (!employee) return { required, chosen, candidate: null };
    const placement = await this.organizationReads.getEmployeePlacement(candidateId, input.day, tx);
    const account = await this.identity.inspectEmployeeAccount(tx, candidateId);

    return {
      required,
      chosen,
      candidate: {
        isTransferee: candidateId === input.transfereeId,
        memberOfOldDepartmentOnDay: placement?.departmentId === input.oldDepartmentId,
        stillWorking: employee.status === 'ACTIVE' && employee.workState !== 'LEFT',
        holdsSuperAdmin: account.roles.includes('SUPER_ADMIN'),
        holdsManager: account.roles.includes('MANAGER'),
        holdsSpendingApprover: account.roles.includes('SPENDING_APPROVER'),
        hasPendingTransfer: (await this.transfers.findPendingOf(tx, candidateId)) !== null,
      },
    };
  }

  /**
   * Whether the person chosen to follow a head who leaves can take the department on `day`, judged as for a transfer (a member that
   * day, still working, not a Super Admin, not the person leaving, not leaving the department themselves); null when they can. The
   * departure never insists on a successor: nobody chosen is a choice. The caller holds the department and the employees.
   */
  async judgeSuccessor(
    tx: DbTx,
    input: { chosen: SuccessorChoice | undefined; leaverId: string; departmentId: string; day: BusinessDate },
  ): Promise<TransferRefusal | null> {
    return successorRefusal(
      await this.successorFacts(tx, {
        required: true,
        chosen: input.chosen ?? { kind: 'NONE' },
        transfereeId: input.leaverId,
        oldDepartmentId: input.departmentId,
        day: input.day,
      }),
    );
  }

  /**
   * The account a few columns and facades that demand a signed-in person see for the actor. A person who signed in is themselves.
   * The controlled procedure has no account, yet `offboarding_cases.left_by_app_user_id` (a person who is `LEFT` says who marked it)
   * and the handover confirmations `licensing` opens (`created_by_app_user_id`) are still NOT NULL: for the procedure the stand-in is
   * the account of the Super Admin it serves, with the ticket as its session. It fills those columns and nothing else: who did the
   * event is the ticket in its own column and in the Audit Trail, and the facade of the handover is told the ticket
   * (`OperatorAuditActor`) so that what it audits is `OPERATOR` with no account, never this stand-in.
   */
  async standIn(tx: DbTx, actor: PersonnelActor): Promise<AuthenticatedPrincipal> {
    if (actor.kind === 'USER') return actor.principal;
    const holder = await this.identity.getSuperAdminHolder(tx);
    if (!holder) throw new PersonnelAccessRefusedError('FORBIDDEN');

    return {
      subject: holder.appUserId,
      appUserId: holder.appUserId,
      sessionId: actor.ticketId,
      employeeId: holder.employeeId,
      directRoles: ['SUPER_ADMIN'],
      roles: ['SUPER_ADMIN'],
    };
  }

  /**
   * The database has the last word on the periods a write puts back or the ones it opens: if someone changed the head of the
   * department or the placements of the person meanwhile, they no longer fit and nothing is saved. A race the database refuses is a
   * conflict the caller can read and retry, never a 500.
   */
  async guarded<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (readSqlState(error) === '23P01' || isCheckViolation(error))
        throw new TransferRefusedError('CONCURRENT_CHANGE');
      throw error;
    }
  }

  /** Throws the refusal the policy gave, naming the department that would be left without a head when that is the reason. */
  refuse(refusal: { code: string; details?: Record<string, unknown> }, extra?: Record<string, unknown>): never {
    throw new TransferRefusedError(refusal.code, { ...refusal.details, ...extra });
  }
}
