import { ProjectForbiddenError } from './project.errors';
import { assertMayKeepProjects } from './project.policy';

describe('project.policy (who keeps the projects of the department profiles, F13, QĐ-87a)', () => {
  it('lets the Super Admin list, read, add and change projects', () => {
    expect(() => assertMayKeepProjects(['SUPER_ADMIN'])).not.toThrow();
  });

  it.each([[['IT_ADMIN']], [['FINANCE']], [['MANAGER']], [['EMPLOYEE']], [[]]])('refuses %j', (roles) => {
    expect(() => assertMayKeepProjects(roles)).toThrow(ProjectForbiddenError);
  });
});
