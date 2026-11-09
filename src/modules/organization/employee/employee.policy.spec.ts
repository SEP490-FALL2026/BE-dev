import { EmployeeForbiddenError, EmployeeSelfChangeForbiddenError } from './employee.errors';
import { assertMayCorrectEmployee, assertMayEnterEmployees } from './employee.policy';

describe('employee.policy (who may enter and correct employee records, F11, F13, QĐ-87a, QĐ-87c)', () => {
  describe('assertMayEnterEmployees', () => {
    it('lets the Super Admin enter a record, by hand or by file', () => {
      expect(() => assertMayEnterEmployees(['SUPER_ADMIN'])).not.toThrow();
    });

    it.each([[['IT_ADMIN']], [['FINANCE']], [['MANAGER']], [['EMPLOYEE']], [[]]])('refuses %j', (roles) => {
      expect(() => assertMayEnterEmployees(roles)).toThrow(EmployeeForbiddenError);
    });
  });

  describe('assertMayCorrectEmployee', () => {
    const superAdmin = { roles: ['SUPER_ADMIN'], employeeId: 'me' };

    it("lets the Super Admin correct somebody else's record", () => {
      expect(() => assertMayCorrectEmployee(superAdmin, 'someone')).not.toThrow();
    });

    it('refuses the Super Admin their own record with the self-change refusal, which names the controlled procedure (F11)', () => {
      expect(() => assertMayCorrectEmployee(superAdmin, 'me')).toThrow(EmployeeSelfChangeForbiddenError);
      expect(() => assertMayCorrectEmployee(superAdmin, 'me')).toThrow(/ops:record-super-admin-event profile-correct/);
    });

    it('judges the role before whose record it is, so a caller without the role learns nothing of whose record is whose', () => {
      expect(() => assertMayCorrectEmployee({ roles: ['IT_ADMIN'], employeeId: 'me' }, 'me')).toThrow(
        EmployeeForbiddenError,
      );
      expect(() => assertMayCorrectEmployee({ roles: ['IT_ADMIN'], employeeId: 'me' }, 'someone')).toThrow(
        EmployeeForbiddenError,
      );
    });
  });
});
