import { ImportForbiddenError } from './employee-import.errors';
import { assertMayImportEmployees } from './employee-import.policy';

describe('employee-import.policy (who works with a people file, US-02-01, F13, QĐ-87a)', () => {
  it('lets the Super Admin upload, judge, confirm, cancel and read a file', () => {
    expect(() => assertMayImportEmployees(['SUPER_ADMIN'])).not.toThrow();
  });

  it.each([[['IT_ADMIN']], [['FINANCE']], [['MANAGER']], [['EMPLOYEE']], [[]]])('refuses %j', (roles) => {
    expect(() => assertMayImportEmployees(roles)).toThrow(ImportForbiddenError);
  });
});
