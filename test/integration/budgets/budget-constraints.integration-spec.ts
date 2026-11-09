import { randomUUID } from 'node:crypto';
import { BudgetHarness } from '../../support/budget-harness';

const h = new BudgetHarness();
const CHECK = '23514';
const UNIQUE = '23505';
const FOREIGN_KEY = '23503';

/** The SQLSTATE a rejected statement carries: the constraint, not the application, said no. */
async function sqlState(text: string, values: unknown[] = []): Promise<string | null> {
  try {
    await h.ctx.sql.query(text, values);

    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? 'unknown';
  }
}

describe('budgets (integration, PostgreSQL constraints)', () => {
  let costCenterId: string;
  let employeeId: string;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    const unit = await h.departmentWithHead('P-CON');
    costCenterId = unit.department.unitId;
    employeeId = unit.head.employeeId;
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  /** A Cost Center of its own each time, so that what one test leaves does not meet the next. */
  const freshCostCenter = async (): Promise<string> => (await h.departmentWithUnit(`P-K${(counter += 1)}`)).unitId;

  const proposal = async (over: Record<string, unknown> = {}) => {
    const id = randomUUID();
    const row = {
      organization_id: h.seed.organizationId,
      cost_center_id: await freshCostCenter(),
      year: 2027,
      state: 'SUBMITTED',
      total_minor: 100,
      currency: 'VND',
      submitted_by_employee_id: employeeId,
      ...over,
    };
    const columns = Object.keys(row);
    const state = await sqlState(
      `INSERT INTO budget_proposals (id, ${columns.join(', ')})
       VALUES ($1, ${columns.map((column, index) => `$${index + 2}${column === 'state' ? '::"BudgetProposalState"' : ''}`).join(', ')})`,
      [id, ...columns.map((column) => (row as Record<string, unknown>)[column])],
    );

    return { id, state, costCenter: row.cost_center_id };
  };

  const version = async (over: Record<string, unknown> = {}) => {
    const source = await proposal();
    const id = randomUUID();
    const row = {
      organization_id: h.seed.organizationId,
      cost_center_id: source.costCenter,
      year: 2027,
      number: 1,
      kind: 'INITIAL',
      state: 'DRAFT',
      proposal_id: source.id,
      base_minor: 60,
      reserve_minor: 20,
      total_minor: 80,
      currency: 'VND',
      high_value_percent: 50,
      created_by_employee_id: employeeId,
      ...over,
    };
    const columns = Object.keys(row);
    const cast = (column: string) =>
      column === 'kind' ? '::"BudgetVersionKind"' : column === 'state' ? '::"BudgetVersionState"' : '';
    const state = await sqlState(
      `INSERT INTO budget_versions (id, ${columns.join(', ')})
       VALUES ($1, ${columns.map((column, index) => `$${index + 2}${cast(column)}`).join(', ')})`,
      [id, ...columns.map((column) => (row as Record<string, unknown>)[column])],
    );

    return { id, state, costCenter: row.cost_center_id };
  };

  describe('the proposal', () => {
    it('takes a proposal, and one that waits or is reviewed for a Cost Center and a year at a time', async () => {
      const first = await proposal();
      expect(first.state).toBeNull();

      const again = await proposal({ cost_center_id: first.costCenter });
      const otherYear = await proposal({ cost_center_id: first.costCenter, year: 2028 });
      const withdrawn = await proposal({
        cost_center_id: first.costCenter,
        year: 2029,
        state: 'WITHDRAWN',
        withdrawn_at: new Date(),
      });
      const another = await proposal({ cost_center_id: first.costCenter, year: 2029 });

      expect(again.state).toBe(UNIQUE);
      expect(otherYear.state).toBeNull();
      expect(withdrawn.state).toBeNull();
      expect(another.state).toBeNull();
    });

    it.each([
      ['a year that is not a year', { year: 27 }],
      ['a negative total', { total_minor: -1 }],
      [
        'a given-back proposal with no reason',
        { state: 'RETURNED', returned_by_employee_id: null, returned_at: new Date() },
      ],
      [
        'a given-back proposal with a blank reason',
        { state: 'RETURNED', returned_reason: ' ', returned_at: new Date() },
      ],
      ['a withdrawn proposal with no time', { state: 'WITHDRAWN' }],
      ['a waiting proposal that says it was withdrawn', { withdrawn_at: new Date() }],
      ['a waiting proposal that says it was given back', { returned_reason: 'No' }],
    ] as Array<[string, Record<string, unknown>]>)('refuses %s', async (_name, over) => {
      const defaults =
        'returned_by_employee_id' in over || over.state === 'RETURNED' ? { returned_by_employee_id: employeeId } : {};

      expect((await proposal({ ...defaults, ...over })).state).toBe(CHECK);
    });

    it('refuses a Cost Center, a currency or a person that does not exist', async () => {
      expect((await proposal({ currency: 'ZZZ' })).state).toBe(FOREIGN_KEY);
      expect((await proposal({ cost_center_id: randomUUID() })).state).toBe(FOREIGN_KEY);
    });
  });

  describe('the lines of a proposal', () => {
    const line = async (over: Record<string, unknown> = {}) => {
      const source = await proposal();
      const row = {
        proposal_id: source.id,
        position: 1,
        // BM-10 lines are ranked: the rank is required (QT 4.4) and given once in a proposal.
        priority_rank: 1,
        description: 'Figma',
        amount_minor: 50,
        window_from: '2027-03-01',
        window_to: '2027-03-31',
        service_period_months: 12,
        repeat_cycle: 'ANNUAL',
        ...over,
      };
      const columns = Object.keys(row);

      return sqlState(
        `INSERT INTO budget_proposal_lines (${columns.join(', ')})
         VALUES (${columns.map((column, index) => `$${index + 1}${column === 'repeat_cycle' ? '::"BudgetRepeatCycle"' : ''}`).join(', ')})`,
        columns.map((column) => (row as Record<string, unknown>)[column]),
      );
    };

    it('takes a line that says what every line says', async () => {
      expect(await line()).toBeNull();
    });

    it.each([
      ['a blank description', { description: ' ' }],
      ['no seats at all', { seats: 0 }],
      ['a negative amount', { amount_minor: -1 }],
      ['a window that runs backwards', { window_from: '2027-04-01', window_to: '2027-03-01' }],
      ['a service period of no months', { service_period_months: 0 }],
      ['a position that is not a position', { position: 0 }],
      ['a blank note', { note: ' ' }],
    ])('refuses %s', async (_name, over) => {
      expect(await line(over)).toBe(CHECK);
    });
  });

  describe('the versions (INV-21)', () => {
    it('keeps the reason of the reserve either absent or written and at most 1000 characters (B-L)', async () => {
      expect((await version({ reserve_reason: 'Two vendors raise their price' })).state).toBeNull();
      expect((await version({ reserve_reason: null, number: 2 })).state).toBeNull();
      expect((await version({ reserve_reason: '   ' })).state).toBe(CHECK);
      expect((await version({ reserve_reason: 'x'.repeat(1001) })).state).toBe(CHECK);
    });

    it('takes a version, and one in progress for a Cost Center and a year at a time', async () => {
      const first = await version();
      expect(first.state).toBeNull();

      const second = await version({ cost_center_id: first.costCenter, number: 2, proposal_id: (await proposal()).id });
      const sameNumber = await version({ cost_center_id: first.costCenter, year: 2028, number: 1 });

      expect(second.state).toBe(UNIQUE);
      expect(sameNumber.state).toBeNull();
    });

    it('has one current version for a Cost Center and a year, and none that is replaced (QĐ-97b: SUPERSEDED is retired)', async () => {
      const sent = { sent_at: new Date(), sent_by_employee_id: employeeId };
      const current = await version({ state: 'APPROVED', ...sent });
      const another = await version({
        cost_center_id: current.costCenter,
        number: 2,
        state: 'APPROVED',
        proposal_id: (await proposal()).id,
        ...sent,
      });
      const replaced = await version({
        cost_center_id: current.costCenter,
        number: 3,
        state: 'SUPERSEDED',
        proposal_id: (await proposal()).id,
        ...sent,
      });

      expect(current.state).toBeNull();
      expect(another.state).toBe(UNIQUE);
      // `budget_versions_no_superseded` (migration BM-10): a version is never replaced, so the state cannot be written any more.
      expect(replaced.state).toBe(CHECK);
    });

    it.each([
      ['a total that is not the base and the reserve', { total_minor: 79 }],
      ['a negative reserve', { reserve_minor: -1, total_minor: 59 }],
      ['a threshold over a hundred percent', { high_value_percent: 101 }],
      ['quarters that do not add up to the total', { q1_minor: 20, q2_minor: 20, q3_minor: 20, q4_minor: 15 }],
      ['only some of the quarters', { q1_minor: 80 }],
      ['a first version with no proposal', { proposal_id: null }],
      ['a revision of nothing', { kind: 'REVISION', proposal_id: null }],
      ['a sent version that says it was not sent', { state: 'SENT' }],
      ['a draft that says it was sent', { sent_at: new Date(), sent_by_employee_id: employeeId }],
      ['a blank reason', { reason: ' ' }],
      ['a year that is not a year', { year: 27 }],
      ['a number that is not a number', { number: 0 }],
    ])('refuses %s', async (_name, over) => {
      expect((await version(over)).state).toBe(CHECK);
    });

    it('takes quarters that add up to the total', async () => {
      expect((await version({ q1_minor: 20, q2_minor: 20, q3_minor: 20, q4_minor: 20 })).state).toBeNull();
    });

    it('refuses a sent revision that carries no reason, and takes it with one', async () => {
      const base = await version({ state: 'APPROVED', sent_at: new Date(), sent_by_employee_id: employeeId });
      const revision = {
        cost_center_id: base.costCenter,
        number: 2,
        kind: 'REVISION',
        proposal_id: null,
        based_on_version_id: base.id,
        state: 'SENT',
        sent_at: new Date(),
        sent_by_employee_id: employeeId,
      };

      expect((await version(revision)).state).toBe(CHECK);
      expect((await version({ ...revision, reason: 'Cut to the plan' })).state).toBeNull();
    });
  });

  describe('the lines of a version and their history', () => {
    const versionLine = async (over: Record<string, unknown> = {}) => {
      const source = await version();
      const row = {
        version_id: source.id,
        position: 1,
        description: 'Figma',
        amount_minor: 50,
        window_from: '2027-03-01',
        window_to: '2027-03-31',
        service_period_months: 12,
        repeat_cycle: 'ANNUAL',
        ...over,
      };
      const columns = Object.keys(row);
      const state = await sqlState(
        `INSERT INTO budget_version_lines (${columns.join(', ')})
         VALUES (${columns.map((column, index) => `$${index + 1}${column === 'repeat_cycle' ? '::"BudgetRepeatCycle"' : ''}`).join(', ')})`,
        columns.map((column) => (row as Record<string, unknown>)[column]),
      );

      return { state, versionId: source.id };
    };

    it('takes a line, and refuses one that is not a line', async () => {
      expect((await versionLine()).state).toBeNull();
      for (const over of [
        { description: ' ' },
        { amount_minor: -1 },
        { window_from: '2027-05-01', window_to: '2027-04-01' },
        { finance_comment: ' ' },
        { adjustment_reason: ' ' },
        { proposal_id: randomUUID() },
      ]) {
        expect((await versionLine(over)).state).toBe(CHECK);
      }
    });

    it('refuses a line of a proposal that does not have that position', async () => {
      const source = await proposal();

      expect((await versionLine({ proposal_id: source.id, proposal_position: 3 })).state).toBe(FOREIGN_KEY);
    });

    it('keeps the move of a window with its reason, and refuses one without or backwards', async () => {
      const { versionId } = await versionLine();
      const change = (reason: string, after: [string, string]) =>
        sqlState(
          `INSERT INTO budget_version_line_changes
             (id, version_id, position, window_from_before, window_to_before, window_from_after, window_to_after, reason, changed_by_employee_id)
           VALUES (gen_random_uuid(), $1, 1, '2027-03-01', '2027-03-31', $2, $3, $4, $5)`,
          [versionId, after[0], after[1], reason, employeeId],
        );

      expect(await change('The purchase slipped', ['2027-06-01', '2027-06-30'])).toBeNull();
      expect(await change('  ', ['2027-06-01', '2027-06-30'])).toBe(CHECK);
      expect(await change('Backwards', ['2027-07-01', '2027-06-30'])).toBe(CHECK);
    });
  });

  describe('the record of a decision (INV-05)', () => {
    const decision = async (over: Record<string, unknown> = {}) => {
      const source = await version({ state: 'SENT', sent_at: new Date(), sent_by_employee_id: employeeId });
      const row = {
        organization_id: h.seed.organizationId,
        version_id: source.id,
        decision: 'APPROVED',
        decided_by_employee_id: employeeId,
        total_minor: 80,
        currency: 'VND',
        decided_at: new Date(),
        ...over,
      };
      const columns = Object.keys(row);
      const state = await sqlState(
        `INSERT INTO budget_version_decisions (id, ${columns.join(', ')})
         VALUES (gen_random_uuid(), ${columns.map((column, index) => `$${index + 1}${column === 'decision' ? '::"BudgetDecision"' : ''}`).join(', ')})`,
        columns.map((column) => (row as Record<string, unknown>)[column]),
      );

      return { state, versionId: source.id };
    };

    it('takes an approval with no reason, and a refusal or a request to look again with one', async () => {
      expect((await decision()).state).toBeNull();
      expect((await decision({ decision: 'REJECTED', reason: 'Too high' })).state).toBeNull();
      expect((await decision({ decision: 'CHANGES_REQUESTED', reason: 'Look again' })).state).toBeNull();
    });

    it.each([
      ['a refusal with no reason', { decision: 'REJECTED' }],
      ['a refusal with a blank reason', { decision: 'REJECTED', reason: ' ' }],
      ['an approval that gives a reason', { reason: 'Because' }],
      ['a role that is not the spending approver', { decider_role: 'FINANCE' }],
      ['a negative total', { total_minor: -1 }],
    ])('refuses %s', async (_name, over) => {
      expect((await decision(over)).state).toBe(CHECK);
    });

    it('is never changed or deleted, by update, delete or truncate', async () => {
      const { versionId } = await decision();

      expect(
        await sqlState(`UPDATE budget_version_decisions SET reason = 'x' WHERE version_id = $1`, [versionId]),
      ).toBe('23001');
      expect(await sqlState(`DELETE FROM budget_version_decisions WHERE version_id = $1`, [versionId])).toBe('23001');
      expect(await sqlState(`TRUNCATE budget_version_decisions`)).toBe('23001');
    });
  });

  describe('the commitments (US-06-07, INV-16)', () => {
    const commitment = async (over: Record<string, unknown> = {}) => {
      const row = {
        organization_id: h.seed.organizationId,
        request_id: await h.fixtureRequestId(),
        cost_center_id: await freshCostCenter(),
        year: 2027,
        amount_minor: 100,
        currency: 'VND',
        unattached_reason: 'NO_BUDGET',
        ...over,
      };
      const columns = Object.keys(row);
      const state = await sqlState(
        `INSERT INTO budget_commitments (id, ${columns.join(', ')})
         VALUES (gen_random_uuid(), ${columns.map((_column, index) => `$${index + 1}`).join(', ')})`,
        columns.map((column) => (row as Record<string, unknown>)[column]),
      );

      return { state, row };
    };

    it('takes a commitment that waits for a budget, one for each request and year', async () => {
      const first = await commitment();
      const sameYear = await commitment({ request_id: first.row.request_id });
      const nextYear = await commitment({ request_id: first.row.request_id, year: 2028 });

      expect(first.state).toBeNull();
      expect(sameYear.state).toBe(UNIQUE);
      expect(nextYear.state).toBeNull();
    });

    it.each([
      ['an amount of nothing', { amount_minor: 0 }],
      ['a year that is not a year', { year: 27 }],
      ['a commitment that waits and says no reason', { unattached_reason: null }],
      ['a commitment that waits and gives another reason', { unattached_reason: 'OTHER' }],
      ['a commitment attached to nothing that says it was attached', { attached_at: new Date() }],
    ])('refuses %s', async (_name, over) => {
      expect((await commitment(over)).state).toBe(CHECK);
    });

    it('takes a commitment attached to a version with the time, and refuses one half attached', async () => {
      const source = await version({ state: 'APPROVED', sent_at: new Date(), sent_by_employee_id: employeeId });
      const attached = { cost_center_id: source.costCenter, unattached_reason: null };

      expect(
        (await commitment({ ...attached, attached_version_id: source.id, attached_at: new Date() })).state,
      ).toBeNull();
      expect((await commitment({ ...attached, attached_version_id: source.id })).state).toBe(CHECK);
      expect((await commitment({ ...attached, attached_at: new Date() })).state).toBe(CHECK);
    });

    it('refuses a commitment for a request, or on a snapshot, that is not there (US-06-09 AC-4)', async () => {
      expect((await commitment({ request_id: randomUUID() })).state).toBe(FOREIGN_KEY);
      expect((await commitment({ snapshot_check_id: randomUUID() })).state).toBe(FOREIGN_KEY);
    });

    it('refuses a Cost Center, a currency or a version that does not exist', async () => {
      expect((await commitment({ cost_center_id: randomUUID() })).state).toBe(FOREIGN_KEY);
      expect((await commitment({ currency: 'ZZZ' })).state).toBe(FOREIGN_KEY);
      expect(
        (await commitment({ unattached_reason: null, attached_version_id: randomUUID(), attached_at: new Date() }))
          .state,
      ).toBe(FOREIGN_KEY);
    });
  });

  it('keeps a Cost Center it is pointed at: the Cost Center is not deleted from under a proposal', async () => {
    const source = await proposal();

    expect(await sqlState(`DELETE FROM cost_centers WHERE id = $1`, [source.costCenter])).toBe(FOREIGN_KEY);
    expect(costCenterId).toBeTruthy();
  });
});
