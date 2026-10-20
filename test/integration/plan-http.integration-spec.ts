import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { ApiAccount, adminToken, createActivatedAccount } from '../support/api-accounts';
import {
  HttpTestApp,
  SeededInstallation,
  createHttpTestApp,
  insertEmployeeFixture,
  seedInstallation,
} from '../support/http-test-app';

interface PlanWire {
  id: string;
  applicationId: string;
  applicationName: string;
  name: string;
  provisioningType: string;
  pricingModel: string | null;
  controlLevel: string | null;
  revocationNote: string | null;
  dataLossOnRemoval: boolean;
  sharingPolicy: string | null;
  seatTracking: string;
  workspaceProfile?: ProfileWire | null;
}

interface ProfileWire {
  primaryOwner: { employeeId: string; employeeCode: string; fullName: string };
  members: Array<{ employeeId: string; role: string }>;
  ownerLimit: number | null;
  adminLimit: number | null;
  ownerTransferProcedure: string | null;
  emergencyAccount: {
    identity: string;
    occupiesSeat: boolean;
    holder: { employeeId: string };
    lastReviewedOn: string;
  } | null;
}

const NO = { personToPersonMessaging: false, callsOrMeetings: false, mailbox: false };
const omit = (source: Record<string, unknown>, key: string) =>
  Object.fromEntries(Object.entries(source).filter(([name]) => name !== key));

