import { Test } from '@nestjs/testing';
import { NotificationNameContributions } from '../../notifications/public/notifications.extension-points';
import { ApplicationRepo } from '../catalog-entry/application.repo';
import { PlanRepo } from '../plan/plan.repo';
import { SubscriptionRepo } from '../subscription/subscription.repo';
import { WorkspaceRepo } from '../workspace/workspace.repo';
import { CatalogNotificationNamesListener } from './catalog-notification-names.listener';

const FIRST = '0198a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a01';
const SECOND = '0198a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a02';
const MISSING = '0198a1b2-c3d4-7e5f-8a9b-0c1d2e3f4aff';

/**
 * The catalog names an application by its name, and a plan and a subscription by "application – plan"; the owner of each table
 * answers for the ids of a page in one read per kind.
 */
describe('CatalogNotificationNamesListener', () => {
  const applications = { namesOf: jest.fn() };
  const plans = { namesOf: jest.fn() };
  const subscriptions = { labelsOf: jest.fn() };
  const workspaces = { namesOf: jest.fn() };
  let contributions: NotificationNameContributions;

  async function listener(): Promise<CatalogNotificationNamesListener> {
    contributions = new NotificationNameContributions();
    const moduleRef = await Test.createTestingModule({
      providers: [
        CatalogNotificationNamesListener,
        { provide: ApplicationRepo, useValue: applications },
        { provide: PlanRepo, useValue: plans },
        { provide: SubscriptionRepo, useValue: subscriptions },
        { provide: WorkspaceRepo, useValue: workspaces },
        { provide: NotificationNameContributions, useValue: contributions },
      ],
    }).compile();

    return moduleRef.get(CatalogNotificationNamesListener);
  }

  /** A table that knows `FIRST` as `first` and `SECOND` as `second`, whatever the ids asked. */
  const table = (first: string, second: string) => (ids: readonly string[]) => {
    const known = new Map([
      [FIRST, first],
      [SECOND, second],
    ]);

    return Promise.resolve(new Map(ids.filter((id) => known.has(id)).map((id) => [id, known.get(id) as string])));
  };

  beforeEach(() => {
    jest.clearAllMocks();
    applications.namesOf.mockImplementation(table('Figma', 'Slack'));
    plans.namesOf.mockImplementation(table('Figma – Professional', 'Slack – Pro'));
    subscriptions.labelsOf.mockImplementation(table('Figma – Professional', 'Slack – Business'));
    workspaces.namesOf.mockImplementation(table('Anthropic', 'Anthropic EU'));
  });

  it('binds the notification name registry and adds itself to it when the module starts', async () => {
    const instance = await listener();

    expect(CatalogNotificationNamesListener.binds).toEqual([NotificationNameContributions]);
    instance.onModuleInit();

    expect(contributions.names()).toEqual(['catalog.names']);
    expect(contributions.all()).toEqual([instance]);
  });

  it('names applications, plans, subscriptions and workspaces', async () => {
    expect([...(await listener()).kinds].sort()).toEqual(['APPLICATION', 'PLAN', 'SUBSCRIPTION', 'WORKSPACE']);
  });

  it.each([
    ['APPLICATION', () => applications.namesOf, [FIRST, 'Figma']],
    ['PLAN', () => plans.namesOf, [FIRST, 'Figma – Professional']],
    ['SUBSCRIPTION', () => subscriptions.labelsOf, [FIRST, 'Figma – Professional']],
    ['WORKSPACE', () => workspaces.namesOf, [FIRST, 'Anthropic']],
  ] as const)('asks only the table of %s, once, for the distinct well-formed ids', async (kind, read, entry) => {
    const instance = await listener();

    const names = await instance.names(kind, [FIRST, 'not-a-uuid', FIRST, MISSING]);

    expect([...names]).toEqual([entry]);
    expect(read()).toHaveBeenCalledTimes(1);
    expect((read().mock.calls as unknown[][])[0]?.[0]).toEqual([FIRST, MISSING]);
    for (const other of [applications.namesOf, plans.namesOf, subscriptions.labelsOf, workspaces.namesOf].filter(
      (fn) => fn !== read(),
    )) {
      expect(other).not.toHaveBeenCalled();
    }
  });

  it('words a subscription as "application – plan", the way a plan is', async () => {
    const instance = await listener();
    await instance.names('SUBSCRIPTION', [FIRST]);

    const label = (subscriptions.labelsOf.mock.calls as unknown[][])[0]?.[2] as (
      application: string,
      plan: string,
    ) => string;

    expect(label('Figma', 'Professional')).toBe('Figma – Professional');
  });

  it('reads nothing for ids that are all malformed or for no ids', async () => {
    const instance = await listener();

    expect((await instance.names('PLAN', ['x', ''])).size).toBe(0);
    expect((await instance.names('PLAN', [])).size).toBe(0);
    expect(plans.namesOf).not.toHaveBeenCalled();
  });

  it('answers nothing for a kind it does not own', async () => {
    const instance = await listener();

    expect((await instance.names('EMPLOYEE', [FIRST])).size).toBe(0);
    expect(applications.namesOf).not.toHaveBeenCalled();
    expect(plans.namesOf).not.toHaveBeenCalled();
    expect(subscriptions.labelsOf).not.toHaveBeenCalled();
  });
});
