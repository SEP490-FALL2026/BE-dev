import { toEmployeeDetailWire, toEmployeeSummaryWire } from './employee-directory.mapper';
import type { EmployeeListRow, EmployeePlacementHistoryRecord } from './employee-directory.types';

describe('employee-directory.mapper', () => {
  const baseRow: EmployeeListRow = {
    id: 'e0000000-0000-0000-0000-000000000001',
    employee_code: 'NV-0001',
    full_name: 'Nguyễn Văn A',
    work_email: 'a.nguyen@congty.vn',
    employment_type: 'STAFF',
    status: 'ACTIVE',
    work_state: 'WORKING',
    hire_date: new Date('2026-01-15T00:00:00.000Z'),
    job_title: 'Software Engineer',
    department_id: 'd0000000-0000-0000-0000-000000000001',
    department_code: 'P-DES',
    department_name: 'Product Design',
    unplaced: false,
  };

  it('maps employee row with account and department to summary wire', () => {
    const summary = toEmployeeSummaryWire(baseRow, {
      id: 'u0000000-0000-0000-0000-000000000001',
      status: 'ACTIVE',
      activationState: 'ACTIVATED',
      employeeLeft: false,
    });

    expect(summary).toEqual({
      id: 'e0000000-0000-0000-0000-000000000001',
      employeeCode: 'NV-0001',
      fullName: 'Nguyễn Văn A',
      workEmail: 'a.nguyen@congty.vn',
      employmentType: 'STAFF',
      status: 'ACTIVE',
      workState: 'WORKING',
      hireDate: '2026-01-15',
      jobTitle: 'Software Engineer',
      department: {
        id: 'd0000000-0000-0000-0000-000000000001',
        code: 'P-DES',
        name: 'Product Design',
      },
      unplaced: false,
      account: {
        id: 'u0000000-0000-0000-0000-000000000001',
        status: 'ACTIVE',
        activationState: 'ACTIVATED',
        employeeLeft: false,
      },
    });
  });

  it('maps unplaced employee row without department and without account', () => {
    const row: EmployeeListRow = {
      ...baseRow,
      department_id: null,
      department_code: null,
      department_name: null,
      unplaced: true,
    };

    const summary = toEmployeeSummaryWire(row, undefined);

    expect(summary.department).toBeNull();
    expect(summary.unplaced).toBe(true);
    expect(summary.account).toBeNull();
  });

  it('maps detail wire with placement history and account roles', () => {
    const placements: EmployeePlacementHistoryRecord[] = [
      {
        department: { id: 'd0000000-0000-0000-0000-000000000001', code: 'P-DES', name: 'Product Design' },
        validFrom: '2026-06-01',
        validTo: null,
      },
      {
        department: { id: 'd0000000-0000-0000-0000-000000000002', code: 'P-OPS', name: 'Operations' },
        validFrom: '2026-01-15',
        validTo: '2026-06-01',
      },
    ];

    const detail = toEmployeeDetailWire(baseRow, placements, true, {
      id: 'u0000000-0000-0000-0000-000000000001',
      status: 'ACTIVE',
      activationState: 'ACTIVATED',
      employeeLeft: false,
      roles: ['SUPER_ADMIN', 'EMPLOYEE'],
    });

    expect(detail.placements).toHaveLength(2);
    expect(detail.placementsHasMore).toBe(true);
    expect(detail.account?.roles).toEqual(['SUPER_ADMIN', 'EMPLOYEE']);
  });
});
