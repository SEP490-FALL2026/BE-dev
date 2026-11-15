import request from 'supertest';
import { addDays } from '../../../src/core/business-date';
import { LicensingDepartmentToolsApi } from '../../../src/modules/licensing/public/licensing-department-tools.api';
import {
  DepartmentSoftwareNoteInvalidError,
  DepartmentSoftwareNotInCatalogError,
  ToolsDepartmentNotFoundError,
} from '../../../src/modules/licensing/public/licensing.errors';
import { declareApplication, declarePlan } from '../../support/builders/catalog.builder';
import { AccessRequestWire, Department, Person, RequestHarness } from '../../support/request-harness';

const h = new RequestHarness();

/**
 * Software the catalog has or lacks, asked for from the other side (IN-1, `QĐ-111a`, `QĐ-111b`, `QĐ-111c`, R-25): the proposal of software the catalog has
 * already is refused with the entry, a plan the application lacks is a short proposal whose assessment is the plan alone, and the IT Admin links the
 * request to a plan the catalog already had and may list it in the department. Real PostgreSQL.
 */
describe('requests: case B against the catalog (integration, real PostgreSQL)', () => {
  let design: Department;
  let noItInCharge: Department;
  let head: Person;
  let designer: Person;
  let itInCharge: Person;
  let otherIt: Person; // an IT Admin who is not in charge of design
  let counter = 0;
  let chatgpt: string; // the application of the catalog: ChatGPT, chatgpt.com, with its plan Plus
  let plus: string;

  beforeAll(async () => {
    await h.start();
    design = await h.departmentWithUnit('P-DES');
    noItInCharge = await h.departmentWithUnit('P-HR');
    head = await h.staff(design, 'DES-H1');
    designer = await h.staff(design, 'DES-E1');
    otherIt = await h.staff(noItInCharge, 'HR-IT2', 'IT_ADMIN');
    itInCharge = { employeeId: h.it1.employeeId, account: h.it1 };
    await h.makeHead(design, head);
    await h.setItAdminInCharge(design, itInCharge);
    // An IT Admin of another department who is in charge of one of its own: out of the scope of design.
    await h.setItAdminInCharge(noItInCharge, otherIt);
    chatgpt = await declareApplication(h.ctx, h.it1.accessToken, {
      name: 'ChatGPT',
      kind: 'SAAS',
      vendorName: 'OpenAI',
      domains: ['chatgpt.com'],
      dataSensitivity: 'LOW',
    });
    plus = await declarePlan(h.ctx, h.it1.accessToken, {
      applicationId: chatgpt,
      name: 'Plus',
      provisioningType: 'K1',
      pricingModel: 'PER_SEAT',
      controlLevel: 'FULL',
    });
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  /** A person of design nobody has asked anything for yet: the limits of a week are per person. */
  const person = async (): Promise<Person> => {
    counter += 1;

    return h.staff(design, 'DES-P' + counter);
  };
  const shortBody = (extra: Record<string, unknown> = {}) =>
    h.proposeBody({
      softwareName: 'ChatGPT Business',
      homepageUrl: 'https://chatgpt.com',
      existingApplicationId: chatgpt,
      plannedPlanName: 'Business',
      ...extra,
    });
  /** A short proposal of the designer whose need the head has approved: it waits for the IT Admin to assess the plan. */
  const shortAwaiting = async (extra: Record<string, unknown> = {}): Promise<AccessRequestWire> => {
    const proposed = await h.proposed(await person(), {
      softwareName: 'ChatGPT Business',
      homepageUrl: 'https://chatgpt.com',
      existingApplicationId: chatgpt,
      plannedPlanName: 'Business',
      ...extra,
    });
    await h.decide(proposed.id, { decision: 'APPROVE' }, head.account).expect(200);

    return proposed;
  };
  const planFields = (extra: Record<string, unknown> = {}) => ({
    provisioningType: 'K2',
    termsSummary: 'Annual terms, 5 seats at least',
    quote: {
      unitPrice: { amount: '200000', currency: 'VND' },
      billingCycle: 'MONTHLY',
      validFrom: '2026-01-01',
      validUntil: null,
    },
    ...extra,
  });
  const stateOf = async (id: string) =>
    (await h.ctx.sql.query<{ state: string }>(`SELECT state FROM access_requests WHERE id = $1`, [id])).rows[0].state;
  const link = (id: string, body: object, account = itInCharge.account) =>
    request(h.server()).post(`/api/v1/access-requests/${id}/catalog-link`).set(h.as(account)).send(body);
  const entriesOf = async (departmentId: string) =>
    (
      await h.ctx.sql.query<{ application_id: string; plan_id: string | null }>(
        `SELECT application_id, plan_id FROM department_software_entries WHERE department_id = $1 ORDER BY added_at`,
        [departmentId],
      )
    ).rows;

  it('a proposal of a person with a term whose contract ended before today is refused 422 ACCESS_REQUEST.TERM_CONTRACT_ENDED with the day the contract ended, and nothing is written', async () => {
    const intern = await person();
    await h.ctx.sql.query(`UPDATE employees SET hire_date = '2020-01-01' WHERE id = $1`, [intern.employeeId]);
    await h.ctx.sql.query(`UPDATE employees SET employment_type = 'INTERN', contract_end_date = $2 WHERE id = $1`, [
      intern.employeeId,
      addDays(h.today(), -1),
    ]);
    const rows = await h.requestRows();

    const refused = await h.propose(h.proposeBody({ termMonths: 3 }), intern.account).expect(422);

    expect(h.codeOf(refused)).toBe('ACCESS_REQUEST.TERM_CONTRACT_ENDED');
    expect(h.detailsOf(refused)).toEqual({ contractEndDate: addDays(h.today(), -1) });
    expect(await h.requestRows()).toBe(rows);
  });

  describe('software the catalog has already (QĐ-111b)', () => {
    it.each([
      ['the same name', { softwareName: 'ChatGPT', homepageUrl: 'https://example.org' }, 'NAME'],
      [
        'the same name, ignoring case, accents and blanks',
        { softwareName: '  chatGPT ', homepageUrl: 'https://example.org' },
        'NAME',
      ],
      [
        'the same domain under another name',
        { softwareName: 'OpenAI Chat', homepageUrl: 'https://www.chatgpt.com/login' },
        'DOMAIN',
      ],
    ])('is refused with the entry, for %s, and nothing is written', async (_name, extra, by) => {
      const before = await h.requestRows();

      const refused = await h.propose(h.proposeBody(extra), designer.account).expect(409);

      expect(h.codeOf(refused)).toBe('ACCESS_REQUEST.SOFTWARE_IN_CATALOG');
      expect(h.detailsOf(refused)).toMatchObject({
        matchedBy: by,
        existing: {
          applicationId: chatgpt,
          name: 'ChatGPT',
          plans: [{ planId: plus, name: 'Plus', provisioningType: 'K1' }],
        },
      });
      expect(await h.requestRows()).toBe(before);
    });

    it('lets software the catalog does not have go on as before, and an application that left the catalog is not an entry to ask for', async () => {
      const retired = await declareApplication(h.ctx, h.it1.accessToken, {
        name: 'OldBoard',
        kind: 'SAAS',
        vendorName: 'Board Co',
        domains: ['oldboard.example'],
        dataSensitivity: 'LOW',
      });
      await h.ctx.sql.query(`UPDATE applications SET catalog_status = 'RETIRED', retired_at = now() WHERE id = $1`, [
        retired,
      ]);

      await h.proposed(await person());
      await h.proposed(await person(), { softwareName: 'OldBoard', homepageUrl: 'https://oldboard.example' });
    });

    it('is told the entry with at most twenty of its plans, and how many there are', async () => {
      const crowded = await declareApplication(h.ctx, h.it1.accessToken, {
        name: 'Crowded Suite',
        kind: 'SAAS',
        vendorName: 'Crowd Co',
        dataSensitivity: 'LOW',
      });
      for (let index = 1; index <= 21; index += 1) {
        await declarePlan(h.ctx, h.it1.accessToken, {
          applicationId: crowded,
          name: `Tier ${String(index).padStart(2, '0')}`,
          provisioningType: 'K1',
          pricingModel: 'PER_SEAT',
          controlLevel: 'FULL',
        });
      }

      const refused = await h
        .propose(
          h.proposeBody({ softwareName: 'Crowded Suite', homepageUrl: 'https://crowd.example' }),
          designer.account,
        )
        .expect(409);

      const existing = h.detailsOf(refused).existing as { plans: unknown[]; planTotal: number };
      expect(existing.plans).toHaveLength(20);
      expect(existing.planTotal).toBe(21);
    });
  });

  describe('a plan the application of the catalog lacks (case B, short: QĐ-111a)', () => {
    it('opens a request of the third branch that names the application, and the assessment starts from the plan asked for and the vendor', async () => {
      const requester = await person();
      const proposed = await h.proposed(requester, {
        softwareName: 'ChatGPT Business',
        homepageUrl: 'https://chatgpt.com',
        existingApplicationId: chatgpt,
        plannedPlanName: 'Business',
      });

      expect(proposed).toMatchObject({
        branch: 'NEW_SOFTWARE',
        state: 'PENDING',
        plan: null,
        proposal: { softwareName: 'ChatGPT Business', existingApplicationId: chatgpt },
      });
      expect(
        (
          await h.ctx.sql.query(`SELECT existing_application_id FROM access_request_proposals WHERE request_id = $1`, [
            proposed.id,
          ])
        ).rows[0],
      ).toEqual({ existing_application_id: chatgpt });
      expect(await h.assessmentWire(proposed.id, requester.account)).toMatchObject({
        status: 'DRAFT',
        scope: 'PLAN_ONLY',
        plannedPlanName: 'Business',
        vendor: { name: 'OpenAI' },
        classification: null,
        complete: false,
        // The IT Admin sees the application the person named, to set it against the software the person typed (B2A-R1).
        proposal: { existingApplicationId: chatgpt, existingApplication: { id: chatgpt, name: 'ChatGPT' } },
      });
      const submitted = (await h.auditEvents('ACCESS_REQUEST', proposed.id)).find(
        (event) => event.action === 'ACCESS_REQUEST.SUBMITTED',
      );
      expect(submitted?.after).toMatchObject({ existingApplicationId: chatgpt, plannedPlanName: 'Business' });
    });

    it('software that is new has the whole to assess and names no application', async () => {
      const requester = await person();
      const proposed = await h.proposed(requester);

      expect(await h.assessmentWire(proposed.id, requester.account)).toMatchObject({
        scope: 'FULL',
        proposal: { existingApplicationId: null, existingApplication: null },
      });
    });

    it('is refused when the plan asked for is one the application has, with the entry: it is asked for from the catalog', async () => {
      const refused = await h.propose(shortBody({ plannedPlanName: ' plus ' }), designer.account).expect(409);

      expect(h.codeOf(refused)).toBe('ACCESS_REQUEST.SOFTWARE_IN_CATALOG');
      expect(h.detailsOf(refused)).toMatchObject({ matchedBy: 'PLAN', existing: { applicationId: chatgpt } });
    });

    it('is refused for an application that does not exist (422, the field) and one that left the catalog (409)', async () => {
      const left = await declareApplication(h.ctx, h.it1.accessToken, {
        name: 'Gone Tool',
        kind: 'SAAS',
        vendorName: 'Gone Co',
        dataSensitivity: 'LOW',
      });
      await h.ctx.sql.query(`UPDATE applications SET catalog_status = 'RETIRED', retired_at = now() WHERE id = $1`, [
        left,
      ]);

      const missing = await h
        .propose(shortBody({ existingApplicationId: '00000000-0000-4000-8000-000000000000' }), designer.account)
        .expect(422);
      const retired = await h.propose(shortBody({ existingApplicationId: left }), designer.account).expect(409);

      expect(h.codeOf(missing)).toBe('ASSESSMENT.REFERENCE_NOT_FOUND');
      expect(h.detailsOf(missing)).toMatchObject({ field: 'existingApplicationId' });
      expect(h.codeOf(retired)).toBe('ACCESS_REQUEST.APPLICATION_RETIRED');
    });

    it('is completed with the plan alone: no classification, no flags, no control level', async () => {
      const proposed = await shortAwaiting();
      await h.saveAssessment(proposed.id, planFields(), itInCharge.account).expect(200);

      expect((await h.assessmentWire(proposed.id, head.account)).complete).toBe(true);
      await h.completeAssessment(proposed.id, itInCharge.account).expect(200);

      expect(await stateOf(proposed.id)).toBe('AWAITING_SPEND_SUBMISSION');
      // A completed assessment always has a classification: a plan alone is paid or licensed.
      expect(
        (
          await h.ctx.sql.query(`SELECT classification FROM access_request_assessments WHERE request_id = $1`, [
            proposed.id,
          ])
        ).rows[0],
      ).toEqual({ classification: 'PAID_LICENSED' });
    });

    describe('a plan of internal software (B2A-R3, QĐ-111d, QĐ-103p)', () => {
      let portal: string; // an internal application of the catalog: its plans are free
      let portalViewer: string; // its plan K5

      beforeAll(async () => {
        portal = await declareApplication(h.ctx, h.it1.accessToken, {
          name: 'Report Portal',
          kind: 'INTERNAL',
          dataSensitivity: 'LOW',
        });
        portalViewer = await declarePlan(h.ctx, h.it1.accessToken, {
          applicationId: portal,
          name: 'Viewer',
          provisioningType: 'K5',
        });
      });

      const forPortal = () =>
        shortAwaiting({
          softwareName: 'Report Portal Admin',
          homepageUrl: 'https://reports.internal.example',
          existingApplicationId: portal,
          plannedPlanName: 'Admin',
        });

      it('is not completed whatever the IT Admin fills: 409 ASSESSMENT.SHORT_PROPOSAL_FREE_PLAN, the assessment stays a draft with the IT Admin, and the queue says so', async () => {
        const proposed = await forPortal();
        await h.saveAssessment(proposed.id, planFields(), itInCharge.account).expect(200);

        const refused = await h.completeAssessment(proposed.id, itInCharge.account).expect(409);

        expect(h.codeOf(refused)).toBe('ASSESSMENT.SHORT_PROPOSAL_FREE_PLAN');
        expect(await stateOf(proposed.id)).toBe('AWAITING_IT_ASSESSMENT');
        expect(
          (await h.ctx.sql.query(`SELECT status FROM access_request_assessments WHERE request_id = $1`, [proposed.id]))
            .rows[0],
        ).toEqual({ status: 'DRAFT' });
        const wire = await h.assessmentWire(proposed.id, itInCharge.account);
        expect(wire.complete).toBe(false);
        expect(wire.proposal.existingApplication).toEqual({ id: portal, name: 'Report Portal' });
        const queue = h.dataOf<{ items: Array<{ requestId: string; readiness: string }> }>(
          await request(h.server()).get('/api/v1/assessment-queue').set(h.as(itInCharge.account)).expect(200),
        );
        expect(queue.items.find((item) => item.requestId === proposed.id)).toMatchObject({ readiness: 'FREE_PLAN' });
        expect(await h.auditEvents('ACCESS_REQUEST', proposed.id)).not.toContainEqual(
          expect.objectContaining({ action: 'ACCESS_REQUEST.ASSESSMENT_COMPLETED' }),
        );
      });

      it('is rejected as not eligible with the plan of the catalog named, which is the way out the refusal points to', async () => {
        const proposed = await forPortal();

        await h
          .rejectAssessment(
            proposed.id,
            {
              kind: 'NOT_ELIGIBLE',
              reason: 'The plan is free: ask for it from the catalog',
              alternativePlanId: portalViewer,
            },
            itInCharge.account,
          )
          .expect(200);

        expect(await stateOf(proposed.id)).not.toBe('AWAITING_IT_ASSESSMENT');
      });

      it('leaves a short proposal for a plan of software that is not internal completable as before', async () => {
        const proposed = await shortAwaiting();
        await h.saveAssessment(proposed.id, planFields(), itInCharge.account).expect(200);

        await h.completeAssessment(proposed.id, itInCharge.account).expect(200);

        expect(await stateOf(proposed.id)).toBe('AWAITING_SPEND_SUBMISSION');
      });
    });

    it('names what the plan still lacks, and nothing of the application, while it is incomplete', async () => {
      const proposed = await shortAwaiting();

      const refused = await h.completeAssessment(proposed.id, itInCharge.account).expect(422);

      expect(h.detailsOf(refused).missing).toEqual(['provisioningType', 'termsSummary', 'quote']);
    });

    it('asks whether a K4 plan has an admin console of the vendor', async () => {
      const proposed = await shortAwaiting();
      await h.saveAssessment(proposed.id, planFields({ provisioningType: 'K4' }), itInCharge.account).expect(200);

      const refused = await h.completeAssessment(proposed.id, itInCharge.account).expect(422);
      await h.saveAssessment(proposed.id, { adminConsole: false }, itInCharge.account).expect(200);
      await h.completeAssessment(proposed.id, itInCharge.account).expect(200);

      expect(h.detailsOf(refused).missing).toEqual(['adminConsole']);
    });

    it('is not registered as internal software, whatever the IT Admin classified: its application is already in the catalog', async () => {
      const proposed = await shortAwaiting();
      await h.saveAssessment(proposed.id, planFields({ classification: 'INTERNAL' }), itInCharge.account).expect(200);

      const refused = await h.registerInternal(proposed.id, {}, itInCharge.account).expect(409);

      expect(h.codeOf(refused)).toBe('ASSESSMENT.NOT_INTERNAL');
    });

    it('still refuses at the gate a plan the IT Admin concluded cannot be controlled', async () => {
      const proposed = await shortAwaiting();
      await h
        .saveAssessment(proposed.id, planFields({ controlLevel: 'UNCONTROLLABLE' }), itInCharge.account)
        .expect(200);

      const refused = await h.completeAssessment(proposed.id, itInCharge.account).expect(409);

      expect(h.codeOf(refused)).toBe('ASSESSMENT.CONTROL_LEVEL_UNCONTROLLABLE');
    });

    it('leaves software that is new asking for the whole: the plan alone is not enough', async () => {
      const proposed = await h.proposed(await person());
      await h.decide(proposed.id, { decision: 'APPROVE' }, head.account).expect(200);
      await h.saveAssessment(proposed.id, planFields({ plannedPlanName: 'Team' }), itInCharge.account).expect(200);

      const refused = await h.completeAssessment(proposed.id, itInCharge.account).expect(422);

      expect(h.detailsOf(refused).missing).toContain('classification');
    });

    it('shows the queue of the IT Admin its scope and what is left to give', async () => {
      const proposed = await shortAwaiting();

      const queue = h.dataOf<{
        items: Array<{ requestId: string; scope: string; readiness: string; missingCount: number }>;
      }>(await request(h.server()).get('/api/v1/assessment-queue').set(h.as(itInCharge.account)).expect(200));

      expect(queue.items.find((item) => item.requestId === proposed.id)).toMatchObject({
        scope: 'PLAN_ONLY',
        readiness: 'INCOMPLETE',
        missingCount: 3,
      });
    });
  });

  describe('linking the request to the catalog (QĐ-111c, R-25)', () => {
    /** Put where the decision of the spending approver leaves a request. */
    const decidedForSpend = async (): Promise<AccessRequestWire> => {
      const proposed = await shortAwaiting();
      await h.ctx.sql.query(`UPDATE access_requests SET state = 'AWAITING_EXECUTION' WHERE id = $1`, [proposed.id]);

      return proposed;
    };

    it('takes a plan the catalog already had, as an IT Admin told the software is there links the request to its entry (R-25), listing nothing', async () => {
      const proposed = await decidedForSpend();

      const linked = h.dataOf<{ request: AccessRequestWire; departmentList: unknown }>(
        await link(proposed.id, { planId: plus }).expect(200),
      );

      expect(linked.request.plan?.planId).toBe(plus);
      expect(linked.departmentList).toBeNull();
      expect(await entriesOf(design.id)).toEqual([]);
    });

    it('puts the application and the plan in the list of the department of the request when the IT Admin ticks it, once', async () => {
      const first = await decidedForSpend();
      const second = await decidedForSpend();

      const added = h.dataOf<{ departmentList: { entryId: string; added: boolean } }>(
        await link(first.id, { planId: plus, addToDepartmentList: true }).expect(200),
      );
      const again = h.dataOf<{ departmentList: { entryId: string; added: boolean } }>(
        await link(second.id, { planId: plus, addToDepartmentList: true }).expect(200),
      );

      expect(added.departmentList.added).toBe(true);
      expect(again.departmentList).toEqual({ entryId: added.departmentList.entryId, added: false });
      expect(await entriesOf(design.id)).toEqual([{ application_id: chatgpt, plan_id: plus }]);
      const audited = await h.ctx.sql.query(
        `SELECT 1 FROM audit_events WHERE action = 'DEPARTMENT_SOFTWARE.ENTRY_ADDED' AND resource_id = $1`,
        [added.departmentList.entryId],
      );
      expect(audited.rowCount).toBe(1);
      const linkedEvent = (await h.auditEvents('ACCESS_REQUEST', first.id)).find(
        (event) => event.action === 'ACCESS_REQUEST.CATALOG_LINKED',
      );
      expect(linkedEvent?.after).toMatchObject({
        addToDepartmentList: true,
        departmentSoftwareEntryId: added.departmentList.entryId,
        departmentSoftwareEntryAdded: true,
      });
    });

    it('lists nothing when the tick is false', async () => {
      // Another plan of the application the proposal names: a short proposal links only to plans of that application (B2A-R1).
      const quiet = await declarePlan(h.ctx, h.it1.accessToken, {
        applicationId: chatgpt,
        name: 'Solo',
        provisioningType: 'K1',
        pricingModel: 'PER_SEAT',
        controlLevel: 'FULL',
      });
      const proposed = await decidedForSpend();

      const linked = h.dataOf<{ departmentList: unknown }>(
        await link(proposed.id, { planId: quiet, addToDepartmentList: false }).expect(200),
      );

      expect(linked.departmentList).toBeNull();
      expect((await entriesOf(design.id)).map((entry) => entry.plan_id)).not.toContain(quiet);
    });

    it('is refused to an IT Admin who is not in charge of the department of the request, and nothing is written (D-118)', async () => {
      const proposed = await decidedForSpend();
      const entriesBefore = await entriesOf(design.id);

      const refused = await link(proposed.id, { planId: plus, addToDepartmentList: true }, otherIt.account).expect(403);

      expect(h.codeOf(refused)).toBe('DEPARTMENT.OUT_OF_SCOPE');
      expect(
        (await h.ctx.sql.query(`SELECT plan_id FROM access_requests WHERE id = $1`, [proposed.id])).rows[0],
      ).toEqual({ plan_id: null });
      expect(await entriesOf(design.id)).toEqual(entriesBefore);
    });

    it('links without the tick as it always did, for an IT Admin of any department', async () => {
      const proposed = await decidedForSpend();

      await link(proposed.id, { planId: plus }, otherIt.account).expect(200);

      expect(
        (await h.ctx.sql.query(`SELECT plan_id FROM access_requests WHERE id = $1`, [proposed.id])).rows[0],
      ).toEqual({ plan_id: plus });
    });

    describe('the plan a short proposal may be linked to (B2A-R1, QĐ-111a, QĐ-53c)', () => {
      let midjourney: string; // another application of the catalog, which no one assessed for this request
      let midjourneyPro: string;
      let chatgptTeam: string; // another plan of the application the proposal names

      beforeAll(async () => {
        midjourney = await declareApplication(h.ctx, h.it1.accessToken, {
          name: 'Midjourney',
          kind: 'SAAS',
          vendorName: 'Midjourney Inc.',
          domains: ['midjourney.com'],
          dataSensitivity: 'LOW',
        });
        midjourneyPro = await declarePlan(h.ctx, h.it1.accessToken, {
          applicationId: midjourney,
          name: 'Pro',
          provisioningType: 'K1',
          pricingModel: 'PER_SEAT',
          controlLevel: 'FULL',
        });
        chatgptTeam = await declarePlan(h.ctx, h.it1.accessToken, {
          applicationId: chatgpt,
          name: 'Team',
          provisioningType: 'K1',
          pricingModel: 'PER_SEAT',
          controlLevel: 'FULL',
        });
      });

      /** The proposal of software that is new, the need approved and the spending approver's decision given: the IT Admin has no assessment of an application to rest on. */
      const newSoftwareDecidedForSpend = async (): Promise<AccessRequestWire> => {
        counter += 1;
        const proposed = await h.proposed(await person(), {
          softwareName: 'Fresh Tool ' + counter,
          homepageUrl: `https://fresh-tool-${counter}.example`,
        });
        await h.decide(proposed.id, { decision: 'APPROVE' }, head.account).expect(200);
        await h.ctx.sql.query(`UPDATE access_requests SET state = 'AWAITING_EXECUTION' WHERE id = $1`, [proposed.id]);

        return proposed;
      };
      const planOf = async (id: string) =>
        (await h.ctx.sql.query<{ plan_id: string | null }>(`SELECT plan_id FROM access_requests WHERE id = $1`, [id]))
          .rows[0].plan_id;
      const linkedEventsOf = async (id: string) =>
        (await h.auditEvents('ACCESS_REQUEST', id)).filter((event) => event.action === 'ACCESS_REQUEST.CATALOG_LINKED');

      it.each([[false], [true]])(
        'refuses a plan of another application than the one the proposal names (tick %s): 422 with the application expected, and nothing is written',
        async (tick) => {
          const proposed = await decidedForSpend();
          const entriesBefore = await entriesOf(design.id);

          const refused = await link(proposed.id, { planId: midjourneyPro, addToDepartmentList: tick }).expect(422);

          expect(h.codeOf(refused)).toBe('ACCESS_REQUEST.CATALOG_LINK_APPLICATION_MISMATCH');
          expect(h.detailsOf(refused)).toEqual({ expectedApplicationId: chatgpt });
          expect(await planOf(proposed.id)).toBeNull();
          expect(await linkedEventsOf(proposed.id)).toEqual([]);
          expect(await entriesOf(design.id)).toEqual(entriesBefore);
        },
      );

      it('takes another plan of the application the proposal names, and lists that application with the tick', async () => {
        const proposed = await decidedForSpend();

        const linked = h.dataOf<{ request: AccessRequestWire; departmentList: { added: boolean } | null }>(
          await link(proposed.id, { planId: chatgptTeam, addToDepartmentList: true }).expect(200),
        );

        expect(linked.request.plan?.planId).toBe(chatgptTeam);
        expect(await entriesOf(design.id)).toContainEqual({ application_id: chatgpt, plan_id: chatgptTeam });
      });

      it('leaves software that is new free to link any plan of the catalog (R-25): only a short proposal names the application', async () => {
        const proposed = await newSoftwareDecidedForSpend();

        await link(proposed.id, { planId: midjourneyPro }).expect(200);

        expect(await planOf(proposed.id)).toBe(midjourneyPro);
      });
    });

    describe('the list of the department behind the tick (D-118, D-122)', () => {
      const facade = () => h.ctx.app.get(LicensingDepartmentToolsApi, { strict: false });
      const planOf = async (id: string) =>
        (await h.ctx.sql.query<{ plan_id: string | null }>(`SELECT plan_id FROM access_requests WHERE id = $1`, [id]))
          .rows[0].plan_id;
      const linkedEvents = async (id: string) =>
        (await h.auditEvents('ACCESS_REQUEST', id)).filter((event) => event.action === 'ACCESS_REQUEST.CATALOG_LINKED');

      it('never reaches the list when the IT Admin is not in charge of the department: the scope is judged before it, not after', async () => {
        const proposed = await decidedForSpend();
        const spy = jest.spyOn(facade(), 'addDepartmentSoftwareFromCatalogLink');
        try {
          await link(proposed.id, { planId: plus, addToDepartmentList: true }, otherIt.account).expect(403);

          expect(spy).not.toHaveBeenCalled();
        } finally {
          spy.mockRestore();
        }
      });

      it('reaches the list once, for the department of the request and the application and plan linked, and not at all without the tick', async () => {
        const ticked = await decidedForSpend();
        const plain = await decidedForSpend();
        const spy = jest.spyOn(facade(), 'addDepartmentSoftwareFromCatalogLink');
        try {
          await link(plain.id, { planId: plus }).expect(200);
          expect(spy).not.toHaveBeenCalled();

          await link(ticked.id, { planId: plus, addToDepartmentList: true }).expect(200);

          expect(spy).toHaveBeenCalledTimes(1);
          expect(spy).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ employeeId: itInCharge.employeeId }),
            { departmentId: design.id, applicationId: chatgpt, planId: plus },
          );
        } finally {
          spy.mockRestore();
        }
      });

      it.each([
        [
          'the place is not in the catalog',
          422,
          'DEPARTMENT_SOFTWARE.NOT_IN_CATALOG',
          () => new DepartmentSoftwareNotInCatalogError([{ applicationId: chatgpt, planId: plus }]),
        ],
        [
          'the note is not one the table keeps',
          422,
          'DEPARTMENT_SOFTWARE.NOTE_INVALID',
          () => new DepartmentSoftwareNoteInvalidError('TOO_LONG'),
        ],
        ['the department is not there', 404, 'DEPARTMENT.NOT_FOUND', () => new ToolsDepartmentNotFoundError()],
      ])(
        'answers its refusal when %s, with its own code, and the link is undone: no plan, no entry, no event of the link',
        async (_what, status, code, refusal) => {
          const proposed = await decidedForSpend();
          const entriesBefore = await entriesOf(design.id);
          const spy = jest.spyOn(facade(), 'addDepartmentSoftwareFromCatalogLink').mockRejectedValueOnce(refusal());
          try {
            const refused = await link(proposed.id, { planId: plus, addToDepartmentList: true }).expect(status);

            expect(h.codeOf(refused)).toBe(code);
            expect(spy).toHaveBeenCalledTimes(1);
          } finally {
            spy.mockRestore();
          }

          expect(await planOf(proposed.id)).toBeNull();
          expect(await entriesOf(design.id)).toEqual(entriesBefore);
          expect(await linkedEvents(proposed.id)).toEqual([]);
        },
      );
    });

    describe('the months of the request, judged by the plan it is linked to (QĐ-111i)', () => {
      let seats: string; // a plan of seats (K2)
      let bought: string; // a plan bought once (K4)

      beforeAll(async () => {
        // Plans of the application the short proposals name: a short proposal links only to a plan of that application (B2A-R1).
        seats = await declarePlan(h.ctx, h.it1.accessToken, {
          applicationId: chatgpt,
          name: 'Seats',
          provisioningType: 'K2',
          pricingModel: 'PER_SEAT',
          controlLevel: 'FULL',
        });
        bought = await declarePlan(h.ctx, h.it1.accessToken, {
          applicationId: chatgpt,
          name: 'Bought once',
          provisioningType: 'K4',
          pricingModel: 'PER_SEAT',
          controlLevel: 'FULL',
        });
      });

      /** A short proposal for `months` months whose assessment the IT Admin concluded as `kind`, completed, and put where the decision of the spending approver leaves it. */
      const decidedAs = async (kind: 'K2' | 'K4', months?: number): Promise<AccessRequestWire> => {
        const proposed = await shortAwaiting(months === undefined ? {} : { termMonths: months });
        const concluded = planFields({ provisioningType: kind, ...(kind === 'K4' ? { adminConsole: false } : {}) });
        await h.saveAssessment(proposed.id, concluded, itInCharge.account).expect(200);
        await h.completeAssessment(proposed.id, itInCharge.account).expect(200);
        await h.ctx.sql.query(`UPDATE access_requests SET state = 'AWAITING_EXECUTION' WHERE id = $1`, [proposed.id]);

        return proposed;
      };
      const termOf = async (id: string) =>
        (
          await h.ctx.sql.query<{ term_months: number | null; plan_id: string | null }>(
            `SELECT term_months, plan_id FROM access_requests WHERE id = $1`,
            [id],
          )
        ).rows[0];
      const linkedEventOf = async (id: string) =>
        (await h.auditEvents('ACCESS_REQUEST', id)).find((event) => event.action === 'ACCESS_REQUEST.CATALOG_LINKED');

      it('refuses a plan bought by the month (K1) for more than 9 months when the assessment concluded seats (K2): 422 ASSESSMENT.TERM_NOT_FIT_KIND, nothing written', async () => {
        const proposed = await decidedAs('K2', 12);

        const refused = await link(proposed.id, { planId: plus }).expect(422);

        expect(h.codeOf(refused)).toBe('ASSESSMENT.TERM_NOT_FIT_KIND');
        expect(h.detailsOf(refused)).toEqual({
          provisioningType: 'K1',
          termMonths: 12,
          maxMonths: 9,
          reason: 'TERM_MONTHS_OUT_OF_RANGE',
        });
        expect(await termOf(proposed.id)).toEqual({ term_months: 12, plan_id: null });
        expect(await linkedEventOf(proposed.id)).toBeUndefined();
      });

      it('refuses a plan bought by the month (K1) when the assessment concluded a plan bought once (K4), which asks no months', async () => {
        const proposed = await decidedAs('K4', 6);

        const refused = await link(proposed.id, { planId: plus }).expect(422);

        expect(h.codeOf(refused)).toBe('ASSESSMENT.TERM_NOT_FIT_KIND');
        expect(h.detailsOf(refused)).toMatchObject({
          provisioningType: 'K1',
          termMonths: null,
          reason: 'TERM_REQUIRED',
        });
        expect(await termOf(proposed.id)).toEqual({ term_months: null, plan_id: null });
      });

      it('takes a plan of another kind when the months still fit it, and keeps them (6 months, K2 then K1)', async () => {
        const proposed = await decidedAs('K2', 6);

        await link(proposed.id, { planId: plus }).expect(200);

        expect(await termOf(proposed.id)).toEqual({ term_months: 6, plan_id: plus });
        expect((await linkedEventOf(proposed.id))?.after).toMatchObject({ termMonths: 6, termMonthsCleared: null });
      });

      it('clears the months when the plan is one bought once (K4), as the completion does, and the audit trail says so', async () => {
        const proposed = await decidedAs('K2', 6);

        await link(proposed.id, { planId: bought }).expect(200);

        expect(await termOf(proposed.id)).toEqual({ term_months: null, plan_id: bought });
        expect((await linkedEventOf(proposed.id))?.after).toMatchObject({ termMonths: null, termMonthsCleared: 6 });
      });

      it('leaves the months as they are when the plan is of the kind the assessment concluded', async () => {
        const proposed = await decidedAs('K2', 12);

        await link(proposed.id, { planId: seats }).expect(200);

        expect(await termOf(proposed.id)).toEqual({ term_months: 12, plan_id: seats });
        expect((await linkedEventOf(proposed.id))?.after).toMatchObject({ termMonths: 12, termMonthsCleared: null });
      });
    });
  });
});
