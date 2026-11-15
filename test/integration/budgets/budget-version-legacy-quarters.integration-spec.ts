import { BudgetHarness, VersionWire } from '../../support/budget-harness';
import type { Person } from '../../support/request-harness';

const h = new BudgetHarness();

/**
 * FIX-LB3 LBG-03 (`QĐ-111ac`: no quarter, one amount for the year): a version a release before BG-2 left as a draft, or sent back to
 * Finance, can still hold the four quarters of its forecast. `budget_versions_quarters_check` wants them to add up to the total or to be
 * all empty, and the edit of the base moves the total: the edit must let the forecast go instead of failing with a 500.
 */
describe('a version that still holds a forecast by quarter is changed (integration, real PostgreSQL)', () => {
  let boss: Person;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    const executive = await h.departmentWithUnit('P-EXE');
    boss = await h.staff(executive, 'EXE-C1');
    await h.makeHead(executive, await h.staff(executive, 'EXE-H1')); // the Spending Approver does not head a department (QĐ-93b)
    await h.setRole('SPENDING_APPROVER', boss);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  /** A draft of its own with the four quarters a release before BG-2 would have written: 80 million, 20 million each. */
  const withQuarters = async () => {
    counter += 1;
    const unit = await h.departmentWithHead(`P-Q${counter}`);
    const proposal = await h.budgetProposed(unit.head, unit.department.unitId);
    const version = await h.built(proposal.id);
    await h.ctx.sql.query(
      `UPDATE budget_versions SET q1_minor = 20000000, q2_minor = 20000000, q3_minor = 20000000, q4_minor = 20000000 WHERE id = $1`,
      [version.id],
    );

    return { ...unit, proposal, version };
  };
  const rowOf = async (id: string) =>
    (
      await h.ctx.sql.query<{ total: string; quarters: (string | null)[]; state: string }>(
        `SELECT total_minor::text AS total, state::text AS state,
                ARRAY[q1_minor, q2_minor, q3_minor, q4_minor]::text[] AS quarters
           FROM budget_versions WHERE id = $1`,
        [id],
      )
    ).rows[0];

  it('lets a draft with quarters change its base: 200, the total follows and the quarters go (they were a forecast nobody keeps)', async () => {
    const { version } = await withQuarters();

    const response = await h
      .updateVersion(version.id, { base: h.money(50_000_000), baseReason: 'The plan was cut' })
      .expect(200);

    expect(h.dataOf<{ version: VersionWire }>(response).version).toMatchObject({ total: { amount: '70000000' } });
    expect(await rowOf(version.id)).toEqual({ total: '70000000', state: 'DRAFT', quarters: [null, null, null, null] });
  });

  it('lets it change its reserve too, and an edit that leaves the total alone does not fail either', async () => {
    const { version } = await withQuarters();

    await h.updateVersion(version.id, { reserve: h.money(1_000_000) }).expect(200);
    expect(await rowOf(version.id)).toEqual({ total: '61000000', state: 'DRAFT', quarters: [null, null, null, null] });

    const other = await withQuarters();
    await h.updateVersion(other.version.id, { reserveReason: 'Another reason' }).expect(200);
    expect((await rowOf(other.version.id)).total).toBe('80000000');
  });

  it('lets a version sent back to Finance with quarters change its base and be sent again', async () => {
    const { version } = await withQuarters();
    await h.sendVersion(version.id).expect(200);
    await h.decideVersion(version.id, { decision: 'RETURN', reason: 'Too high' }, boss.account).expect(200);
    expect((await rowOf(version.id)).state).toBe('CHANGES_REQUESTED');

    await h.updateVersion(version.id, { base: h.money(40_000_000), baseReason: 'As asked' }).expect(200);

    expect(await rowOf(version.id)).toEqual({
      total: '60000000',
      state: 'CHANGES_REQUESTED',
      quarters: [null, null, null, null],
    });
    await h.sendVersion(version.id).expect(200);
  });
});
