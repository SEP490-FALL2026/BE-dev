import request from 'supertest';
import { PgRelay } from '../../support/pg-relay';
import { QueryCounter } from '../../support/query-count';
import { RequestHarness } from '../../support/request-harness';

describe('retired project labels and old drafts (integration)', () => {
  const h = new RequestHarness();
  let relay: PgRelay;
  beforeAll(async () => {
    await h.start({
      appDatabaseUrl: async (directUrl) => {
        const url = new URL(directUrl);
        relay = await PgRelay.start(url.hostname, Number(url.port || 5432));
        url.port = String(relay.port);
        return url.toString();
      },
    });
  }, 240000);
  afterAll(async () => {
    await h.stop();
    await relay?.stop();
  });

  it('sends an old draft and never reads or writes the retired column', async () => {
    const department = await h.departmentWithUnit('P-RET');
    const head = await h.staff(department, 'RET-H');
    const employee = await h.staff(department, 'RET-E');
    await h.makeHead(department, head);
    const plan = await h.planOf(await h.subscription(10));
    const secondPlan = await h.planOf(await h.subscription(10));
    const counter = QueryCounter.on(relay);
    const save = await counter.run(() =>
      request(h.server())
        .post('/api/v1/access-requests/drafts')
        .set(h.as(employee.account))
        .send({ kind: 'INDIVIDUAL', ...h.form(plan) })
        .then((response) => response),
    );
    expect(save.result.status).toBe(201);
    const id = (save.result.body as { data: { draft: { id: string } } }).data.draft.id;
    await h.ctx.sql.query(
      `UPDATE access_requests SET policy = jsonb_set(policy, '{draft,projectLabel}', '"Old label"'::jsonb) WHERE id = $1`,
      [id],
    );
    const send = await counter.run(() =>
      request(h.server())
        .post(`/api/v1/access-requests/drafts/${id}/submission`)
        .set(h.as(employee.account))
        .send({})
        .then((response) => response),
    );
    expect(send.result.status).toBe(201);
    expect(JSON.stringify(send.result.body)).not.toContain('projectLabel');
    const policy = await h.ctx.sql.query<{ policy: unknown }>('SELECT policy FROM access_requests WHERE id = $1', [id]);
    expect(JSON.stringify(policy.rows[0].policy)).not.toContain('projectLabel');
    const preview = await counter.run(() =>
      h.previewRequest({ planId: secondPlan, termMonths: 6 }, employee.account).then((response) => response),
    );
    expect(preview.result.status).toBe(200);
    const submitted = await counter.run(() =>
      h.submit(h.form(secondPlan), employee.account).then((response) => response),
    );
    expect(submitted.result.status).toBe(201);
    const requestId = (submitted.result.body as { data: { request: { id: string } } }).data.request.id;
    const read = await counter.run(() => h.fetch(requestId, employee.account).then((response) => response));
    expect(read.result.status).toBe(200);
    expect(JSON.stringify(read.result.body)).not.toContain('projectLabel');
    expect(
      [
        ...save.statements,
        ...send.statements,
        ...preview.statements,
        ...submitted.statements,
        ...read.statements,
      ].filter((sql) => /project_label/i.test(sql)),
    ).toEqual([]);
  }, 240000);
});
