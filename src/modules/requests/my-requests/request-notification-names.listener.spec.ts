import { Test } from '@nestjs/testing';
import { CatalogApi } from '../../catalog/public/catalog.api';
import { NotificationNameContributions } from '../../notifications/public/notifications.extension-points';
import { RequestNotificationNamesListener } from './request-notification-names.listener';
import { MyRequestsRepo } from './my-requests.repo';

const SENT = '0198a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a01';
const PROPOSED = '0198a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a02';
const LINKED = '0198a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a03';
const BARE = '0198a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a04';
const MISSING = '0198a1b2-c3d4-7e5f-8a9b-0c1d2e3f4aff';
const PLAN = '0198a1b2-c3d4-7e5f-8a9b-0c1d2e3f4b01';
const OTHER_PLAN = '0198a1b2-c3d4-7e5f-8a9b-0c1d2e3f4b02';

/**
 * A Request is named by "application – plan" of what it asks for; software proposed that is not in the catalog yet is named by the name
 * proposed, and a Request that names neither (a group Request) is absent so the sentence falls back to a general phrase.
 */
describe('RequestNotificationNamesListener', () => {
  const requests = { softwareOf: jest.fn() };
  const catalog = { getPlanSummaries: jest.fn() };
  let contributions: NotificationNameContributions;

  async function listener(): Promise<RequestNotificationNamesListener> {
    contributions = new NotificationNameContributions();
    const moduleRef = await Test.createTestingModule({
      providers: [
        RequestNotificationNamesListener,
        { provide: MyRequestsRepo, useValue: requests },
        { provide: CatalogApi, useValue: catalog },
        { provide: NotificationNameContributions, useValue: contributions },
      ],
    }).compile();

    return moduleRef.get(RequestNotificationNamesListener);
  }

  beforeEach(() => {
    jest.clearAllMocks();
    const software = new Map([
      [SENT, { planId: PLAN, proposedName: null }],
      [PROPOSED, { planId: null, proposedName: 'Linear' }],
      [LINKED, { planId: OTHER_PLAN, proposedName: 'Notion (proposed)' }],
      [BARE, { planId: null, proposedName: null }],
    ]);
    requests.softwareOf.mockImplementation((ids: readonly string[]) =>
      Promise.resolve(new Map(ids.filter((id) => software.has(id)).map((id) => [id, software.get(id)]))),
    );
    catalog.getPlanSummaries.mockImplementation((ids: readonly string[]) =>
      Promise.resolve(
        [
          { planId: PLAN, planName: 'Professional', applicationId: 'a1', applicationName: 'Figma' },
          { planId: OTHER_PLAN, planName: 'Plus', applicationId: 'a2', applicationName: 'Notion' },
        ].filter((plan) => ids.includes(plan.planId)),
      ),
    );
  });

  it('binds the notification name registry and adds itself to it when the module starts', async () => {
    const instance = await listener();

    expect(RequestNotificationNamesListener.binds).toEqual([NotificationNameContributions]);
    instance.onModuleInit();

    expect(contributions.names()).toEqual(['requests.names']);
    expect(contributions.all()).toEqual([instance]);
  });

  it('names the Request kind only', async () => {
    expect((await listener()).kinds).toEqual(['REQUEST']);
  });

  it('names a Request by its application and plan, or by the software proposed when it has no plan yet', async () => {
    const instance = await listener();

    const names = await instance.names('REQUEST', [SENT, PROPOSED, LINKED]);

    expect(Object.fromEntries(names)).toEqual({
      [SENT]: 'Figma – Professional',
      [PROPOSED]: 'Linear',
      [LINKED]: 'Notion – Plus',
    });
  });

  it('reads the Requests once and the plans once, for the distinct ids', async () => {
    const instance = await listener();

    await instance.names('REQUEST', [SENT, LINKED, SENT, PROPOSED]);

    expect(requests.softwareOf).toHaveBeenCalledTimes(1);
    expect(requests.softwareOf).toHaveBeenCalledWith([SENT, LINKED, PROPOSED]);
    expect(catalog.getPlanSummaries).toHaveBeenCalledTimes(1);
    expect(catalog.getPlanSummaries).toHaveBeenCalledWith([PLAN, OTHER_PLAN]);
  });

  it('asks the catalog for nothing when no Request has a plan', async () => {
    const instance = await listener();

    await instance.names('REQUEST', [PROPOSED]);

    expect(catalog.getPlanSummaries).not.toHaveBeenCalled();
  });

  it('leaves out a Request that names no software, one that does not exist and an id that is not a uuid, without throwing', async () => {
    const instance = await listener();

    const names = await instance.names('REQUEST', [BARE, MISSING, 'not-a-uuid', PROPOSED]);

    expect([...names]).toEqual([[PROPOSED, 'Linear']]);
    expect(requests.softwareOf).toHaveBeenCalledWith([BARE, MISSING, PROPOSED]);
  });

  it('falls back to the proposed name when the plan of a Request is gone from the catalog', async () => {
    catalog.getPlanSummaries.mockResolvedValue([]);
    const instance = await listener();

    const names = await instance.names('REQUEST', [SENT, LINKED]);

    expect([...names]).toEqual([[LINKED, 'Notion (proposed)']]);
  });

  it('reads nothing for ids that are all malformed, for no ids or for a kind it does not own', async () => {
    const instance = await listener();

    expect((await instance.names('REQUEST', ['x', ''])).size).toBe(0);
    expect((await instance.names('REQUEST', [])).size).toBe(0);
    expect((await instance.names('PLAN', [SENT])).size).toBe(0);
    expect(requests.softwareOf).not.toHaveBeenCalled();
    expect(catalog.getPlanSummaries).not.toHaveBeenCalled();
  });
});
