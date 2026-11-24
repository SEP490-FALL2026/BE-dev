import type { BusinessDate } from '../../../core/business-date';
import type { ActingItAdminsResult } from '../../organization/public/organization.types';
import { isOverdue } from './device-return-task.policy';
import type { ReturnTaskListRow } from './device-return-task.types';

export interface EmployeeBrief {
  id: string;
  employeeCode: string;
  fullName: string;
}

export interface DepartmentBrief {
  id: string;
  name: string;
}

/** Resolves eligible acting IT Admins for a return task, always excluding the departing employee. */
export function resolveTaskActingItAdmins(
  departmentId: string | null,
  taskEmployeeId: string,
  actingByDepartment: ReadonlyMap<string, ActingItAdminsResult>,
): Array<{ id: string; bySubstitute: boolean }> {
  if (!departmentId) return [];
  const acting = actingByDepartment.get(departmentId);
  if (!acting) return [];

  return acting.actors
    .filter((id) => id !== taskEmployeeId)
    .map((id) => ({
      id,
      bySubstitute: acting.substitute === id && acting.inCharge !== id,
    }));
}

export function toReturnTaskItem(
  row: ReturnTaskListRow,
  context: {
    today: BusinessDate;
    employees: ReadonlyMap<string, EmployeeBrief>;
    departments: ReadonlyMap<string, DepartmentBrief>;
    actingByDepartment: ReadonlyMap<string, ActingItAdminsResult>;
  },
) {
  const employee = context.employees.get(row.employeeId) ?? {
    id: row.employeeId,
    employeeCode: '',
    fullName: '',
  };
  const acting = resolveTaskActingItAdmins(row.departmentId, row.employeeId, context.actingByDepartment).map(
    (entry) => ({
      id: entry.id,
      fullName: context.employees.get(entry.id)?.fullName ?? '',
      bySubstitute: entry.bySubstitute,
    }),
  );

  return {
    id: row.id,
    device: {
      id: row.deviceId,
      assetCode: row.deviceAssetCode,
      hostname: row.deviceHostname,
    },
    employee,
    offboardingCaseId: row.offboardingCaseId,
    department: row.departmentId ? (context.departments.get(row.departmentId) ?? null) : null,
    actingItAdmins: acting,
    waiting: acting.length === 0,
    dueOn: row.dueOn,
    overdue: isOverdue({ state: row.state, dueOn: row.dueOn, today: context.today }),
    state: row.state,
    handledAt: row.handledAt ? row.handledAt.toISOString() : null,
  };
}
