import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { ApiAccount, createActivatedAccount } from '../support/api-accounts';
import { SeatHarness } from '../support/seat-baseline-harness';
import { HR_BASIS } from '../support/hr-basis';

const h = new SeatHarness();

/** Today in the calendar of the organization (the seeded one is Asia/Ho_Chi_Minh). */
function today(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
}

interface ToolsetWire {
  departmentId: string;
  jobTitleId: string;
  version: number;
  plans: Array<{ planId: string; planName: string; applicationId: string; applicationName: string }>;
  reason: string;
  changedBy: string;
  changedAt: string;
}

describe('standard toolsets over HTTP (integration, real PostgreSQL)', () => {
  let design: { id: string; code: string };
  let ops: { id: string; code: string };
  let designer: string;
  let senior: string;
  let it2: ApiAccount;
  let headOfDesign: ApiAccount;
  let memberOfDesign: ApiAccount;
  let figma: string;
  let miro: string;
  let sketch: string;
  const REASON = 'theo đề xuất của trưởng phòng';

  const put = (departmentId: string, jobTitleId: string, body: object, account: ApiAccount = h.it1) =>
    request(h.server()).put(`/api/v1/standard-toolsets/${departmentId}/${jobTitleId}`).set(h.as(account)).send(body);
  const get = (departmentId: string, jobTitleId: string, account: ApiAccount = h.it1) =>
    request(h.server()).get(`/api/v1/standard-toolsets/${departmentId}/${jobTitleId}`).set(h.as(account));
  const history = (departmentId: string, jobTitleId: string, account: ApiAccount = h.it1) =>
    request(h.server()).get(`/api/v1/standard-toolsets/${departmentId}/${jobTitleId}/history`).set(h.as(account));
  const set = async (
    departmentId: string,
    jobTitleId: string,
    planIds: string[],
    reason = REASON,
  ): Promise<ToolsetWire> =>
    h.dataOf<{ toolset: ToolsetWire }>(await put(departmentId, jobTitleId, { planIds, reason }).expect(200)).toolset;
  const created = (response: request.Response): request.Response => {
    if (response.status !== 201) throw new Error(`${response.status} ${JSON.stringify(response.body)}`);

    return response;
  };
  const jobTitle = async (name: string): Promise<string> =>
    h.dataOf<{ id: string }>(
      await request(h.server()).post('/api/v1/job-titles').set(h.as(h.it1)).send({ name }).then(created),
    ).id;
  const department = async (code: string) => {
    const costCenter = await h.costCenter('UNIT');

    return h.dataOf<{ id: string; code: string }>(
      await request(h.server())
        .post('/api/v1/departments')
        .set(h.as(h.it1))
        .send({ code, name: `Department ${code}`, costCenterId: costCenter.id })
        .then(created),
    );
  };
  const member = async (departmentCode: string, code: string, jobTitleId: string): Promise<string> =>
    h.dataOf<{ id: string }>(
      await request(h.server())
        .post('/api/v1/employees')
        .set({ Authorization: `Bearer ${h.admin}` })
        .send({
          hrBasis: HR_BASIS,
          employeeCode: code,
          fullName: `Person ${code}`,
          workEmail: `${code.toLowerCase()}@acme.vn`,
          employmentType: 'STAFF',
          hireDate: '2026-10-01',
          departmentCode,
          jobTitleId,
        })
        .then(created),
    ).id;
  const account = async (code: string, employeeId: string, roles: string[] = []): Promise<ApiAccount> =>
    createActivatedAccount(h.ctx, h.seed, {
      code,
      email: `${code.toLowerCase()}@acme.vn`,
      roles,
      admin: h.admin,
      employeeId,
    });
  const plan = async (name: string) => {
    const planId = await h.plan('K2');
    await h.ctx.sql.query(`UPDATE plans SET name = $2, normalized_name = lower($2) WHERE id = $1`, [planId, name]);

    return planId;
  };
  const count = (table: string) => h.count(table);
  const auditOf = async (resourceId: string) =>
    (
      await h.ctx.sql.query<{ action: string; before: unknown; after: unknown; actor_roles: string[] }>(
        `SELECT action, before, after, actor_roles FROM audit_events WHERE resource_type = 'StandardToolset' AND resource_id = $1 ORDER BY occurred_at, id`,
        [resourceId],
      )
    ).rows;

  beforeAll(async () => {
    await h.start();
    design = await department('P-DES');
    ops = await department('P-OPS2');
    designer = await jobTitle('Designer');
    senior = await jobTitle('Senior Designer');
    figma = await plan('Figma Organization');
    miro = await plan('Miro Team');
    sketch = await plan('Sketch Business');
    it2 = await account('E-IT2', await member(design.code, 'E-IT2', designer), ['IT_ADMIN']);
    const headId = await member(design.code, 'E-HEAD', designer);
    headOfDesign = await account('E-HEAD', headId);
    await request(h.server())
      .post(`/api/v1/departments/${design.id}/head-assignments`)
      .set(h.as(h.it1))
      .send({ employeeId: headId, effectiveFrom: today() })
      .expect(200);
    memberOfDesign = await account('E-DESIGNER', await member(design.code, 'E-DESIGNER', designer));
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  it('AC-1: sets the toolset of (P-DES, Designer) with a reason, and audits who, why, before and after', async () => {
    const toolset = await set(design.id, designer, [figma, miro]);

    expect(toolset).toMatchObject({
      departmentId: design.id,
      jobTitleId: designer,
      version: 1,
      reason: REASON,
      changedBy: h.it1.appUserId,
    });
    expect(toolset.plans.map((entry) => entry.planName).sort()).toEqual(['Figma Organization', 'Miro Team']);
    const events = await auditOf(`${design.id}/${designer}`);
    expect(events.map((event) => event.action)).toEqual(['STANDARD_TOOLSET.CHANGED']);
    expect(events[0]).toMatchObject({
      before: null,
      after: { version: 1, reason: REASON },
      actor_roles: ['IT_ADMIN'],
    });
    expect(JSON.stringify(events[0].after)).toContain(figma);
  });

  it('AC-2: refuses a change without a reason, or with a blank one, and changes nothing', async () => {
    const versions = await count('standard_toolset_versions');
    const events = (await auditOf(`${design.id}/${designer}`)).length;

    for (const body of [{ planIds: [figma] }, { planIds: [figma], reason: '' }, { planIds: [figma], reason: '   ' }]) {
      const response = await put(design.id, designer, body).expect(422);
      expect(h.codeOf(response)).toMatch(/^(STANDARD_TOOLSET\.REASON_REQUIRED|VALIDATION_ERROR)$/);
    }
    expect(await count('standard_toolset_versions')).toBe(versions);
    expect((await auditOf(`${design.id}/${designer}`)).length).toBe(events);
    expect(h.codeOf(await put(design.id, designer, { planIds: [figma], reason: '   ' }).expect(422))).toBe(
      'STANDARD_TOOLSET.REASON_REQUIRED',
    );
  });

  it('AC-3: replaces a tool with another on the initiative of IT: a new version, the old one whole, audit before and after', async () => {
    await set(design.id, designer, [sketch, figma], 'Sketch trong bộ chuẩn');
    const replaced = await set(design.id, designer, [figma, miro], 'Sketch được thay bằng Figma trong danh mục');

    expect(replaced.version).toBeGreaterThanOrEqual(3);
    const page = h.dataOf<{ items: ToolsetWire[]; pagination: { totalItems: number } }>(
      await history(design.id, designer).expect(200),
    );
    expect(page.items.map((item) => item.version)).toEqual(
      [...page.items.map((item) => item.version)].sort((a, b) => b - a),
    );
    expect(page.items.at(-1)?.reason).toBe(REASON);
    expect(
      page.items
        .at(-1)
        ?.plans.map((entry) => entry.planName)
        .sort(),
    ).toEqual(['Figma Organization', 'Miro Team']);
    const last = (await auditOf(`${design.id}/${designer}`)).at(-1);
    expect(JSON.stringify(last?.before)).toContain(sketch);
    expect(JSON.stringify(last?.after)).not.toContain(sketch);
  });

  it('answers the same plans again, in any order, with changed false and records nothing', async () => {
    const before = await count('standard_toolset_versions');

    const response = await put(design.id, designer, { planIds: [miro, figma], reason: 'xác nhận lại' }).expect(200);

    expect(h.dataOf<{ changed: boolean }>(response).changed).toBe(false);
    expect(await count('standard_toolset_versions')).toBe(before);
  });

  it('AC-4: grants and revokes nothing: a seat held stays held, and no assignment, task or import is made or changed', async () => {
    const subscriptionId = await h.subscription(5);
    const planId = (
      await h.ctx.sql.query<{ plan_id: string }>(`SELECT plan_id FROM subscriptions WHERE id = $1`, [subscriptionId])
    ).rows[0].plan_id;
    const holder = await member(design.code, 'E-SEAT-HOLDER', senior);
    const assignmentId = randomUUID();
    await h.ctx.sql.query(
      `INSERT INTO license_assignments (id, organization_id, kind, source, plan_id, subscription_id, employee_id,
         account_identifier, normalized_account_identifier, valid_from, valid_from_basis, created_by_app_user_id)
       VALUES ($1, $2, 'PERSONAL', 'REQUEST', $3, $4, $5, 'e-seat-holder@acme.vn', 'e-seat-holder@acme.vn',
         '2026-10-01', 'ACTUAL', $6)`,
      [assignmentId, h.seed.organizationId, planId, subscriptionId, holder, randomUUID()],
    );
    const held = () =>
      h.ctx.sql.query<{ row: Record<string, unknown> }>(
        `SELECT to_jsonb(a) AS row FROM license_assignments a WHERE id = $1`,
        [assignmentId],
      );
    const before = {
      assignments: await count('license_assignments'),
      tasks: await count('provisioning_tasks'),
      imports: await count('seat_baseline_imports'),
      row: (await held()).rows[0].row,
    };

    // The seat held is in the toolset, then taken out of it, and nobody is given or loses anything by it.
    await set(design.id, senior, [planId, figma], 'bộ chuẩn Senior Designer');
    await set(design.id, senior, [figma], 'bỏ khỏi bộ chuẩn');
    await set(design.id, senior, [], 'bỏ hết');

    expect(await count('license_assignments')).toBe(before.assignments);
    expect(await count('provisioning_tasks')).toBe(before.tasks);
    expect(await count('seat_baseline_imports')).toBe(before.imports);
    expect((await held()).rows[0].row).toEqual(before.row);
  });

  it('AC-9: refuses a plan that is not in the catalog, a plan twice and more than fifty, naming what is wrong', async () => {
    const ghost = randomUUID();
    const versions = await count('standard_toolset_versions');

    const missing = await put(design.id, designer, { planIds: [figma, ghost], reason: REASON }).expect(422);
    expect(h.codeOf(missing)).toBe('STANDARD_TOOLSET.PLAN_NOT_FOUND');
    expect(h.detailsOf(missing)).toEqual({ planIds: [ghost] });
    expect(h.codeOf(await put(design.id, designer, { planIds: [figma, figma], reason: REASON }).expect(422))).toBe(
      'STANDARD_TOOLSET.PLAN_DUPLICATE',
    );
    const many = Array.from({ length: 51 }, () => randomUUID());
    expect(h.codeOf(await put(design.id, designer, { planIds: many, reason: REASON }).expect(422))).toBe(
      'STANDARD_TOOLSET.TOO_MANY_PLANS',
    );
    expect(await count('standard_toolset_versions')).toBe(versions);
  });

  it('AC-10: saves the toolset of a department that has no head, and sends no notice to anyone', async () => {
    const response = await put(ops.id, designer, { planIds: [miro], reason: 'phòng chưa có trưởng phòng' }).expect(200);

    expect(h.dataOf<{ toolset: ToolsetWire }>(response).toolset.version).toBe(1);
    expect((await auditOf(`${ops.id}/${designer}`)).map((event) => event.action)).toEqual(['STANDARD_TOOLSET.CHANGED']);
  });

  it('AC-12: refuses a new pair with a job title that is no longer in use, and still updates a pair that exists', async () => {
    const intern = await jobTitle('Intern');
    await set(ops.id, intern, [miro], 'bộ chuẩn Intern của P-OPS');
    await request(h.server()).post(`/api/v1/job-titles/${intern}/deactivate`).set(h.as(h.it1)).expect(200);
    const versions = await count('standard_toolset_versions');

    const refused = await put(design.id, intern, { planIds: [miro], reason: REASON }).expect(422);
    expect(h.codeOf(refused)).toBe('STANDARD_TOOLSET.JOB_TITLE_INACTIVE');
    expect(await count('standard_toolset_versions')).toBe(versions);

    expect((await set(ops.id, intern, [miro, figma], 'cập nhật cặp đã có')).version).toBe(2);
    expect(h.dataOf<{ toolset: ToolsetWire | null }>(await get(ops.id, intern).expect(200)).toolset?.version).toBe(2);
  });

  it('refuses a new pair of a department that is no longer active, and answers 404 for a department or a job title that does not exist', async () => {
    const retired = await department('P-OLD');
    await request(h.server()).post(`/api/v1/departments/${retired.id}/deactivate`).set(h.as(h.it1)).expect(200);

    expect(h.codeOf(await put(retired.id, designer, { planIds: [miro], reason: REASON }).expect(422))).toBe(
      'STANDARD_TOOLSET.DEPARTMENT_INACTIVE',
    );
    expect(h.codeOf(await put(randomUUID(), designer, { planIds: [], reason: REASON }).expect(404))).toBe(
      'DEPARTMENT.NOT_FOUND',
    );
    expect(h.codeOf(await put(design.id, randomUUID(), { planIds: [], reason: REASON }).expect(404))).toBe(
      'JOB_TITLE.NOT_FOUND',
    );
  });

  it('AC-8: refuses Finance, the head, an employee and the Super Admin the change, and lets an IT Admin who is not in charge make it, under their own name', async () => {
    const versions = await count('standard_toolset_versions');
    for (const who of [h.finance, headOfDesign, memberOfDesign]) {
      expect(h.codeOf(await put(design.id, designer, { planIds: [figma], reason: REASON }, who).expect(403))).toBe(
        'AUTHORIZATION.FORBIDDEN',
      );
    }
    expect(
      h.codeOf(
        await request(h.server())
          .put(`/api/v1/standard-toolsets/${design.id}/${designer}`)
          .set({ Authorization: `Bearer ${h.admin}` })
          .send({ planIds: [figma], reason: REASON })
          .expect(403),
      ),
    ).toBe('AUTHORIZATION.FORBIDDEN');
    expect(await count('standard_toolset_versions')).toBe(versions);

    const byOther = await put(
      design.id,
      designer,
      { planIds: [figma, miro, sketch], reason: 'IT khác xử lý thay' },
      it2,
    ).expect(200);

    expect(h.dataOf<{ toolset: ToolsetWire }>(byOther).toolset.changedBy).toBe(it2.appUserId);
    expect((await auditOf(`${design.id}/${designer}`)).at(-1)).toMatchObject({ actor_roles: ['IT_ADMIN'] });
  });

  it('lets the head read the toolsets of their department and refuses another department, and an employee reads their own', async () => {
    const own = h.dataOf<{ toolset: ToolsetWire | null }>(await get(design.id, designer, headOfDesign).expect(200));
    expect(own.toolset?.plans.length).toBeGreaterThan(0);
    expect(h.codeOf(await get(ops.id, designer, headOfDesign).expect(403))).toBe('DEPARTMENT.OUT_OF_SCOPE');
    const list = h.dataOf<{ items: ToolsetWire[] }>(
      await request(h.server())
        .get('/api/v1/standard-toolsets')
        .query({ departmentId: design.id })
        .set(h.as(headOfDesign))
        .expect(200),
    );
    expect(list.items.every((item) => item.departmentId === design.id)).toBe(true);
    expect(
      h.codeOf(
        await request(h.server())
          .get('/api/v1/standard-toolsets')
          .query({ departmentId: ops.id })
          .set(h.as(headOfDesign))
          .expect(403),
      ),
    ).toBe('DEPARTMENT.OUT_OF_SCOPE');
    expect(
      h.codeOf(await request(h.server()).get('/api/v1/standard-toolsets').set(h.as(headOfDesign)).expect(403)),
    ).toBe('DEPARTMENT.OUT_OF_SCOPE');

    const mine = h.dataOf<{ department: { id: string }; jobTitle: { id: string }; toolset: ToolsetWire | null }>(
      await request(h.server()).get('/api/v1/standard-toolsets/mine').set(h.as(memberOfDesign)).expect(200),
    );
    expect(mine.department.id).toBe(design.id);
    expect(mine.jobTitle.id).toBe(designer);
    expect(mine.toolset?.plans.length).toBeGreaterThan(0);
  });

  describe('what an employee reads of their own toolset (US-04-10 AC-12)', () => {
    const mineOf = async (who: ApiAccount) =>
      h.dataOf<{
        department: { id: string } | null;
        jobTitle: { id: string; name: string } | null;
        toolset: ToolsetWire | null;
      }>(await request(h.server()).get('/api/v1/standard-toolsets/mine').set(h.as(who)).expect(200));

    it('still shows the toolset to someone whose job title is no longer in use', async () => {
      const retiring = await jobTitle('Retiring Title');
      await set(design.id, retiring, [miro], 'bộ chuẩn của chức vụ sắp ngừng');
      const holder = await account('E-RETIRING', await member(design.code, 'E-RETIRING', retiring));
      await request(h.server()).post(`/api/v1/job-titles/${retiring}/deactivate`).set(h.as(h.it1)).expect(200);

      const mine = await mineOf(holder);

      expect(mine.jobTitle?.id).toBe(retiring);
      expect(mine.toolset?.plans.map((entry) => entry.planId)).toEqual([miro]);
    });

    it('shows the new name when the job title is renamed, with the same toolset and the same version', async () => {
      const original = await jobTitle('Desginer Typo');
      await set(design.id, original, [figma], 'bộ chuẩn');
      const holder = await account('E-RENAMED', await member(design.code, 'E-RENAMED', original));
      const versions = await count('standard_toolset_versions');

      await request(h.server())
        .patch(`/api/v1/job-titles/${original}`)
        .set(h.as(h.it1))
        .send({ name: 'Designer Fixed' })
        .expect(200);
      const mine = await mineOf(holder);

      expect(mine.jobTitle).toEqual({ id: original, name: 'Designer Fixed' });
      expect(mine.toolset?.version).toBe(1);
      expect(await count('standard_toolset_versions')).toBe(versions);
    });

    it('answers a toolset of null for a pair that has none, and nothing for someone with no department', async () => {
      const bare = await jobTitle('Title Without Toolset');
      const withoutToolset = await account('E-BARE', await member(design.code, 'E-BARE', bare));
      const strayId = await h.person('E-NOPLACE');
      const noPlacement = await account('E-NOPLACE', strayId);
      // Someone the system holds with no department today (the fixture put them in one: take it away).
      await h.ctx.sql.query(`DELETE FROM employee_placements WHERE employee_id = $1`, [strayId]);

      expect(await mineOf(withoutToolset)).toMatchObject({ toolset: null, jobTitle: { id: bare } });
      expect(await mineOf(noPlacement)).toEqual({ department: null, jobTitle: null, toolset: null });
    });
  });

  it('answers a pair with no toolset as null, not as a missing page, and the history to the IT Admin only', async () => {
    const pair = await jobTitle('Accountant');

    expect(h.dataOf<{ toolset: unknown }>(await get(design.id, pair).expect(200)).toolset).toBeNull();
    expect(h.dataOf<{ items: unknown[] }>(await history(design.id, pair).expect(200)).items).toEqual([]);
    expect(h.codeOf(await history(design.id, designer, headOfDesign).expect(403))).toBe('AUTHORIZATION.FORBIDDEN');
    expect(h.codeOf(await history(design.id, designer, h.employee).expect(403))).toBe('AUTHORIZATION.FORBIDDEN');
  });

  it('never lists a head that has no setting yet, and answers it as no toolset', async () => {
    const bare = await jobTitle('Intern Designer');
    await h.ctx.sql.query(
      `INSERT INTO standard_toolsets (department_id, job_title_id, organization_id, current_version)
       SELECT id, $2::uuid, organization_id, 0 FROM departments WHERE id = $1`,
      [ops.id, bare],
    );

    const list = h.dataOf<{ items: ToolsetWire[]; pagination: { totalItems: number } }>(
      await request(h.server())
        .get('/api/v1/standard-toolsets')
        .query({ departmentId: ops.id })
        .set(h.as(h.it1))
        .expect(200),
    );
    expect(list.items.some((item) => item.jobTitleId === bare)).toBe(false);
    expect(h.dataOf<{ toolset: unknown }>(await get(ops.id, bare).expect(200)).toolset).toBeNull();
  });

  it('AC-7: has no route that suggests or adds tools by itself, and none that deletes a toolset: 404', async () => {
    for (const [method, path] of [
      ['get', '/api/v1/standard-toolsets/suggestions'],
      ['post', `/api/v1/standard-toolsets/${design.id}/${designer}`],
      ['delete', `/api/v1/standard-toolsets/${design.id}/${designer}`],
      ['get', `/api/v1/standard-toolsets/${design.id}/${designer}/recommendations`],
    ] as const) {
      const response = await request(h.server())[method](path).set(h.as(h.it1)).send({});
      expect([path, response.status]).toEqual([path, 404]);
    }
  });

  it('queues two different changes that arrive at once: consecutive versions, never a unique violation', async () => {
    const pair = await jobTitle('Researcher');

    const responses = await Promise.all([
      put(design.id, pair, { planIds: [figma], reason: 'một' }),
      put(design.id, pair, { planIds: [miro], reason: 'hai' }),
      put(design.id, pair, { planIds: [sketch], reason: 'ba' }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([200, 200, 200]);
    expect(
      responses.map((response) => h.dataOf<{ toolset: ToolsetWire }>(response).toolset.version).sort((a, b) => a - b),
    ).toEqual([1, 2, 3]);
  });

  it('is for people who are signed in: 401 without a token, 422 for an id or a body that is not valid', async () => {
    expect(h.codeOf(await request(h.server()).get('/api/v1/standard-toolsets/mine').expect(401))).toBe(
      'AUTHENTICATION_REQUIRED',
    );
    expect(h.codeOf(await put('not-a-uuid', designer, { planIds: [], reason: REASON }).expect(422))).toBe(
      'VALIDATION_ERROR',
    );
    expect(h.codeOf(await put(design.id, designer, { planIds: ['x'], reason: REASON }).expect(422))).toBe(
      'VALIDATION_ERROR',
    );
    expect(h.codeOf(await put(design.id, designer, { reason: REASON }).expect(422))).toBe('VALIDATION_ERROR');
    expect(h.codeOf(await put(design.id, designer, { planIds: [], reason: REASON, extra: 1 }).expect(422))).toBe(
      'VALIDATION_ERROR',
    );
  });
});
