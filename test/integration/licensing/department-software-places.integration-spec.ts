import { TransactionRunner, type DbTx } from '../../../src/infrastructure/database/transaction-runner';
import { DepartmentSoftwareRepo } from '../../../src/modules/licensing/department-tools/department-software.repo';
import { RequestHarness, type Department, type Person } from '../../support/request-harness';

const h = new RequestHarness();

/** The SQLSTATE a rejected statement carries: the constraint, not the application, said no. */
async function sqlState(text: string, values: unknown[] = []): Promise<string | null> {
  try {
    await h.ctx.sql.query(text, values);

    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? 'unknown';
  }
}

/**
 * DS.1 (`QĐ-110s`, `QĐ-110t`, SPEC P16 to P18, MIN-4): the list of software of a department and the proposals to add to it, on real
 * PostgreSQL. The unique indexes decide a place twice and a second open proposal, so two writers that arrive together leave one row and a
 * refusal for the other, and an application alone counts as one place (`NULLS NOT DISTINCT`).
 */
describe('the list of software of a department and its proposals (integration, real PostgreSQL)', () => {
  let organizationId: string;
  let department: Department;
  let head: Person;
  let repo: DepartmentSoftwareRepo;
  const appUserId = '00000000-0000-4000-8000-000000000001';

  const run = <T>(work: (tx: DbTx) => Promise<T>): Promise<T> => h.ctx.app.get(TransactionRunner).run(work);
  /** A plan of a new application: the application it belongs to and the plan. */
  const newPlace = async (): Promise<{ applicationId: string; planId: string }> => {
    const planId = await h.plan('K1');
    const { rows } = await h.ctx.sql.query<{ application_id: string }>(
      'SELECT application_id FROM plans WHERE id = $1',
      [planId],
    );

    return { applicationId: rows[0].application_id, planId };
  };
  const insertEntries = (items: { applicationId: string; planId: string | null; note: string | null }[]) =>
    run((tx) =>
      repo.insertEntries(tx, { organizationId, departmentId: department.id, addedByAppUserId: appUserId, items }),
    );
  const propose = (item: { applicationId: string; planId: string | null }) =>
    run((tx) =>
      repo.insertProposal(tx, {
        organizationId,
        departmentId: department.id,
        item,
        reason: 'The team needs it',
        proposedByEmployeeId: head.employeeId,
      }),
    );
  const count = async (text: string, values: unknown[]): Promise<number> =>
    (await h.ctx.sql.query(text, values)).rows.length;

  beforeAll(async () => {
    await h.start();
    repo = h.ctx.app.get(DepartmentSoftwareRepo);
    organizationId = (await h.ctx.sql.query<{ id: string }>('SELECT id FROM organizations LIMIT 1')).rows[0].id;
    department = await h.departmentWithUnit('P-DS1');
    head = await h.staff(department, 'DS1-HEAD');
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  describe('the places of the list', () => {
    it('keeps an application alone once, and a plan of it as another place', async () => {
      const { applicationId, planId } = await newPlace();

      const first = await insertEntries([{ applicationId, planId: null, note: 'main tool' }]);
      const again = await insertEntries([{ applicationId, planId: null, note: 'other note' }]);
      const withPlan = await insertEntries([{ applicationId, planId, note: null }]);

      expect(first).toHaveLength(1);
      expect(again).toEqual([]);
      expect(withPlan).toHaveLength(1);
      const { rows: kept } = await h.ctx.sql.query<{ plan_id: string | null; note: string | null }>(
        'SELECT plan_id, note FROM department_software_entries WHERE application_id = $1 ORDER BY plan_id NULLS FIRST',
        [applicationId],
      );
      expect(kept).toEqual([
        { plan_id: null, note: 'main tool' },
        { plan_id: planId, note: null },
      ]);
    });

    it('writes only the places that are new when a batch holds one already there, and returns just those', async () => {
      const { applicationId, planId } = await newPlace();
      await insertEntries([{ applicationId, planId: null, note: null }]);

      const written = await insertEntries([
        { applicationId, planId: null, note: null },
        { applicationId, planId, note: 'x' },
      ]);

      expect(written.map((entry) => entry.planId)).toEqual([planId]);
    });

    it('stays one row when two writers add the same place together: one gets the row, the other nothing, and no error', async () => {
      const { applicationId } = await newPlace();

      const [one, two] = await Promise.all([
        insertEntries([{ applicationId, planId: null, note: null }]),
        insertEntries([{ applicationId, planId: null, note: null }]),
      ]);

      expect(one.length + two.length).toBe(1);
      expect(await count('SELECT 1 FROM department_software_entries WHERE application_id = $1', [applicationId])).toBe(
        1,
      );
    });

    it('pages newest first and then by id without repeating a place, and counts the whole list', async () => {
      for (let index = 0; index < 3; index += 1) {
        const { applicationId } = await newPlace();
        await insertEntries([{ applicationId, planId: null, note: null }]);
      }
      const total = await count('SELECT 1 FROM department_software_entries WHERE department_id = $1', [department.id]);

      const first = await repo.pageEntries(department.id, 0, 2);
      const second = await repo.pageEntries(department.id, 2, 2);

      expect(first.total).toBe(total);
      expect(first.items).toHaveLength(2);
      const ids = [...first.items, ...second.items].map((entry) => entry.id);
      expect(new Set(ids).size).toBe(ids.length);
      const at = [...first.items, ...second.items].map((entry) => entry.addedAt.getTime());
      expect(at).toEqual([...at].sort((a, b) => b - a));
    });

    it('refuses a blank or an over-long note', async () => {
      const { applicationId, planId } = await newPlace();
      const insert = (note: string) =>
        sqlState(
          `INSERT INTO department_software_entries (id, organization_id, department_id, application_id, plan_id, note, added_by_app_user_id)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6)`,
          [organizationId, department.id, applicationId, planId, note, appUserId],
        );

      expect(await insert('   ')).toBe('23514');
      expect(await insert('x'.repeat(501))).toBe('23514');
      expect(await insert('x'.repeat(500))).toBeNull();
    });

    it('takes places out only of the department they are in', async () => {
      const { applicationId } = await newPlace();
      const [entry] = await insertEntries([{ applicationId, planId: null, note: null }]);
      const other = await h.departmentWithUnit('P-DS1B');

      expect(await run((tx) => repo.deleteEntries(tx, other.id, [entry.id]))).toBe(0);
      expect(await run((tx) => repo.findEntries(tx, other.id, [entry.id]))).toEqual([]);
      expect(await run((tx) => repo.findEntries(tx, department.id, [entry.id]))).toHaveLength(1);
      expect(await run((tx) => repo.deleteEntries(tx, department.id, [entry.id]))).toBe(1);
    });
  });

  describe('the proposals', () => {
    it('opens one proposal for a place; a second for the same place while it is open writes nothing', async () => {
      const place = await newPlace();

      const first = await propose(place);
      const again = await propose(place);

      expect(first?.state).toBe('PENDING');
      expect(again).toBeNull();
    });

    it('counts an application alone as one place, and the same application with a plan as another', async () => {
      const { applicationId, planId } = await newPlace();

      expect(await propose({ applicationId, planId: null })).not.toBeNull();
      expect(await propose({ applicationId, planId: null })).toBeNull();
      expect(await propose({ applicationId, planId })).not.toBeNull();
    });

    it('leaves exactly one open proposal when several are sent together', async () => {
      const { applicationId } = await newPlace();

      const results = await Promise.all([
        propose({ applicationId, planId: null }),
        propose({ applicationId, planId: null }),
        propose({ applicationId, planId: null }),
      ]);

      expect(results.filter((result) => result !== null)).toHaveLength(1);
      expect(
        await count(`SELECT 1 FROM department_software_proposals WHERE application_id = $1 AND state = 'PENDING'`, [
          applicationId,
        ]),
      ).toBe(1);
    });

    it('decides an open proposal once even when two IT Admins decide together, and lets a new one in afterwards', async () => {
      const place = await newPlace();
      const opened = await propose(place);
      const id = opened?.id ?? '';
      const at = new Date();

      const results = await Promise.all([
        run((tx) => repo.decide(tx, id, { state: 'REJECTED', byAppUserId: appUserId, at, reason: 'Not needed' })),
        run((tx) => repo.decide(tx, id, { state: 'ACCEPTED', byAppUserId: appUserId, at, reason: null })),
      ]);

      expect(opened).not.toBeNull();
      expect(results.filter(Boolean)).toHaveLength(1);
      expect((await repo.findProposal(id))?.state).not.toBe('PENDING');
      expect(await propose(place)).not.toBeNull();
    });

    it('refuses a blank reason and a decision that does not hold together, whatever wrote it', async () => {
      const { applicationId, planId } = await newPlace();
      const insert = (
        state: string,
        reason: string,
        decision: { by: string | null; at: boolean; why: string | null },
      ) =>
        sqlState(
          `INSERT INTO department_software_proposals
             (id, organization_id, department_id, application_id, plan_id, reason, state, proposed_by_employee_id,
              decided_by_app_user_id, decided_at, decision_reason)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6::"DepartmentSoftwareProposalState", $7, $8,
                   CASE WHEN $9::boolean THEN now() ELSE NULL END, $10)`,
          [
            organizationId,
            department.id,
            applicationId,
            planId,
            reason,
            state,
            head.employeeId,
            decision.by,
            decision.at,
            decision.why,
          ],
        );
      const none = { by: null, at: false, why: null };
      const decided = (why: string | null) => ({ by: appUserId, at: true, why });

      expect(await insert('PENDING', '   ', none)).toBe('23514');
      expect(await insert('PENDING', 'x'.repeat(501), none)).toBe('23514');
      expect(await insert('PENDING', 'why', decided(null))).toBe('23514');
      expect(await insert('REJECTED', 'why', decided(null))).toBe('23514');
      expect(await insert('REJECTED', 'why', decided('   '))).toBe('23514');
      expect(await insert('REJECTED', 'why', { by: null, at: true, why: 'because' })).toBe('23514');
      expect(await insert('ACCEPTED', 'why', decided('an acceptance has no reason'))).toBe('23514');
      expect(await insert('ACCEPTED', 'why', { by: appUserId, at: false, why: null })).toBe('23514');
      expect(await insert('ACCEPTED', 'why', decided(null))).toBeNull();
      expect(await insert('PENDING', 'why', none)).toBeNull();
    });
  });
});
