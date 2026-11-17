import { Test } from '@nestjs/testing';
import { NotificationNameContributions } from '../../notifications/public/notifications.extension-points';
import { CostCenterNotificationNamesListener } from './cost-center-notification-names.listener';
import { CostCenterRepo } from './cost-center.repo';

const FIRST = '0198a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a01';
const SECOND = '0198a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a02';
const MISSING = '0198a1b2-c3d4-7e5f-8a9b-0c1d2e3f4aff';

/** A Cost Center is named in a notification by its code and name; the owner of its table answers for every id of a page in one read. */
describe('CostCenterNotificationNamesListener', () => {
  const repo = { namesOf: jest.fn() };
  let contributions: NotificationNameContributions;

  async function listener(): Promise<CostCenterNotificationNamesListener> {
    contributions = new NotificationNameContributions();
    const moduleRef = await Test.createTestingModule({
      providers: [
        CostCenterNotificationNamesListener,
        { provide: CostCenterRepo, useValue: repo },
        { provide: NotificationNameContributions, useValue: contributions },
      ],
    }).compile();

    return moduleRef.get(CostCenterNotificationNamesListener);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    repo.namesOf.mockImplementation((ids: readonly string[]) => {
      const known = new Map([
        [FIRST, 'CC-001 · Kế toán'],
        [SECOND, 'CC-002 · Kỹ thuật'],
      ]);

      return Promise.resolve(new Map(ids.filter((id) => known.has(id)).map((id) => [id, known.get(id) as string])));
    });
  });

  it('binds the notification name registry and adds itself to it when the module starts', async () => {
    const instance = await listener();

    expect(CostCenterNotificationNamesListener.binds).toEqual([NotificationNameContributions]);
    instance.onModuleInit();

    expect(contributions.names()).toEqual(['organization.cost-center-names']);
    expect(contributions.all()).toEqual([instance]);
  });

  it('names the Cost Center kind only', async () => {
    expect((await listener()).kinds).toEqual(['COST_CENTER']);
  });

  it('answers the name of each Cost Center that exists, in one read for the distinct ids', async () => {
    const instance = await listener();

    const names = await instance.names('COST_CENTER', [FIRST, SECOND, FIRST]);

    expect([...names]).toEqual([
      [FIRST, 'CC-001 · Kế toán'],
      [SECOND, 'CC-002 · Kỹ thuật'],
    ]);
    expect(repo.namesOf).toHaveBeenCalledTimes(1);
    expect(repo.namesOf).toHaveBeenCalledWith([FIRST, SECOND]);
  });

  it('leaves out a Cost Center that does not exist and an id that is not a uuid, without throwing', async () => {
    const instance = await listener();

    const names = await instance.names('COST_CENTER', [MISSING, 'not-a-uuid', FIRST]);

    expect([...names]).toEqual([[FIRST, 'CC-001 · Kế toán']]);
    expect(repo.namesOf).toHaveBeenCalledWith([MISSING, FIRST]);
  });

  it('reads nothing for ids that are all malformed or for no ids', async () => {
    const instance = await listener();

    expect((await instance.names('COST_CENTER', ['x', ''])).size).toBe(0);
    expect((await instance.names('COST_CENTER', [])).size).toBe(0);
    expect(repo.namesOf).not.toHaveBeenCalled();
  });

  it('answers nothing for a kind it does not own', async () => {
    const instance = await listener();

    expect((await instance.names('DEPARTMENT', [FIRST])).size).toBe(0);
    expect(repo.namesOf).not.toHaveBeenCalled();
  });
});
