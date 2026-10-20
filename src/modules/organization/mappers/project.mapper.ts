import { ProjectRecord } from '../project/project.types';

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
