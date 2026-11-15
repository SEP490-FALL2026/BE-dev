import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { TransactionRunner } from '../../../src/infrastructure/database/transaction-runner';
import { INITIAL_CHANGE_NOTE, INITIAL_POLICIES } from '../../../src/modules/policies/initial/initial-policies.policy';
import { policyContentJson } from '../../../src/modules/policies/library/library.json';
import { PoliciesBootstrapApi } from '../../../src/modules/policies/public/policies-bootstrap.api';
import { bodyOf } from '../../support/api-body';
import { AccountManagementHttpHarness, dataOf } from '../../support/account-management-http-harness';

const h = new AccountManagementHttpHarness();

const BACKFILL = readFileSync(
  join(__dirname, '../../../prisma/migrations/20261113100300_fixlb1_policies_backfill/migration.sql'),
  'utf8',
);

/**
 * The library of policies against real PostgreSQL (`PL-1`, FIX-LB1 LB1-01, LB1-06): the constraints and triggers of the three tables, the
 * lock that makes drafts and publications follow each other, an acknowledgement said twice, the seed and the backfill that never write twice.
 */
describe('policy library (integration, real PostgreSQL)', () => {
  const count = async (sql: string, values: unknown[] = []): Promise<number> =>
    Number((await h.ctx.sql.query<{ n: string }>(sql, values)).rows[0]?.n);
  const policiesOfOrganization = () =>
    count('SELECT count(*) AS n FROM policies WHERE organization_id = $1', [h.seed.organizationId]);
  const versionsOfOrganization = () =>
    count('SELECT count(*) AS n FROM policy_versions WHERE organization_id = $1', [h.seed.organizationId]);
  const policyId = async (code: string) =>
    (
      await h.ctx.sql.query<{ id: string }>('SELECT id FROM policies WHERE organization_id = $1 AND code = $2', [
        h.seed.organizationId,
        code,
      ])
    ).rows[0].id;

  beforeAll(async () => {
    await h.start();
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  describe('the seed and the backfill', () => {
    it('has the eight policies with version one in force for the installed organization', async () => {
      expect(await policiesOfOrganization()).toBe(8);
      expect(
        await count('SELECT count(*) AS n FROM policy_versions WHERE organization_id = $1 AND version_number = 1', [
          h.seed.organizationId,
        ]),
      ).toBe(8);
    });

    it('writes nothing the second time the set is seeded', async () => {
      const runner = h.ctx.app.get(TransactionRunner);
      const bootstrap = h.ctx.app.get(PoliciesBootstrapApi, { strict: false });

      const again = await runner.run((tx) => bootstrap.seedInitialPolicies(tx, h.seed.organizationId));

      expect(again).toEqual({ policiesCreated: 0, versionsPublished: 0 });
      expect(await policiesOfOrganization()).toBe(8);
      expect(await versionsOfOrganization()).toBe(8);
    });

    it('gives an organization that has none the same eight policies from the backfill, and writes nothing the second time or over a later version (LB1-01)', async () => {
      const sql = h.ctx.sql;
      await sql.query('ALTER TABLE policy_versions DISABLE TRIGGER USER');
      await sql.query('DELETE FROM policy_acknowledgements');
      await sql.query('DELETE FROM policy_versions');
      await sql.query('DELETE FROM policies');
      await sql.query('ALTER TABLE policy_versions ENABLE TRIGGER USER');

      await sql.query(BACKFILL);

      expect(await policiesOfOrganization()).toBe(8);
      const rows = (
        await sql.query<{
          code: string;
          title: string;
          roles: string[];
          content: unknown;
          change_note: string;
          again: boolean;
          n: number;
        }>(
          `SELECT p.code, v.title, v.applicable_roles::text[] AS roles, v.content, v.change_note, v.requires_reacknowledgement AS again, v.version_number AS n
             FROM policies p JOIN policy_versions v ON v.policy_id = p.id WHERE p.organization_id = $1 ORDER BY p.code`,
          [h.seed.organizationId],
        )
      ).rows;
      expect(rows).toHaveLength(8);
      for (const initial of INITIAL_POLICIES) {
        const row = rows.find((candidate) => candidate.code === initial.code)!;
        expect(row.title).toBe(initial.title);
        expect([...row.roles].sort()).toEqual([...initial.applicableRoles].sort());
        expect(policyContentJson.decode(row.content)).toEqual(initial.content);
        expect([row.change_note, row.again, row.n]).toEqual([INITIAL_CHANGE_NOTE, true, 1]);
      }

      await sql.query(BACKFILL);
      expect(await versionsOfOrganization()).toBe(8);

      await h.admin.put('/api/v1/policies/POL-GEN/draft', {}).expect(200);
      await h.admin
        .post('/api/v1/policies/POL-GEN/draft/publish', {
          changeNote: 'Quyết định số 05',
          applicableRoles: ['EMPLOYEE'],
        })
        .expect(201);
      await sql.query(BACKFILL);
      expect(await versionsOfOrganization()).toBe(9);
    });
  });

  describe('the constraints and triggers', () => {
    const rejects = async (statement: string, values: unknown[], message: RegExp) =>
      expect(h.ctx.sql.query(statement, values)).rejects.toThrow(message);

    it('never changes or deletes a published version, and never truncates the acknowledgements', async () => {
      const id = await policyId('POL-MF2');
      await rejects(
        `UPDATE policy_versions SET title = 'x' WHERE policy_id = $1 AND version_number = 1`,
        [id],
        /never changed or deleted/,
      );
      await rejects(
        'DELETE FROM policy_versions WHERE policy_id = $1 AND version_number = 1',
        [id],
        /never changed or deleted/,
      );
      await rejects('TRUNCATE policy_acknowledgements', [], /append-only/);
    });

    it('holds one draft per policy, and a published version names a role, a ground and no Super Admin', async () => {
      const id = await policyId('POL-MF3');
      const draft = `INSERT INTO policy_versions (id, organization_id, policy_id, title, content, applicable_roles, updated_at)
                     VALUES (gen_random_uuid(), $1, $2, 't', '{}', '{MANAGER}', now())`;
      await h.ctx.sql.query(draft, [h.seed.organizationId, id]);
      await rejects(draft, [h.seed.organizationId, id], /policy_versions_one_draft/);
      const publish = (set: string) =>
        `UPDATE policy_versions SET version_number = 2, published_at = now(), ${set} WHERE policy_id = $1 AND version_number IS NULL`;
      await rejects(publish(`change_note = '   '`), [id], /policy_versions_draft_or_published/);
      await rejects(publish(`change_note = 'x', applicable_roles = '{}'`), [id], /policy_versions_draft_or_published/);
      await rejects(
        publish(`change_note = 'x', applicable_roles = '{SUPER_ADMIN,MANAGER}'`),
        [id],
        /policy_versions_no_super_admin/,
      );
      await h.ctx.sql.query('DELETE FROM policy_versions WHERE policy_id = $1 AND version_number IS NULL', [id]);
    });
  });

  describe('drafts and publications', () => {
    it('keeps one draft however many writes arrive together, and refuses a text that adds or drops a decision step (LB1-05)', async () => {
      const results = await Promise.all([1, 2, 3].map(() => h.admin.put('/api/v1/policies/POL-MF4/draft', {})));

      expect(results.map((response) => response.status)).toEqual([200, 200, 200]);
      expect(
        await count('SELECT count(*) AS n FROM policy_versions WHERE policy_id = $1 AND version_number IS NULL', [
          await policyId('POL-MF4'),
        ]),
      ).toBe(1);
      const draft = dataOf<{ content: { steps: { checklist: { code: string; check: string }[] }[] } }>(
        await h.admin.get('/api/v1/policies/POL-MF4/draft').expect(200),
      );
      const noStep = await h.admin
        .put('/api/v1/policies/POL-MF4/draft', { content: { ...draft.content, steps: [] } })
        .expect(422);
      expect(bodyOf(noStep).error).toMatchObject({ code: 'POLICY.STEP_SET_FIXED', details: { removed: ['4.7'] } });
      const promoted = {
        ...draft.content,
        steps: draft.content.steps.map((step: { checklist: { code: string; check: string }[] }) => ({
          ...step,
          checklist: step.checklist.map((item) => ({ ...item, check: 'SYSTEM' })),
        })),
      };
      const system = await h.admin.put('/api/v1/policies/POL-MF4/draft', { content: promoted }).expect(422);
      expect(bodyOf(system).error.code).toBe('POLICY.SYSTEM_ITEM_UNKNOWN');
      await h.admin.delete('/api/v1/policies/POL-MF4/draft').expect(200);
    });

    it('numbers versions one after the other, publishes a draft once, and names who published each (LB1-04)', async () => {
      await h.admin.put('/api/v1/policies/POL-MF5/draft', {}).expect(200);
      const body = {
        changeNote: 'Quyết định số 07',
        applicableRoles: ['MANAGER', 'IT_ADMIN'],
        requiresReacknowledgement: false,
      };

      const two = await Promise.all([
        h.admin.post('/api/v1/policies/POL-MF5/draft/publish', body),
        h.admin.post('/api/v1/policies/POL-MF5/draft/publish', body),
      ]);

      expect(two.map((response) => response.status).sort()).toEqual([201, 404]);
      await h.admin.put('/api/v1/policies/POL-MF5/draft', {}).expect(200);
      expect(
        dataOf<{ versionNumber: number }>(
          await h.admin.post('/api/v1/policies/POL-MF5/draft/publish', body).expect(201),
        ).versionNumber,
      ).toBe(3);
      const history = dataOf<{ items: { versionNumber: number; publishedByAppUserId: string | null }[] }>(
        await h.admin.get('/api/v1/policies/POL-MF5/versions').expect(200),
      ).items;
      expect(history.map((item: { versionNumber: number }) => item.versionNumber)).toEqual([3, 2, 1]);
      expect(history.map((item: { publishedByAppUserId: string | null }) => item.publishedByAppUserId)).toEqual([
        h.seed.superAdmin.appUserId,
        h.seed.superAdmin.appUserId,
        null,
      ]);
    });

    it('tells every account of the applicable roles once, in the same step as the publication', async () => {
      const holder = await h.activatedAccount(['EMPLOYEE']);
      await h.admin.put('/api/v1/policies/POL-GEN/draft', {}).expect(200);
      const published = dataOf<{ notified: number }>(
        await h.admin
          .post('/api/v1/policies/POL-GEN/draft/publish', {
            changeNote: 'Quyết định số 09',
            applicableRoles: ['EMPLOYEE'],
          })
          .expect(201),
      );

      const told = await count(
        `SELECT count(*) AS n FROM in_app_notifications WHERE code = 'POLICY_PUBLISHED' AND recipient_employee_id = $1`,
        [holder.employeeId],
      );
      const employees = await count(
        `SELECT count(DISTINCT u.employee_id) AS n FROM app_users u JOIN role_grants g ON g.app_user_id = u.id
          WHERE g.role = 'EMPLOYEE' AND g.revoked_at IS NULL AND u.status = 'ACTIVE' AND u.activation_state = 'ACTIVATED'`,
      );
      expect(told).toBe(1);
      expect(published.notified).toBe(employees);
    });
  });

  describe('the acknowledgement', () => {
    it('is one row however many times it is said, and GET /me lists what is still owed (QĐ-111ar)', async () => {
      const account = await h.activatedAccount(['MANAGER']);
      const { token } = await h.signIn(account.email, account.password);
      const as = (req: request.Test) => req.set(h.as(token));
      const owed = async (): Promise<string[]> =>
        dataOf<{ pendingPolicyAcknowledgements: { code: string }[] }>(
          await as(request(h.server()).get('/api/v1/me')).expect(200),
        ).pendingPolicyAcknowledgements.map((row) => row.code);
      const before = await owed();
      // POL-GEN was published again above for the employees alone, so a head no longer owes it.
      expect(before).toEqual(expect.arrayContaining(['POL-MF1', 'POL-MF2']));
      expect(before).not.toContain('POL-GEN');

      const first = await as(request(h.server()).post('/api/v1/policies/POL-MF1/acknowledgements')).expect(201);
      const second = await as(request(h.server()).post('/api/v1/policies/POL-MF1/acknowledgements')).expect(201);

      expect([
        dataOf<{ alreadyAcknowledged: boolean }>(first).alreadyAcknowledged,
        dataOf<{ alreadyAcknowledged: boolean }>(second).alreadyAcknowledged,
      ]).toEqual([false, true]);
      expect(
        await count('SELECT count(*) AS n FROM policy_acknowledgements WHERE app_user_id = $1', [account.appUserId]),
      ).toBe(1);
      expect(await owed()).toEqual(before.filter((code) => code !== 'POL-MF1'));
    });

    it('is one row too when the same account says it twice at the same moment', async () => {
      const account = await h.activatedAccount(['IT_ADMIN']);
      const { token } = await h.signIn(account.email, account.password);
      const say = () => request(h.server()).post('/api/v1/policies/POL-USAGE/acknowledgements').set(h.as(token));

      const answers = await Promise.all([say(), say()]);

      expect(answers.map((response) => response.status)).toEqual([201, 201]);
      expect(
        await count('SELECT count(*) AS n FROM policy_acknowledgements WHERE app_user_id = $1', [account.appUserId]),
      ).toBe(1);
    });

    it('asks the Super Admin nothing and refuses them an acknowledgement (US-01-14 AC-5)', async () => {
      const response = await h.admin.post('/api/v1/policies/POL-MF1/acknowledgements').expect(409);

      expect(bodyOf(response).error.code).toBe('POLICY.ACKNOWLEDGEMENT_NOT_REQUIRED');
    });
  });
});