describe('plans and workspace profiles over HTTP (integration, real PostgreSQL)', () => {
  let ctx: HttpTestApp;
  let seed: SeededInstallation;
  let admin: string;
  let it1: ApiAccount;
  let it2: ApiAccount;
  let finance: ApiAccount;
  let employee: ApiAccount;
  let businessOwner: string;
  let counter = 0;
  const server = () => ctx.app.getHttpServer();
  const as = (account: ApiAccount) => ({ Authorization: `Bearer ${account.accessToken}` });

  beforeAll(async () => {
    ctx = await createHttpTestApp();
    seed = await seedInstallation(ctx.app);
    admin = await adminToken(ctx, seed);
    it1 = await createActivatedAccount(ctx, seed, { code: 'E-IT1', email: 'it1@acme.vn', roles: ['IT_ADMIN'], admin });
    it2 = await createActivatedAccount(ctx, seed, { code: 'E-IT2', email: 'it2@acme.vn', roles: ['IT_ADMIN'], admin });
    finance = await createActivatedAccount(ctx, seed, {
      code: 'E-FIN',
      email: 'fin@acme.vn',
      roles: ['FINANCE'],
      admin,
    });
    employee = await createActivatedAccount(ctx, seed, { code: 'E-EMP', email: 'emp@acme.vn', roles: [], admin });
    businessOwner = (await insertEmployeeFixture(ctx.app, seed, { code: 'E-OWN', email: 'owner@acme.vn' })).employeeId;
  }, 120000);

  afterAll(async () => {
    await ctx?.close();
  });

  const unique = (prefix: string): string => `${prefix} ${(counter += 1)}`;
  const dataOf = <T>(response: request.Response): T => (response.body as { data: T }).data;
  const codeOf = (response: request.Response): string => (response.body as { error: { code: string } }).error.code;
  const createPlan = (body: object, account: ApiAccount = it1) =>
    request(server()).post('/api/v1/plans').set(as(account)).send(body);
  const patchPlan = (id: string, body: object, account: ApiAccount = it1) =>
    request(server()).patch(`/api/v1/plans/${id}`).set(as(account)).send(body);
  const getPlan = (id: string, account: ApiAccount = it1) =>
    request(server()).get(`/api/v1/plans/${id}`).set(as(account));
  const putProfile = (id: string, body: object, account: ApiAccount = it1) =>
    request(server()).put(`/api/v1/plans/${id}/workspace-profile`).set(as(account)).send(body);
  const application = async (kind: 'SAAS' | 'LICENSED' | 'INTERNAL' = 'SAAS', name = unique('App')): Promise<string> =>
    dataOf<{ id: string }>(
      await request(server())
        .post('/api/v1/applications')
        .set(as(it1))
        .send({
          name,
          kind,
          ...(kind === 'INTERNAL' ? {} : { vendorName: unique('Vendor') }),
          dataSensitivity: 'LOW',
          businessOwnerEmployeeId: businessOwner,
          communication: NO,
        })
        .expect(201),
    ).id;
  const k2 = (applicationId: string, extra: object = {}) => ({
    applicationId,
    name: unique('Organization'),
    provisioningType: 'K2',
    pricingModel: 'PER_SEAT',
    controlLevel: 'FULL',
    ...extra,
  });
  const plan = async (applicationId: string, extra: object = {}): Promise<PlanWire> =>
    dataOf<PlanWire>(await createPlan(k2(applicationId, extra)).expect(201));
  const n = async (table: string): Promise<number> =>
    (await ctx.sql.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n;
  const auditOf = async (resourceId: string) =>
    (
      await ctx.sql.query<{ action: string; before: unknown; after: unknown; actor_roles: string[] }>(
        'SELECT action, before, after, actor_roles FROM audit_events WHERE resource_id = $1 ORDER BY occurred_at, id',
        [resourceId],
      )
    ).rows;
  const profileBody = (extra: object = {}) => ({
    primaryOwnerEmployeeId: it1.employeeId,
    members: [
      { employeeId: it1.employeeId, role: 'OWNER' },
      { employeeId: it2.employeeId, role: 'ADMIN' },
    ],
    ownerLimit: 1,
    ownerTransferProcedure: 'Transfer in the admin console, then confirm by mail',
    emergencyAccount: {
      identity: 'figma-breakglass',
      occupiesSeat: true,
      holderEmployeeId: it1.employeeId,
      lastReviewedOn: '2026-10-01',
    },
    ...extra,
  });

  describe('declaring a plan (US-04-02)', () => {
    it('AC-1: Figma Organization, K2, per seat, full control is stored, counted by seat, and audited', async () => {
      const app = await application('SAAS', 'Figma');

      const created = dataOf<PlanWire>(
        await createPlan({
          applicationId: app,
          name: 'Organization',
          provisioningType: 'K2',
          pricingModel: 'PER_SEAT',
          controlLevel: 'FULL',
        }).expect(201),
      );

      expect(created).toMatchObject({
        applicationId: app,
        applicationName: 'Figma',
        name: 'Organization',
        provisioningType: 'K2',
        pricingModel: 'PER_SEAT',
        controlLevel: 'FULL',
        dataLossOnRemoval: false,
        sharingPolicy: null,
        seatTracking: 'APPLICABLE',
      });
      expect(await auditOf(created.id)).toEqual([
        expect.objectContaining({ action: 'PLAN.CREATED', before: null, actor_roles: ['IT_ADMIN'] }),
      ]);
    });

    it('AC-2: refuses a K1, K2 or K4 plan without a pricing model, storing nothing', async () => {
      const app = await application();
      const before = await n('plans');

      for (const provisioningType of ['K1', 'K2', 'K4']) {
        const response = await createPlan({
          applicationId: app,
          name: unique('No model'),
          provisioningType,
          controlLevel: 'FULL',
        }).expect(422);
        expect(codeOf(response)).toBe('PLAN.PRICING_MODEL_REQUIRED');
      }

      expect(await n('plans')).toBe(before);
    });

    it('AC-3: a plan that is not per seat shows seats as not applicable, never as zero', async () => {
      const app = await application();

      for (const pricingModel of ['FLAT_RATE', 'CONCURRENT', 'CONSUMPTION', 'PER_HOST']) {
        const created = await plan(app, { pricingModel });

        expect(created.seatTracking).toBe('NOT_APPLICABLE');
        expect(Object.keys(created).filter((key) => /seat/i.test(key))).toEqual(['seatTracking']);
      }
    });

    it('AC-4: refuses a plan without a kind; one application has plans of different kinds; K3 cannot be declared yet', async () => {
      const app = await application();
      const withoutKind = omit(k2(app), 'provisioningType');

      expect(codeOf(await createPlan(withoutKind).expect(422))).toBe('VALIDATION_ERROR');
      await createPlan(k2(app, { provisioningType: 'K1' })).expect(201);
      await createPlan(k2(app, { provisioningType: 'K2' })).expect(201);
      expect(
        codeOf(
          await createPlan(k2(app, { provisioningType: 'K3', pricingModel: undefined, controlLevel: 'FULL' })).expect(
            422,
          ),
        ),
      ).toBe('PLAN.PROVISIONING_TYPE_NOT_SUPPORTED');
    });

    it('AC-5: ChatGPT Plus K1 with partial control is stored; a control level outside the three is refused; K1 needs one', async () => {
      const app = await application('SAAS', unique('ChatGPT'));

      const stored = dataOf<PlanWire>(
        await createPlan(k2(app, { name: 'Plus', provisioningType: 'K1', controlLevel: 'PARTIAL' })).expect(201),
      );
      expect(stored).toMatchObject({ provisioningType: 'K1', controlLevel: 'PARTIAL' });
      expect(codeOf(await createPlan(k2(app, { controlLevel: 'MOSTLY' })).expect(422))).toBe('VALIDATION_ERROR');
      expect(codeOf(await createPlan(k2(app, { controlLevel: undefined })).expect(422))).toBe(
        'PLAN.CONTROL_LEVEL_REQUIRED',
      );
    });

    it('AC-6: a note about what is lost, with the flag, marks the plan; the flag needs the note; the note alone does not set it', async () => {
      const app = await application();
      const note = 'Cuộc trò chuyện của người bị gỡ không chuyển được';

      const marked = await plan(app, { revocationNote: `  ${note} `, dataLossOnRemoval: true });
      expect(marked).toMatchObject({ revocationNote: note, dataLossOnRemoval: true });
      expect(codeOf(await createPlan(k2(app, { dataLossOnRemoval: true })).expect(422))).toBe(
        'PLAN.DATA_LOSS_NOTE_REQUIRED',
      );
      expect(await plan(app, { revocationNote: note })).toMatchObject({
        revocationNote: note,
        dataLossOnRemoval: false,
      });
    });

    it('AC-7: an internal application gets a K5 plan with no pricing, no control level and no seats', async () => {
      const app = await application('INTERNAL');

      const created = dataOf<PlanWire>(
        await createPlan({ applicationId: app, name: unique('Manual'), provisioningType: 'K5' }).expect(201),
      );

      expect(created).toMatchObject({
        provisioningType: 'K5',
        pricingModel: null,
        controlLevel: null,
        seatTracking: 'NOT_APPLICABLE',
      });
      expect(
        codeOf(
          await createPlan({
            applicationId: app,
            name: unique('Priced'),
            provisioningType: 'K5',
            pricingModel: 'FLAT_RATE',
          }).expect(422),
        ),
      ).toBe('PLAN.PRICING_MODEL_NOT_APPLICABLE');
    });

    it('AC-8: refuses a K1 to K4 plan for an internal application, and a K5 plan for a paid one', async () => {
      const internal = await application('INTERNAL');
      const paid = await application('SAAS', 'Canva');
      const before = await n('plans');

      for (const provisioningType of ['K1', 'K2', 'K4']) {
        expect(codeOf(await createPlan(k2(internal, { provisioningType })).expect(422))).toBe(
          'PLAN.PROVISIONING_TYPE_MISMATCH',
        );
      }
      expect(
        codeOf(await createPlan({ applicationId: paid, name: unique('Manual'), provisioningType: 'K5' }).expect(422)),
      ).toBe('PLAN.PROVISIONING_TYPE_MISMATCH');
      expect(await n('plans')).toBe(before);
    });

    it('refuses an application that does not exist or is retired', async () => {
      const retired = await application();
      await ctx.sql.query(`UPDATE applications SET catalog_status = 'RETIRED' WHERE id = $1`, [retired]);

      expect(codeOf(await createPlan(k2(randomUUID())).expect(422))).toBe('PLAN.APPLICATION_NOT_FOUND');
      expect(codeOf(await createPlan(k2(retired)).expect(422))).toBe('PLAN.APPLICATION_RETIRED');
    });

    it('refuses a name already used in the application (case, accents, spacing), allows it in another, and runs one of two at once', async () => {
      const app = await application();
      const other = await application();
      const name = unique('Business');
      await createPlan(k2(app, { name })).expect(201);

      expect(codeOf(await createPlan(k2(app, { name: ` ${name.toUpperCase()} ` })).expect(409))).toBe(
        'PLAN.NAME_TAKEN',
      );
      await createPlan(k2(other, { name })).expect(201);
      const racing = k2(app, { name: unique('Race') });
      const results = await Promise.all([createPlan(racing), createPlan(racing)]);
      expect(results.map((response) => response.status).sort()).toEqual([201, 409]);
    });

    it.each([
      ['an empty name', { name: '   ' }, 'PLAN.NAME_INVALID'],
      ['a name over 200 characters', { name: 'N'.repeat(201) }, 'PLAN.NAME_INVALID'],
      ['a note over 2000 characters', { revocationNote: 'n'.repeat(2001) }, 'PLAN.NOTE_INVALID'],
    ])('refuses a plan with %s: 422 %s and nothing stored', async (_name, extra, code) => {
      const app = await application();
      const before = await n('plans');

      expect(codeOf(await createPlan(k2(app, extra)).expect(422))).toBe(code);
      expect(await n('plans')).toBe(before);
    });
  });

  describe('changing a plan', () => {
    it('AC-10: records the sharing policy and audits its change before and after; a no-op is not audited', async () => {
      const created = await plan(await application('SAAS', unique('Figma')), { sharingPolicy: 'NOT_ALLOWED' });
      expect(created.sharingPolicy).toBe('NOT_ALLOWED');

      const allowed = dataOf<PlanWire>(await patchPlan(created.id, { sharingPolicy: 'ALLOWED' }).expect(200));
      await patchPlan(created.id, { sharingPolicy: 'ALLOWED' }).expect(200);
      const cleared = dataOf<PlanWire>(await patchPlan(created.id, { sharingPolicy: null }).expect(200));

      expect(allowed.sharingPolicy).toBe('ALLOWED');
      expect(cleared.sharingPolicy).toBeNull();
      const events = await auditOf(created.id);
      expect(events.map((event) => event.action)).toEqual(['PLAN.CREATED', 'PLAN.UPDATED', 'PLAN.UPDATED']);
      expect(events[1]).toMatchObject({
        before: { sharingPolicy: 'NOT_ALLOWED' },
        after: { sharingPolicy: 'ALLOWED' },
      });
    });

    it('changes the kind with its pricing model and keeps the pairing rules, auditing the change', async () => {
      const app = await application();
      const created = await plan(app);

      const changed = dataOf<PlanWire>(
        await patchPlan(created.id, {
          provisioningType: 'K1',
          pricingModel: 'FLAT_RATE',
          controlLevel: 'PARTIAL',
        }).expect(200),
      );
      expect(changed).toMatchObject({
        provisioningType: 'K1',
        pricingModel: 'FLAT_RATE',
        controlLevel: 'PARTIAL',
        seatTracking: 'NOT_APPLICABLE',
      });
      expect(codeOf(await patchPlan(created.id, { provisioningType: 'K5' }).expect(422))).toBe(
        'PLAN.PROVISIONING_TYPE_MISMATCH',
      );
      expect(codeOf(await patchPlan(created.id, { pricingModel: null }).expect(422))).toBe(
        'PLAN.PRICING_MODEL_REQUIRED',
      );
      expect(codeOf(await patchPlan(created.id, { dataLossOnRemoval: true }).expect(422))).toBe(
        'PLAN.DATA_LOSS_NOTE_REQUIRED',
      );
      expect((await auditOf(created.id)).map((event) => event.action)).toEqual(['PLAN.CREATED', 'PLAN.UPDATED']);
    });

    it('answers 404 for a missing plan, 422 for an empty update, and 409 for a name another plan of the application has', async () => {
      const app = await application();
      const a = await plan(app, { name: unique('Alpha') });
      const b = await plan(app, { name: unique('Beta') });

      expect(codeOf(await patchPlan(randomUUID(), { name: 'x' }).expect(404))).toBe('PLAN.NOT_FOUND');
      expect(codeOf(await getPlan(randomUUID()).expect(404))).toBe('PLAN.NOT_FOUND');
      expect(codeOf(await patchPlan(a.id, {}).expect(422))).toBe('PLAN.UPDATE_EMPTY');
      expect(codeOf(await patchPlan(b.id, { name: a.name.toUpperCase() }).expect(409))).toBe('PLAN.NAME_TAKEN');
      expect(codeOf(await patchPlan(a.id, { applicationId: randomUUID() }).expect(422))).toBe('VALIDATION_ERROR');
    });
  });

  describe('who may use it (AC-11)', () => {
    it('turns Finance, an employee and the Super Admin away from declaring and changing, and lets only Finance read', async () => {
      const created = await plan(await application());
      const before = { plans: await n('plans'), audit: await n('audit_events') };
      const asSuperAdmin = { Authorization: `Bearer ${admin}` };

      for (const account of [finance, employee]) {
        await createPlan(k2(randomUUID()), account).expect(403);
        await patchPlan(created.id, { name: unique('Renamed') }, account).expect(403);
        await putProfile(created.id, profileBody(), account).expect(403);
      }
      await request(server()).post('/api/v1/plans').set(asSuperAdmin).send(k2(randomUUID())).expect(403);
      await request(server()).patch(`/api/v1/plans/${created.id}`).set(asSuperAdmin).send({ name: 'x' }).expect(403);
      await request(server())
        .put(`/api/v1/plans/${created.id}/workspace-profile`)
        .set(asSuperAdmin)
        .send({})
        .expect(403);

      expect({ plans: await n('plans'), audit: await n('audit_events') }).toEqual(before);
      await getPlan(created.id, finance).expect(200);
      await request(server()).get('/api/v1/plans').set(as(finance)).expect(200);
      await getPlan(created.id, employee).expect(403);
      await request(server()).get('/api/v1/plans').set(as(employee)).expect(403);
    });
  });

  describe('the workspace profile of a K2 plan (AC-12)', () => {
    it('records owners, admins, the owner limit, the transfer procedure and the emergency account, and takes no password', async () => {
      const k2Plan = await plan(await application('SAAS', unique('Figma')));

      const stored = dataOf<ProfileWire>(await putProfile(k2Plan.id, profileBody()).expect(200));

      expect(stored).toMatchObject({
        primaryOwner: { employeeId: it1.employeeId, employeeCode: 'E-IT1' },
        ownerLimit: 1,
        adminLimit: null,
        ownerTransferProcedure: 'Transfer in the admin console, then confirm by mail',
        emergencyAccount: {
          identity: 'figma-breakglass',
          occupiesSeat: true,
          holder: { employeeId: it1.employeeId },
          lastReviewedOn: '2026-10-01',
        },
      });
      expect(stored.members.map((member) => `${member.employeeId}:${member.role}`).sort()).toEqual(
        [`${it1.employeeId}:OWNER`, `${it2.employeeId}:ADMIN`].sort(),
      );
      const detail = dataOf<PlanWire>(await getPlan(k2Plan.id).expect(200));
      expect(detail.workspaceProfile?.primaryOwner.employeeId).toBe(it1.employeeId);
      expect((await auditOf(k2Plan.id)).map((event) => event.action)).toEqual([
        'PLAN.CREATED',
        'PLAN.WORKSPACE_PROFILE_SET',
      ]);
      expect(JSON.stringify(await auditOf(k2Plan.id))).not.toMatch(/password/i);

      expect(codeOf(await putProfile(k2Plan.id, profileBody({ password: 'hunter2' })).expect(422))).toBe(
        'VALIDATION_ERROR',
      );
      expect(
        codeOf(
          await putProfile(
            k2Plan.id,
            profileBody({
              emergencyAccount: {
                identity: 'x',
                occupiesSeat: false,
                holderEmployeeId: it1.employeeId,
                lastReviewedOn: '2026-10-01',
                password: 'x',
              },
            }),
          ).expect(422),
        ),
      ).toBe('VALIDATION_ERROR');
    });

    it('creates no Assignment for the people named: the profile writes only its own tables', async () => {
      const before = await ctx.sql.query<{ n: number }>(`SELECT count(*)::int AS n FROM license_assignments`);
      const k2Plan = await plan(await application());

      await putProfile(k2Plan.id, profileBody()).expect(200);

      const after = await ctx.sql.query<{ n: number }>(`SELECT count(*)::int AS n FROM license_assignments`);
      expect(after.rows[0].n).toBe(before.rows[0].n);
    });

    it('refuses a missing primary owner and an emergency account that is not whole: 422 VALIDATION_ERROR', async () => {
      const k2Plan = await plan(await application());
      const withoutPrimary = omit(profileBody(), 'primaryOwnerEmployeeId');

      expect(codeOf(await putProfile(k2Plan.id, withoutPrimary).expect(422))).toBe('VALIDATION_ERROR');
      expect(
        codeOf(
          await putProfile(
            k2Plan.id,
            profileBody({ emergencyAccount: { identity: 'figma-breakglass', occupiesSeat: true } }),
          ).expect(422),
        ),
      ).toBe('VALIDATION_ERROR');
      expect(codeOf(await putProfile(k2Plan.id, profileBody({ members: [] })).expect(422))).toBe('VALIDATION_ERROR');
    });

    it('refuses a person who is not an IT Admin, has no account, or has left, naming the person', async () => {
      const k2Plan = await plan(await application());
      const noAccount = (
        await insertEmployeeFixture(ctx.app, seed, { code: unique('E-NOACC'), email: `noacc${counter}@acme.vn` })
      ).employeeId;
      const left = (
        await createActivatedAccount(ctx, seed, {
          code: unique('E-LEFT'),
          email: `left${counter}@acme.vn`,
          roles: ['IT_ADMIN'],
          admin,
        })
      ).employeeId;
      await ctx.sql.query(`UPDATE employees SET status = 'TERMINATED' WHERE id = $1`, [left]);

      for (const person of [finance.employeeId, employee.employeeId, noAccount, left, randomUUID()]) {
        const members = [
          { employeeId: it1.employeeId, role: 'OWNER' },
          { employeeId: person, role: 'ADMIN' },
        ];
        const response = await putProfile(k2Plan.id, profileBody({ members })).expect(422);

        expect(codeOf(response)).toBe('PLAN.WORKSPACE_PERSON_INVALID');
        expect((response.body as { error: { details: { employeeId: string } } }).error.details.employeeId).toBe(person);
      }
      const emergencyHolder = await putProfile(
        k2Plan.id,
        profileBody({
          emergencyAccount: {
            identity: 'x-glass',
            occupiesSeat: false,
            holderEmployeeId: finance.employeeId,
            lastReviewedOn: '2026-10-01',
          },
        }),
      ).expect(422);
      expect(codeOf(emergencyHolder)).toBe('PLAN.WORKSPACE_PERSON_INVALID');
      expect(
        (await ctx.sql.query(`SELECT 1 FROM plan_workspace_profiles WHERE plan_id = $1`, [k2Plan.id])).rowCount,
      ).toBe(0);
    });

    it('refuses a primary owner who is not an owner among the members, a person twice, and more owners than the limit', async () => {
      const k2Plan = await plan(await application());

      expect(
        codeOf(
          await putProfile(
            k2Plan.id,
            profileBody({
              primaryOwnerEmployeeId: it1.employeeId,
              members: [{ employeeId: it2.employeeId, role: 'OWNER' }],
            }),
          ).expect(422),
        ),
      ).toBe('PLAN.PRIMARY_OWNER_NOT_LISTED');
      expect(
        codeOf(
          await putProfile(
            k2Plan.id,
            profileBody({
              members: [
                { employeeId: it1.employeeId, role: 'OWNER' },
                { employeeId: it1.employeeId, role: 'ADMIN' },
              ],
            }),
          ).expect(422),
        ),
      ).toBe('PLAN.WORKSPACE_MEMBER_DUPLICATE');
      expect(
        codeOf(
          await putProfile(
            k2Plan.id,
            profileBody({
              ownerLimit: 1,
              members: [
                { employeeId: it1.employeeId, role: 'OWNER' },
                { employeeId: it2.employeeId, role: 'OWNER' },
              ],
            }),
          ).expect(422),
        ),
      ).toBe('PLAN.WORKSPACE_LIMIT_EXCEEDED');
    });

    it('replaces the profile as a whole and leaves a repeat of the same profile unaudited', async () => {
      const k2Plan = await plan(await application());
      await putProfile(k2Plan.id, profileBody()).expect(200);
      await putProfile(k2Plan.id, profileBody()).expect(200);
      const next = profileBody({
        primaryOwnerEmployeeId: it2.employeeId,
        members: [{ employeeId: it2.employeeId, role: 'OWNER' }],
        ownerLimit: null,
        ownerTransferProcedure: null,
        emergencyAccount: null,
      });

      const replaced = dataOf<ProfileWire>(await putProfile(k2Plan.id, next).expect(200));

      expect(replaced.members).toEqual([expect.objectContaining({ employeeId: it2.employeeId, role: 'OWNER' })]);
      expect(replaced.emergencyAccount).toBeNull();
      const events = await auditOf(k2Plan.id);
      expect(events.map((event) => event.action)).toEqual([
        'PLAN.CREATED',
        'PLAN.WORKSPACE_PROFILE_SET',
        'PLAN.WORKSPACE_PROFILE_SET',
      ]);
      expect(events[2].before).toMatchObject({ primaryOwnerEmployeeId: it1.employeeId });
      expect(events[2].after).toMatchObject({ primaryOwnerEmployeeId: it2.employeeId, emergencyIdentity: null });
      expect(
        (await ctx.sql.query(`SELECT 1 FROM plan_workspace_admins WHERE plan_id = $1`, [k2Plan.id])).rowCount,
      ).toBe(1);
    });

    it('is only for a K2 plan: 422 on any other kind, 404 on a missing plan', async () => {
      const app = await application();
      const k1 = dataOf<PlanWire>(await createPlan(k2(app, { provisioningType: 'K1' })).expect(201));

      expect(codeOf(await putProfile(k1.id, profileBody()).expect(422))).toBe('PLAN.WORKSPACE_PROFILE_NOT_APPLICABLE');
      expect(codeOf(await putProfile(randomUUID(), profileBody()).expect(404))).toBe('PLAN.NOT_FOUND');
    });

    it('keeps a plan with a profile from changing to a kind that has none, and lets it keep K2', async () => {
      const k2Plan = await plan(await application());
      await putProfile(k2Plan.id, profileBody()).expect(200);

      expect(
        codeOf(await patchPlan(k2Plan.id, { provisioningType: 'K1', pricingModel: 'FLAT_RATE' }).expect(409)),
      ).toBe('PLAN.WORKSPACE_PROFILE_BLOCKS_TYPE_CHANGE');
      await patchPlan(k2Plan.id, { name: unique('Still K2') }).expect(200);
      expect(dataOf<PlanWire>(await getPlan(k2Plan.id).expect(200)).provisioningType).toBe('K2');
    });

    it('does not let a person who leaves while the profile is being recorded get through', async () => {
      const k2Plan = await plan(await application());
      const leaving = await createActivatedAccount(ctx, seed, {
        code: unique('E-LEAVING'),
        email: `leaving${counter}@acme.vn`,
        roles: ['IT_ADMIN'],
        admin,
      });
      await ctx.sql.query('BEGIN');
      await ctx.sql.query(`UPDATE employees SET status = 'TERMINATED' WHERE id = $1`, [leaving.employeeId]);

      const pending = putProfile(
        k2Plan.id,
        profileBody({
          members: [
            { employeeId: it1.employeeId, role: 'OWNER' },
            { employeeId: leaving.employeeId, role: 'ADMIN' },
          ],
        }),
      ).then((response) => response);
      await new Promise((resolve) => setTimeout(resolve, 400));
      await ctx.sql.query('COMMIT');
      const response = await pending;

      expect(response.status).toBe(422);
      expect(codeOf(response)).toBe('PLAN.WORKSPACE_PERSON_INVALID');
      expect(
        (await ctx.sql.query(`SELECT 1 FROM plan_workspace_profiles WHERE plan_id = $1`, [k2Plan.id])).rowCount,
      ).toBe(0);
    });
  });

  describe('reading', () => {
    it('lists plans by application then name, filtered by application and kind, in pages', async () => {
      const app = await application('SAAS', unique('Listed App'));
      await plan(app, { name: 'B plan' });
      await plan(app, { name: 'A plan' });
      await createPlan(k2(app, { name: 'C plan', provisioningType: 'K1', controlLevel: 'PARTIAL' })).expect(201);

      const all = dataOf<{ items: PlanWire[]; pagination: { totalItems: number } }>(
        await request(server()).get('/api/v1/plans').query({ applicationId: app }).set(as(it1)).expect(200),
      );
      expect(all.items.map((item) => item.name)).toEqual(['A plan', 'B plan', 'C plan']);
      expect(all.pagination.totalItems).toBe(3);
      const k1 = dataOf<{ items: PlanWire[] }>(
        await request(server())
          .get('/api/v1/plans')
          .query({ applicationId: app, provisioningType: 'K1' })
          .set(as(finance))
          .expect(200),
      );
      expect(k1.items.map((item) => item.name)).toEqual(['C plan']);
      const paged = dataOf<{ items: PlanWire[] }>(
        await request(server())
          .get('/api/v1/plans')
          .query({ applicationId: app, page: 2, pageSize: 2 })
          .set(as(it1))
          .expect(200),
      );
      expect(paged.items.map((item) => item.name)).toEqual(['C plan']);
    });
  });
});
