import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { IdentityAccessService } from '../../identity-access/identity-access.service';
import { OrganizationService } from '../../organization/organization.service';
import { selfActionMode, type SelfActionMode } from '../personnel-self-action.policy';
import { TransferRefusedError } from './transfer.errors';
import { TransferRepo } from './transfer.repo';
import { successorRefusal, type SuccessorFacts, type TransferRefusal } from './transfer.policy';
import type { SuccessorChoice } from './transfer.types';

/** What the writes of a transfer judge alike: who the actor is to the person moved, and how the next head of a department stands. */
@Injectable()
export class TransferGuardService {
  constructor(
    private readonly organization: OrganizationService,
    private readonly identity: IdentityAccessService,
    private readonly transfers: TransferRepo,
  ) {}

  /** The installation's organization; a transfer before installation is a programming error. */
  async requireOrganization(): Promise<{ id: string }> {
    const organization = await this.organization.getOrganization();
    if (!organization) throw new Error('A transfer was recorded before installation');

    return organization;
  }

  /** Whether the actor may act on this person: an IT Admin acting on themselves needs another IT Admin unless they are the only one. */
  async selfMode(actor: AuthenticatedPrincipal, employeeId: string): Promise<SelfActionMode> {
    const isSelf = actor.employeeId === employeeId;

    return selfActionMode({
      isSelf,
      otherUsableItAdmins: isSelf ? await this.identity.countUsableItAdminsExcept(actor.employeeId) : 0,
    });
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
    const employee = await this.organization.getEmployee(candidateId, tx);
    if (!employee) return { required, chosen, candidate: null };
    const placement = await this.organization.getEmployeePlacement(candidateId, input.day, tx);
    const account = await this.identity.inspectEmployeeAccount(tx, candidateId);

    return {
      required,
      chosen,
      candidate: {
        isTransferee: candidateId === input.transfereeId,
        memberOfOldDepartmentOnDay: placement?.departmentId === input.oldDepartmentId,
        stillWorking: employee.status === 'ACTIVE' && employee.workState !== 'LEFT',
        holdsSuperAdmin: account.roles.includes('SUPER_ADMIN'),
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

  /** Throws the refusal the policy gave, naming the department that would be left without a head when that is the reason. */
  refuse(refusal: { code: string; details?: Record<string, unknown> }, extra?: Record<string, unknown>): never {
    throw new TransferRefusedError(refusal.code, { ...refusal.details, ...extra });
  }
}
