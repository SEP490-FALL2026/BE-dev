import { Client } from 'pg';
import request from 'supertest';
import { addDays } from '../../support/department-harness';
import { BudgetHarness } from '../../support/budget-harness';
import { CarriedOverContributions } from '../../../src/modules/budgets/public/budgets.extension-points';
import { budgetYearLockKey } from '../../../src/modules/budgets/public/budget-year-lock-key.policy';
import { waitForLockWaiters } from '../../support/lock-wait';
import type { Department } from '../../support/request-harness';

const h = new BudgetHarness();
/**
 * What each Cost Center carries into the year, as these tests say it (the budgets read it through `CarriedOverContributions.totals`; the
 * requests context's real source, and its figures, are proved in `requests/year-start-carried-over`): a spy on the answer, never a second
 * source added next to the real one, which would be added up with it (FIX-LB4 MG-05).
 */
const carriedOver = new Map<string, bigint>();

interface VersionBody {
  version: {
    id: string;
    origin: string;
    proposalId: string | null;
    base: { amount: string };
    reserve: { amount: string };
    carriedOverNextYear: { amount: string };
    belowCarriedOver: boolean;
    carriedOverShortfall: { amount: string };
    noProposalSubmitted: boolean;
  };
}

/**
 * `qd103-budget-baseline-annual-check`, Task 3, as `QĐ-111bb` changed it: after the submission deadline Finance builds the version of a
 * department that has no proposal, from the baseline: one figure for the year, the base filled in with what the Cost Center carries into it.
 */
