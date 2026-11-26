import type { DbTx } from '../../../infrastructure/database/transaction-runner';
import type { LicensingGhostSeatApi } from '../../licensing/public/licensing-ghost-seat.api';
import type { SharedPoolVacancy } from '../../licensing/public/licensing-ghost-seat.types';
import type { GhostSeatRepo } from '../ghost-seat/ghost-seat.repo';
import type { GhostSeatService } from '../ghost-seat/ghost-seat.service';
import { InternalRulesG1Service } from './internal-rules-g1.service';
import type { RulePass } from './internal-rules.types';

const makePass = () => {
  const createdTally = jest.fn();
  const pass: RulePass = {
    organizationId: 'org-1',
    today: '2027-04-20',
    now: new Date('2027-04-20T01:00:00Z'),
    tally: {
      run: { id: 'run-1' },
      created: createdTally,
      updated: jest.fn(),
      closed: jest.fn(),
      skip: jest.fn(),
      failed: jest.fn(),
    } as unknown as RulePass['tally'],
  };

  return { pass, createdTally };
};

describe('InternalRulesG1Service (W3-26 K4 ACCOUNT lots)', () => {
  const setup = (vacancies: SharedPoolVacancy[]) => {
    const runner = {
      run: jest.fn((fn: (tx: DbTx) => Promise<void>) => fn({} as DbTx)),
    };
    const licensing = {
      listSharedPoolVacancies: jest.fn().mockResolvedValue(vacancies),
    };
    const repo = {
      unclosedG1: jest.fn().mockResolvedValue([]),
    };
    const createGhostSeat = jest
      .fn<
        Promise<unknown>,
        [
          unknown,
          {
            group: string;
            subscriptionId: string;
            freeSeats: number;
            countsTowardVacantCost: boolean;
            evidence: { free: number; action: string };
          },
          unknown,
        ]
      >()
      .mockResolvedValue(undefined);
    const ghostSeats = {
      create: createGhostSeat,
      updateFreeSeats: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
    };
    const service = new InternalRulesG1Service(
      runner as never,
      licensing as unknown as LicensingGhostSeatApi,
      repo as unknown as GhostSeatRepo,
      ghostSeats as unknown as GhostSeatService,
    );

    return { service, createGhostSeat };
  };

  it('creates G1 with countsTowardVacantCost=false for K4 ACCOUNT lot and ignores DEVICE_KEY lot', async () => {
    const { service, createGhostSeat } = setup([
      {
        subscriptionId: 'lot-cad',
        planId: 'plan-cad',
        applicationId: 'app-cad',
        provisioningType: 'K4',
        pricingModel: null,
        subjectKind: 'LICENSE_LOT',
        keyBinding: 'ACCOUNT',
        purchased: 5,
        occupied: 3,
        free: 2,
      },
      {
        subscriptionId: 'lot-dev',
        planId: 'plan-dev',
        applicationId: 'app-dev',
        provisioningType: 'K4',
        pricingModel: null,
        subjectKind: 'LICENSE_LOT',
        keyBinding: 'DEVICE_KEY',
        purchased: 5,
        occupied: 0,
        free: 5,
      },
    ]);
    const { pass, createdTally } = makePass();

    await service.pass(pass);

    expect(createGhostSeat).toHaveBeenCalledTimes(1);
    const createdRec = createGhostSeat.mock.calls[0]?.[1];
    expect(createdRec?.group).toBe('G1');
    expect(createdRec?.subscriptionId).toBe('lot-cad');
    expect(createdRec?.freeSeats).toBe(2);
    expect(createdRec?.countsTowardVacantCost).toBe(false);
    expect(createdRec?.evidence.free).toBe(2);
    expect(createdRec?.evidence.action).toBe('REGRANT_BEFORE_PURCHASE');
    expect(createdTally).toHaveBeenCalledTimes(1);
  });
});
