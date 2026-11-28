import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import { EmployeeNotStartedError, FinanceSetupIncompleteError } from '../../organization/public/organization.errors';
import { AccessRequestNoDepartmentError } from '../access-request/access-request.errors';
import { RequestFactsService } from '../access-request/request-facts.service';

const tx = {} as DbTx;
const input = { employeeId: 'e-1', now: new Date('2026-06-01T05:00:00Z'), lockDepartment: true };
const unit = { departmentId: 'd-1', costCenter: { id: 'cc-1', status: 'ACTIVE' } };

function build() {
  const organization = {
    businessToday: jest.fn().mockResolvedValue('2026-06-01'),
    getOwningUnits: jest.fn().mockResolvedValue(new Map([[input.employeeId, unit]])),
    notStartedAmong: jest.fn().mockResolvedValue(new Set()),
    requireUnitCostCenter: jest.fn((found: { costCenter: unknown; departmentId: string }) => {
      if (!found.costCenter) throw new FinanceSetupIncompleteError(found.departmentId);
      return found;
    }),
    lockDepartmentShared: jest.fn(),
  };
  const service = new RequestFactsService(
    organization as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  return { service, organization };
}

describe('RequestFactsService.assessParty', () => {
  it('refuses a requester without an owning department', async () => {
    const { service, organization } = build();
    organization.getOwningUnits.mockResolvedValue(new Map());
    await expect(service.assessParty(tx, input)).rejects.toBeInstanceOf(AccessRequestNoDepartmentError);
    expect(organization.lockDepartmentShared).not.toHaveBeenCalled();
  });

  it('refuses an employee whose placement has yet to start', async () => {
    const { service, organization } = build();
    organization.getOwningUnits.mockResolvedValue(new Map());
    organization.notStartedAmong.mockResolvedValue(new Set([input.employeeId]));
    await expect(service.assessParty(tx, input)).rejects.toBeInstanceOf(EmployeeNotStartedError);
    expect(organization.lockDepartmentShared).not.toHaveBeenCalled();
  });

  it('requires a current Cost Center before locking', async () => {
    const { service, organization } = build();
    organization.getOwningUnits.mockResolvedValue(new Map([[input.employeeId, { ...unit, costCenter: null }]]));
    await expect(service.assessParty(tx, input)).rejects.toBeInstanceOf(FinanceSetupIncompleteError);
    expect(organization.lockDepartmentShared).not.toHaveBeenCalled();
  });

  it('reads the department on the business day and locks it for share once', async () => {
    const { service, organization } = build();
    await expect(service.assessParty(tx, input)).resolves.toEqual({ today: '2026-06-01', unit });
    expect(organization.getOwningUnits).toHaveBeenCalledWith([input.employeeId], '2026-06-01', tx);
    expect(organization.lockDepartmentShared).toHaveBeenCalledTimes(1);
    expect(organization.lockDepartmentShared).toHaveBeenCalledWith(tx, unit.departmentId);
  });
});
