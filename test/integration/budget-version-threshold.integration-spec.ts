import { BudgetHarness, VersionWire } from '../support/budget-harness';

const h = new BudgetHarness();

type Wire = VersionWire & { highValueAmount: { amount: string; currency: string } | null };

describe('the high-value threshold of a version over HTTP (US-06-09, QĐ-82c; integration, real PostgreSQL)', () => {
  let counter = 0;

  beforeAll(async () => {
    await h.start();
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const waiting = async () => {
    counter += 1;
    const unit = await h.departmentWithHead(`P-T${counter}`);

    return { ...unit, proposal: await h.budgetProposed(unit.head, unit.department.unitId) };
  };
  const wire = (response: { body: unknown }) => h.dataOf<{ version: Wire }>(response as never).version;

  it('is a share of what is left and, when the version says so, an amount as well', async () => {
    const { proposal } = await waiting();

    const response = await h
      .createVersion({
        proposalId: proposal.id,
        base: h.money(60_000_000),
        reserve: h.money(20_000_000),
        highValuePercent: 50,
        highValueAmount: h.money(20_000_000),
      })
      .expect(201);

    expect(wire(response)).toMatchObject({
      highValuePercent: 50,
      highValueAmount: { amount: '20000000', currency: h.reporting },
    });
  });

  it('is only a share when no amount is given', async () => {
    const { proposal } = await waiting();

    const response = await h
      .createVersion({ proposalId: proposal.id, base: h.money(1), reserve: h.money(0), highValuePercent: 50 })
      .expect(201);

    expect(wire(response)).toMatchObject({ highValuePercent: 50, highValueAmount: null });
  });

  it('is set, changed and taken away while the version is a draft', async () => {
    const { proposal } = await waiting();
    const version = await h.built(proposal.id);

    const set = await h.updateVersion(version.id, { highValueAmount: h.money(5_000_000) }).expect(200);
    const unrelated = await h.updateVersion(version.id, { highValuePercent: 40 }).expect(200);
    const cleared = await h.updateVersion(version.id, { highValueAmount: null }).expect(200);

    expect(wire(set).highValueAmount).toEqual({ amount: '5000000', currency: h.reporting });
    expect(wire(unrelated)).toMatchObject({ highValuePercent: 40, highValueAmount: { amount: '5000000' } });
    expect(wire(cleared).highValueAmount).toBeNull();
  });

  it.each([
    ['an amount of nothing', () => h.money(0)],
    ['an amount below nothing', () => h.money(-5)],
    ['an amount in another currency', () => ({ amount: '5', currency: 'USD' })],
  ])('refuses %s, and nothing is changed', async (_name, amount) => {
    const { proposal } = await waiting();
    const version = await h.built(proposal.id, { highValueAmount: h.money(9_000_000) });

    const response = await h.updateVersion(version.id, { highValueAmount: amount() });

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expect(wire(await h.versionOf(version.id).expect(200)).highValueAmount).toEqual({
      amount: '9000000',
      currency: h.reporting,
    });
  });

  it('is kept by a revision that does not say otherwise, replaced by one that does, and cleared by null', async () => {
    const { proposal, department } = await waiting();
    await h.current(proposal.id, { highValueAmount: h.money(20_000_000) });
    const revise = (extra: Record<string, unknown>) =>
      h.createRevision({ costCenterId: department.unitId, year: h.next, reason: 'Change', ...extra });

    const kept = wire(await revise({ highValuePercent: 30 }).expect(201));
    await h.sendVersion(kept.id).expect(200);
    await h.makeCurrent(kept.id);
    const replaced = wire(await revise({ highValueAmount: h.money(7_000_000) }).expect(201));
    await h.sendVersion(replaced.id).expect(200);
    await h.makeCurrent(replaced.id);
    const cleared = wire(await revise({ highValueAmount: null }).expect(201));

    expect(kept).toMatchObject({ highValuePercent: 30, highValueAmount: { amount: '20000000' } });
    expect(replaced).toMatchObject({ highValueAmount: { amount: '7000000' } });
    expect(cleared.highValueAmount).toBeNull();
  });
});
