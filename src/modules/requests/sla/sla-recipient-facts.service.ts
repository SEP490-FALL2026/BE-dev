import { Injectable } from '@nestjs/common';
import type { BusinessDate } from '../../../core/business-date';
import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { IdentityAccessApi } from '../../identity-access/public/identity-access.api';
import { OrganizationApi } from '../../organization/public/organization.api';
import { superiorOf, type QueueRecipientFacts, type StepRecipientFacts } from './step-sla.policy';

/**
 * Reads, on the day of the pass and in the transaction of the reminder, who is who around a late step: whether the holder still
 * works, who is above them, who the Super Admin and Finance are. It reads the organization and the accounts through their facades
 * and writes nothing. A person counts only while their employment is active; a name that is missing is `null`, never a guess.
 */
@Injectable()
export class SlaRecipientFactsService {
  constructor(
    private readonly organization: OrganizationApi,
    private readonly identity: IdentityAccessApi,
  ) {}

  /** The people to tell about a step held by `holderEmployeeId` (or by nobody), with the question to Finance when one is open. */
  async forStep(
    tx: DbTx,
    input: { holderEmployeeId: string | null; today: BusinessDate; questionOpen: boolean },
  ): Promise<StepRecipientFacts> {
    const holder = input.holderEmployeeId;
    const holderUsable = holder !== null && (await this.working(tx, [holder])).has(holder);
    const superiorEmployeeId =
      holder !== null && holderUsable ? await this.superiorOfHolder(tx, holder, input.today) : null;

    return {
      holderEmployeeId: holder,
      holderUsable,
      superiorEmployeeId,
      superAdminEmployeeId: await this.identity.findUsableSuperAdminEmployeeId(tx),
      financeQuestionEmployeeId: input.questionOpen ? await this.identity.findUsableFinanceEmployeeId(tx) : null,
    };
  }

  /** The people to tell about a request that waits in the queue of the head of `departmentId`. */
  async forQueue(tx: DbTx, input: { departmentId: string; today: BusinessDate }): Promise<QueueRecipientFacts> {
    const heads = await this.organization.getDepartmentHeads([input.departmentId], input.today, tx);
    const head = heads.get(input.departmentId)?.employeeId ?? null;

    return {
      headEmployeeId: head,
      headUsable: head !== null && (await this.working(tx, [head])).has(head),
      superAdminEmployeeId: await this.identity.findUsableSuperAdminEmployeeId(tx),
    };
  }

  /** The person above the holder if they still work and are somebody else; null when there is none. */
  private async superiorOfHolder(tx: DbTx, holder: string, today: BusinessDate): Promise<string | null> {
    const placement = await this.organization.getEmployeePlacement(holder, today, tx);
    const heads = placement
      ? await this.organization.getDepartmentHeads([placement.departmentId], today, tx)
      : new Map<string, { employeeId: string }>();
    const roles = await this.identity.getApprovalRoleHolders(tx);
    const superior = superiorOf({
      holderEmployeeId: holder,
      isSpendingApprover: roles.spendingApproverEmployeeId === holder,
      departmentHeadEmployeeId: placement ? (heads.get(placement.departmentId)?.employeeId ?? null) : null,
      spendingApproverEmployeeId: roles.spendingApproverEmployeeId,
    });

    return superior !== null && (await this.working(tx, [superior])).has(superior) ? superior : null;
  }

  /** Which of these employees still work for the company. */
  private async working(tx: DbTx, employeeIds: readonly string[]): Promise<Set<string>> {
    const found = await this.organization.getEmployees([...employeeIds], tx);

    return new Set(found.filter((employee) => employee.status === 'ACTIVE').map((employee) => employee.id));
  }
}
