import { FirstPlacementUseContributions } from '../../../organization/public/organization.extension-points';
import { FirstPlacementRequestsReader } from './first-placement-requests.listener';
import { RequestUseRepo } from './request-use.repo';

/** A Request of the person, as requester or as beneficiary, in any state (a draft too), keeps their first placement from being corrected (`QĐ-113e`). */
describe('FirstPlacementRequestsReader', () => {
  const accessRequest = { findFirst: jest.fn() };
  const accessRequestBeneficiary = { findFirst: jest.fn() };
  const repo = new RequestUseRepo({} as never);
  const tx = { accessRequest, accessRequestBeneficiary };
  const contributions = new FirstPlacementUseContributions();
  const reader = new FirstPlacementRequestsReader(repo, contributions);

  beforeEach(() => {
    jest.clearAllMocks();
    accessRequest.findFirst.mockResolvedValue(null);
    accessRequestBeneficiary.findFirst.mockResolvedValue(null);
  });

  it('registers itself under the name the correction expects', () => {
    reader.onModuleInit();

    expect(contributions.names()).toEqual(['requests.requests-of-person']);
  });

  it('answers REQUEST for the requester and for the beneficiary, and null for a person with neither', async () => {
    await expect(reader.read('emp-1', tx as never)).resolves.toBeNull();

    accessRequest.findFirst.mockResolvedValueOnce({ id: 'r-1' });
    await expect(reader.read('emp-1', tx as never)).resolves.toBe('REQUEST');

    accessRequestBeneficiary.findFirst.mockResolvedValueOnce({ requestId: 'r-2' });
    await expect(reader.read('emp-1', tx as never)).resolves.toBe('REQUEST');
  });

  it('asks about the person only, in any state, so a draft counts', async () => {
    await reader.read('emp-1', tx as never);

    expect(accessRequest.findFirst).toHaveBeenCalledWith({
      where: { requesterEmployeeId: 'emp-1' },
      select: { id: true },
    });
    expect(accessRequestBeneficiary.findFirst).toHaveBeenCalledWith({
      where: { employeeId: 'emp-1' },
      select: { requestId: true },
    });
  });
});