describe('a version built from the baseline (integration, real PostgreSQL)', () => {
  let counter = 0;

  const create = (body: object, token = h.finance) =>
    request(h.server()).post('/api/v1/budget-versions').set(h.as(token)).send(body);
  const setDeadline = (year: number, deadline: string) =>
    h.ctx.sql.query(`UPDATE budget_cycles SET submission_deadline = $2, decision_deadline = $3 WHERE year = $1`, [
      year,
      deadline,
      addDays(deadline, 10),
    ]);
  /** A department of the year with a Cost Center, a subscription of 10 seats and nobody heading it. */
  const headless = async (): Promise<Department> => {
    counter += 1;
    const department = await h.departmentWithUnit(`P-BV${counter}`);
    await h.subscription(10, 'K2', department.id);

    return department;
  };
  /** Six seats held on the subscription of the department, by people who are not its head (nobody is). */
  const holdSeats = async (department: Department, held: number) => {
    const { rows } = await h.ctx.sql.query<{ id: string; plan_id: string }>(
      `SELECT id, plan_id FROM subscriptions WHERE owner_department_id = $1 AND status = 'ACTIVE' ORDER BY id`,
      [department.id],
    );
    for (let i = 0; i < held; i += 1) {
      const person = await h.staff(department, `BVS${counter}-${i}`);
      await h.ctx.sql.query(
        `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id,
           account_identifier, normalized_account_identifier, valid_from, valid_from_basis, created_by_app_user_id)
         SELECT gen_random_uuid(), e.organization_id, 'PERSONAL', 'REQUEST', $2, $3, e.id, e.employee_code || '@acme.vn',
                lower(e.employee_code) || '@acme.vn', '2026-01-05', 'ACTUAL', gen_random_uuid()
           FROM employees e WHERE e.id = $1`,
        [person.employeeId, rows[0].plan_id, rows[0].id],
      );
    }
  };
  const baselineBody = (department: Department, year = h.year) => ({
    source: 'BASELINE',
    costCenterId: department.unitId,
    year,
  });

  beforeAll(async () => {
    await h.start();
    jest
      .spyOn(h.ctx.app.get(CarriedOverContributions, { strict: false }), 'totals')
      .mockImplementation((ids) => Promise.resolve(new Map([...carriedOver].filter(([id]) => ids.includes(id)))));
    // The deadline of the year has passed: yesterday.
    await setDeadline(h.year, addDays(h.today(), -1));
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  it('builds the version from the baseline with one figure for the year: the base is what the Cost Center carries into it, the reserve its share, and no line (QĐ-111bb, T-BG2)', async () => {
    const department = await headless();
    await holdSeats(department, 6);
    carriedOver.set(department.unitId, 10n * 1_000_000n * 12n + 3_000_000n);

    const made = h.dataOf<VersionBody>(await create(baselineBody(department)).expect(201)).version;

    expect(made).toMatchObject({
      origin: 'BASELINE_NO_PROPOSAL',
      proposalId: null,
      base: { amount: '123000000' },
      reserve: { amount: '12300000' },
      carriedOverNextYear: { amount: '123000000' },
      belowCarriedOver: false,
      carriedOverShortfall: { amount: '0' },
      noProposalSubmitted: true,
    });
    expect(await h.budgetRows(`budget_version_lines WHERE version_id = '${made.id}'`)).toBe(0);
  });

  it('takes the figures Finance gives instead: a base below what is carried over raises the red flag and is still saved and sent (QĐ-111ac)', async () => {
    const department = await headless();
    carriedOver.set(department.unitId, 50_000_000n);

    const made = h.dataOf<VersionBody>(
      await create({
        ...baselineBody(department),
        base: h.money(40_000_000),
        reservePercent: 5,
        reserveReason: 'A lean year',
      }).expect(201),
    ).version;

    expect(made).toMatchObject({
      base: { amount: '40000000' },
      reserve: { amount: '2000000' },
      carriedOverNextYear: { amount: '50000000' },
      belowCarriedOver: true,
      carriedOverShortfall: { amount: '8000000' },
    });
    const read = h.dataOf<VersionBody>(await h.versionOf(made.id).expect(200)).version;
    expect(read).toMatchObject({ belowCarriedOver: true, noProposalSubmitted: true });
    await h.sendVersion(made.id).expect(200);
  });

  it('flags a version of the older kind, made when nobody headed the department, as one with no proposal just like the new kind (QĐ-104f; FIX-LB3 LBG-06)', async () => {
    const department = await headless();
    const made = h.dataOf<VersionBody>(await create(baselineBody(department)).expect(201)).version;
    await h.ctx.sql.query(`UPDATE budget_versions SET origin = 'BASELINE_NO_HEAD' WHERE id = $1`, [made.id]);

    const read = h.dataOf<VersionBody>(await h.versionOf(made.id).expect(200)).version;

    expect(read).toMatchObject({ origin: 'BASELINE_NO_HEAD', noProposalSubmitted: true });
  });

  describe('the red flag compares the base and the reserve together with what is carried over (QĐ-111ac, C-09, QT 4.6; FIX-LB3 LBG-01)', () => {
    const flagsOf = async (department: Department, versionId: string) => {
      const read = h.dataOf<VersionBody>(await h.versionOf(versionId).expect(200)).version;
      const baseline = h.dataOf<{
        departments: { departmentId: string; belowCarriedOver: boolean; carriedOverShortfall: { amount: string } }[];
      }>(await request(h.server()).get(`/api/v1/budget-cycles/${h.year}/baseline`).set(h.as(h.finance)).expect(200));
      const row = baseline.departments.find((one) => one.departmentId === department.id);

      return {
        version: { below: read.belowCarriedOver, shortfall: read.carriedOverShortfall.amount },
        baseline: { below: row?.belowCarriedOver, shortfall: row?.carriedOverShortfall.amount },
      };
    };

    it('is down when the base is below what is carried over (850 against 900 million) and the reserve of 85 makes up for it: 935 covers 900', async () => {
      const department = await headless();
      carriedOver.set(department.unitId, 900_000_000n);

      const made = h.dataOf<VersionBody>(
        await create({ ...baselineBody(department), base: h.money(850_000_000), reservePercent: 10 }).expect(201),
      ).version;

      expect(made.reserve.amount).toBe('85000000');
      expect(await flagsOf(department, made.id)).toEqual({
        version: { below: false, shortfall: '0' },
        baseline: { below: false, shortfall: '0' },
      });
    });

    it('is up with the amount that is missing when the base and the reserve fall short: 800 + 80 against 900 million is 20 million short, still saved and sent', async () => {
      const department = await headless();
      carriedOver.set(department.unitId, 900_000_000n);

      const made = h.dataOf<VersionBody>(
        await create({ ...baselineBody(department), base: h.money(800_000_000), reservePercent: 10 }).expect(201),
      ).version;

      expect(made).toMatchObject({ belowCarriedOver: true, carriedOverShortfall: { amount: '20000000' } });
      expect(await flagsOf(department, made.id)).toEqual({
        version: { below: true, shortfall: '20000000' },
        baseline: { below: true, shortfall: '20000000' },
      });
      await h.sendVersion(made.id).expect(200);
    });
  });

  describe('refuses with 409 BUDGET.BASELINE_VERSION_NOT_ALLOWED naming the reason', () => {
    const refusedWith = (response: request.Response, reason: string): void => {
      expect(response.status).toBe(409);
      expect(h.codeOf(response)).toBe('BUDGET.BASELINE_VERSION_NOT_ALLOWED');
      expect(h.detailsOf(response)).toEqual({ reason });
    };

    it('before the submission deadline, and on the day of it', async () => {
      const department = await headless();
      await setDeadline(h.year, h.today());

      refusedWith(await create(baselineBody(department)), 'BEFORE_DEADLINE');
      await setDeadline(h.year, addDays(h.today(), 5));
      refusedWith(await create(baselineBody(department)), 'BEFORE_DEADLINE');
      await setDeadline(h.year, addDays(h.today(), -1));
    });

    it('when a proposal waits, even though nobody heads the department any more', async () => {
      const unit = await h.departmentWithHead(`P-BVP${(counter += 1)}`);
      // The proposal was sent before the deadline (after it the cycle is locked, QĐ-111z).
      await setDeadline(h.year, addDays(h.today(), 5));
      await h.budgetProposed(unit.head, unit.department.unitId, undefined, h.year);
      await setDeadline(h.year, addDays(h.today(), -1));
      await h.withoutHead(unit.department);

      refusedWith(await create(baselineBody(unit.department)), 'HAS_PROPOSAL');
    });

    it('when the department takes effect after the year: it is not among the departments of the cycle (F-078)', async () => {
      const later = await headless();
      await h.ctx.sql.query(`UPDATE departments SET effective_from = $2 WHERE id = $1`, [later.id, `${h.next}-01-01`]);

      refusedWith(await create(baselineBody(later)), 'DEPARTMENT_NOT_IN_CYCLE');
    });

    it('when the cycle of the year is not open (a draft)', async () => {
      const department = await headless();
      await h.ctx.sql.query(`UPDATE budget_cycles SET opened_at = NULL, opened_by_employee_id = NULL WHERE year = $1`, [
        h.year,
      ]);
      try {
        refusedWith(await create(baselineBody(department)), 'CYCLE_NOT_OPEN');
      } finally {
        await h.ctx.sql.query(
          `UPDATE budget_cycles SET opened_at = now(), opened_by_employee_id = $2 WHERE year = $1`,
          [h.year, h.finance.employeeId],
        );
      }
    });
  });

  it('answers 409 FINANCE.SETUP_INCOMPLETE when the department has no Cost Center in use', async () => {
    const department = await headless();
    await h.ctx.sql.query(`UPDATE cost_centers SET status = 'INACTIVE', deactivated_at = now() WHERE id = $1`, [
      department.unitId,
    ]);

    const refused = await create(baselineBody(department)).expect(409);

    expect(h.codeOf(refused)).toBe('FINANCE.SETUP_INCOMPLETE');
  });

  it('builds the version of a department whatever its head: one that submitted nothing by the deadline, or is to head it from tomorrow (QĐ-111bb)', async () => {
    const headed = await h.departmentWithHead(`P-BVH${(counter += 1)}`);
    const successor = await headless();
    const person = await h.staff(successor, `BVN${(counter += 1)}`, 'MANAGER');
    await h.ctx.sql.query(
      `INSERT INTO department_head_periods (id, organization_id, department_id, employee_id, valid_from)
       VALUES (gen_random_uuid(), $1, $2, $3, $4::date)`,
      [h.seed.organizationId, successor.id, person.employeeId, addDays(h.today(), 1)],
    );

    const first = h.dataOf<VersionBody>(await create(baselineBody(headed.department)).expect(201)).version;
    const second = h.dataOf<VersionBody>(await create(baselineBody(successor)).expect(201)).version;

    expect([first.origin, second.origin]).toEqual(['BASELINE_NO_PROPOSAL', 'BASELINE_NO_PROPOSAL']);
  });

  it('shows in the baseline what each Cost Center carries into the year, from the contexts that add it, and the department with no proposal by the deadline (QĐ-111ac, QĐ-111bb)', async () => {
    const quiet = await headless();
    const proposed = await h.departmentWithHead(`P-BVQ${(counter += 1)}`);
    await h.ctx.sql.query(
      `INSERT INTO budget_proposals (id, organization_id, cost_center_id, year, state, total_minor, currency,
         submitted_by_employee_id, submitted_at, updated_at)
       SELECT gen_random_uuid(), id, $1, $2, 'SUBMITTED', 0, $3, $4, now(), now() FROM organizations LIMIT 1`,
      [proposed.department.unitId, h.year, h.reporting, proposed.head.employeeId],
    );
    // A context that carries ten rights of 1,000,000 a month with no end (twelve months each) and 3,000,000 saved for a right with an end.
    carriedOver.set(quiet.unitId, 10n * 1_000_000n * 12n + 3_000_000n);

    const wire = h.dataOf<{
      departments: { departmentId: string; carriedOverNextYear: { amount: string }; noProposalSubmitted: boolean }[];
    }>(await request(h.server()).get(`/api/v1/budget-cycles/${h.year}/baseline`).set(h.as(h.finance)).expect(200));
    const of = (id: string) => wire.departments.find((department) => department.departmentId === id);

    expect(of(quiet.id)).toMatchObject({ carriedOverNextYear: { amount: '123000000' }, noProposalSubmitted: true });
    expect(of(proposed.department.id)).toMatchObject({
      carriedOverNextYear: { amount: '0' },
      noProposalSubmitted: false,
    });
  });

  it('tells nobody that a department sent no proposal while the cycle is still a draft, even when its deadline is already behind us (FIX-LB3 LBG-17)', async () => {
    const quiet = await headless();
    const flagOf = async () =>
      h
        .dataOf<{ departments: { departmentId: string; noProposalSubmitted: boolean }[] }>(
          await request(h.server()).get(`/api/v1/budget-cycles/${h.year}/baseline`).set(h.as(h.finance)).expect(200),
        )
        .departments.find((department) => department.departmentId === quiet.id)?.noProposalSubmitted;
    expect(await flagOf()).toBe(true);
    await h.ctx.sql.query(`UPDATE budget_cycles SET opened_at = NULL, opened_by_employee_id = NULL WHERE year = $1`, [
      h.year,
    ]);
    try {
      expect(await flagOf()).toBe(false);
    } finally {
      await h.ctx.sql.query(`UPDATE budget_cycles SET opened_at = now(), opened_by_employee_id = $2 WHERE year = $1`, [
        h.year,
        h.finance.employeeId,
      ]);
    }
  });

  it('builds a version with a base of zero for a department that carries nothing into the year, whatever it runs (F-086)', async () => {
    counter += 1;
    const empty = await h.departmentWithUnit(`P-BVZ${counter}`);
    const running = await headless();
    await holdSeats(running, 6);
    const emptyMade = h.dataOf<VersionBody>(await create(baselineBody(empty)).expect(201)).version;
    const runningMade = h.dataOf<VersionBody>(await create(baselineBody(running)).expect(201)).version;

    expect([emptyMade.base.amount, runningMade.base.amount]).toEqual(['0', '0']);
    const lines = await h.ctx.sql.query(`SELECT 1 FROM budget_version_lines WHERE version_id = ANY($1::uuid[])`, [
      [emptyMade.id, runningMade.id],
    ]);
    expect(lines.rows).toHaveLength(0);
  });

  describe('the second call for the same Cost Center and year (F-079)', () => {
    it('answers 409 BUDGET.VERSION_IN_FLIGHT while the first version is a draft, and builds nothing more', async () => {
      const department = await headless();
      await create(baselineBody(department)).expect(201);

      const second = await create(baselineBody(department)).expect(409);

      expect(h.codeOf(second)).toBe('BUDGET.VERSION_IN_FLIGHT');
      const { rows } = await h.ctx.sql.query(`SELECT 1 FROM budget_versions WHERE cost_center_id = $1 AND year = $2`, [
        department.unitId,
        h.year,
      ]);
      expect(rows).toHaveLength(1);
    });

    it('answers 409 BUDGET.CURRENT_EXISTS when a version is the current budget', async () => {
      const department = await headless();
      const made = h.dataOf<VersionBody>(await create(baselineBody(department)).expect(201)).version;
      await h.ctx.sql.query(
        `UPDATE budget_versions SET state = 'APPROVED', sent_at = now(), sent_by_employee_id = $2 WHERE id = $1`,
        [made.id, h.finance.employeeId],
      );

      const second = await create(baselineBody(department)).expect(409);

      expect(h.codeOf(second)).toBe('BUDGET.CURRENT_EXISTS');
    });
  });

  it('holds the cycle while it waits for the lock of the year: the cycle first, then the year, as everywhere in the module (F-084)', async () => {
    const department = await headless();
    const holder = new Client({ connectionString: h.ctx.database.url });
    const observer = new Client({ connectionString: h.ctx.database.url });
    await holder.connect();
    await observer.connect();
    try {
      await holder.query('BEGIN');
      await holder.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        budgetYearLockKey(department.unitId, h.year),
      ]);
      const made = create(baselineBody(department)).then((response) => response);
      await waitForLockWaiters(observer, 1);
      await observer.query('BEGIN');
      // The creation has taken the cycle FOR UPDATE and waits for the year: even a shared lock on it is refused (FOR SHARE only
      // conflicts with FOR UPDATE and FOR NO KEY UPDATE, so a creation that held the cycle FOR SHARE would let this one in).
      const cycleTaken = await observer
        .query(`SELECT id FROM budget_cycles WHERE year = $1 FOR SHARE NOWAIT`, [h.year])
        .then(
          () => false,
          () => true,
        );
      await observer.query('ROLLBACK');
      await holder.query('COMMIT');

      expect(cycleTaken).toBe(true);
      expect((await made).status).toBe(201);
    } finally {
      await holder.query('ROLLBACK').catch(() => undefined);
      await holder.end();
      await observer.end();
    }
  });

  it('is for Finance only: the Super Admin, the IT Admin, the spending approver and an employee get 403 (AC-5, F-081)', async () => {
    const department = await headless();
    const employee = await h.staff(department, `BVE${counter}`);

    const approver = await h.staff(department, `BVA${counter}`);
    await h.setRole('SPENDING_APPROVER', approver);
    for (const headers of [
      { Authorization: `Bearer ${h.admin}` },
      h.as(h.it1),
      h.as(employee.account),
      h.as(approver.account),
    ]) {
      const refused = await request(h.server())
        .post('/api/v1/budget-versions')
        .set(headers)
        .send(baselineBody(department));
      expect([refused.status, h.codeOf(refused)]).toEqual([403, 'AUTHORIZATION.FORBIDDEN']);
    }
  });

  it('turns away a body that mixes the two sources, or leaves out what its source needs, naming the kind of fault and the path (422, F-077, F-099)', async () => {
    const department = await headless();
    const proposalId = '5b1b4f7e-0a52-4b0e-9f5b-9f3c1a2d7e10';
    // The answer names the kind of the fault, and the path when the fault is a field that is missing or wrong: a field a source does
    // not take is `unrecognized_keys` (the same wire as every strict body of the API).
    const bodies: [object, string, string][] = [
      [{ source: 'BASELINE', costCenterId: department.unitId }, 'invalid_type', 'year'],
      [{ ...baselineBody(department), proposalId }, 'unrecognized_keys', ''],
      // The figures are Finance's to give on either source (QĐ-111ac); the reserve is an amount or a share, not both.
      [{ ...baselineBody(department), reserve: h.money(1), reservePercent: 10 }, 'custom', 'reservePercent'],
      [{ ...baselineBody(department), quarters: null }, 'unrecognized_keys', ''],
      [{ proposalId, base: h.money(1), year: h.year }, 'unrecognized_keys', ''],
      [{ proposalId, base: h.money(1), costCenterId: department.unitId }, 'unrecognized_keys', ''],
      [{ proposalId, base: h.money(1), reservePercent: 101 }, 'too_big', 'reservePercent'],
      [{ source: 'OTHER', proposalId, base: h.money(1) }, 'invalid_union', 'source'],
    ];

    for (const [body, code, path] of bodies) {
      const response = await create(body).expect(422);
      const issues = (response.body as { error: { details: { issues: { code: string; path: string }[] } } }).error
        .details.issues;

      expect(h.codeOf(response)).toBe('VALIDATION_ERROR');
      expect(issues).toEqual([expect.objectContaining({ code, path })]);
    }
  });
});
