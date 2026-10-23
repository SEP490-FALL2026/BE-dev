import { ProjectRecord, ProjectSummaryRecord } from '../project/project.types';

/** The wire model of a project, shared by the project routes and the department profile. */
export function toProjectWire(project: ProjectRecord) {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    status: project.status,
    departments: project.departments,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

/** The wire model of a project in a list: without the description. */
export function toProjectSummaryWire(project: ProjectSummaryRecord) {
  return {
    id: project.id,
    name: project.name,
    status: project.status,
    departments: project.departments,
    updatedAt: project.updatedAt.toISOString(),
  };
}
