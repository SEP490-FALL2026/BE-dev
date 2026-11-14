import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { RequestHarness, type Department, type Person } from '../../support/request-harness';

const h = new RequestHarness();

interface ProposalWire {
  proposalId: string;
  department: { id: string; code: string; name: string };
  applicationId: string;
  applicationName: string;
  planId: string | null;
  planName: string | null;
  reason: string;
  state: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  proposedBy: { employeeId: string; employeeCode: string; fullName: string };
  proposedAt: string;
  decidedAt: string | null;
  decisionReason: string | null;
}
interface PageWire {
  items: ProposalWire[];
  pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
}
interface Place {
  applicationId: string;
  planId: string;
}

/**
 * DS.3 (`QĐ-110t`, `QĐ-111c`, SPEC P18, T-IT): the proposals to add to the list of software of a department, over HTTP, on real PostgreSQL. Only
 * the head proposes, for their own department and only a place of the catalog; one proposal is open for a place; the IT Admin in charge accepts
 * (the place goes in the list) or rejects with a reason, once; the IT Admin is told of a proposal and the head of its decision.
 */
describe('the proposals for the list of software of a department over HTTP (integration, real PostgreSQL)', () => {
  let design: Department;
  let finance: Department;
  let designHead: Person;
  let designMember: Person;
  let financeHead: Person;
  let designIt: Person;
  let financeIt: Person;
  let counter = 0;

  const propose = (who: Record<string, string>, body: object) =>
    request(h.server()).post('/api/v1/department-software-proposals').set(who).send(body);
  const proposals = (who: Record<string, string>, query: object = {}) =>
    request(h.server()).get('/api/v1/department-software-proposals').query(query).set(who);
  const accept = (id: string, who: Record<string, string>) =>
    request(h.server()).post(`/api/v1/department-software-proposals/${id}/acceptance`).set(who);
  const reject = (id: string, who: Record<string, string>, body: object = { reason: 'Not for this team' }) =>
    request(h.server()).post(`/api/v1/department-software-proposals/${id}/rejection`).set(who).send(body);
  const listOf = (departmentId: string) =>
    request(h.server())
      .get(`/api/v1/departments/${departmentId}/software-list`)
      .query({ pageSize: 100 })
      .set({ Authorization: `Bearer ${h.admin}` });
  const change = (departmentId: string, who: Record<string, string>, body: object) =>
    request(h.server()).post(`/api/v1/departments/${departmentId}/software-list/changes`).set(who).send(body);
  const listed = async (departmentId: string) =>
    h.dataOf<{ items: { entryId: string; applicationId: string; planId: string | null }[] }>(
      await listOf(departmentId).expect(200),
    ).items;
  const place = async (): Promise<Place> => {
    const planId = await h.plan('K1');
    const { rows } = await h.ctx.sql.query<{ application_id: string }>(
      'SELECT application_id FROM plans WHERE id = $1',
      [planId],
    );

    return { applicationId: rows[0].application_id, planId };
  };
  const proposedBy = async (who: Person, place_: Place | { applicationId: string }): Promise<ProposalWire> =>
    h.dataOf<{ proposal: ProposalWire }>(
      await propose(h.as(who.account), { ...place_, reason: 'The team needs it' }).expect(201),
    ).proposal;
  const notices = async (code: string, subjectId: string) =>
    (
      await h.ctx.sql.query<{ recipient: string; params: Record<string, unknown> }>(
        `SELECT recipient_employee_id AS recipient, params FROM in_app_notifications
          WHERE code = $1 AND subject_id = $2 ORDER BY recipient_employee_id`,
        [code, subjectId],
      )
    ).rows;
  const auditActions = async (resourceId: string): Promise<string[]> =>
    (
      await h.ctx.sql.query<{ action: string }>(
        'SELECT action FROM audit_events WHERE resource_id = $1 ORDER BY action',
        [resourceId],
      )
    ).rows.map((row) => row.action);
  const state = async (id: string): Promise<string> =>
    (await h.ctx.sql.query<{ state: string }>('SELECT state FROM department_software_proposals WHERE id = $1', [id]))
      .rows[0].state;

  beforeAll(async () => {
    await h.start();
    design = await h.departmentWithUnit('P-DSP-D');
    finance = await h.departmentWithUnit('P-DSP-F');
    designHead = await h.staff(design, 'DSP-D-H');
    designMember = await h.staff(design, 'DSP-D-M');
    financeHead = await h.staff(finance, 'DSP-F-H');
    designIt = await h.staff(design, 'DSP-D-IT', 'IT_ADMIN');
    financeIt = await h.staff(finance, 'DSP-F-IT', 'IT_ADMIN');
    await h.makeHead(design, designHead);
    await h.makeHead(finance, financeHead);
    await h.setItAdminInCharge(design, designIt);
    await h.setItAdminInCharge(finance, financeIt);
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  describe('proposing', () => {
    it('is the head of the department, for their own department, and tells the IT Admin in charge and nobody else', async () => {
      const here = await place();

      const proposal = await proposedBy(designHead, here);

      expect(proposal).toMatchObject({
        applicationId: here.applicationId,
        planId: here.planId,
        reason: 'The team needs it',
        state: 'PENDING',
        decidedAt: null,
        decisionReason: null,
        department: { id: design.id, code: 'P-DSP-D' },
        proposedBy: { employeeId: designHead.employeeId, employeeCode: 'DSP-D-H' },
      });
      expect(proposal.applicationName).not.toBe('');
      expect(proposal.planName).not.toBe('');
      const told = await notices('DEPARTMENT_SOFTWARE_PROPOSED', proposal.proposalId);
      expect(told.map((notice) => notice.recipient)).toEqual([designIt.employeeId]);
      expect(told[0].params).toEqual({
        proposalId: proposal.proposalId,
        departmentId: design.id,
        applicationId: here.applicationId,
        planId: here.planId,
      });
      expect(await auditActions(proposal.proposalId)).toEqual(['DEPARTMENT_SOFTWARE.PROPOSED']);
    });

    it('is told to every IT Admin who can act while nobody is in charge of the department', async () => {
      const bare = await h.departmentWithUnit(`P-DSP-N${(counter += 1)}`);
      const head = await h.staff(bare, `DSP-N${counter}-H`);
      await h.makeHead(bare, head);

      const proposal = await proposedBy(head, await place());

      const recipients = (await notices('DEPARTMENT_SOFTWARE_PROPOSED', proposal.proposalId)).map(
        (notice) => notice.recipient,
      );
      expect(recipients).toEqual(expect.arrayContaining([designIt.employeeId, financeIt.employeeId, h.it1.employeeId]));
      expect(new Set(recipients).size).toBe(recipients.length);
    });

    it('is refused to a person who does not head a department, an IT Admin and the Super Admin: 403', async () => {
      const here = await place();

      for (const who of [h.as(designMember.account), h.as(designIt.account), { Authorization: `Bearer ${h.admin}` }]) {
        const response = await propose(who, { ...here, reason: 'The team needs it' }).expect(403);
        expect(h.codeOf(response)).toBe('AUTHORIZATION.FORBIDDEN');
      }
    });

    it('is refused for what the catalog does not offer, 422: an unknown application, a retired one, a plan of another application', async () => {
      const one = await place();
      const two = await place();
      const retired = await place();
      await h.ctx.sql.query(`UPDATE applications SET catalog_status = 'RETIRED', retired_at = now() WHERE id = $1`, [
        retired.applicationId,
      ]);

      for (const body of [
        { applicationId: randomUUID() },
        { applicationId: retired.applicationId },
        { applicationId: retired.applicationId, planId: retired.planId },
        { applicationId: one.applicationId, planId: two.planId },
      ]) {
        const response = await propose(h.as(designHead.account), { ...body, reason: 'The team needs it' }).expect(422);
        expect(h.codeOf(response)).toBe('DEPARTMENT_SOFTWARE.NOT_IN_CATALOG');
        expect(h.detailsOf(response).places).toEqual([
          { applicationId: body.applicationId, planId: (body as { planId?: string }).planId ?? null },
        ]);
      }
    });

    it('is refused for a place that is in the list already, 409', async () => {
      const here = await place();
      await change(design.id, h.as(designIt.account), { add: [{ applicationId: here.applicationId }] }).expect(200);

      const response = await propose(h.as(designHead.account), {
        applicationId: here.applicationId,
        reason: 'Again',
      }).expect(409);

      expect(h.codeOf(response)).toBe('DEPARTMENT_SOFTWARE.ALREADY_LISTED');
    });

    it('keeps one open proposal for a place: a second is 409 whether it comes after or together, and another place or plan is free', async () => {
      const here = await place();
      const first = await proposedBy(designHead, { applicationId: here.applicationId });

      const second = await propose(h.as(designHead.account), {
        applicationId: here.applicationId,
        reason: 'Twice',
      }).expect(409);

      expect(h.codeOf(second)).toBe('DEPARTMENT_SOFTWARE.PROPOSAL_ALREADY_OPEN');
      await proposedBy(designHead, here);
      const together = await place();
      const answers = await Promise.all([
        propose(h.as(designHead.account), { applicationId: together.applicationId, reason: 'One' }),
        propose(h.as(designHead.account), { applicationId: together.applicationId, reason: 'Two' }),
      ]);
      expect(answers.map((answer) => answer.status).sort()).toEqual([201, 409]);
      expect(await state(first.proposalId)).toBe('PENDING');
    });
  });

  describe('reading the proposals', () => {
    it('is the proposals of the department of the head and of the departments the IT Admin is in charge of, and no others', async () => {
      const mine = await proposedBy(designHead, await place());
      const theirs = await proposedBy(financeHead, await place());

      const byDesignHead = h.dataOf<PageWire>(await proposals(h.as(designHead.account), { pageSize: 100 }).expect(200));
      const byDesignIt = h.dataOf<PageWire>(await proposals(h.as(designIt.account), { pageSize: 100 }).expect(200));
      const byFinanceIt = h.dataOf<PageWire>(await proposals(h.as(financeIt.account), { pageSize: 100 }).expect(200));

      const idsOf = (page: PageWire) => page.items.map((item) => item.proposalId);
      expect(idsOf(byDesignHead)).toContain(mine.proposalId);
      expect(idsOf(byDesignHead)).not.toContain(theirs.proposalId);
      expect(idsOf(byDesignIt)).toContain(mine.proposalId);
      expect(idsOf(byDesignIt)).not.toContain(theirs.proposalId);
      expect(idsOf(byFinanceIt)).toContain(theirs.proposalId);
      expect(idsOf(byFinanceIt)).not.toContain(mine.proposalId);
      expect(byDesignHead.items.every((item) => item.department.id === design.id)).toBe(true);
    });

    it('answers an empty page, not a refusal, for a department or a state outside the scope, and refuses an employee with 403', async () => {
      await proposedBy(designHead, await place());

      const outside = h.dataOf<PageWire>(
        await proposals(h.as(financeIt.account), { departmentId: design.id }).expect(200),
      );
      const none = h.dataOf<PageWire>(
        await proposals(h.as(designIt.account), { state: 'REJECTED', departmentId: finance.id }).expect(200),
      );

      expect(outside.items).toEqual([]);
      expect(outside.pagination.totalItems).toBe(0);
      expect(none.items).toEqual([]);
      await proposals(h.as(designMember.account)).expect(403);
    });

    it('pages newest first and then by id, the same pages twice, and filters by state', async () => {
      const bare = await h.departmentWithUnit(`P-DSP-P${(counter += 1)}`);
      const head = await h.staff(bare, `DSP-P${counter}-H`);
      await h.makeHead(bare, head);
      const made: ProposalWire[] = [];
      for (let index = 0; index < 3; index += 1) made.push(await proposedBy(head, await place()));
      await reject(made[0].proposalId, h.as(h.it1)).expect(200);

      const first = h.dataOf<PageWire>(await proposals(h.as(head.account), { page: 1, pageSize: 2 }).expect(200));
      const second = h.dataOf<PageWire>(await proposals(h.as(head.account), { page: 2, pageSize: 2 }).expect(200));
      const again = h.dataOf<PageWire>(await proposals(h.as(head.account), { page: 1, pageSize: 2 }).expect(200));
      const open = h.dataOf<PageWire>(await proposals(h.as(head.account), { state: 'PENDING' }).expect(200));

      expect(first.pagination).toEqual({ page: 1, pageSize: 2, totalItems: 3, totalPages: 2 });
      expect(again.items.map((item) => item.proposalId)).toEqual(first.items.map((item) => item.proposalId));
      expect(new Set([...first.items, ...second.items].map((item) => item.proposalId)).size).toBe(3);
      const at = [...first.items, ...second.items].map((item) => new Date(item.proposedAt).getTime());
      expect(at).toEqual([...at].sort((a, b) => b - a));
      expect(open.items.map((item) => item.state)).toEqual(['PENDING', 'PENDING']);
    });
  });

  describe('accepting', () => {
    it('adds the place to the list at once, answers its entry, tells the head, and is decided once', async () => {
      const here = await place();
      const proposal = await proposedBy(designHead, here);

      const done = h.dataOf<{ proposal: ProposalWire; entryId: string }>(
        await accept(proposal.proposalId, h.as(designIt.account)).expect(200),
      );

      expect(done.proposal).toMatchObject({ state: 'ACCEPTED', decisionReason: null });
      expect(done.proposal.decidedAt).not.toBeNull();
      const entries = await listed(design.id);
      const entry = entries.find((item) => item.entryId === done.entryId);
      expect(entry).toMatchObject({ applicationId: here.applicationId, planId: here.planId, note: null });
      const told = await notices('DEPARTMENT_SOFTWARE_PROPOSAL_DECIDED', proposal.proposalId);
      expect(told.map((notice) => notice.recipient)).toEqual([designHead.employeeId]);
      expect(told[0].params).toMatchObject({ decision: 'ACCEPTED', reason: null });
      expect(await auditActions(proposal.proposalId)).toEqual([
        'DEPARTMENT_SOFTWARE.PROPOSAL_ACCEPTED',
        'DEPARTMENT_SOFTWARE.PROPOSED',
      ]);
      expect(await auditActions(done.entryId)).toEqual(['DEPARTMENT_SOFTWARE.ENTRY_ADDED']);

      const again = await accept(proposal.proposalId, h.as(designIt.account)).expect(409);
      expect(h.codeOf(again)).toBe('DEPARTMENT_SOFTWARE.PROPOSAL_NOT_PENDING');
      await reject(proposal.proposalId, h.as(designIt.account)).expect(409);
      expect((await listed(design.id)).filter((entry) => entry.applicationId === here.applicationId)).toHaveLength(1);
    });

    it('is not found by an IT Admin who is not in charge of the department, nor by an id that is not a proposal: 404', async () => {
      const proposal = await proposedBy(designHead, await place());

      for (const response of [
        await accept(proposal.proposalId, h.as(financeIt.account)).expect(404),
        await reject(proposal.proposalId, h.as(financeIt.account)).expect(404),
        await accept(randomUUID(), h.as(designIt.account)).expect(404),
      ]) {
        expect(h.codeOf(response)).toBe('DEPARTMENT_SOFTWARE.PROPOSAL_NOT_FOUND');
      }
      expect(await state(proposal.proposalId)).toBe('PENDING');
      expect(await notices('DEPARTMENT_SOFTWARE_PROPOSAL_DECIDED', proposal.proposalId)).toEqual([]);
    });

    it('takes the entry an IT Admin put in the list meanwhile and writes no second one', async () => {
      const here = await place();
      const proposal = await proposedBy(designHead, { applicationId: here.applicationId });
      const added = h.dataOf<{ added: { entryId: string }[] }>(
        await change(design.id, h.as(designIt.account), {
          add: [{ applicationId: here.applicationId, note: 'by hand' }],
        }).expect(200),
      ).added[0];

      const done = h.dataOf<{ entryId: string; proposal: ProposalWire }>(
        await accept(proposal.proposalId, h.as(designIt.account)).expect(200),
      );

      expect(done.entryId).toBe(added.entryId);
      expect(done.proposal.state).toBe('ACCEPTED');
      expect((await listed(design.id)).filter((entry) => entry.applicationId === here.applicationId)).toHaveLength(1);
      expect(await auditActions(added.entryId)).toEqual(['DEPARTMENT_SOFTWARE.ENTRY_ADDED']);
    });

    it('is refused when the catalog no longer offers the place, 422, and the proposal stays open to be rejected', async () => {
      const here = await place();
      const proposal = await proposedBy(designHead, here);
      await h.ctx.sql.query(`UPDATE applications SET catalog_status = 'RETIRED', retired_at = now() WHERE id = $1`, [
        here.applicationId,
      ]);

      const response = await accept(proposal.proposalId, h.as(designIt.account)).expect(422);

      expect(h.codeOf(response)).toBe('DEPARTMENT_SOFTWARE.NOT_IN_CATALOG');
      expect(await state(proposal.proposalId)).toBe('PENDING');
      await reject(proposal.proposalId, h.as(designIt.account), { reason: 'The tool is retired' }).expect(200);
    });
  });

  describe('rejecting', () => {
    it('needs a reason, keeps it, tells the head with it, adds nothing, and lets the place be proposed again', async () => {
      const here = await place();
      const proposal = await proposedBy(designHead, here);

      const missing = await reject(proposal.proposalId, h.as(designIt.account), {}).expect(422);
      expect(h.codeOf(missing)).toBe('VALIDATION_ERROR');
      expect(await state(proposal.proposalId)).toBe('PENDING');

      const done = h.dataOf<{ proposal: ProposalWire }>(
        await reject(proposal.proposalId, h.as(designIt.account), { reason: 'We have a cheaper tool' }).expect(200),
      ).proposal;

      expect(done).toMatchObject({ state: 'REJECTED', decisionReason: 'We have a cheaper tool' });
      const told = await notices('DEPARTMENT_SOFTWARE_PROPOSAL_DECIDED', proposal.proposalId);
      expect(told.map((notice) => notice.recipient)).toEqual([designHead.employeeId]);
      expect(told[0].params).toMatchObject({ decision: 'REJECTED', reason: 'We have a cheaper tool' });
      expect((await listed(design.id)).some((entry) => entry.applicationId === here.applicationId)).toBe(false);
      await proposedBy(designHead, here);
    });

    it('is decided once when an acceptance and a rejection arrive together: one answers 200, the other 409, and the list follows the winner', async () => {
      const here = await place();
      const proposal = await proposedBy(designHead, here);

      const answers = await Promise.all([
        accept(proposal.proposalId, h.as(designIt.account)),
        reject(proposal.proposalId, h.as(designIt.account)),
      ]);

      expect(answers.map((answer) => answer.status).sort()).toEqual([200, 409]);
      const final = await state(proposal.proposalId);
      const inList = (await listed(design.id)).some((entry) => entry.applicationId === here.applicationId);
      expect(inList).toBe(final === 'ACCEPTED');
      expect(await notices('DEPARTMENT_SOFTWARE_PROPOSAL_DECIDED', proposal.proposalId)).toHaveLength(1);
    });
  });
});
