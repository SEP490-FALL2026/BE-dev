import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { buildActivatedAccount } from '../../support/builders/account.builder';
import { PROJECT_ROOT } from '../../support/cli-process';
import { migrationEndingWith } from '../../support/migration-history';
import { OffboardingHarness } from '../../support/offboarding-harness';
import type { Department, Person } from '../../support/request-harness';

const h = new OffboardingHarness();
const TARGET = migrationEndingWith('_licensing_service_accounts_converted');
const M = 1_000_000;

interface SeatRow {
  id: string;
  kind: string;
  source: string;
  employee_id: string;
  cost_center_id: string | null;
  owning_department_id: string | null;
  account_identifier: string;
  is_machine_account: boolean;
  machine_account_note: string | null;
  valid_from: string;
  valid_until: string | null;
  predecessor_id: string | null;
  plan_id: string;
  subscription_id: string | null;
}

/**
 * `QĐ-110m`, `R-9`, Q2 (X-SA.1b): the data migration that ends what the earlier releases held as a service account and writes it again as a
 * personal seat of an IT Admin flagged as a machine account, closes the requests for a service account that were still open (what was held
 * for them goes back to the budget) and removes the unsent drafts of that kind. Real PostgreSQL: the migration file is run on a database
 * that already holds the whole history, with rows as an older release wrote them (a service account is written by SQL, a request is made
 * through the routes and then given the kind of an older release), and the notices it raises are read.
 */
