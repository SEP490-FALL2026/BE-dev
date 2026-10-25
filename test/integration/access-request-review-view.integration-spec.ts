import request from 'supertest';
import { PgRelay } from '../support/pg-relay';
import { QueryCounter, dataStatements } from '../support/query-count';
import { AccessRequestWire, Department, Person, RequestHarness } from '../support/request-harness';

const h = new RequestHarness();

interface SeatsWire {
  items: {
    assignmentId: string;
    plan: { planId: string; planName: string };
    accountIdentifier: string;
    heldSince: string;
  }[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}

describe('requests over HTTP: what the head sees of a request (integration, real PostgreSQL)', () => {
  let relay: PgRelay;
  let design: Department;
  let head: Person;
  let designer: Person;
  let figma: string; // paid software asked for
  let sketch: string; // same functional group as Figma, held by the designer
  let penpot: string; // same group, held by the designer
  let jira: string; // another group, held by the designer
  let counter: QueryCounter;

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
    design = await h.departmentWithUnit('P-DES');
    head = await h.staff(design, 'DES-H1');
    designer = await h.staff(design, 'DES-E1');
    await h.makeHead(design, head);
    await h.setRole('SPENDING_APPROVER', await h.staff(design, 'DES-C1'));
    figma = await h.plan('K2');
    sketch = await h.plan('K5');
    penpot = await h.plan('K5');
    jira = await h.plan('K5');
    await h.groupTogether([figma, sketch, penpot]);
    await h.hold('DES-E1', sketch);
    await h.hold('DES-E1', penpot);
    await h.hold('DES-E1', jira);
  }, 300000);

  afterAll(async () => {
    await h.stop();
    await relay?.stop();
  });

  const seats = (id: string, account: Person['account'], query = '') =>
    request(h.server()).get(`/api/v1/access-requests/${id}/similar-seats${query}`).set(h.as(account));
  const wire = async (id: string, account: Person['account'], query = '') =>
    h.dataOf<SeatsWire>(await seats(id, account, query).expect(200));

  describe('the flag outside the standard toolset (US-05-04 AC-7)', () => {
    it('is raised for a tool outside the standard toolset of the sender, with their reason, and stops nothing', async () => {
      const sent = await h.sent(designer, figma, { outsideStandardReason: 'The project needs a wiki' });

      const read = h.dataOf<{ request: AccessRequestWire }>(await h.fetch(sent.id, head.account).expect(200)).request;
      const approved = await h.decide(sent.id, { decision: 'APPROVE' }, head.account).expect(200);

      expect(read).toMatchObject({ outsideStandard: true, outsideStandardReason: 'The project needs a wiki' });
      expect(h.dataOf<{ request: AccessRequestWire }>(approved).request.state).toBe('AWAITING_SPEND_SUBMISSION');
    });

    it('is not raised for a tool in the toolset, and is fixed when the request is sent', async () => {
      await h.setToolset(design, [figma]);
      const inside = await h.sent(designer, figma);
      await h.setToolset(design, []);
      const outside = await h.sent(designer, figma);
      const reread = h.dataOf<{ request: AccessRequestWire }>(
        await h.fetch(inside.id, head.account).expect(200),
      ).request;

      expect(inside.outsideStandard).toBe(false);
      expect(reread.outsideStandard).toBe(false);
      expect(outside.outsideStandard).toBe(true);
    });
  });

  describe('the seats the person already holds in tools that do the same work (US-05-04 AC-3)', () => {
    it('shows the head the seats in the same functional group, oldest first, and not the others', async () => {
      const sent = await h.sent(designer, figma);

      const page = await wire(sent.id, head.account);

      expect(page.items.map((seat) => seat.plan.planId).sort()).toEqual([penpot, sketch].sort());
      expect(page.items.map((seat) => seat.plan.planId)).not.toContain(jira);
      expect(page.items[0]).toMatchObject({ accountIdentifier: 'des-e1@acme.vn' });
      expect(page.pagination).toMatchObject({ page: 1, totalItems: 2, totalPages: 1 });
    });

    it('pages the seats and refuses a bad page', async () => {
      const sent = await h.sent(designer, figma);

      const first = await wire(sent.id, head.account, '?page=1&pageSize=1');
      const second = await wire(sent.id, head.account, '?page=2&pageSize=1');

      expect(first.items).toHaveLength(1);
      expect(second.items).toHaveLength(1);
      expect(first.items[0].assignmentId).not.toBe(second.items[0].assignmentId);
      expect(first.pagination).toMatchObject({ totalItems: 2, totalPages: 2 });
      expect(h.codeOf(await seats(sent.id, head.account, '?pageSize=101').expect(422))).toBe('VALIDATION_ERROR');
    });

    it('shows nothing for a tool whose application is in no group', async () => {
      const lone = await h.sent(designer, await h.plan('K2'));

      expect((await wire(lone.id, head.account)).items).toEqual([]);
    });

    it('is for the person who holds the step: the sender and an IT Admin are refused, a stranger sees nothing', async () => {
      const sent = await h.sent(designer, figma);

      expect(h.codeOf(await seats(sent.id, designer.account).expect(403))).toBe('ACCESS_REQUEST.NOT_THE_ASSIGNEE');
      expect(h.codeOf(await seats(sent.id, h.it1).expect(403))).toBe('ACCESS_REQUEST.NOT_THE_ASSIGNEE');
      expect(h.codeOf(await seats(sent.id, h.finance).expect(404))).toBe('ACCESS_REQUEST.NOT_FOUND');
      await request(h.server()).get(`/api/v1/access-requests/${sent.id}/similar-seats`).expect(401);
    });

    it('reads a constant number of statements whatever the number of seats held, and only the page', async () => {
      const sent = await h.sent(designer, figma);
      const run = () => counter.run(() => seats(sent.id, head.account, '?pageSize=100').expect(200));

      const few = dataStatements((await run()).statements);
      for (let index = 0; index < 8; index += 1) {
        const more = await h.plan('K5');
        await h.joinGroupOf(figma, [more]);
        await h.hold('DES-E1', more);
      }
      const many = await run();

      expect(dataStatements(many.statements)).toHaveLength(few.length);
      expect(h.dataOf<SeatsWire>(many.result).items).toHaveLength(10);
    });
  });
});
