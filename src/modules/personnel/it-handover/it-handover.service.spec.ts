import type { AuthenticatedPrincipal } from '../../../infrastructure/security/tokens/access-token-verifier.port';
import { ItHandoverRefusedError } from './it-handover.errors';
import { ItHandoverService } from './it-handover.service';

const ACTOR = { employeeId: 'leaver', roles: ['IT_ADMIN'] } as unknown as AuthenticatedPrincipal;
const SOURCE = { kind: 'OFFBOARDING_CASE', id: 'case-1' } as const;

/** What the service meets: every dependency answers what a hand-over of one subscription before the milestone needs, and `moved` is what the catalog says it moved. */
function build(moved: { subscriptionIds: string[]; applicationIds: string[] }) {
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
        leftOn: null,
        effectiveOn: null,
      }),
    } as never,
    {
      countResponsibilitiesOf: () => new Map([['leaver', { subscriptions: 1, applications: 0 }]]),
      transferResponsibilities: () => moved,
    } as never,
    { lockEmployeeForUpdate: jest.fn() } as never,
    { businessToday: () => '2026-11-13' } as never,
    { findDepartureBlock: () => null } as never,
    { tell } as never,
  );

  return { service, recordDone, tell };
}

describe('ItHandoverService: a hand-over that moves nothing (X-IT-O2)', () => {
  it('is refused with NOTHING_TO_HAND_OVER, not recorded and nobody told, when the catalog moved no subscription and no application', async () => {
    const { service, recordDone, tell } = build({ subscriptionIds: [], applicationIds: [] });

    const refused = await service.handOver(ACTOR, SOURCE, 'target').then(
      () => null,
      (error: unknown) => error,
    );

    expect(refused).toBeInstanceOf(ItHandoverRefusedError);
    expect((refused as ItHandoverRefusedError).code).toBe('NOTHING_TO_HAND_OVER');
    expect(recordDone).not.toHaveBeenCalled();
    expect(tell).not.toHaveBeenCalled();
  });

  it('records and tells when something moved', async () => {
    const { service, recordDone, tell } = build({ subscriptionIds: ['s1'], applicationIds: [] });

    const result = await service.handOver(ACTOR, SOURCE, 'target');

    expect(result).toMatchObject({ subscriptions: 1, applications: 0, toEmployeeId: 'target' });
    expect(recordDone).toHaveBeenCalledTimes(1);
    expect(tell).toHaveBeenCalledTimes(1);
  });
});
