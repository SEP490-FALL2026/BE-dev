import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { PROJECT_ROOT, stopCliProcesses } from '../../support/cli-process';
import { dropDisposableDatabase, provisionDisposableDatabase } from '../../support/disposable-database';
import {
  DEPLOY_TIMEOUT_MS,
  deployMigrations,
  migrationBefore,
  migrationEndingWith,
} from '../../support/migration-history';

const TARGET = migrationEndingWith('_application_responsible_it_admin');
const sqlOf = (directory: string): string =>
  readFileSync(join(PROJECT_ROOT, 'prisma', 'migrations', directory, 'migration.sql'), 'utf8');

/**
 * QĐ-111g: the migration that gives an application the IT Admin who answers for it, on an installation that already holds applications.
 * The history before it is replayed, applications are written the way they were (with the audit event of their creation), and then the
 * migration runs: the creator becomes the responsible IT Admin only while they are a usable IT Admin, by the test of
 * `IdentityAccessApi.findUsableItAdminEmployeeIds` (account ACTIVE and ACTIVATED, an IT_ADMIN grant not revoked); every other application
 * stays NULL, which is read as "needs a responsible IT Admin".
 */
describe('the migration of the responsible IT Admin of an application (integration, real PostgreSQL)', () => {
  it(
    'backfills the creator only while they are a usable IT Admin, leaves the others NULL, and keeps the foreign key',
    async () => {
      const database = await provisionDisposableDatabase();
      const sql = new Client({ connectionString: database.url });
      await sql.connect();
      try {
        const before = await deployMigrations(database, { through: migrationBefore(TARGET) });
        if (before.code !== 0) throw new Error(`Deploying the history before the migration failed: ${before.stdout}`);
        const organizationId = randomUUID();
        await sql.query(
          `INSERT INTO organizations (id, name, time_zone, reporting_currency) VALUES ($1, 'Acme', 'UTC', 'VND')`,
          [organizationId],
        );
        const person = async (code: string): Promise<string> => {
          const id = randomUUID();
          await sql.query(
            `INSERT INTO employees (id, organization_id, employee_code, full_name, employment_type, hire_date, updated_at)
             VALUES ($1, $2, $3, $3, 'STAFF', '2026-01-01', now())`,
            [id, organizationId, code],
          );

          return id;
        };
        /** An account of the person; `grant` is the role granted and `revoked` whether the grant was taken back. */
        const account = async (
          employeeId: string,
          over: { status?: string; activation?: string; role?: string | null; revoked?: boolean } = {},
        ): Promise<string> => {
          const id = randomUUID();
          await sql.query(
            `INSERT INTO app_users (id, organization_id, employee_id, login_email, normalized_login_email, status, activation_state, updated_at)
             VALUES ($1, $2, $3, $4, $4, $5::"AppUserStatus", $6::"ActivationState", now())`,
            [id, organizationId, employeeId, `${id}@acme.vn`, over.status ?? 'ACTIVE', over.activation ?? 'ACTIVATED'],
          );
          const role = over.role === undefined ? 'IT_ADMIN' : over.role;
          if (role) {
            await sql.query(
              `INSERT INTO role_grants (id, organization_id, app_user_id, role, revoked_at)
               VALUES ($1, $2, $3, $4::"AppRole", $5)`,
              [randomUUID(), organizationId, id, role, over.revoked ? new Date() : null],
            );
          }

          return id;
        };
        /** An application, and the audit event of its creation by the account (none when `actor` is null). */
        const application = async (name: string, actor: string | null, action = 'APPLICATION.CREATED') => {
          const id = randomUUID();
          await sql.query(
            `INSERT INTO applications (id, organization_id, kind, name, normalized_name, data_sensitivity,
               comm_person_to_person_messaging, comm_calls_or_meetings, comm_mailbox, is_communication_service)
             VALUES ($1, $2, 'INTERNAL', $3, $3, 'LOW', false, false, false, false)`,
            [id, organizationId, name],
          );
          await sql.query(
            `INSERT INTO audit_events (id, organization_id, actor_kind, actor_app_user_id, actor_roles, action, resource_type, resource_id, correlation_id)
             VALUES ($1, $2, $3::"AuditActorKind", $4, ARRAY['IT_ADMIN'], $5, 'Application', $6, $7)`,
            [randomUUID(), organizationId, actor ? 'USER' : 'SYSTEM', actor, action, id, randomUUID()],
          );

          return id;
        };

        const usable = await person('E-USABLE');
        const revoked = await person('E-REVOKED');
        const locked = await person('E-LOCKED');
        const invited = await person('E-INVITED');
        const notIt = await person('E-NOT-IT');
        const usableAccount = await account(usable);
        const revokedAccount = await account(revoked, { revoked: true });
        const lockedAccount = await account(locked, { status: 'LOCKED' });
        const invitedAccount = await account(invited, { activation: 'INVITED' });
        const notItAccount = await account(notIt, { role: 'EMPLOYEE' });
        const byUsable = await application('By usable IT Admin', usableAccount);
        const byRevoked = await application('By revoked grant', revokedAccount);
        const byLocked = await application('By locked account', lockedAccount);
        const byInvited = await application('By invited account', invitedAccount);
        const byNotIt = await application('By not IT Admin', notItAccount);
        const bySystem = await application('By the system', null);
        const otherEvent = await application('Another event', usableAccount, 'APPLICATION.UPDATED');

        await sql.query(sqlOf(TARGET));

        const responsible = async (id: string): Promise<string | null> =>
          (
            await sql.query<{ r: string | null }>(
              `SELECT responsible_it_admin_employee_id AS r FROM applications WHERE id = $1`,
              [id],
            )
          ).rows[0].r;
        expect(await responsible(byUsable)).toBe(usable);
        for (const id of [byRevoked, byLocked, byInvited, byNotIt, bySystem, otherEvent]) {
          expect(await responsible(id)).toBeNull();
        }
        // The same set the test of the function gives: the creators that are usable IT Admins now.
        const usableNow = await sql.query<{ employee_id: string }>(
          `SELECT u.employee_id FROM app_users u
           WHERE u.status = 'ACTIVE' AND u.activation_state = 'ACTIVATED'
             AND EXISTS (SELECT 1 FROM role_grants g WHERE g.app_user_id = u.id AND g.role = 'IT_ADMIN' AND g.revoked_at IS NULL)`,
        );
        const filled = await sql.query<{ r: string }>(
          `SELECT DISTINCT responsible_it_admin_employee_id AS r FROM applications WHERE responsible_it_admin_employee_id IS NOT NULL`,
        );
        expect(filled.rows.map((row) => row.r).sort()).toEqual(usableNow.rows.map((row) => row.employee_id).sort());

        // The foreign key is in force: a person who does not exist cannot be named.
        await expect(
          sql.query(`UPDATE applications SET responsible_it_admin_employee_id = $1 WHERE id = $2`, [
            randomUUID(),
            byUsable,
          ]),
        ).rejects.toMatchObject({ code: '23503' });
      } finally {
        await sql.end();
        await dropDisposableDatabase(database);
        stopCliProcesses();
      }
    },
    DEPLOY_TIMEOUT_MS + 60_000,
  );
});
