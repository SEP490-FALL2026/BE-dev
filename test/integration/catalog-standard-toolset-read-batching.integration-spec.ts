import request from 'supertest';
import { PgRelay } from '../support/pg-relay';
import { ProvisioningHarness } from '../support/provisioning-harness';
import { QueryCounter, dataStatements } from '../support/query-count';

const h = new ProvisioningHarness();

/** LD-07 of the post-merge review: the toolset list and history read a page in a fixed number of statements and name what they list. */
describe('standard toolset read batching (integration, real PostgreSQL)', () => {
  let relay: PgRelay;
  let counter: QueryCounter;
  let plans: string[];
  let jobTitles: { id: string; name: string }[];
  let departments: { id: string; code: string }[];
  const as = () => h.as(h.it1);

  beforeAll(async () => {
    await h.start({
      appDatabaseUrl: async (directUrl) => {
        const url = new URL(directUrl);
        relay = await PgRelay.start(url.hostname, Number(url.port || 5432));
        url.port = String(relay.port);

        return url.toString();
      },
    });
    counter = QueryCounter.on(relay);
    plans = [];
    for (let index = 0; index < 3; index += 1) plans.push(await h.plan('K2', 'PER_SEAT'));
    jobTitles = [];
    for (const name of ['Designer', 'Developer', 'Tester', 'Analyst']) {
      jobTitles.push({ id: await h.jobTitle(name), name });
    }
    departments = [];
    for (const code of ['D-ONE', 'D-TWO', 'D-THREE']) departments.push(await h.department(code));
  }, 300000);

  afterAll(async () => {
    await h.stop();
    await relay?.stop();
  });

  const set = (departmentId: string, jobTitleId: string, reason: string, planIds = plans) =>
    request(h.server())
      .put(`/api/v1/standard-toolsets/${departmentId}/${jobTitleId}`)
      .set(as())
      .send({ planIds, reason })
      .expect(200);
  const listAll = () =>
    counter.run(() => request(h.server()).get('/api/v1/standard-toolsets?pageSize=100').set(as()).expect(200));

  it('reads 4 toolsets and 12 toolsets in the same number of statements, and names the department and job title of each', async () => {
    for (const jobTitle of jobTitles) await set(departments[0].id, jobTitle.id, 'first setting');
    const few = await listAll();
    for (const department of departments.slice(1)) {
      for (const jobTitle of jobTitles) await set(department.id, jobTitle.id, 'first setting');
    }
    const many = await listAll();

    const items = h.dataOf<{
      items: { department: { id: string; code: string; name: string }; jobTitle: { id: string; name: string } }[];
    }>(many.result).items;
    expect(items).toHaveLength(12);
    for (const item of items) {
      expect(item.department.name).toBe(`Department ${item.department.code}`);
      expect(jobTitles.map((jobTitle) => jobTitle.name)).toContain(item.jobTitle.name);
    }
    expect(dataStatements(many.statements)).toHaveLength(dataStatements(few.statements).length);
  }, 300_000);

  it('reads the plans of every version of a history in one statement, however many versions', async () => {
    const [department, jobTitle] = [departments[0], jobTitles[0]];
    for (let version = 2; version <= 6; version += 1) {
      await set(department.id, jobTitle.id, `setting ${version}`, plans.slice(0, ((version - 2) % 3) + 1));
    }

    const { result, statements } = await counter.run(() =>
      request(h.server())
        .get(`/api/v1/standard-toolsets/${department.id}/${jobTitle.id}/history?pageSize=100`)
        .set(as())
        .expect(200),
    );

    expect(h.dataOf<{ items: unknown[] }>(result).items.length).toBeGreaterThanOrEqual(5);
    const planReads = dataStatements(statements).filter((statement) => /FROM "public"\."plans"/.test(statement));
    expect(planReads.length).toBeLessThanOrEqual(1);
  }, 300_000);
});
