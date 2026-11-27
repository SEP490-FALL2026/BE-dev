import { randomUUID } from 'node:crypto';
import {
  NotificationNameContributions,
  type NameKind,
} from '../../../src/modules/notifications/public/notifications.extension-points';
import type { Unit } from '../../support/spend-harness';
import { StatusHarness } from '../../support/status-harness';

const h = new StatusHarness();
const M = 1_000_000;

/**
 * N5b over PostgreSQL: the owners of the tables answer for the names a notification sentence calls (employee, department, Cost Center,
 * application, plan, subscription, Request) through `notifications.name-sources`, in the API graph, one read per kind.
 */
describe('notification name sources over PostgreSQL (N5b)', () => {
  let unit: Unit;
  let subscriptionId: string;
  let planId: string;
  const sources = () => h.ctx.app.get(NotificationNameContributions, { strict: false });
  const namesOf = async (kind: NameKind, ids: string[]): Promise<Record<string, string>> => {
    const owners = sources()
      .all()
      .filter((source) => source.kinds.includes(kind));
    expect(owners).toHaveLength(1);

    return Object.fromEntries(await owners[0].names(kind, ids));
  };
  const one = async (sql: string, values: unknown[]): Promise<Record<string, string>> =>
    (await h.ctx.sql.query<Record<string, string>>(sql, values)).rows[0];

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    subscriptionId = await h.subscription(10);
    planId = await h.planOf(subscriptionId);
    await h
      .declareTaxProfile((await h.vendorOf(planId)).id, [{ taxType: 'GTGT', ratePercent: '10', deductible: true }])
      .expect(200);
    unit = await h.departmentWithHead('P-N5B');
    await h.budgetFor(unit, { total: 100 * M, held: 20 * M, spent: 40 * M });
    await h.setItAdminInCharge(unit.department, { employeeId: h.it1.employeeId, account: h.it1 });
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  it('is registered once for each of the nine kinds in the API graph', () => {
    const kinds = sources()
      .all()
      .flatMap((source) => [...source.kinds])
      .sort();

    expect(kinds).toEqual([
      'APPLICATION',
      'COST_CENTER',
      'DEPARTMENT',
      'EMPLOYEE',
      'LICENSE_LOT',
      'PLAN',
      'REQUEST',
      'SUBSCRIPTION',
      'WORKSPACE',
    ]);
  });

  it('names an employee by their full name and a department by its name, leaving out ids that do not exist', async () => {
    const employeeId = unit.head.employeeId;
    const employee = await one('SELECT full_name AS name FROM employees WHERE id = $1', [employeeId]);
    const department = await one('SELECT name FROM departments WHERE id = $1', [unit.department.id]);

    expect(await namesOf('EMPLOYEE', [employeeId, randomUUID(), 'not-a-uuid'])).toEqual({
      [employeeId]: employee.name,
    });
    expect(await namesOf('DEPARTMENT', [unit.department.id, randomUUID(), ''])).toEqual({
      [unit.department.id]: department.name,
    });
  });

  it('names a Cost Center by its code and name', async () => {
    const costCenter = await one('SELECT code, name FROM cost_centers WHERE id = $1', [unit.department.unitId]);

    expect(await namesOf('COST_CENTER', [unit.department.unitId, randomUUID()])).toEqual({
      [unit.department.unitId]: `${costCenter.code} · ${costCenter.name}`,
    });
  });

  it('names an application by its name, and a plan and a subscription by "application – plan"', async () => {
    const row = await one(
      `SELECT a.id AS application_id, a.name AS application, p.name AS plan
         FROM plans p JOIN applications a ON a.id = p.application_id WHERE p.id = $1`,
      [planId],
    );

    expect(await namesOf('APPLICATION', [row.application_id, randomUUID()])).toEqual({
      [row.application_id]: row.application,
    });
    expect(await namesOf('PLAN', [planId, randomUUID()])).toEqual({ [planId]: `${row.application} – ${row.plan}` });
    expect(await namesOf('SUBSCRIPTION', [subscriptionId, randomUUID()])).toEqual({
      [subscriptionId]: `${row.application} – ${row.plan}`,
    });
  });

  it('names a Request by its application and plan, or by the software proposed, and leaves out one that does not exist', async () => {
    const sent = await h.sent(unit.member, planId, { termMonths: 1 });
    const proposed = await h.proposed(unit.member);
    const row = await one(
      `SELECT a.name AS application, p.name AS plan
         FROM plans p JOIN applications a ON a.id = p.application_id WHERE p.id = $1`,
      [planId],
    );

    expect(await namesOf('REQUEST', [sent.id, proposed.id, randomUUID(), 'not-a-uuid'])).toEqual({
      [sent.id]: `${row.application} – ${row.plan}`,
      [proposed.id]: 'Miro',
    });
  });
});
