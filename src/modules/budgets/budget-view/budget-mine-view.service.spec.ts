import { BudgetViewService } from './budget-view.service';

const format = (minor: bigint) => ({ amount: String(minor), currency: 'VND' });

function setup() {
  const current = { id: 'version', number: 1, currency: 'VND', baseMinor: 100n, reserveMinor: 20n, totalMinor: 120n };
  const versions = { reference: jest.fn().mockResolvedValue(current), latestOf: jest.fn().mockResolvedValue(null) };
  const cycle = {
    currency: 'VND',
    publishedAt: new Date(),
    submissionDeadline: '2026-12-01',
    decisionDeadline: '2026-12-15',
    ceilings: [
      {
        departmentId: 'department',
        totalMinor: 100n,
        signedCommitmentsMinor: 20n,
        plannedSeatsMinor: 70n,
        priorityMinor: 10n,
      },
    ],
  };
  const numbers = {
    totals: jest
      .fn()
      .mockResolvedValue(
        new Map([['center:2027', { committed: 10n, spent: 20n, pendingSpend: 30n, priorPeriodAdjustment: 0n }]]),
      ),
    cycle: jest.fn().mockResolvedValue(cycle),
  };
  const facts = {
    pickHeadedUnit: jest
      .fn()
      .mockResolvedValue({ departmentId: 'department', costCenter: { id: 'center', inUse: true } }),
    today: jest.fn().mockResolvedValue('2026-11-09'),
    costCenter: jest.fn().mockResolvedValue({ id: 'center' }),
    formatter: jest.fn().mockResolvedValue(format),
    reportingCurrency: jest.fn().mockResolvedValue('VND'),
    departmentsOf: jest.fn().mockResolvedValue(new Map([['center', 'department']])),
  };
  const service = new BudgetViewService(
    versions as never,
    {} as never,
    { chainOf: jest.fn().mockResolvedValue([]) } as never,
    numbers as never,
    {} as never,
    {} as never,
    facts as never,
    {} as never,
  );
  return { service, facts, numbers, versions, cycle };
}

describe('BR-MF4-05 budgetMine selection and visibility', () => {
  const actor = { employeeId: 'head' } as never;

  it('reads the headed department selected for the year and exposes only its published ceiling', async () => {
    const { service, facts } = setup();
    const wire = await service.mine(actor, 2027, 'center');
    expect(facts.pickHeadedUnit).toHaveBeenCalledWith('head', '2026-11-09', { year: 2027, costCenterId: 'center' });
    expect(wire).toMatchObject({
      base: format(100n),
      reserve: format(20n),
      committed: format(10n),
      spent: format(20n),
      pendingSpend: format(30n),
      remainingBase: format(40n),
      remainingWithReserve: format(60n),
      departmentCeiling: {
        total: format(100n),
        signedCommitments: format(20n),
        plannedSeats: format(70n),
        priority: format(10n),
      },
    });
    expect(wire).not.toHaveProperty('annualCeiling');
    expect(wire).not.toHaveProperty('sharedPoolReserve');
  });

  it('BR-MF4-01 hides an unpublished division while retaining both deadlines', async () => {
    const { service, numbers, cycle } = setup();
    numbers.cycle.mockResolvedValue({ ...cycle, publishedAt: null });
    const wire = await service.mine(actor, 2027);
    expect(wire.departmentCeiling).toBeNull();
    expect(wire.cycle).toEqual({ submissionDeadline: '2026-12-01', decisionDeadline: '2026-12-15', published: false });
  });

  it('BR-MF4-01 gives no cycle and no department ceiling when there is no cycle', async () => {
    const { service, numbers } = setup();
    numbers.cycle.mockResolvedValue(null);
    const wire = await service.mine(actor, 2027);
    expect(wire.cycle).toBeNull();
    expect(wire.departmentCeiling).toBeNull();
  });

  it('preserves held and spent figures without an active budget', async () => {
    const { service, versions } = setup();
    versions.reference.mockResolvedValue(null);
    expect(await service.mine(actor, 2027)).toMatchObject({
      status: 'NO_ACTIVE_BUDGET',
      total: null,
      base: null,
      reserve: null,
      committed: format(10n),
      spent: format(20n),
      remainingBase: null,
      remainingWithReserve: null,
    });
  });
});
