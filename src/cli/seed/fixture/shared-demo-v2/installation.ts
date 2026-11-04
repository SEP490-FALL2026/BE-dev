/** Bootstrap data belongs only to installation; organization steps never reuse this department or employee. */
export const INSTALLATION = {
  organizationName: 'SLM Demo',
  timeZone: 'Asia/Ho_Chi_Minh',
  reportingCurrency: 'VND',
  departmentCode: 'DS1-ADMIN',
  departmentName: 'Quản trị hệ thống',
  loginEmail: 'system.admin@slm-demo.example',
  superAdmin: {
    employeeCode: 'DS1-SA',
    fullName: 'Quản trị demo',
    workEmail: 'system.admin@slm-demo.example',
    employmentType: 'STAFF',
    hireDate: '2020-01-01',
  },
};

/**
 * The installation of the fixture with the Super Admin's address chosen by the operator (`--super-admin-email`, Owner
 * 04/11/2026): it is both the work email of the employee and the login email of the account. Everything else stays fixed.
 */
export function installationWith(superAdminEmail: string = INSTALLATION.loginEmail) {
  return {
    ...INSTALLATION,
    loginEmail: superAdminEmail,
    superAdmin: { ...INSTALLATION.superAdmin, workEmail: superAdminEmail },
  };
}
