import { FirstPlacementUseContributions } from '../../public/organization.extension-points';
import { FirstPlacementUseReaderMissingError } from '../employee.errors';
import { FirstPlacementUseService } from './first-placement-use.service';

/** What refers to a first placement (`QĐ-113e`): the head periods, then the two modules that hold the other facts; a missing one fails closed. */
describe('FirstPlacementUseService', () => {
  const tx = { name: 'tx' };
  const departments = { headPeriodsOf: jest.fn() };
  const reader = (answer: string | null) => ({ read: jest.fn().mockResolvedValue(answer) });
  const contributions = (readers: Record<string, ReturnType<typeof reader>>) => {
    const registry = new FirstPlacementUseContributions();
    for (const [name, impl] of Object.entries(readers)) registry.add(name, impl);

    return registry;
  };
  const service = (registry: FirstPlacementUseContributions) =>
    new FirstPlacementUseService(departments as never, registry);

  beforeEach(() => {
    jest.clearAllMocks();
    departments.headPeriodsOf.mockResolvedValue([]);
  });

  it('refuses to answer when a contributor is not registered, so a missing module never reads as "unused"', async () => {
    const onlyRequests = contributions({ 'requests.requests-of-person': reader(null) });
    await expect(service(onlyRequests).read(tx as never, 'emp-1')).rejects.toBeInstanceOf(
      FirstPlacementUseReaderMissingError,
    );
    await expect(service(contributions({})).read(tx as never, 'emp-1')).rejects.toBeInstanceOf(
      FirstPlacementUseReaderMissingError,
    );
    const onlyPersonnel = contributions({ 'personnel.transfers-and-departures': reader(null) });
    await expect(service(onlyPersonnel).read(tx as never, 'emp-1')).rejects.toThrow(/requests\.requests-of-person/);
  });

  it('answers HEAD_PERIOD first, then the first contributor that finds something, else null', async () => {
    const requests = reader(null);
    const personnel = reader('TRANSFER');
    const registry = contributions({
      'requests.requests-of-person': requests,
      'personnel.transfers-and-departures': personnel,
    });

    await expect(service(registry).read(tx as never, 'emp-1')).resolves.toBe('TRANSFER');
    expect(requests.read).toHaveBeenCalledWith('emp-1', tx);
    personnel.read.mockResolvedValue(null);
    await expect(service(registry).read(tx as never, 'emp-1')).resolves.toBeNull();
    departments.headPeriodsOf.mockResolvedValue([{}]);
    await expect(service(registry).read(tx as never, 'emp-1')).resolves.toBe('HEAD_PERIOD');
  });
});
