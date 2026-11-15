import { BudgetViewService } from './budget-view.service';

const format = (minor: bigint) => ({ amount: String(minor), currency: 'VND' });

function setup() {
  const current = { id: 'version', number: 1, currency: 'VND', baseMinor: 100n, reserveMinor: 20n, totalMinor: 120n };
  const versions = { reference: jest.fn().mockResolvedValue(current), latestOf: jest.fn().mockResolvedValue(null) };
  const cycle = {
    currency: 'VND',
    openedAt: new Date('2026-11-01T00:00:00Z') as Date | null,
    submissionDeadline: '2026-12-01',
    decisionDeadline: '2026-12-15',
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
    { chainOf: jest.fn().mockResolvedValue([]) } as never,
    numbers as never,
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
    });
    expect(wire).not.toHaveProperty('departmentCeiling');
    expect(wire).not.toHaveProperty('annualCeiling');
    expect(wire).not.toHaveProperty('sharedPoolReserve');
  });

  it.each([
    ['a draft', null, '2026-11-09', 'DRAFT'],
    ['open through the day of the submission deadline', new Date('2026-11-01T00:00:00Z'), '2026-12-01', 'OPEN'],
    ['locked the day after it', new Date('2026-11-01T00:00:00Z'), '2026-12-02', 'LOCKED'],
  ] as const)('QĐ-111z gives both deadlines and the state of the cycle: %s', async (_name, openedAt, today, status) => {
    const { service, numbers, cycle, facts } = setup();
    numbers.cycle.mockResolvedValue({ ...cycle, openedAt });
    facts.today.mockResolvedValue(today);
    const wire = await service.mine(actor, 2027);
    expect(wire.cycle).toEqual({ submissionDeadline: '2026-12-01', decisionDeadline: '2026-12-15', status });
  });

  it('gives no cycle when there is none', async () => {
    const { service, numbers } = setup();
    numbers.cycle.mockResolvedValue(null);
    const wire = await service.mine(actor, 2027);
    expect(wire.cycle).toBeNull();
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
