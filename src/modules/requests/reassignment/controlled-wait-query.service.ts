import { Injectable } from '@nestjs/common';
import { pageOf, type Page } from '../../../core/application/pagination';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { OrganizationReadApi } from '../../organization/public/organization-read.api';
import { ControlledWaitRepo } from './controlled-wait.repo';
import type { ControlledWaitWire } from './controlled-wait.dto';
import { configurationHintOf } from '../step-routing/reassignment.policy';

/**
 * The queue of the steps that wait under control (`US-05-11`): the Super Admin sees every one, an IT Admin the requests sent
 * for the departments they are in charge of, and nobody else reads it (the route admits no other role). A page is one query
 * for the steps and one for the people and the departments in it, whatever its size.
 */
@Injectable()
export class ControlledWaitQueryService {
  constructor(
    private readonly waits: ControlledWaitRepo,
    private readonly organizationReads: OrganizationReadApi,
  ) {}

  async page(
    actor: AuthenticatedPrincipal,
    query: { page: number; pageSize: number },
  ): Promise<Page<ControlledWaitWire>> {
    const departmentIds = actor.roles.includes('SUPER_ADMIN')
      ? null
      : await this.organizationReads.getDepartmentIdsInChargeOf(actor.employeeId);
    if (departmentIds !== null && departmentIds.length === 0) return pageOf([], 0, query.page, query.pageSize);

    const { rows, total } = await this.waits.page(departmentIds, (query.page - 1) * query.pageSize, query.pageSize);
    const people = new Map(
      (await this.organizationReads.getEmployees([...new Set(rows.map((row) => row.requesterEmployeeId))])).map(
        (employee) => [employee.id, employee],
      ),
    );
    const departments = new Map(
      (await this.organizationReads.getDepartmentBriefs([...new Set(rows.map((row) => row.departmentId))])).map(
        (department) => [department.id, department],
      ),
    );
    const items = rows.map((row): ControlledWaitWire => {
      const requester = people.get(row.requesterEmployeeId);
      const department = departments.get(row.departmentId);
      if (!requester || !department)
        throw new Error(`The waiting step ${row.stepId} points at a missing person or department.`);

      return {
        requestId: row.requestId,
        stepId: row.stepId,
        stepKind: row.stepKind,
        waitingReason: row.waitingReason as ControlledWaitWire['waitingReason'],
        configurationHint: configurationHintOf(row.waitingReason),
        waitingSince: row.waitingSince.toISOString(),
        alertedAt: row.alertedAt?.toISOString() ?? null,
        requester: { employeeId: requester.id, employeeCode: requester.employeeCode, fullName: requester.fullName },
        department: { id: department.id, code: department.code, name: department.name },
      };
    });

    return pageOf(items, total, query.page, query.pageSize);
  }
}
