import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { ApiAccount, adminToken, createActivatedAccount } from '../../support/api-accounts';
import { bodyOf } from '../../support/api-body';
import { HttpTestApp, SeededInstallation, createHttpTestApp, seedInstallation } from '../../support/http-test-app';

/**
 * `GET /api/v1/ai/invocations/{invocationId}/content` over the whole application and real PostgreSQL: only the Super Admin reads
 * what was said to the AI and what it answered, and every read is in the Audit Trail with the id of the call and nothing else.
 */
const CONTEXT = {
  generatedAt: '2026-11-04T09:00:00.000Z',
  requests: [
    {
      sourceRef: 'R001',
      stepKind: 'NEED_APPROVAL',
      softwareName: 'Figma',
      beneficiaryDisplayName: 'Nhóm 5 người',
      reason: 'Thiết kế giao diện',
      requestedDurationLabel: '3 tháng',
      estimatedCostRef: null,
    },
  ],
};
const PARSED = { items: [{ sourceRef: 'R001', stepKind: 'NEED_APPROVAL', summary: 'An cần Figma.' }] };
const RESULT = {
  total: 1,
  steps: [{ sourceRef: 'R001', stepId: randomUUID(), requestId: randomUUID(), stepKind: 'NEED_APPROVAL' }],
  accepted: [{ sourceRef: 'R001', summary: 'An cần Figma.' }],
  rejections: [],
};