describe('the migration that takes service accounts out of the scope (integration, real PostgreSQL)', () => {
  const sql = migrationSql();
  let notices: string[] = [];
  let ownerWithItAdmin: Department;
  let ownerWithoutItAdmin: Department;
  let itOne: string;
  let itTwo: string;
  let subscriptions: { seed: string; withIt: string; without: string };
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    itOne = h.it1.employeeId;
    const second = await buildActivatedAccount(h.ctx, h.seed, {
      code: 'E-IT2',
      email: 'it2@acme.vn',
      role: 'IT_ADMIN',
    });
    itTwo = second.employeeId;
    ownerWithItAdmin = await h.departmentWithUnit('P-WITH');
    ownerWithoutItAdmin = await h.departmentWithUnit('P-WITHOUT');
    await h.ctx.sql.query(`UPDATE departments SET it_admin_employee_id = $2 WHERE id = $1`, [
      ownerWithItAdmin.id,
      itTwo,
    ]);
    await h.ctx.sql.query(`UPDATE departments SET it_admin_employee_id = NULL WHERE id = $1`, [ownerWithoutItAdmin.id]);
    subscriptions = {
      seed: await h.subscription(40, 'K2'),
      withIt: await h.subscription(40, 'K2', ownerWithItAdmin.id),
      without: await h.subscription(40, 'K2', ownerWithoutItAdmin.id),
    };
    h.ctx.sql.on('notice', (notice) => notices.push(notice.message ?? ''));
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  /** Runs the migration and returns the notices it raised. */
  const migrate = async (): Promise<string[]> => {
    notices = [];
    await h.ctx.sql.query(sql);

    return notices;
  };
  const code = () => `SA-${(counter += 1)}`;
  const today = () => h.today();
  const inDays = (days: number): string => {
    const date = new Date(`${h.today()}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + days);

    return date.toISOString().slice(0, 10);
  };
  const tomorrow = () => inDays(1);

  /** A service account as an earlier release wrote it: charged to the Unit of the department that owns its subscription. */
  const serviceAccount = async (
    subscriptionId: string,
    responsible: string,
    extra: { identifier?: string; validFrom?: string; validUntil?: string | null; reason?: string } = {},
  ): Promise<string> => {
    const { rows } = await h.ctx.sql.query<{ id: string }>(
      `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id, account_identifier,
         normalized_account_identifier, reason, cost_center_id, owning_department_id, valid_from, valid_from_basis, valid_until,
         created_by_app_user_id)
       SELECT gen_random_uuid(), s.organization_id, 'SERVICE', 'REQUEST', s.plan_id, s.id, $2, $3, lower($3), $4,
              c.id, s.owner_department_id, $5, 'RECORDED', $6, $7
         FROM subscriptions s JOIN cost_centers c ON c.department_id = s.owner_department_id AND c.status = 'ACTIVE' WHERE s.id = $1
       RETURNING id`,
      [
        subscriptionId,
        responsible,
        extra.identifier ?? `bot-${code()}`,
        extra.reason ?? 'Builds the release',
        extra.validFrom ?? '2026-01-05',
        extra.validUntil ?? null,
        randomUUID(),
      ],
    );

    return rows[0].id;
  };
  const seatRow = async (id: string): Promise<SeatRow> =>
    (
      await h.ctx.sql.query<SeatRow>(
        `SELECT id, kind::text, source::text, employee_id, cost_center_id, owning_department_id, account_identifier,
                is_machine_account, machine_account_note, to_char(valid_from, 'YYYY-MM-DD') AS valid_from,
                to_char(valid_until, 'YYYY-MM-DD') AS valid_until, predecessor_id, plan_id, subscription_id
           FROM license_assignments WHERE id = $1`,
        [id],
      )
    ).rows[0];
  const successorOf = async (id: string): Promise<SeatRow | null> => {
    const { rows } = await h.ctx.sql.query<{ id: string }>(
      `SELECT id FROM license_assignments WHERE predecessor_id = $1 AND source = 'MACHINE_ACCOUNT_CONVERSION'`,
      [id],
    );

    return rows[0] ? seatRow(rows[0].id) : null;
  };
  const seatsTaken = async (subscriptionId: string, day: string): Promise<number> =>
    (
      await h.ctx.sql.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM license_assignments
          WHERE subscription_id = $1 AND valid_from <= $2::date AND (valid_until IS NULL OR valid_until > $2::date)`,
        [subscriptionId, day],
      )
    ).rows[0].n;

  describe('the service accounts that are in force', () => {
    it('writes the seat of the IT Admin who answers for it, beside the personal seat they hold on the same subscription (R-9)', async () => {
      // The personal seat of the IT Admin: written by SQL for the person of the installation (`it1`), who also answers for the bot.
      await h.ctx.sql.query(
        `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id, account_identifier,
           normalized_account_identifier, valid_from, valid_from_basis, created_by_app_user_id)
         SELECT gen_random_uuid(), s.organization_id, 'PERSONAL', 'REQUEST', s.plan_id, s.id, $2, 'it1@acme.vn', 'it1@acme.vn',
                '2026-01-05', 'RECORDED', $3
           FROM subscriptions s WHERE s.id = $1`,
        [subscriptions.seed, itOne, randomUUID()],
      );
      const bot = await serviceAccount(subscriptions.seed, itOne, { identifier: 'ci-bot-own', reason: 'CI pipeline' });
      const taken = await seatsTaken(subscriptions.seed, today());

      const told = await migrate();

      const old = await seatRow(bot);
      const next = await successorOf(bot);
      expect(old).toMatchObject({ kind: 'SERVICE', valid_until: today() });
      expect(next).toMatchObject({
        kind: 'PERSONAL',
        source: 'MACHINE_ACCOUNT_CONVERSION',
        employee_id: itOne,
        cost_center_id: null,
        owning_department_id: old.owning_department_id,
        account_identifier: 'ci-bot-own',
        is_machine_account: true,
        machine_account_note: 'CI pipeline',
        valid_from: today(),
        valid_until: null,
        predecessor_id: bot,
        plan_id: old.plan_id,
        subscription_id: old.subscription_id,
      });
      // The IT Admin holds a personal seat and a seat flagged as a machine account of one subscription at once, and no seat is counted twice.
      expect(
        (
          await h.ctx.sql.query<{ n: number }>(
            `SELECT count(*)::int AS n FROM license_assignments WHERE subscription_id = $1 AND employee_id = $2 AND kind = 'PERSONAL'
                AND valid_until IS NULL`,
            [subscriptions.seed, itOne],
          )
        ).rows[0].n,
      ).toBe(2);
      expect(await seatsTaken(subscriptions.seed, today())).toBe(taken);
      const events = await h.ctx.sql.query<{ before: { assignmentId: string }; after: { isMachineAccount: boolean } }>(
        `SELECT before, after FROM audit_events WHERE action = 'LICENSE_ASSIGNMENT.MACHINE_ACCOUNT_CONVERTED' AND resource_id = $1`,
        [next?.id],
      );
      expect(events.rows).toHaveLength(1);
      expect(events.rows[0].before.assignmentId).toBe(bot);
      expect(events.rows[0].after.isMachineAccount).toBe(true);
      expect(
        told.some((line) =>
          /service accounts in force before: \d+, converted: \d+, kept: \d+, in force after: \d+/.test(line),
        ),
      ).toBe(true);
    }, 180_000);

    it('gives the account of a person who is not an IT Admin to the IT Admin in charge of the department that owns it (Q2), or else to the first IT Admin who can act', async () => {
      const worker = await h.person(code());
      const inCharge = await serviceAccount(subscriptions.withIt, worker, { reason: 'Deploys the site' });
      const nobodyInCharge = await serviceAccount(subscriptions.without, worker, { reason: 'Runs the reports' });

      await migrate();

      expect((await successorOf(inCharge))?.employee_id).toBe(itTwo);
      // `E-IT1` comes before `E-IT2` by employee code.
      expect((await successorOf(nobodyInCharge))?.employee_id).toBe(itOne);
      expect(await successorOf(inCharge)).toMatchObject({
        machine_account_note: 'Deploys the site',
        cost_center_id: null,
      });
    }, 180_000);

    it('ends the account the day after when it began on the day of the migration, and the seat continues from that day', async () => {
      const worker = await h.person(code());
      const fresh = await serviceAccount(subscriptions.seed, worker, { validFrom: today() });
      const taken = await seatsTaken(subscriptions.seed, tomorrow());

      await migrate();

      expect(await seatRow(fresh)).toMatchObject({ valid_until: tomorrow() });
      expect(await successorOf(fresh)).toMatchObject({ valid_from: tomorrow(), valid_until: null });
      expect(await seatsTaken(subscriptions.seed, tomorrow())).toBe(taken);
    }, 180_000);

    it('keeps the end it had, and is safe to run again: a row already converted is not converted twice', async () => {
      const worker = await h.person(code());
      const ending = await serviceAccount(subscriptions.seed, worker, { validUntil: inDays(30) });

      await migrate();
      const first = await successorOf(ending);
      const countSeats = async (): Promise<number> =>
        (await h.ctx.sql.query<{ n: number }>(`SELECT count(*)::int AS n FROM license_assignments`)).rows[0].n;
      const before = await countSeats();
      await migrate();

      expect(first).toMatchObject({ valid_from: today(), valid_until: inDays(30) });
      expect(await countSeats()).toBe(before);
    }, 180_000);

    it('leaves a service account with a task still alive, a duty of handover still open, or a person with an open personnel file, and lists it', async () => {
      const taskPerson = await h.person(code());
      const withTask = await serviceAccount(subscriptions.seed, taskPerson);
      await h.ctx.sql.query(
        `INSERT INTO provisioning_tasks (id, organization_id, assignment_id, kind, channel, request_id, max_attempts, created_by_app_user_id)
         SELECT gen_random_uuid(), organization_id, id, 'GRANT', 'MANUAL', gen_random_uuid(), 4, $2 FROM license_assignments WHERE id = $1`,
        [withTask, randomUUID()],
      );
      const dutyPerson = await h.person(code());
      const withDuty = await serviceAccount(subscriptions.seed, dutyPerson);
      await h.ctx.sql.query(
        `INSERT INTO handover_duties (id, organization_id, assignment_id, employee_id, source, leaver_is_head, confirmer_role,
           data_loss, due_on, created_by_app_user_id)
         SELECT gen_random_uuid(), a.organization_id, a.id, a.employee_id, 'DEPARTURE', false, 'IT_ADMIN', true, '2026-11-20', $2
           FROM license_assignments a WHERE a.id = $1`,
        [withDuty, randomUUID()],
      );
      const unit = await h.departmentWithHead('P-SAFILE');
      const leaver = await h.worker(unit.department, code());
      await h.recordedCase(leaver);
      const withFile = await serviceAccount(subscriptions.seed, leaver.employeeId);

      const told = await migrate();

      for (const id of [withTask, withDuty, withFile]) {
        expect(await successorOf(id)).toBeNull();
        expect((await seatRow(id)).valid_until).toBeNull();
        expect(told.some((line) => line.includes(id))).toBe(true);
      }
      expect(told.find((line) => line.includes(withTask))).toContain(
        'a task of the grant or of the revocation is still alive',
      );
      expect(told.find((line) => line.includes(withDuty))).toContain('a duty of handover is still open');
      expect(told.find((line) => line.includes(withFile))).toContain('personnel file that is not closed');
    }, 240_000);

    it('leaves one that has not started yet, and one for which no IT Admin can act', async () => {
      const worker = await h.person(code());
      const future = await serviceAccount(subscriptions.seed, worker, { validFrom: tomorrow() });
      const orphan = await serviceAccount(subscriptions.without, worker);
      await h.ctx.sql.query(`UPDATE role_grants SET revoked_at = now() WHERE role = 'IT_ADMIN' AND revoked_at IS NULL`);
      try {
        const told = await migrate();

        expect(await successorOf(future)).toBeNull();
        expect(await successorOf(orphan)).toBeNull();
        expect(told.find((line) => line.includes(future))).toContain('it has not started yet');
        expect(told.find((line) => line.includes(orphan))).toContain('no IT Admin can take it');
      } finally {
        await h.ctx.sql.query(`UPDATE role_grants SET revoked_at = NULL WHERE role = 'IT_ADMIN'`);
      }
    }, 180_000);

    it('leaves the history alone: the service rows already ended and the rows that failed are not touched', async () => {
      const worker = await h.person(code());
      const ended = await serviceAccount(subscriptions.seed, worker, {
        validFrom: '2026-01-05',
        validUntil: '2026-02-01',
      });

      await migrate();

      expect(await successorOf(ended)).toBeNull();
      expect(await seatRow(ended)).toMatchObject({ kind: 'SERVICE', valid_until: '2026-02-01' });
    }, 180_000);
  });

  describe('the requests for a service account that were still open', () => {
    /** A request of the shape an earlier release wrote: made through the routes, then given the kind and the detail of a service account. */
    const asServiceAccount = async (requestId: string, responsible: string): Promise<void> => {
      await h.ctx.sql.query('BEGIN');
      try {
        await h.ctx.sql.query(`UPDATE access_requests SET type = 'SERVICE_ACCOUNT' WHERE id = $1`, [requestId]);
        await h.ctx.sql.query(
          `INSERT INTO access_request_service_accounts (request_id, purpose, expected_identifier, responsible_employee_id)
           VALUES ($1, 'Build bot of the CI pipeline', 'ci-bot-9', $2)`,
          [requestId, responsible],
        );
        await h.ctx.sql.query('COMMIT');
      } catch (error) {
        await h.ctx.sql.query('ROLLBACK');
        throw error;
      }
    };
    const requestRow = async (id: string) =>
      (
        await h.ctx.sql.query<{
          state: string;
          cancel_cause: string | null;
          cancelled_by_employee_id: string | null;
          cancelled_at: Date | null;
        }>(
          `SELECT state::text, cancel_cause::text, cancelled_by_employee_id, cancelled_at FROM access_requests WHERE id = $1`,
          [id],
        )
      ).rows[0];
    const openSteps = async (id: string) =>
      (
        await h.ctx.sql.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM access_request_steps WHERE request_id = $1 AND state IN ('PENDING', 'WAITING')`,
          [id],
        )
      ).rows[0].n;
    const commitmentOf = async (id: string) =>
      (
        await h.ctx.sql.query<{ state: string; amount_minor: string; released_minor: string; releases: number }>(
          `SELECT c.state::text, c.amount_minor::text, c.released_minor::text,
                  (SELECT count(*)::int FROM budget_commitment_releases r WHERE r.commitment_id = c.id) AS releases
             FROM budget_commitments c WHERE c.request_id = $1`,
          [id],
        )
      ).rows[0];
    /** A request for a plan of internal software: the head decides it, and it holds no money. */
    const waitingForTheHead = async (): Promise<{ id: string; person: Person }> => {
      const unit = await h.departmentWithHead(`P-SAI${(counter += 1)}`);
      const sent = await h.sent(unit.member, await h.plan('K5'));

      return { id: sent.id, person: unit.member };
    };
    /** A request for a paid plan decided by the head and the spending approver: it waits to be carried out, and its money is held. */
    const approvedAndHeld = async (): Promise<{ id: string; person: Person }> => {
      const unit = await h.departmentWithHead(`P-SAP${(counter += 1)}`);
      await h.budgetFor(unit, { total: 100 * M, held: 20 * M, spent: 40 * M });
      const plan = await h.planOf(await h.subscription(10, 'K2'));
      await h
        .declareTaxProfile((await h.vendorOf(plan)).id, [{ taxType: 'GTGT', ratePercent: '10', deductible: true }])
        .expect(200);
      const sent = await h.sent(unit.member, plan, { termMonths: 1 });
      await h.decide(sent.id, { decision: 'APPROVE' }, unit.head.account).expect(200);
      await h.setPayments(sent.id, { amount: 5 * M });
      await h.sendOn([sent.id], unit.head.account).expect(201);
      await h.decideSpend(sent.id, { decision: 'APPROVE' }, h.boss.account).expect(200);

      return { id: sent.id, person: unit.member };
    };

    it('closes a request that waits for the head with the cause SYSTEM_SCOPE_REMOVED, nobody having closed it, and its steps closed', async () => {
      const { id, person } = await waitingForTheHead();
      await asServiceAccount(id, person.employeeId);
      expect(await openSteps(id)).toBeGreaterThan(0);

      await migrate();

      expect(await requestRow(id)).toMatchObject({
        state: 'CANCELLED',
        cancel_cause: 'SYSTEM_SCOPE_REMOVED',
        cancelled_by_employee_id: null,
      });
      expect((await requestRow(id)).cancelled_at).not.toBeNull();
      expect(await openSteps(id)).toBe(0);
    }, 240_000);

    it('closes a request that waits to be carried out and gives back what was held for it, once', async () => {
      const { id, person } = await approvedAndHeld();
      expect(await commitmentOf(id)).toMatchObject({ state: 'HELD', releases: 0 });
      await asServiceAccount(id, person.employeeId);
      const held = (await commitmentOf(id)).amount_minor;

      await migrate();

      expect(await requestRow(id)).toMatchObject({ state: 'CANCELLED', cancel_cause: 'SYSTEM_SCOPE_REMOVED' });
      expect(await commitmentOf(id)).toEqual({
        state: 'RELEASED',
        amount_minor: held,
        released_minor: held,
        releases: 1,
      });
      const release = await h.ctx.sql.query<{ reason: string; amount_minor: string }>(
        `SELECT r.reason::text, r.amount_minor::text FROM budget_commitment_releases r
           JOIN budget_commitments c ON c.id = r.commitment_id WHERE c.request_id = $1`,
        [id],
      );
      expect(release.rows).toEqual([{ reason: 'REQUEST_CANCELLED', amount_minor: held }]);
      await migrate();
      expect((await commitmentOf(id)).releases).toBe(1);
    }, 240_000);

    it('leaves a request whose grant is under way, or whose money became an expense, and lists it', async () => {
      const grant = await waitingForTheHead();
      await asServiceAccount(grant.id, grant.person.employeeId);
      await h.ctx.sql.query(`UPDATE access_requests SET state = 'EXECUTING' WHERE id = $1`, [grant.id]);
      const spent = await approvedAndHeld();
      await asServiceAccount(spent.id, spent.person.employeeId);
      await h.ctx.sql.query(`UPDATE budget_commitments SET applied_minor = 1 WHERE request_id = $1`, [spent.id]);

      const told = await migrate();

      expect((await requestRow(grant.id)).state).toBe('EXECUTING');
      expect((await requestRow(spent.id)).state).toBe('AWAITING_EXECUTION');
      expect(await commitmentOf(spent.id)).toMatchObject({ state: 'HELD', releases: 0 });
      expect(told.find((line) => line.includes(grant.id))).toContain('its grant is under way');
      expect(told.find((line) => line.includes(spent.id))).toContain('became an expense');
      expect(
        told.some((line) =>
          /requests for a service account open before: \d+, cancelled as SYSTEM_SCOPE_REMOVED: \d+/.test(line),
        ),
      ).toBe(true);
    }, 240_000);

    it('does not touch a request of any other kind', async () => {
      const { id } = await waitingForTheHead();

      await migrate();

      expect((await requestRow(id)).state).not.toBe('CANCELLED');
      expect(await openSteps(id)).toBeGreaterThan(0);
    }, 180_000);
  });

  describe('the drafts of a request for a service account', () => {
    it('removes the draft of that kind, with its rows, and leaves the draft of any other kind', async () => {
      const unit = await h.departmentWithHead(`P-SAD${(counter += 1)}`);
      const plan = await h.plan('K5');
      const save = async (): Promise<string> => {
        const response = await request(h.server())
          .post('/api/v1/access-requests/drafts')
          .set(h.as(unit.member.account))
          .send({ kind: 'INDIVIDUAL', ...h.form(plan) })
          .expect(201);

        return h.dataOf<{ draft: { id: string } }>(response).draft.id;
      };
      const old = await save();
      const other = await save();
      await h.ctx.sql.query(
        `UPDATE access_requests SET policy = jsonb_set(policy, '{draft,kind}', '"SERVICE_ACCOUNT"') WHERE id = $1`,
        [old],
      );

      const told = await migrate();

      const left = await h.ctx.sql.query<{ id: string }>(`SELECT id FROM access_requests WHERE id = ANY($1::uuid[])`, [
        [old, other],
      ]);
      expect(left.rows.map((row) => row.id)).toEqual([other]);
      expect(
        told.some((line) => /drafts of a request for a service account before: \d+, removed: \d+/.test(line)),
      ).toBe(true);
    }, 240_000);
  });
});

function migrationSql(): string {
  return readFileSync(join(PROJECT_ROOT, 'prisma', 'migrations', TARGET, 'migration.sql'), 'utf8');
}
