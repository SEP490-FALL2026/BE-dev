import { Injectable } from '@nestjs/common';
import { pageOf, type Page } from '../../../core/application/pagination';
import type { BusinessDate } from '../../../core/business-date';
import { TransactionRunner } from '../../../infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { LicensingApi } from '../../licensing/public/licensing.api';
import { OrganizationHistoryApi } from '../../organization/public/organization-history.api';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { RequestsApi } from '../../requests/public/requests.api';
import type {
  DepartmentMemberOpenRequestWire,
  DepartmentMemberSoftwareRightWire,
  DepartmentMemberWire,
} from './department-member.dto';
import { DepartmentMemberRefusedError } from './department-member.errors';
import { memberReadVerdict } from './department-member.policy';

interface PageQuery {
  page: number;
  pageSize: number;
}

const slice = (query: PageQuery) => ({ skip: (query.page - 1) * query.pageSize, take: query.pageSize });

/**
 * What the head of a department reads of one person placed in it today (`QĐ-41c`(2)): the record without email, contract or end of
 * employment, the software the person holds and the requests of theirs, from this department, that are not over. Nothing is changed.
 * A person who is not placed in the department today is not found, whether they moved away or never existed. The record costs the same
 * statements whatever the person holds; each of the two lists is a page whose cost does not grow with its size.
 */
@Injectable()
export class DepartmentMemberQueryService {
  constructor(
    private readonly organizationReads: OrganizationReadApi,
    private readonly history: OrganizationHistoryApi,
    private readonly runner: TransactionRunner,
    private readonly licensing: LicensingApi,
    private readonly requests: RequestsApi,
  ) {}

  /** Throws DepartmentMemberRefusedError (`OUT_OF_SCOPE`, `NOT_FOUND`). */
  async get(
    principal: AuthenticatedPrincipal,
    departmentId: string,
    employeeId: string,
  ): Promise<DepartmentMemberWire> {
    const today = await this.organizationReads.businessToday();
    await this.requireHead(principal, departmentId, today);
    const { placement, employee } = await this.runner.run(async (tx) => {
      const found = await this.history.getPlacementInForce(tx, employeeId, today);

      return {
        placement: found,
        employee:
          found?.departmentId === departmentId ? await this.organizationReads.getEmployee(employeeId, tx) : null,
      };
    });
    if (!placement || !employee) throw new DepartmentMemberRefusedError('NOT_FOUND');
    const held = await this.licensing.pageHeldSoftwareOf(employeeId, today, { skip: 0, take: 0 });
    const open = await this.requests.listOpenOfBeneficiary(employeeId, { skip: 0, take: 0 }, undefined, {
      departmentId,
    });

    return {
      employeeId: employee.id,
      employeeCode: employee.employeeCode,
      fullName: employee.fullName,
      status: employee.status,
      hasWorkEmail: employee.workEmail !== null,
      memberSince: placement.validFrom,
      heldSoftwareCount: held.total,
      openRequestCount: open.total,
    };
  }

  /** Throws DepartmentMemberRefusedError (`OUT_OF_SCOPE`, `NOT_FOUND`). */
  async softwareRights(
    principal: AuthenticatedPrincipal,
    departmentId: string,
    employeeId: string,
    query: PageQuery,
  ): Promise<Page<DepartmentMemberSoftwareRightWire>> {
    const today = await this.requireMember(principal, departmentId, employeeId);
    const { items, total } = await this.licensing.pageHeldSoftwareOf(employeeId, today, slice(query));

    return pageOf(items, total, query.page, query.pageSize);
  }

  /** Throws DepartmentMemberRefusedError (`OUT_OF_SCOPE`, `NOT_FOUND`). */
  async openRequests(
    principal: AuthenticatedPrincipal,
    departmentId: string,
    employeeId: string,
    query: PageQuery,
  ): Promise<Page<DepartmentMemberOpenRequestWire>> {
    await this.requireMember(principal, departmentId, employeeId);
    const { items, total } = await this.requests.listOpenOfBeneficiary(employeeId, slice(query), undefined, {
      departmentId,
    });

    return pageOf(
      items.map((item) => ({
        requestId: item.requestId,
        type: item.type,
        state: item.state,
        applicationName: item.plan?.applicationName ?? null,
        planName: item.plan?.planName ?? null,
        submittedAt: item.submittedAt.toISOString(),
        group: item.group,
      })),
      total,
      query.page,
      query.pageSize,
    );
  }

  /** The caller must head the department today; the one who does not is told the department is out of their scope, or not found. */
  private async requireHead(
    principal: AuthenticatedPrincipal,
    departmentId: string,
    today: BusinessDate,
  ): Promise<void> {
    const headed = await this.organizationReads.getHeadedDepartment(principal.employeeId, today);
    if (headed?.departmentId === departmentId) return;
    const departmentExists = (await this.organizationReads.getDepartmentBrief(departmentId)) !== null;
    const verdict = memberReadVerdict({ headsThisDepartment: false, departmentExists, placedHere: false });
    if (verdict !== 'ALLOWED') throw new DepartmentMemberRefusedError(verdict);
  }

  /** The caller heads the department and the person is placed in it today; returns that day. */
  private async requireMember(
    principal: AuthenticatedPrincipal,
    departmentId: string,
    employeeId: string,
  ): Promise<BusinessDate> {
    const today = await this.organizationReads.businessToday();
    await this.requireHead(principal, departmentId, today);
    const placement = await this.organizationReads.getEmployeePlacement(employeeId, today);
    const verdict = memberReadVerdict({
      headsThisDepartment: true,
      departmentExists: true,
      placedHere: placement?.departmentId === departmentId,
    });
    if (verdict !== 'ALLOWED') throw new DepartmentMemberRefusedError(verdict);

    return today;
  }
}