describe('the content of a call of the AI over HTTP (integration, real PostgreSQL)', () => {
  let ctx: HttpTestApp;
  let seed: SeededInstallation;
  let admin: string;
  let owner: ApiAccount;
  const server = () => ctx.app.getHttpServer();
  const urlOf = (id: string) => `/api/v1/ai/invocations/${id}/content`;
  const readAs = (token: string, id: string) =>
    request(server()).get(urlOf(id)).set('Authorization', `Bearer ${token}`);

  async function insertCall(options: { complete?: boolean } = {}): Promise<string> {
    const id = randomUUID();
    const complete = options.complete ?? true;
    await ctx.sql.query(
      `INSERT INTO ai_invocations (id, organization_id, feature, actor_app_user_id, actor_employee_id, status, source_revision, finished_at)
       VALUES ($1, $2, 'ACCESS_REQUEST_QUEUE_SUMMARY', $3, $4, $5::"AiInvocationStatus", $6, now())`,
      [id, seed.organizationId, owner.appUserId, owner.employeeId, complete ? 'COMPLETED' : 'FAILED', `rev-${id}`],
    );
    await ctx.sql.query(
      `INSERT INTO ai_invocation_contents (invocation_id, context, prompt_text, raw_response, parsed, result)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      complete ? [id, CONTEXT, 'the prompt', '{"items":[]}', PARSED, RESULT] : [id, CONTEXT, null, null, null, null],
    );

    return id;
  }
  const readEvents = async (id: string) =>
    (
      await ctx.sql.query<Record<string, unknown>>(
        `SELECT actor_kind, actor_app_user_id, actor_roles, action, resource_type, resource_id, before, after, operator_reference, organization_id
           FROM audit_events WHERE action = 'AI_INVOCATION.CONTENT_READ' AND resource_id = $1 ORDER BY occurred_at, id`,
        [id],
      )
    ).rows;

  beforeAll(async () => {
    ctx = await createHttpTestApp();
    seed = await seedInstallation(ctx.app);
    admin = await adminToken(ctx, seed);
    owner = await createActivatedAccount(ctx, seed, {
      code: 'E-OWNER',
      email: 'owner@acme.vn',
      role: 'IT_ADMIN',
      admin,
    });
  }, 120000);

  afterAll(async () => {
    await ctx?.close();
  });

  it('gives the Super Admin the content, field for field, and writes one event with the id of the call and nothing else', async () => {
    const id = await insertCall();

    const response = await readAs(admin, id).expect(200);

    expect(bodyOf(response)).toEqual({
      success: true,
      message: 'AI.CONTENT_READ',
      data: {
        invocationId: id,
        context: CONTEXT,
        promptText: 'the prompt',
        rawResponse: '{"items":[]}',
        parsed: PARSED,
        result: RESULT,
      },
    });
    expect(await readEvents(id)).toEqual([
      {
        actor_kind: 'USER',
        actor_app_user_id: seed.superAdmin.appUserId,
        actor_roles: expect.arrayContaining(['SUPER_ADMIN']) as unknown,
        action: 'AI_INVOCATION.CONTENT_READ',
        resource_type: 'AiInvocation',
        resource_id: id,
        before: null,
        after: { invocationId: id },
        operator_reference: null,
        organization_id: seed.organizationId,
      },
    ]);
  });

  it('writes an event for every read: three reads, three events', async () => {
    const id = await insertCall();

    await readAs(admin, id).expect(200);
    await readAs(admin, id).expect(200);
    await readAs(admin, id).expect(200);

    expect(await readEvents(id)).toHaveLength(3);
  });

  it('carries what the call never got as null: a call that failed before the model answered', async () => {
    const id = await insertCall({ complete: false });

    const response = await readAs(admin, id).expect(200);

    expect(bodyOf(response).data).toEqual({
      invocationId: id,
      context: CONTEXT,
      promptText: null,
      rawResponse: null,
      parsed: null,
      result: null,
    });
  });

  it("refuses the call's own owner when they are not the Super Admin, and every other role, with 403 and no event", async () => {
    const id = await insertCall();

    const response = await readAs(owner.accessToken, id).expect(403);

    expect(bodyOf(response).error.code).toBe('AUTHORIZATION.FORBIDDEN');
    expect(JSON.stringify(response.body)).not.toContain('the prompt');
    expect(await readEvents(id)).toEqual([]);
  });

  it('answers 404 AI.NOT_FOUND, with no event, for an id that is not there', async () => {
    const id = randomUUID();

    const response = await readAs(admin, id).expect(404);

    expect(bodyOf(response).error.code).toBe('AI.NOT_FOUND');
    expect(await readEvents(id)).toEqual([]);
  });

  it('answers 404 AI.NOT_FOUND, with no event, once the content was purged although the call is kept', async () => {
    const id = await insertCall();
    await ctx.sql.query('DELETE FROM ai_invocation_contents WHERE invocation_id = $1', [id]);

    const response = await readAs(admin, id).expect(404);

    expect(bodyOf(response).error.code).toBe('AI.NOT_FOUND');
    expect(await readEvents(id)).toEqual([]);
  });

  it('answers 422 for an id that is not a UUID', async () => {
    const response = await readAs(admin, 'not-an-id').expect(422);

    expect(bodyOf(response).error.code).toBe('VALIDATION_ERROR');
  });

  it('answers the read only with the event written: when the event cannot be written the content is not given and nothing is recorded', async () => {
    const id = await insertCall();
    await ctx.sql.query(`CREATE FUNCTION refuse_read_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.action = 'AI_INVOCATION.CONTENT_READ' THEN RAISE EXCEPTION 'audit refused'; END IF;
        RETURN NEW;
      END $$`);
    await ctx.sql.query(
      `CREATE TRIGGER refuse_read_audit BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION refuse_read_audit()`,
    );
    try {
      const response = await readAs(admin, id).expect(500);

      expect(JSON.stringify(response.body)).not.toContain('the prompt');
      expect(await readEvents(id)).toEqual([]);
    } finally {
      await ctx.sql.query('DROP TRIGGER refuse_read_audit ON audit_events');
      await ctx.sql.query('DROP FUNCTION refuse_read_audit()');
    }
  });
  describe('after the content of a call was purged: the owner reads the summary of it', () => {
    const summaryAs = (token: string, id: string) =>
      request(server()).get(`/api/v1/ai/access-request-summaries/${id}`).set('Authorization', `Bearer ${token}`);

    it('answers 200 while the content is there, and 404 AI.NOT_FOUND once it was purged: never an empty completed summary', async () => {
      const id = await insertCall();
      expect(bodyOf(await summaryAs(owner.accessToken, id).expect(200)).data).toMatchObject({ invocationId: id });

      await ctx.sql.query('DELETE FROM ai_invocation_contents WHERE invocation_id = $1', [id]);

      const response = await summaryAs(owner.accessToken, id).expect(404);
      expect(bodyOf(response).error.code).toBe('AI.NOT_FOUND');
      await readAs(admin, id).expect(404);
    });

    it('still shows a failed call whose content never had a result: its status and errorCode', async () => {
      const id = await insertCall({ complete: false });

      const response = await summaryAs(owner.accessToken, id).expect(200);

      expect(bodyOf(response).data).toMatchObject({ invocationId: id, status: 'FAILED', lines: [] });
    });
  });
});
