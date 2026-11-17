import { Test } from '@nestjs/testing';
import { NotificationNameContributions } from '../../notifications/public/notifications.extension-points';
import { EmployeeNotificationNamesListener } from './employee-notification-names.listener';
import { EmployeeDirectoryRepo } from './employee-directory.repo';

const FIRST = '0198a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a01';
const SECOND = '0198a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a02';
const MISSING = '0198a1b2-c3d4-7e5f-8a9b-0c1d2e3f4aff';

/** An employee is named in a notification by their full name; the owner of its table answers for every id of a page in one read. */
describe('EmployeeNotificationNamesListener', () => {
  const repo = { namesOf: jest.fn() };
  let contributions: NotificationNameContributions;

  async function listener(): Promise<EmployeeNotificationNamesListener> {
    contributions = new NotificationNameContributions();
    const moduleRef = await Test.createTestingModule({
      providers: [
        EmployeeNotificationNamesListener,
        { provide: EmployeeDirectoryRepo, useValue: repo },
        { provide: NotificationNameContributions, useValue: contributions },
      ],
    }).compile();

    return moduleRef.get(EmployeeNotificationNamesListener);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    repo.namesOf.mockImplementation((ids: readonly string[]) => {
      const known = new Map([
        [FIRST, 'Nguyễn Văn An'],
        [SECOND, 'Trần Thị Bình'],
      ]);

      return Promise.resolve(new Map(ids.filter((id) => known.has(id)).map((id) => [id, known.get(id) as string])));
    });
  });

  it('binds the notification name registry and adds itself to it when the module starts', async () => {
    const instance = await listener();

    expect(EmployeeNotificationNamesListener.binds).toEqual([NotificationNameContributions]);
    instance.onModuleInit();

    expect(contributions.names()).toEqual(['organization.employee-names']);
    expect(contributions.all()).toEqual([instance]);
  });

  it('names the employee kind only', async () => {
    expect((await listener()).kinds).toEqual(['EMPLOYEE']);
  });

  it('answers the name of each employee that exists, in one read for the distinct ids', async () => {
    const instance = await listener();

    const names = await instance.names('EMPLOYEE', [FIRST, SECOND, FIRST]);

    expect([...names]).toEqual([
      [FIRST, 'Nguyễn Văn An'],
      [SECOND, 'Trần Thị Bình'],
    ]);
    expect(repo.namesOf).toHaveBeenCalledTimes(1);
    expect(repo.namesOf).toHaveBeenCalledWith([FIRST, SECOND]);
  });

  it('leaves out an employee that does not exist and an id that is not a uuid, without throwing', async () => {
    const instance = await listener();

    const names = await instance.names('EMPLOYEE', [MISSING, 'not-a-uuid', FIRST]);

    expect([...names]).toEqual([[FIRST, 'Nguyễn Văn An']]);
    expect(repo.namesOf).toHaveBeenCalledWith([MISSING, FIRST]);
  });

  it('reads nothing for ids that are all malformed or for no ids', async () => {
    const instance = await listener();

    expect((await instance.names('EMPLOYEE', ['x', ''])).size).toBe(0);
    expect((await instance.names('EMPLOYEE', [])).size).toBe(0);
    expect(repo.namesOf).not.toHaveBeenCalled();
  });

  it('answers nothing for a kind it does not own', async () => {
    const instance = await listener();

    expect((await instance.names('DEPARTMENT', [FIRST])).size).toBe(0);
    expect(repo.namesOf).not.toHaveBeenCalled();
  });
});
