import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { BlockAnnouncementService } from '../../../src/modules/personnel/departure-deadline/block-announcement.service';
import { DepartureImpactService } from '../../../src/modules/personnel/departure-deadline/departure-impact.service';
import { OffboardingHarness } from '../../support/offboarding-harness';
import type { Person } from '../../support/request-harness';
import type { Unit } from '../../support/spend-harness';

const h = new OffboardingHarness();

/**
 * X-IT.6 (`QĐ-110k`, SPEC P23, T-IT), real PostgreSQL: the plans a person administers at the vendor are listed in the impact of their departure
 * (`<application> / <plan> (OWNER|ADMIN)`), and when the person is the last who still works as an IT Admin among the admins of a plan, the block of
 * their access tells every IT Admin once for the plan. The file is never held back; a plan that another IT Admin who works also administers tells nobody.
 */
describe('the vendor admin roles of a person who leaves (X-IT.6, integration, real PostgreSQL)', () => {
  let counter = 0;
  let department: Unit['department'];
  let outsider: Person;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    department = (await h.departmentWithHead('P-VA-T')).department;
    // A plain employee: not an IT Admin, so a plan he administers at the vendor has nobody the company can count on.
    outsider = await h.worker(department, 'VA-OUTSIDER');
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  /** A K2 plan whose workspace profile has `owner` as its owner and `admin` as its admin, and the name of the plan with its application. */
  const planAdministeredBy = async (owner: Person, admin: Person): Promise<{ planId: string; label: string }> => {
    const subscriptionId = await h.subscription(10);
    const planId = await h.planOf(subscriptionId);
    await h.ctx.sql.query(`DELETE FROM plan_workspace_admins WHERE plan_id = $1`, [planId]);
    await h.ctx.sql.query(`UPDATE plan_workspace_profiles SET primary_owner_employee_id = $2 WHERE plan_id = $1`, [
      planId,
      owner.employeeId,
    ]);
    await h.ctx.sql.query(
      `INSERT INTO plan_workspace_admins (plan_id, employee_id, role)
       VALUES ($1, $2, 'OWNER'::"WorkspaceRole"), ($1, $3, 'ADMIN'::"WorkspaceRole")`,
      [planId, owner.employeeId, admin.employeeId],
    );
    const { rows } = await h.ctx.sql.query<{ label: string }>(
      `SELECT a.name || ' / ' || p.name AS label FROM plans p JOIN applications a ON a.id = p.application_id WHERE p.id = $1`,
      [planId],
    );

    return { planId, label: rows[0].label };
  };
  const itAdmin = async (): Promise<Person> => {
    counter += 1;

    return h.worker(department, `VA-IT${counter}`, ['IT_ADMIN']);
  };
  const impact = (person: Person) =>
    h.ctx.app.get(TransactionRunner, { strict: false }).run((tx) =>
      h.ctx.app.get(DepartureImpactService, { strict: false }).impactOf(tx, {
        employeeId: person.employeeId,
        today: h.today(),
        lastWorkingDay: h.day(10),
        headSuccessorRequired: false,
      }),
    );
  const warnings = async (planId: string) =>
    (
      await h.ctx.sql.query<{ recipient: string; params: Record<string, unknown> }>(
        `SELECT recipient_employee_id AS recipient, params FROM in_app_notifications
          WHERE code = 'VENDOR_ADMINS_BELOW_MINIMUM' AND subject_id = $1 ORDER BY recipient_employee_id`,
        [planId],
      )
    ).rows;
  const announce = () =>
    h.ctx.app.get(BlockAnnouncementService, { strict: false }).announce(new Date(Date.now() + 60_000));

  it('lists each plan the person administers at the vendor with their role, and nothing for a person who administers none', async () => {
    const leaver = await itAdmin();
    const owned = await planAdministeredBy(leaver, outsider);
    const administered = await planAdministeredBy(outsider, leaver);

    const found = await impact(leaver);

    expect([...found.vendorAdminRoles].sort()).toEqual(
      [`${owned.label} (OWNER)`, `${administered.label} (ADMIN)`].sort(),
    );
    expect((await impact(await itAdmin())).vendorAdminRoles).toEqual([]);
  });

  it('tells every IT Admin once for the plan when the person who leaves is the last who works as one among its admins', async () => {
    const leaver = await itAdmin();
    const bare = await planAdministeredBy(leaver, outsider);
    const recorded = await h.recordedCase(leaver, { accessBlockMode: 'BLOCK_NOW', lastWorkingDay: undefined });

    await announce();
    await announce();

    const told = await warnings(bare.planId);
    expect(told.map((notice) => notice.recipient)).toEqual(expect.arrayContaining([h.it1.employeeId]));
    expect(told.map((notice) => notice.recipient)).not.toContain(leaver.employeeId);
    expect(new Set(told.map((notice) => notice.recipient)).size).toBe(told.length);
    expect(told[0].params).toMatchObject({ planId: bare.planId, adminCount: 0 });
    // The file is not held back by it (QĐ-110e): it is read as it was.
    await h.readCase(recorded.id).expect(200);
  });

  it('tells nobody when another IT Admin who works also administers the plan', async () => {
    const leaver = await itAdmin();
    const colleague = await itAdmin();
    const shared = await planAdministeredBy(leaver, colleague);
    await h.recordedCase(leaver, { accessBlockMode: 'BLOCK_NOW', lastWorkingDay: undefined });

    await announce();

    expect(await warnings(shared.planId)).toEqual([]);
  });
});
