import { FirstPlacementUseContributions } from '../../organization/public/organization.extension-points';
import { FirstPlacementPersonnelReader } from './first-placement-personnel.listener';
import { FirstPlacementPersonnelRepo } from './first-placement-personnel.repo';

/** A transfer or a departure of the person, whatever its state, keeps their first placement from being corrected (`QĐ-113e`). */
describe('FirstPlacementPersonnelReader', () => {
  const departmentTransfer = { findFirst: jest.fn() };
  const offboardingCase = { findFirst: jest.fn() };
  const repo = new FirstPlacementPersonnelRepo({} as never);
  const contributions = new FirstPlacementUseContributions();
  const reader = new FirstPlacementPersonnelReader(repo, contributions);
  const db = { departmentTransfer, offboardingCase } as never;

  beforeEach(() => {
    jest.clearAllMocks();
    departmentTransfer.findFirst.mockResolvedValue(null);
    offboardingCase.findFirst.mockResolvedValue(null);
  });

  it('registers itself under the name the correction expects', () => {
    reader.onModuleInit();

    expect(contributions.names()).toEqual(['personnel.transfers-and-departures']);
  });

  it('answers TRANSFER, then OFFBOARDING, then null, with no filter on the state', async () => {
    await expect(reader.read('emp-1', db)).resolves.toBeNull();
    expect(departmentTransfer.findFirst).toHaveBeenCalledWith({ where: { employeeId: 'emp-1' }, select: { id: true } });
    expect(offboardingCase.findFirst).toHaveBeenCalledWith({ where: { employeeId: 'emp-1' }, select: { id: true } });

    offboardingCase.findFirst.mockResolvedValueOnce({ id: 'c-1' });
    await expect(reader.read('emp-1', db)).resolves.toBe('OFFBOARDING');

    departmentTransfer.findFirst.mockResolvedValueOnce({ id: 't-1' });
    await expect(reader.read('emp-1', db)).resolves.toBe('TRANSFER');
  });
});
