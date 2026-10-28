import { ReassignmentHarness } from '../support/reassignment-harness';
import type { Person } from '../support/request-harness';
import type { Unit } from '../support/spend-harness';

/**
 * `g0-g6-final-business-baseline-remediation`, Task 4.3 (F28, `QĐ-90b`, `FR-3.16`): the event of a department that changes only
 * redetermines the need step of a request for internal software with no fee. A paid request keeps the department it was sent from, so
 * its need step stays with the head of that department, and a change of that head moves it by `access_requests.department_id`, not by
 * who sits in the department now.
 */
const h = new ReassignmentHarness();
const APPROVE = { decision: 'APPROVE' };

describe('a transfer redetermines the need step of internal requests only (F28)', () => {
  let internal: string;
  let paid: string;
  let counter = 0;

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    internal = await h.plan('K5');
    paid = await h.planOf(await h.subscription(20));
    await h
      .declareTaxProfile((await h.vendorOf(paid)).id, [{ taxType: 'GTGT', ratePercent: '10', deductible: true }])
      .expect(200);
  }, 240000);

  afterAll(async () => {
    await h.stop();
  });

  const scene = async (): Promise<Unit> => {
    counter += 1;

    return h.departmentWithHead(`P-PD${counter}`);
  };
  const colleague = async (unit: Unit, label: string): Promise<Person> => {
    counter += 1;

    return h.staff(unit.department, `${label}-${counter}`);
  };

  it('keeps a paid request with the head of the department it was sent from when the requester moves, and sends an internal one to the new head', async () => {
    const from = await scene();
    const to = await scene();
    const sentPaid = await h.sent(from.member, paid);
    const sentInternal = await h.sent(await colleague(from, 'IN'), internal);

    await h.moveTo(from.member.employeeId, to.department.id);
    await h.moveTo(sentInternal.requester.employeeId, to.department.id);

    // The paid request keeps its department and its head; nothing was redetermined for it.
    expect(await h.stepOf(sentPaid.id, 'NEED')).toMatchObject({
      state: 'PENDING',
      assignee_employee_id: from.head.employeeId,
    });
    expect(await h.audit('ACCESS_REQUEST.STEP_REDETERMINED', (await h.stepOf(sentPaid.id, 'NEED')).id)).toEqual([]);
    expect((await h.requestRow(sentPaid.id)).department_id).toBe(from.department.id);
    // The internal request follows its requester to the new department (FR-3.16).
    expect(await h.stepOf(sentInternal.id, 'NEED')).toMatchObject({ assignee_employee_id: to.head.employeeId });
    // The old head still decides the paid one; the new head does not see it.
    expect(h.codeOf(await h.decide(sentPaid.id, APPROVE, to.head.account).expect(404))).toBe(
      'ACCESS_REQUEST.NOT_FOUND',
    );
    await h.decide(sentPaid.id, APPROVE, from.head.account).expect(200);
  });

  it('keeps a proposal of new software with the department it was sent from as well', async () => {
    const from = await scene();
    const to = await scene();
    const proposed = await h.proposed(from.member);

    await h.moveTo(from.member.employeeId, to.department.id);

    expect(await h.stepOf(proposed.id, 'NEED')).toMatchObject({ assignee_employee_id: from.head.employeeId });
  });

  it('gives the paid request of a person who moved to the new head of the department it was sent from, and not to the head of where they sit now', async () => {
    const from = await scene();
    const to = await scene();
    const sentPaid = await h.sent(from.member, paid);
    await h.moveTo(from.member.employeeId, to.department.id);
    const successor = await colleague(from, 'SUC');

    await h.makeHead(from.department, successor);

    expect(await h.stepOf(sentPaid.id, 'NEED')).toMatchObject({
      state: 'PENDING',
      assignee_employee_id: successor.employeeId,
    });
    await h.decide(sentPaid.id, APPROVE, successor.account).expect(200);
  });

  it('waits under control, and is never given to the head of where the requester sits now, when nobody heads the department it was sent from', async () => {
    const from = await scene();
    const to = await scene();
    const sentPaid = await h.sent(from.member, paid);
    await h.moveTo(from.member.employeeId, to.department.id);

    // Nobody heads the department it was sent from now: the step waits, as a step nobody can hold does.
    await h.vacateHead(from.department.id).expect(200);

    expect(await h.stepOf(sentPaid.id, 'NEED')).toMatchObject({ state: 'WAITING', assignee_employee_id: null });
    expect((await h.stepOf(sentPaid.id, 'NEED')).assignee_employee_id).not.toBe(to.head.employeeId);
  });

  it('leaves a paid request whose requester was transferred and whose pass of the day runs later with the department it was sent from', async () => {
    const from = await scene();
    const to = await scene();
    const sentPaid = await h.sent(from.member, paid);
    await h.moveTo(from.member.employeeId, to.department.id, { announce: false });

    await h.sweep();

    expect(await h.stepOf(sentPaid.id, 'NEED')).toMatchObject({ assignee_employee_id: from.head.employeeId });
  });
});
