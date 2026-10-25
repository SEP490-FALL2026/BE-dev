import { Injectable } from '@nestjs/common';
import { pageOf, type Page } from '../../../core/application/pagination';
import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { OrganizationService } from '../../organization/organization.service';
import { ControlledWaitRepo } from './controlled-wait.repo';
import type { ControlledWaitWire } from './controlled-wait.dto';
import { configurationHintOf } from './reassignment.policy';

/**
 * The queue of the steps that wait under control (`US-05-11`): the Super Admin sees every one, an IT Admin the requests sent
 * for the departments they are in charge of, and nobody else reads it (the route admits no other role). A page is one query
 * for the steps and one for the people and the departments in it, whatever its size (`LD-07`).
 */
@Injectable()
export class ControlledWaitQueryService {
  constructor(
    private readonly waits: ControlledWaitRepo,
    private readonly organization: OrganizationService,
  ) {}

  async page(
    actor: AuthenticatedPrincipal,
    query: { page: number; pageSize: number },
  ): Promise<Page<ControlledWaitWire>> {
    const departmentIds = actor.roles.includes('SUPER_ADMIN')
      ? null
      : await this.organization.getDepartmentIdsInChargeOf(actor.employeeId);
    if (departmentIds !== null && departmentIds.length === 0) return pageOf([], 0, query.page, query.pageSize);

    const { rows, total } = await this.waits.page(departmentIds, (query.page - 1) * query.pageSize, query.pageSize);
    const people = new Map(
      (await this.organization.getEmployees([...new Set(rows.map((row) => row.requesterEmployeeId))])).map(
        (employee) => [employee.id, employee],
      ),
    );
    const departments = new Map(
      (await this.organization.getDepartmentBriefs([...new Set(rows.map((row) => row.departmentId))])).map(
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
