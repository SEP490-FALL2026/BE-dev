import { AccessRequestWire, Department, Person, RequestHarness } from '../../support/request-harness';

const h = new RequestHarness();

describe('requests over HTTP: the gate of the assessment (integration, real PostgreSQL)', () => {
  let design: Department;
  let executive: Department;
  let head: Person;
  let designer: Person;
  let boss: Person; // the spending approver
  let itAdmin: Person;
  let ownIt: Person;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    design = await h.departmentWithUnit('P-DES');
    executive = await h.departmentWithUnit('P-EXE');
    head = await h.staff(design, 'DES-H1');
    designer = await h.staff(design, 'DES-E1');
    boss = await h.staff(executive, 'EXE-C1');
    ownIt = await h.staff(design, 'DES-IT3', ['IT_ADMIN']);
    itAdmin = { employeeId: h.it1.employeeId, account: h.it1 };
    await h.makeHead(design, head);
    await h.makeHead(executive, await h.staff(executive, 'EXE-H1')); // the Spending Approver does not head a department (QĐ-93b)
    await h.setRole('SPENDING_APPROVER', boss);
    await h.setItAdminInCharge(design, itAdmin);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const count = async (table: string) =>
    Number((await h.ctx.sql.query<{ count: string }>(`SELECT count(*) FROM ${table}`)).rows[0].count);
  const stateOf = async (id: string) =>
    (await h.ctx.sql.query<{ state: string }>(`SELECT state FROM access_requests WHERE id = $1`, [id])).rows[0].state;
  const stepsOf = async (id: string) =>
    (
      await h.ctx.sql.query<{ kind: string; state: string }>(
        `SELECT kind, state FROM access_request_steps WHERE request_id = $1 ORDER BY sequence`,
        [id],
      )
    ).rows;
  /** A proposal whose need the head approved: it waits for the IT Admin. */
  const awaiting = async (): Promise<AccessRequestWire> => {
    counter += 1;
    const proposed = await h.proposed(designer, { softwareName: `Whiteboard ${counter}` });
    await h.decide(proposed.id, { decision: 'APPROVE' }, head.account).expect(200);

    return proposed;
  };
  const reject = (id: string, body: object, account = itAdmin.account) => h.rejectAssessment(id, body, account);
  const assessmentOf = (id: string, account = designer.account) => h.assessmentWire(id, account);
  const alternativePlan = async () => h.planOf(await h.subscription(10));

  describe('a tool that cannot be controlled (US-05-18 AC-1, AC-2)', () => {
    it('ends the request at the assessment, with the reason and the control level it concludes', async () => {
      const proposed = await awaiting();

      const done = h.dataOf<{ request: AccessRequestWire }>(
        await reject(proposed.id, { kind: 'UNCONTROLLABLE', reason: 'No admin page and no member export' }).expect(200),
      ).request;

      expect(done.state).toBe('IT_REJECTED');
      expect(await stepsOf(proposed.id)).toEqual([
        { kind: 'NEED', state: 'APPROVED' },
        { kind: 'IT_ASSESSMENT', state: 'REJECTED' },
      ]);
      expect(await assessmentOf(proposed.id)).toMatchObject({
        status: 'REJECTED',
        controlLevel: 'UNCONTROLLABLE',
        rejection: {
          kind: 'UNCONTROLLABLE',
          reason: 'No admin page and no member export',
          alternative: { plan: null, note: null },
          rejectedBy: { employeeId: itAdmin.employeeId },
        },
      });
    });

    it.each([
      ['no reason', {}],
      ['a blank reason', { reason: '   ' }],
    ])('is not saved with %s, and the request stays with the IT Admin', async (_name, over) => {
      const proposed = await awaiting();

      const response = await reject(proposed.id, { kind: 'UNCONTROLLABLE', ...over }).expect(422);

      expect(h.codeOf(response)).toBe('VALIDATION_ERROR');
      expect(await stateOf(proposed.id)).toBe('AWAITING_IT_ASSESSMENT');
      expect((await stepsOf(proposed.id))[1].state).toBe('PENDING');
      expect((await assessmentOf(proposed.id)).status).toBe('DRAFT');
    });

    it('cannot be completed into a request for the spending approver: completing it points at the gate', async () => {
      const proposed = await awaiting();
      await h
        .saveAssessment(proposed.id, h.assessmentBody({ controlLevel: 'UNCONTROLLABLE' }), itAdmin.account)
        .expect(200);

      const response = await h.completeAssessment(proposed.id, itAdmin.account).expect(409);

      expect(h.codeOf(response)).toBe('ASSESSMENT.CONTROL_LEVEL_UNCONTROLLABLE');
      expect(await stateOf(proposed.id)).toBe('AWAITING_IT_ASSESSMENT');
    });
  });

  describe('what follows a refusal (AC-3, AC-9, AC-10)', () => {
    it('has no spend step, no snapshot or commitment, and the spending approver never sees it', async () => {
      const proposed = await awaiting();
      await reject(proposed.id, { kind: 'UNCONTROLLABLE', reason: 'Cannot be controlled' }).expect(200);

      expect((await stepsOf(proposed.id)).map((step) => step.kind)).toEqual(['NEED', 'IT_ASSESSMENT']);
      await h.assessmentOf(proposed.id, boss.account).expect(404);
      await h.fetch(proposed.id, boss.account).expect(404);
      const refused = h.dataOf<{ request: AccessRequestWire }>(
        await h.fetch(proposed.id, designer.account).expect(200),
      );
      expect(refused.request).toMatchObject({ state: 'IT_REJECTED', pricing: { status: 'MISSING' } });
    });

    it('is read, with its reason and alternative, by the person who asked, the head and an IT Admin', async () => {
      const proposed = await awaiting();
      const plan = await alternativePlan();
      await reject(proposed.id, {
        kind: 'UNCONTROLLABLE',
        reason: 'The Starter plan has no admin page',
        alternativePlanId: plan,
        alternativeNote: 'The Business plan can be controlled',
      }).expect(200);

      for (const reader of [designer, head, itAdmin]) {
        expect((await assessmentOf(proposed.id, reader.account)).rejection).toMatchObject({
          reason: 'The Starter plan has no admin page',
          alternative: { plan: { planId: plan }, note: 'The Business plan can be controlled' },
        });
      }
    });

    it('gives only the reason when there is no alternative (AC-10)', async () => {
      const proposed = await awaiting();

      await reject(proposed.id, { kind: 'UNCONTROLLABLE', reason: 'Nothing comparable can be controlled' }).expect(200);

      expect((await assessmentOf(proposed.id)).rejection).toMatchObject({
        reason: 'Nothing comparable can be controlled',
        alternative: { plan: null, note: null },
      });
    });

    it('refuses an alternative plan that does not exist', async () => {
      const proposed = await awaiting();

      const response = await reject(proposed.id, {
        kind: 'UNCONTROLLABLE',
        reason: 'No admin page',
        alternativePlanId: '00000000-0000-4000-8000-000000000000',
      }).expect(422);

      expect(h.codeOf(response)).toBe('ASSESSMENT.REFERENCE_NOT_FOUND');
      expect(h.detailsOf(response)).toEqual({ field: 'alternativePlanId' });
      expect(await stateOf(proposed.id)).toBe('AWAITING_IT_ASSESSMENT');
    });

    it('cannot be granted, linked to the catalog, completed or refused again', async () => {
      const proposed = await awaiting();
      await reject(proposed.id, { kind: 'UNCONTROLLABLE', reason: 'No admin page' }).expect(200);

      const grant = await h.grant({ requestId: proposed.id });
      const link = await h.linkPlan(proposed.id, await h.plan('K5'), itAdmin.account);
      const complete = await h.completeAssessment(proposed.id, itAdmin.account);
      const again = await reject(proposed.id, { kind: 'NOT_ELIGIBLE', reason: 'Again' });

      expect(grant.status).toBe(409);
      expect(h.codeOf(grant)).toBe('PROVISIONING.REQUEST_ENDED');
      expect(link.status).toBe(409);
      expect(h.codeOf(complete)).toBe('ACCESS_REQUEST.NOT_AWAITING_ASSESSMENT');
      expect(h.codeOf(again)).toBe('ACCESS_REQUEST.NOT_AWAITING_ASSESSMENT');
    });
  });

  describe('an alternative is a new request, never the old one changed (AC-4)', () => {
    it('leaves the refused request as it is and routes the new one from the start', async () => {
      const refused = await awaiting();
      const plan = await alternativePlan();
      await reject(refused.id, { kind: 'UNCONTROLLABLE', reason: 'No admin page', alternativePlanId: plan }).expect(
        200,
      );

      const fresh = await h.sent(designer, plan);

      expect(fresh.id).not.toBe(refused.id);
      expect(fresh).toMatchObject({ state: 'PENDING', needStep: { assignee: { employeeId: head.employeeId } } });
      expect(await stateOf(refused.id)).toBe('IT_REJECTED');
    });
  });

  describe('software that is not eligible for the catalog (AC-11)', () => {
    it('ends the request with that kind, adds nothing to the catalog and has no free outcome', async () => {
      const proposed = await awaiting();
      const before = await Promise.all(['applications', 'plans', 'vendors', 'subscriptions'].map(count));

      await reject(proposed.id, { kind: 'NOT_ELIGIBLE', reason: 'Only a personal edition exists' }).expect(200);

      expect(await Promise.all(['applications', 'plans', 'vendors', 'subscriptions'].map(count))).toEqual(before);
      expect(await stateOf(proposed.id)).toBe('IT_REJECTED');
      expect((await assessmentOf(proposed.id)).rejection).toMatchObject({
        kind: 'NOT_ELIGIBLE',
        reason: 'Only a personal edition exists',
      });
      expect((await assessmentOf(proposed.id)).controlLevel).toBeNull();
    });

    it('needs its reason, and offers no outcome for free software', async () => {
      const proposed = await awaiting();

      const missing = await reject(proposed.id, { kind: 'NOT_ELIGIBLE' }).expect(422);
      const free = await reject(proposed.id, { kind: 'FREE_SOFTWARE', reason: 'It costs nothing' }).expect(422);

      expect(h.codeOf(missing)).toBe('VALIDATION_ERROR');
      expect(h.codeOf(free)).toBe('VALIDATION_ERROR');
      expect(await stateOf(proposed.id)).toBe('AWAITING_IT_ASSESSMENT');
    });
  });

  describe('a tool that is controlled goes on (AC-5, AC-6)', () => {
    it.each(['PARTIAL', 'FULL'])(
      'with the level %s the request goes to the spend, and the approver reads the level and the risk',
      async (level) => {
        const proposed = await awaiting();
        await h
          .saveAssessment(
            proposed.id,
            h.assessmentBody({ controlLevel: level, controlRiskNote: 'Usage cannot be exported' }),
            itAdmin.account,
          )
          .expect(200);

        await h.completeAssessment(proposed.id, itAdmin.account).expect(200);

        expect(await stateOf(proposed.id)).toBe('AWAITING_SPEND_SUBMISSION');
        expect(await assessmentOf(proposed.id, boss.account)).toMatchObject({
          controlLevel: level,
          controlRiskNote: 'Usage cannot be exported',
          rejection: null,
        });
      },
    );
  });

  describe('only the proposals of the third branch, and only the IT Admin (AC-8, AC-9)', () => {
    it('has no gate for software already in the catalog', async () => {
      const sent = await h.sent(designer, await h.plan('K2'));

      const response = await reject(sent.id, { kind: 'UNCONTROLLABLE', reason: 'Not here' }).expect(404);

      expect(h.codeOf(response)).toBe('ACCESS_REQUEST.NOT_FOUND');
      expect((await stepsOf(sent.id)).map((step) => step.kind)).toEqual(['NEED']);
    });

    it.each([
      ['the person who asked', () => designer],
      ['the head', () => head],
      ['the spending approver', () => boss],
    ])('is not refused by %s', async (_name, who) => {
      const proposed = await awaiting();

      await reject(proposed.id, { kind: 'UNCONTROLLABLE', reason: 'No' }, who().account).expect(403);
      await reject(proposed.id, { kind: 'UNCONTROLLABLE', reason: 'No' }, h.finance).expect(403);
      expect(await stateOf(proposed.id)).toBe('AWAITING_IT_ASSESSMENT');
    });

    it('is not refused by an IT Admin for a request they asked for, nor before the need is approved', async () => {
      const own = await h.proposed(ownIt, { softwareName: 'Own whiteboard' });
      await h.decide(own.id, { decision: 'APPROVE' }, head.account).expect(200);
      const waiting = await h.proposed(designer, { softwareName: 'Waiting whiteboard' });

      const ownRefusal = await reject(own.id, { kind: 'UNCONTROLLABLE', reason: 'No' }, ownIt.account).expect(403);
      const early = await reject(waiting.id, { kind: 'UNCONTROLLABLE', reason: 'No' }).expect(409);

      expect(h.codeOf(ownRefusal)).toBe('ACCESS_REQUEST.OWN_REQUEST');
      expect(h.codeOf(early)).toBe('ACCESS_REQUEST.NOT_AWAITING_ASSESSMENT');
    });

    it('is audited with its kind and whether there was an alternative', async () => {
      const proposed = await awaiting();
      await reject(proposed.id, {
        kind: 'NOT_ELIGIBLE',
        reason: 'Personal edition only',
        alternativeNote: 'Use the team plan',
      }).expect(200);

      const events = await h.auditEvents('ACCESS_REQUEST', proposed.id);
      const refused = events.find((event) => event.action === 'ACCESS_REQUEST.ASSESSMENT_REJECTED');

      expect(refused?.after).toMatchObject({ kind: 'NOT_ELIGIBLE', withAlternative: true });
    });
  });
});
