import { randomUUID } from 'node:crypto';
import { TransactionRunner, type DbTx } from '../../../src/infrastructure/database/transaction-runner';
import type { AuthenticatedPrincipal } from '../../../src/infrastructure/security/tokens/access-token-verifier.port';
import { LicensingDepartmentToolsApi } from '../../../src/modules/licensing/public/licensing-department-tools.api';
import {
  DepartmentSoftwareNotInCatalogError,
  ToolsDepartmentNotFoundError,
} from '../../../src/modules/licensing/public/licensing.errors';
import { RequestHarness, type Department, type Person } from '../../support/request-harness';

const h = new RequestHarness();

/**
 * DS.4 (`QĐ-111c`, SPEC FE IN-1): `LicensingDepartmentToolsApi.addDepartmentSoftwareFromCatalogLink`, what the link of a request to the catalog calls
 * when the IT Admin ticks "add to the list of the department", in the transaction of the caller, on real PostgreSQL.
 */
describe('the facade that adds software to the list of a department from the link to the catalog (integration, real PostgreSQL)', () => {
  let design: Department;
  let itAdmin: Person;

  /** The IT Admin as the module that links the request has them: the account with the role it holds. */
  const actor = (): AuthenticatedPrincipal => ({
    subject: itAdmin.account.appUserId,
    appUserId: itAdmin.account.appUserId,
    sessionId: randomUUID(),
    employeeId: itAdmin.employeeId,
    directRoles: ['IT_ADMIN'],
    roles: ['IT_ADMIN'],
  });
  const api = () => h.ctx.app.get(LicensingDepartmentToolsApi);
  const run = <T>(work: (tx: DbTx) => Promise<T>): Promise<T> => h.ctx.app.get(TransactionRunner).run(work);
  const link = (
    tx: DbTx,
    place: { applicationId: string; planId: string | null },
    extra: { note?: string; department?: string } = {},
  ) =>
    api().addDepartmentSoftwareFromCatalogLink(tx, actor(), {
      departmentId: extra.department ?? design.id,
      applicationId: place.applicationId,
      planId: place.planId,
      note: extra.note ?? null,
    });
  const place = async (): Promise<{ applicationId: string; planId: string }> => {
    const planId = await h.plan('K1');
    const { rows } = await h.ctx.sql.query<{ application_id: string }>(
      'SELECT application_id FROM plans WHERE id = $1',
      [planId],
    );

    return { applicationId: rows[0].application_id, planId };
  };
  const entries = async (applicationId: string) =>
    (
      await h.ctx.sql.query<{ id: string; plan_id: string | null; note: string | null; added_by_app_user_id: string }>(
        'SELECT id, plan_id, note, added_by_app_user_id FROM department_software_entries WHERE department_id = $1 AND application_id = $2 ORDER BY plan_id NULLS FIRST',
        [design.id, applicationId],
      )
    ).rows;
  const audits = async (entryId: string): Promise<string[]> =>
    (
      await h.ctx.sql.query<{ action: string }>('SELECT action FROM audit_events WHERE resource_id = $1', [entryId])
    ).rows.map((row) => row.action);

  beforeAll(async () => {
    await h.start();
    design = await h.departmentWithUnit('P-DSF-D');
    itAdmin = await h.staff(design, 'DSF-D-IT', 'IT_ADMIN');
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  it('puts the place in the list with the note and the IT Admin who ticked, audits it once, and says it was added', async () => {
    const here = await place();

    const result = await run((tx) => link(tx, here, { note: 'linked from a request' }));

    expect(result.added).toBe(true);
    const [row] = await entries(here.applicationId);
    expect(row).toMatchObject({ id: result.entryId, plan_id: here.planId, note: 'linked from a request' });
    expect(row.added_by_app_user_id).toBe(itAdmin.account.appUserId);
    expect(await audits(result.entryId)).toEqual(['DEPARTMENT_SOFTWARE.ENTRY_ADDED']);
  });

  it('answers the entry that is there when the place is listed already, adds and audits nothing, and leaves the transaction of the caller alive', async () => {
    const here = await place();
    const other = await place();
    const first = await run((tx) => link(tx, here));

    const again = await run(async (tx) => {
      const same = await link(tx, here, { note: 'a second note is not kept' });
      // A duplicate must not abort the transaction: the caller goes on writing.
      const next = await link(tx, other);

      return { same, next };
    });

    expect(again.same).toEqual({ entryId: first.entryId, added: false });
    expect(again.next.added).toBe(true);
    expect((await entries(here.applicationId)).map((row) => row.note)).toEqual([null]);
    expect(await audits(first.entryId)).toEqual(['DEPARTMENT_SOFTWARE.ENTRY_ADDED']);
  });

  it('counts an application alone and the same application with a plan as two places', async () => {
    const here = await place();

    const alone = await run((tx) => link(tx, { applicationId: here.applicationId, planId: null }));
    const withPlan = await run((tx) => link(tx, here));
    const aloneAgain = await run((tx) => link(tx, { applicationId: here.applicationId, planId: null }));

    expect(alone.added && withPlan.added).toBe(true);
    expect(aloneAgain).toEqual({ entryId: alone.entryId, added: false });
  });

  it('is kept or lost with the transaction of the caller, not before', async () => {
    const here = await place();

    await expect(
      run(async (tx) => {
        await link(tx, here);
        throw new Error('the caller fails after the link');
      }),
    ).rejects.toThrow('the caller fails after the link');

    expect(await entries(here.applicationId)).toEqual([]);
  });

  it('refuses what the catalog does not offer, naming the place, and writes nothing', async () => {
    const one = await place();
    const two = await place();
    const retired = await place();
    await h.ctx.sql.query(`UPDATE applications SET catalog_status = 'RETIRED', retired_at = now() WHERE id = $1`, [
      retired.applicationId,
    ]);

    for (const outside of [
      { applicationId: randomUUID(), planId: null },
      { applicationId: retired.applicationId, planId: retired.planId },
      { applicationId: one.applicationId, planId: two.planId },
    ]) {
      const refused = await run((tx) => link(tx, outside)).catch((error: unknown) => error);

      expect(refused).toBeInstanceOf(DepartmentSoftwareNotInCatalogError);
      expect((refused as DepartmentSoftwareNotInCatalogError).places).toEqual([outside]);
    }
    expect(await entries(retired.applicationId)).toEqual([]);
    expect(await entries(one.applicationId)).toEqual([]);
  });

  it('refuses a department that does not exist', async () => {
    const here = await place();

    await expect(run((tx) => link(tx, here, { department: randomUUID() }))).rejects.toBeInstanceOf(
      ToolsDepartmentNotFoundError,
    );
  });

  it('leaves one entry when two requests link the same software together: one adds it, the other finds it', async () => {
    const here = await place();

    const results = await Promise.all([run((tx) => link(tx, here)), run((tx) => link(tx, here))]);

    expect(results.filter((result) => result.added)).toHaveLength(1);
    expect(new Set(results.map((result) => result.entryId)).size).toBe(1);
    expect(await entries(here.applicationId)).toHaveLength(1);
  });
});
