import { CostCenterService } from '../../../src/modules/organization/cost-center/cost-center.service';
import { CreateCostCenterBodyDto } from '../../../src/modules/organization/cost-center/cost-center.dto';
import { DepartmentHeadService } from '../../../src/modules/organization/department-management/department-head.service';
import { DepartmentService } from '../../../src/modules/organization/department-management/department.service';
import {
  AssignHeadBodyDto,
  CreateDepartmentBodyDto,
} from '../../../src/modules/organization/department-management/department.dto';
import { DepartmentCreationWindowHook } from '../../../src/modules/organization/public/organization.extension-points';
import { EmployeeManualService } from '../../../src/modules/organization/employee/employee-manual.service';
import { CreateEmployeeBodyDto } from '../../../src/modules/organization/employee/employee.dto';
import type { HttpTestApp } from '../http-test-app';
import { changeRoleTo, principalOf, sent } from './account.builder';

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

/** The fixtures that make a department take turns (see `createDepartment`). */
let fixtureTurn: Promise<void> = Promise.resolve();

/** The Super Admin creates a department with no Cost Center (`POST /departments`). */
export async function createDepartment(
  ctx: HttpTestApp,
  adminToken: string,
  body: object,
): Promise<{ id: string; code: string }> {
  const actor = await principalOf(ctx, adminToken);
  const parsed = CreateDepartmentBodyDto.create(sent(body));
  // A fixture department is a precondition, not the creation the budgeting period rules (`QĐ-104e(3)`): the suites that publish the
  // cycles of next year (the budget harness) still need departments after it. The suites of the window call the route. The hook is
  // shared by the whole application, so the fixtures take it one at a time: a department made while another is being made (Promise.all)
  // never sees, or leaves behind, a stand-in the other put there.
  const made = fixtureTurn.then(async () => {
    const window = ctx.app.get(DepartmentCreationWindowHook, { strict: false }).get();
    const windowOn = window.windowOn.bind(window);
    window.windowOn = () => Promise.resolve({ kind: 'NO_CYCLE_YET' });
    try {
      const id = await ctx.app.get(DepartmentService, { strict: false }).create(actor, {
        code: parsed.code,
        name: parsed.name,
        functionDescription: parsed.function,
        itAdminEmployeeId: parsed.itAdminEmployeeId,
      });
      // It has existed since long ago: suites that move the clock back must still find it in effect (the window suites call the route).
      await ctx.sql.query(`UPDATE departments SET effective_from = DATE '2020-01-01' WHERE id = $1`, [id]);

      return { id, code: parsed.code };
    } finally {
      window.windowOn = windowOn;
    }
  });
  fixtureTurn = made.then(
    () => undefined,
    () => undefined,
  );

  return made;
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
  body: { employeeId: string; effectiveFrom?: string },
): Promise<void> {
  // The head is a MANAGER first (US-03-06 AC-23); the seam grants it once the application stops deriving the role.
  await changeRoleTo(ctx, adminToken, body.employeeId, 'MANAGER');
  const actor = await principalOf(ctx, adminToken);
  await ctx.app
    .get(DepartmentHeadService, { strict: false })
    .assign(actor, departmentId, AssignHeadBodyDto.create(sent(body)));
}
