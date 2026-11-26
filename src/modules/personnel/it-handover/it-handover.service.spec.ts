import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { PersonnelAccessRefusedError } from '../public/personnel.errors';
import { ItHandoverRefusedError } from './it-handover.errors';
import { ItHandoverService } from './it-handover.service';

const SUPER_ADMIN = { employeeId: 'super-admin', roles: ['SUPER_ADMIN'] } as unknown as AuthenticatedPrincipal;
const IT_ADMIN = { employeeId: 'leaver', roles: ['IT_ADMIN'] } as unknown as AuthenticatedPrincipal;
const SOURCE = { kind: 'OFFBOARDING_CASE', id: 'case-1' } as const;

/** What the service meets: every dependency answers what a hand-over of one subscription needs, and `moved` is what the catalog says it moved. */
function build(
  moved: {
    subscriptionIds: string[];
    applicationIds: string[];
    workspaceIds?: string[];
    licenseLotIds?: string[];
  },
  options: {
    leftOn?: string | null;
    effectiveOn?: string | null;
    counts?: { subscriptions: number; applications: number; workspaces: number; licenseLots: number };
  } = {},
) {
  const recordDone = jest.fn();
  const tell = jest.fn();
  const service = new ItHandoverService(
    { run: (work: (tx: unknown) => unknown) => work({}) } as never,
    { recordDone } as never,
    {
      employeeOf: () => 'leaver',
      lockSource: () => ({
        ...SOURCE,
        organizationId: 'org',
        employeeId: 'leaver',
        cancelled: false,
        leftOn: options.leftOn ?? null,
        effectiveOn: options.effectiveOn ?? null,
      }),
    } as never,
    {
      countResponsibilitiesOf: () =>
        new Map([['leaver', options.counts ?? { subscriptions: 1, applications: 0, workspaces: 0, licenseLots: 0 }]]),
      transferResponsibilities: () => ({ workspaceIds: [], licenseLotIds: [], ...moved }),
    } as never,
    { lockEmployeeForUpdate: jest.fn() } as never,
    { businessToday: () => '2026-11-13' } as never,
    { findDepartureBlock: () => null } as never,
    { tell } as never,
  );

  return { service, recordDone, tell };
}

describe('ItHandoverService', () => {
  it('rejects IT_ADMIN with PersonnelAccessRefusedError FORBIDDEN', async () => {
    const { service, recordDone, tell } = build({ subscriptionIds: ['s1'], applicationIds: [] });

    await expect(service.handOver(IT_ADMIN, SOURCE, 'target')).rejects.toMatchObject<
      Partial<PersonnelAccessRefusedError>
    >({ problem: 'FORBIDDEN' });
    expect(recordDone).not.toHaveBeenCalled();
    expect(tell).not.toHaveBeenCalled();
  });

  it('allows SUPER_ADMIN before the milestone', async () => {
    const { service, recordDone, tell } = build({ subscriptionIds: ['s1'], applicationIds: [] });

    const result = await service.handOver(SUPER_ADMIN, SOURCE, 'target');

    expect(result).toMatchObject({ subscriptions: 1, applications: 0, toEmployeeId: 'target' });
    expect(recordDone).toHaveBeenCalledTimes(1);
    expect(tell).toHaveBeenCalledTimes(1);
  });

  it('allows SUPER_ADMIN after the milestone', async () => {
    const { service, recordDone, tell } = build(
      { subscriptionIds: ['s1'], applicationIds: ['a1'] },
      { leftOn: '2026-11-10' },
    );

    const result = await service.handOver(SUPER_ADMIN, SOURCE, 'target');

    expect(result).toMatchObject({ subscriptions: 1, applications: 1, toEmployeeId: 'target' });
    expect(recordDone).toHaveBeenCalledTimes(1);
    expect(tell).toHaveBeenCalledTimes(1);
  });

  it('hands over when the leaving IT Admin only holds workspaces and license lots', async () => {
    const { service, recordDone, tell } = build(
      { subscriptionIds: [], applicationIds: [], workspaceIds: ['ws-1'], licenseLotIds: ['lot-1'] },
      { counts: { subscriptions: 0, applications: 0, workspaces: 1, licenseLots: 1 } },
    );

    const result = await service.handOver(SUPER_ADMIN, SOURCE, 'target');

    expect(result).toMatchObject({ subscriptions: 0, applications: 0, toEmployeeId: 'target' });
    expect(recordDone).toHaveBeenCalledTimes(1);
    expect(tell).toHaveBeenCalledTimes(1);
  });

  it('is refused with NOTHING_TO_HAND_OVER, not recorded and nobody told, when the catalog moved no subscription and no application', async () => {
    const { service, recordDone, tell } = build({ subscriptionIds: [], applicationIds: [] });

    const refused = await service.handOver(SUPER_ADMIN, SOURCE, 'target').then(
      () => null,
      (error: unknown) => error,
    );

    expect(refused).toBeInstanceOf(ItHandoverRefusedError);
    expect((refused as ItHandoverRefusedError).code).toBe('NOTHING_TO_HAND_OVER');
    expect(recordDone).not.toHaveBeenCalled();
    expect(tell).not.toHaveBeenCalled();
  });
});
