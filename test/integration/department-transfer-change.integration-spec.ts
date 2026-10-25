import { TransferHarness, type TransferWire } from '../support/transfer-harness';
import type { Department, Person } from '../support/request-harness';

const h = new TransferHarness();
const M = 1_000_000;
const APPROVE = { decision: 'APPROVE' };

/** US-03-01 AC-19, AC-20, AC-7, AC-6: moving or cancelling a waiting transfer, and telling the modules that act when it takes effect. */
describe('moving, cancelling and telling a transfer (integration, real PostgreSQL)', () => {
  let des: Department;
  let fin: Department;
  let paid: string;
  let internal: string;
  let subscriptionId: string;
  let sequence = 0;
  const code = (prefix: string) => `${prefix}${(sequence += 1)}`;
  const body = (employeeId: string, extra: object = {}) => ({
    employeeId,
    toDepartmentId: fin.id,
    effectiveOn: h.day(30),
    grounds: h.grounds,
    ...extra,
  });
  const why = { reason: 'The department asked for another day', grounds: h.grounds };
  const outcome = (response: { status: number }) => response.status;
  const headedDepartment = async (name: string) => {
    const department = await h.departmentWithUnit(name);
    const head = await h.veteran(department, code('H'));
    await h.makeHead(department, head);

    return { department, head };
  };

  beforeAll(async () => {
    await h.start();
    await h.withApprover();
    des = await h.departmentWithUnit('P-DES');
    fin = await h.departmentWithUnit('P-FIN');
    internal = await h.plan('K5');
    subscriptionId = await h.subscription(20);
    paid = await h.planOf(subscriptionId);
    await h
      .declareTaxProfile((await h.vendorOf(paid)).id, [{ taxType: 'GTGT', ratePercent: '10', deductible: true }])
      .expect(200);
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  describe('moving the day of a waiting transfer (AC-19)', () => {
    it('keeps the old department to the end of the day before the new day and logs the move with its reason and basis', async () => {
      const person = await h.veteran(des, code('E'));
      const wire = await h.recorded(body(person.employeeId, { effectiveOn: h.day(30) }));

      const moved = await h.rescheduleTransfer(wire.id, { newEffectiveOn: h.day(45), ...why }).expect(200);

      expect(h.dataOf<TransferWire>(moved)).toMatchObject({ id: wire.id, status: 'PENDING', effectiveOn: h.day(45) });
      expect(await h.placements(person.employeeId)).toEqual([
        expect.objectContaining({ department_id: des.id, valid_to: h.day(45) }),
        expect.objectContaining({ department_id: fin.id, valid_from: h.day(45), valid_to: null }),
      ]);
      const log = h.dataOf<{ items: Record<string, unknown>[] }>(await h.transferChanges(wire.id).expect(200)).items;
      expect(log).toEqual([
        expect.objectContaining({
          kind: 'RESCHEDULED',
          oldEffectiveOn: h.day(30),
          newEffectiveOn: h.day(45),
          reason: why.reason,
          grounds: h.grounds,
        }),
      ]);
      const [event] = await h.auditEventsOf('DEPARTMENT_TRANSFER.RESCHEDULED', wire.id);
      expect(event).toMatchObject({ before: { effectiveOn: h.day(30) }, after: { effectiveOn: h.day(45) } });
    });

    it('needs a reason and a basis, and a day that is a new one', async () => {
      const person = await h.veteran(des, code('E'));
      const wire = await h.recorded(body(person.employeeId));
      const move = (extra: object) => h.rescheduleTransfer(wire.id, { newEffectiveOn: h.day(45), ...why, ...extra });

      const noReason = await move({ reason: undefined });
      const noGrounds = await move({ grounds: undefined });
      const same = await move({ newEffectiveOn: h.day(30) });
      const past = await move({ newEffectiveOn: h.day(-2) });

      expect([noReason.status, h.codeOf(noReason)]).toEqual([422, 'DEPARTMENT_TRANSFER.REASON_REQUIRED']);
      expect([noGrounds.status, h.codeOf(noGrounds)]).toEqual([422, 'DEPARTMENT_TRANSFER.GROUNDS_REQUIRED']);
      expect([same.status, h.codeOf(same)]).toEqual([422, 'DEPARTMENT_TRANSFER.NO_CHANGE']);
      expect([past.status, h.codeOf(past)]).toEqual([422, 'DEPARTMENT_TRANSFER.EFFECTIVE_DATE_IN_PAST']);
      expect(h.dataOf<TransferWire>(await h.readTransfer(wire.id).expect(200)).effectiveOn).toBe(h.day(30));
      expect(h.dataOf<{ items: unknown[] }>(await h.transferChanges(wire.id).expect(200)).items).toEqual([]);
    });

    it('is refused once the day has come, and for a transfer that has taken effect or was cancelled', async () => {
      const due = await h.recorded(body((await h.veteran(des, code('E'))).employeeId));
      await h.ctx.sql.query(`UPDATE department_transfers SET effective_on = $2 WHERE id = $1`, [due.id, h.today()]);
      const effective = await h.recorded(
        body((await h.veteran(des, code('E'))).employeeId, { effectiveOn: h.today() }),
      );
      const cancelled = await h.recorded(body((await h.veteran(des, code('E'))).employeeId));
      await h.cancelTransfer(cancelled.id, why).expect(200);

      const results = [
        await h.rescheduleTransfer(due.id, { newEffectiveOn: h.day(60), ...why }),
        await h.rescheduleTransfer(effective.id, { newEffectiveOn: h.day(60), ...why }),
        await h.rescheduleTransfer(cancelled.id, { newEffectiveOn: h.day(60), ...why }),
      ];

      expect(results.map((response) => [outcome(response), h.codeOf(response)])).toEqual([
        [409, 'DEPARTMENT_TRANSFER.ALREADY_EFFECTIVE'],
        [409, 'DEPARTMENT_TRANSFER.ALREADY_EFFECTIVE'],
        [409, 'DEPARTMENT_TRANSFER.ALREADY_CANCELLED'],
      ]);
    });

    it('takes effect at once when the new day is today', async () => {
      const person = await h.veteran(des, code('E'));
      const wire = await h.recorded(body(person.employeeId));

      const moved = h.dataOf<TransferWire>(
        await h.rescheduleTransfer(wire.id, { newEffectiveOn: h.today(), ...why }).expect(200),
      );

      expect(moved.status).toBe('EFFECTIVE');
      expect((await h.organizationService().getEmployeePlacement(person.employeeId, h.today()))?.departmentId).toBe(
        fin.id,
      );
    });

    it('refuses the whole command, saving nothing, when the successor cannot follow on the new day', async () => {
      const { department, head } = await headedDepartment('P-MV1');
      const heir = await h.veteran(department, code('H'));
      const wire = await h.recorded(
        body(head.employeeId, { successor: { kind: 'EMPLOYEE', employeeId: heir.employeeId } }),
      );
      await h.ctx.sql.query(`UPDATE employees SET status = 'TERMINATED' WHERE id = $1`, [heir.employeeId]);
      const periods = await h.headPeriods(department.id);
      const placements = await h.placements(head.employeeId);

      const response = await h.rescheduleTransfer(wire.id, { newEffectiveOn: h.day(50), ...why });

      expect([response.status, h.codeOf(response)]).toEqual([
        422,
        'DEPARTMENT_TRANSFER.SUCCESSOR_NOT_A_MEMBER_ON_DATE',
      ]);
      expect(h.detailsOf(response)).toEqual({ reason: 'EMPLOYEE_NOT_ACTIVE' });
      expect(await h.headPeriods(department.id)).toEqual(periods);
      expect(await h.placements(head.employeeId)).toEqual(placements);
      expect(h.dataOf<TransferWire>(await h.readTransfer(wire.id).expect(200)).effectiveOn).toBe(h.day(30));
    });

    it('moves the handover of the head with the day, and the successor becomes the head from the new day', async () => {
      const { department, head } = await headedDepartment('P-MV2');
      const heir = await h.veteran(department, code('H'));
      const wire = await h.recorded(
        body(head.employeeId, { successor: { kind: 'EMPLOYEE', employeeId: heir.employeeId } }),
      );

      await h.rescheduleTransfer(wire.id, { newEffectiveOn: h.day(50), ...why }).expect(200);

      expect(await h.headPeriods(department.id)).toEqual([
        { employee_id: head.employeeId, valid_from: h.today(), valid_to: h.day(50) },
        { employee_id: heir.employeeId, valid_from: h.day(50), valid_to: null },
      ]);
    });
  });

  describe('cancelling a waiting transfer (AC-20)', () => {
    it('brings back the head and the placement: the successor is removed and the old period is open again', async () => {
      const { department, head } = await headedDepartment('P-CX1');
      const heir = await h.veteran(department, code('H'));
      const wire = await h.recorded(
        body(head.employeeId, { successor: { kind: 'EMPLOYEE', employeeId: heir.employeeId } }),
      );

      const response = await h.cancelTransfer(wire.id, why).expect(200);

      expect(h.dataOf<TransferWire>(response)).toMatchObject({
        status: 'CANCELLED',
        cancellation: expect.objectContaining({ reason: why.reason }) as unknown,
      });
      expect(await h.headPeriods(department.id)).toEqual([
        { employee_id: head.employeeId, valid_from: h.today(), valid_to: null },
      ]);
      expect(await h.placements(head.employeeId)).toEqual([
        expect.objectContaining({ department_id: department.id, valid_to: null }),
      ]);
      expect(
        (await h.organizationService().getDepartmentHeads([department.id], h.day(60))).get(department.id)?.employeeId,
      ).toBe(head.employeeId);
      const log = h.dataOf<{ items: Record<string, unknown>[] }>(await h.transferChanges(wire.id).expect(200)).items;
      expect(log).toEqual([expect.objectContaining({ kind: 'CANCELLED', newEffectiveOn: null, reason: why.reason })]);
      expect(await h.auditEventsOf('DEPARTMENT_TRANSFER.CANCELLED', wire.id)).toHaveLength(1);
    });

    it('needs a reason and a basis, cannot be done twice, and lets the person be moved again afterwards', async () => {
      const person = await h.veteran(des, code('E'));
      const wire = await h.recorded(body(person.employeeId));

      const noReason = await h.cancelTransfer(wire.id, { grounds: h.grounds });
      const noGrounds = await h.cancelTransfer(wire.id, { reason: 'Not needed' });
      expect([noReason.status, h.codeOf(noReason)]).toEqual([422, 'DEPARTMENT_TRANSFER.REASON_REQUIRED']);
      expect([noGrounds.status, h.codeOf(noGrounds)]).toEqual([422, 'DEPARTMENT_TRANSFER.GROUNDS_REQUIRED']);
      await h.cancelTransfer(wire.id, why).expect(200);
      const again = await h.cancelTransfer(wire.id, why);
      expect([again.status, h.codeOf(again)]).toEqual([409, 'DEPARTMENT_TRANSFER.ALREADY_CANCELLED']);

      await h.recorded(body(person.employeeId, { effectiveOn: h.day(40) }));
    });

    it('cannot cancel a transfer that has taken effect', async () => {
      const wire = await h.recorded(body((await h.veteran(des, code('E'))).employeeId, { effectiveOn: h.today() }));

      const response = await h.cancelTransfer(wire.id, why);

      expect([response.status, h.codeOf(response)]).toEqual([409, 'DEPARTMENT_TRANSFER.ALREADY_EFFECTIVE']);
    });
  });

  describe('telling the modules that act when a change takes effect (AC-7, FR-3.16)', () => {
    let failing = false;
    let heard: ReturnType<TransferHarness['listen']>;
    beforeAll(() => {
      heard = h.listen({ failing: () => failing });
    });
    const about = (employeeId: string) =>
      heard.heard.filter((change) => 'employeeId' in change && change.employeeId === employeeId);

    it('tells a transfer for today once, in its own transaction, with what the listeners need', async () => {
      const person = await h.veteran(des, code('E'));

      const wire = await h.recorded(body(person.employeeId, { effectiveOn: h.today() }));
      await h.sweepAt();
      await h.sweepAt();

      const [placement] = (await h.placements(person.employeeId)).slice(-1);
      expect(about(person.employeeId)).toEqual([
        {
          id: expect.stringMatching(/^[0-9a-f-]{36}$/) as unknown,
          kind: 'PLACEMENT_START',
          placementId: placement.id,
          employeeId: person.employeeId,
          fromDepartmentId: des.id,
          toDepartmentId: fin.id,
          fromJobTitleId: expect.any(String) as unknown,
          toJobTitleId: expect.any(String) as unknown,
          effectiveOn: h.today(),
        },
      ]);
      expect((await h.announcements('PLACEMENT_START')).filter((row) => row.subject_id === placement.id)).toHaveLength(
        1,
      );
      expect(wire.status).toBe('EFFECTIVE');
    });

    it('tells a transfer for a day to come when its day comes, exactly once however often the sweep runs, and settles it', async () => {
      const person = await h.veteran(des, code('E'));
      const wire = await h.recorded(body(person.employeeId, { effectiveOn: h.day(30) }));

      await h.sweepAt(h.day(29));
      expect(about(person.employeeId)).toEqual([]);
      const first = await h.sweepAt(h.day(30));
      const second = await h.sweepAt(h.day(30));
      await h.sweepAt(h.day(31));

      expect(first.told).toBeGreaterThanOrEqual(1);
      expect(second.told).toBe(0);
      expect(about(person.employeeId)).toHaveLength(1);
      expect(about(person.employeeId)[0]).toMatchObject({ kind: 'PLACEMENT_START', effectiveOn: h.day(30) });
      const settled = h.dataOf<TransferWire>(await h.readTransfer(wire.id).expect(200));
      expect(settled.status).toBe('EFFECTIVE');
      const [event] = await h.auditEventsOf('DEPARTMENT_TRANSFER.EFFECTIVE', wire.id);
      expect(event).toMatchObject({
        actor_kind: 'SYSTEM',
        before: { status: 'PENDING' },
        after: { status: 'EFFECTIVE' },
      });
    });

    it('tells a change of title alone with the same department on both sides, which the listeners of a department skip', async () => {
      const person = await h.veteran(des, code('E'));
      const senior = await h.jobTitle(h.unique('Senior'));

      await h.recorded({
        employeeId: person.employeeId,
        toJobTitleId: senior,
        effectiveOn: h.day(30),
        grounds: h.grounds,
      });
      await h.sweepAt(h.day(30));

      expect(about(person.employeeId)).toEqual([
        expect.objectContaining({ kind: 'PLACEMENT_START', fromDepartmentId: des.id, toDepartmentId: des.id }),
      ]);
    });

    it('tells the end of the head and the start of the successor when the handover takes effect', async () => {
      const { department, head } = await headedDepartment('P-EV1');
      const heir = await h.veteran(department, code('H'));
      await h.recorded(
        body(head.employeeId, {
          effectiveOn: h.day(10),
          successor: { kind: 'EMPLOYEE', employeeId: heir.employeeId },
        }),
      );

      await h.sweepAt(h.day(10));
      await h.sweepAt(h.day(10));

      const periods = heard.heard.filter((change) => 'departmentId' in change && change.departmentId === department.id);
      expect(periods.map((change) => [change.kind, 'headEmployeeId' in change ? change.headEmployeeId : null])).toEqual(
        expect.arrayContaining([
          ['HEAD_PERIOD_END', head.employeeId],
          ['HEAD_PERIOD_START', heir.employeeId],
        ]),
      );
      expect(
        periods.filter((change) => change.kind === 'HEAD_PERIOD_END' && change.headEmployeeId === head.employeeId),
      ).toHaveLength(1);
      const start = periods.find(
        (change) => change.kind === 'HEAD_PERIOD_START' && change.headEmployeeId === heir.employeeId,
      );
      expect(start).toMatchObject({ previousHeadEmployeeId: head.employeeId, effectiveOn: h.day(10) });
    });

    it('tells the naming of a head for today in the transaction of the route, once', async () => {
      const department = await h.departmentWithUnit(code('P-EV'));
      const first = await h.veteran(department, code('H'));
      const second = await h.veteran(department, code('H'));

      await h.makeHead(department, first);
      await h.makeHead(department, second);
      await h.sweepAt();

      const own = heard.heard.filter((change) => 'departmentId' in change && change.departmentId === department.id);
      expect(own.map((change) => [change.kind, 'headEmployeeId' in change ? change.headEmployeeId : null])).toEqual([
        ['HEAD_PERIOD_START', first.employeeId],
        ['HEAD_PERIOD_END', first.employeeId],
        ['HEAD_PERIOD_START', second.employeeId],
      ]);
    });

    it('rolls a change back with the listener that fails and tells it again at the next pass, without telling it half', async () => {
      const person = await h.veteran(des, code('E'));
      const wire = await h.recorded(body(person.employeeId, { effectiveOn: h.day(30) }));

      failing = true;
      const refused = await h.sweepAt(h.day(30));
      expect(refused.failed).toBeGreaterThanOrEqual(1);
      expect(about(person.employeeId)).toEqual([]);
      expect((await h.announcements('PLACEMENT_START')).map((row) => row.subject_id)).not.toContain(
        (await h.placements(person.employeeId)).slice(-1)[0].id,
      );
      expect(h.dataOf<TransferWire>(await h.readTransfer(wire.id).expect(200)).status).toBe('PENDING');
      failing = false;
      await h.sweepAt(h.day(30));

      expect(about(person.employeeId)).toHaveLength(1);
      expect(h.dataOf<TransferWire>(await h.readTransfer(wire.id).expect(200)).status).toBe('EFFECTIVE');
    });

    it('records nothing when a listener refuses a transfer for today: the placements stay as they were', async () => {
      const person = await h.veteran(des, code('E'));
      const before = await h.placements(person.employeeId);

      failing = true;
      const response = await h.recordTransfer(body(person.employeeId, { effectiveOn: h.today() }));
      failing = false;

      expect(response.status).toBe(500);
      expect(await h.placements(person.employeeId)).toEqual(before);
      expect(
        h.dataOf<{ items: unknown[] }>(await h.listTransfers(`?employeeId=${person.employeeId}`).expect(200)).items,
      ).toEqual([]);
    });
  });

  describe('the requests of the person when the transfer takes effect (AC-6, AC-7)', () => {
    const member = async (unit: { department: Department }, label: string): Promise<Person> => {
      const person = await h.staff(unit.department, code(label));
      await h.ctx.sql.query(`UPDATE employee_placements SET valid_from = '2026-01-05' WHERE employee_id = $1`, [
        person.employeeId,
      ]);

      return person;
    };

    it('gives the need step of a request waiting for the head to the head of the new department, and moves nothing else', async () => {
      const from = await h.departmentWithHead(code('P-RQ'));
      const to = await h.departmentWithHead(code('P-RQ'));
      const requester = await member(from, 'R');
      const sent = await h.sent(requester, internal);
      expect((await h.stepOf(sent.id, 'NEED')).assignee_employee_id).toBe(from.head.employeeId);

      await h
        .recordTransfer(body(requester.employeeId, { toDepartmentId: to.department.id, effectiveOn: h.today() }))
        .expect(201);

      expect((await h.stepOf(sent.id, 'NEED')).assignee_employee_id).toBe(to.head.employeeId);
    });

    it('leaves the spend step and the need step that was decided as they were, and the grant with its task (AC-6)', async () => {
      const unit = await h.departmentWithHead(code('P-RQ'));
      const other = await h.departmentWithHead(code('P-RQ'));
      await h.budgetFor(unit, { total: 100 * M });
      const requester = await member(unit, 'R');
      const waiting = await h.waitingForApprover({ ...unit, member: requester }, paid, { amount: 5 * M });
      const needBefore = await h.stepOf(waiting, 'NEED');
      const spendBefore = await h.stepOf(waiting, 'SPEND_APPROVAL');
      expect(spendBefore).toMatchObject({ state: 'PENDING', assignee_employee_id: h.boss.employeeId });
      expect(needBefore.state).toBe('APPROVED');
      const steps = async () =>
        JSON.stringify((await h.ctx.sql.query(`SELECT * FROM access_request_steps ORDER BY id`)).rows);
      const decided = await steps();

      await h
        .recordTransfer(body(requester.employeeId, { toDepartmentId: other.department.id, effectiveOn: h.today() }))
        .expect(201);

      expect(await h.stepOf(waiting, 'NEED')).toEqual(needBefore);
      expect(await h.stepOf(waiting, 'SPEND_APPROVAL')).toEqual(spendBefore);
      expect(await steps()).toBe(decided);
      expect(APPROVE.decision).toBe('APPROVE');
    });
  });
});
