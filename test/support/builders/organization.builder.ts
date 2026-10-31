import { ApprovalRoleService } from '../../../src/modules/identity-access/approval-roles/approval-role.service';
import {
  ApprovalRoleParamDto,
  SetApprovalRoleBodyDto,
} from '../../../src/modules/identity-access/approval-roles/approval-role.dto';
import { CostCenterService } from '../../../src/modules/organization/cost-center/cost-center.service';
import { CreateCostCenterBodyDto } from '../../../src/modules/organization/cost-center/cost-center.dto';
import { DepartmentHeadService } from '../../../src/modules/organization/department-management/department-head.service';
import { DepartmentService } from '../../../src/modules/organization/department-management/department.service';
import {
  AssignHeadBodyDto,
  CreateDepartmentBodyDto,
} from '../../../src/modules/organization/department-management/department.dto';
import { EmployeeManualService } from '../../../src/modules/organization/employee/employee-manual.service';
import { CreateEmployeeBodyDto } from '../../../src/modules/organization/employee/employee.dto';
import type { HttpTestApp } from '../http-test-app';
import { principalOf, sent } from './account.builder';

/*
 * T2.2 (spec "Integration: dựng fixture không qua HTTP"): the organization a suite only needs as a precondition, made by the
 * service each route calls, as the bearer of the token the route would have been called with (the principal the guard resolves
 * from it), on the body the route's validation pipe would have passed on (the DTO schema parses it). Everything the service does
 * still happens — the authorization of the service, its locks, audit rows, in-app notices and the listeners of other modules —
 * only HTTP is skipped (and the profile the route reads back afterwards, which the harness never used). A suite that proves one
 * of these routes calls the route itself. No assertion lives here.
 */

/** The Super Admin enters one person by hand (`POST /employees`): the employee, the placement, the audit row and the notices. */
export async function enterEmployee(ctx: HttpTestApp, adminToken: string, body: object): Promise<{ id: string }> {
  const actor = await principalOf(ctx, adminToken);

  return ctx.app.get(EmployeeManualService, { strict: false }).create(actor, CreateEmployeeBodyDto.create(sent(body)));
}

/** The Super Admin creates a department with no Cost Center (`POST /departments`). */
export async function createDepartment(
  ctx: HttpTestApp,
  adminToken: string,
  body: object,
): Promise<{ id: string; code: string }> {
  const actor = await principalOf(ctx, adminToken);
  const parsed = CreateDepartmentBodyDto.create(sent(body));
  const id = await ctx.app.get(DepartmentService, { strict: false }).create(actor, {
    code: parsed.code,
    name: parsed.name,
    functionDescription: parsed.function,
    itAdminEmployeeId: parsed.itAdminEmployeeId,
    hrBasis: parsed.hrBasis,
  });

  return { id, code: parsed.code };
}

/** Finance creates the Cost Center of a department (`POST /cost-centers`). */
export async function createCostCenter(
  ctx: HttpTestApp,
  financeToken: string,
  body: object,
): Promise<{ id: string; code: string }> {
  const actor = await principalOf(ctx, financeToken);
  const created = await ctx.app
    .get(CostCenterService, { strict: false })
    .create(actor, CreateCostCenterBodyDto.create(sent(body)));

  return { id: created.id, code: created.code };
}

/** The Super Admin names the head of a department (`POST /departments/{id}/head-assignments`). */
export async function assignHead(
  ctx: HttpTestApp,
  adminToken: string,
  departmentId: string,
  body: object,
): Promise<void> {
  const actor = await principalOf(ctx, adminToken);
  await ctx.app
    .get(DepartmentHeadService, { strict: false })
    .assign(actor, departmentId, AssignHeadBodyDto.create(sent(body)));
}

/** The Super Admin names the holder of an approval role (`PUT /approval-roles/{role}`). */
export async function setApprovalRole(
  ctx: HttpTestApp,
  adminToken: string,
  role: string,
  employeeId: string,
): Promise<void> {
  const actor = await principalOf(ctx, adminToken);
  await ctx.app
    .get(ApprovalRoleService, { strict: false })
    .set(actor, ApprovalRoleParamDto.create({ role }).role, SetApprovalRoleBodyDto.create({ employeeId }).employeeId);
}
