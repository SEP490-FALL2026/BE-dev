import { toProjectWire } from '../mappers/project.mapper';
import { DepartmentProfileView, DepartmentView } from './department.types';

/** The wire model of a department in a list. */
export function toDepartmentWire(view: DepartmentView) {
  return {
    id: view.id,
    code: view.code,
    name: view.name,
    function: view.functionDescription,
    status: view.status,
    costCenter: view.costCenter,
    itAdmin: view.itAdmin
      ? {
          employeeId: view.itAdmin.employeeId,
          employeeCode: view.itAdmin.employeeCode,
          fullName: view.itAdmin.fullName,
          usable: view.itAdminUsable,
        }
      : null,
    head: view.head,
    memberCount: view.memberCount,
    warnings: view.warnings,
    createdAt: view.createdAt.toISOString(),
    updatedAt: view.updatedAt.toISOString(),
    deactivatedAt: view.deactivatedAt ? view.deactivatedAt.toISOString() : null,
  };
}

/** The wire model of one department's profile: the list model, who headed it and the projects it takes part in. */
export function toDepartmentProfileWire(view: DepartmentProfileView) {
  return {
    ...toDepartmentWire(view),
    headHistory: view.headHistory,
    headHistoryHasMore: view.headHistoryHasMore,
    projects: view.projects.map(toProjectWire),
    projectTotal: view.projectTotal,
  };
}
