import request from 'supertest';
import { OffboardingHarness, type CaseWire, type RightWire } from '../../support/offboarding-harness';
import { pretendBusinessToday } from '../../support/pretend-today';
import type { Department, Person } from '../../support/request-harness';

const h = new OffboardingHarness();

/**
 * QĐ-93g, D-S17, D-S18, D-S28: Offboarding and first-placement lifecycle for unplaced employees.
 * Integration tests on real PostgreSQL.
 */
describe('unplaced employee offboarding and first placement (integration, real PostgreSQL)', () => {
  let des: Department;
  /** A subscription of a plan that loses data when a seat is taken away; made before any department is stopped. */
  let tool: string;
  let counter = 0;
  const code = (prefix = 'NV-UNP') => `${prefix}-${(counter += 1)}`;

  beforeAll(async () => {
    await h.start();
    des = await h.departmentWithUnit('P-DES');
    tool = await h.subscription(60, 'K2');
    await h.describePlan(tool, true, 'Xuất dữ liệu trước khi gỡ');
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  const createUnplacedEmployee = async (empCode = code()) => {
    const response = await request(h.server())
      .post('/api/v1/employees')
      .set(h.as(h.sa))
      .send({
        employeeCode: empCode,
        fullName: `Unplaced Worker ${empCode}`,
        workEmail: `${empCode.toLowerCase()}@acme.vn`,
        employmentType: 'STAFF',
        hireDate: '2026-01-01',
      })
      .expect(201);

    return h.dataOf<{
      id: string;
      employeeCode: string;
      fullName: string;
      department: null;
    }>(response);
  };

  it('1. records planned offboarding for an unplaced employee with null department and no handover duties', async () => {
    const emp = await createUnplacedEmployee();

    const response = await h
      .recordCase({
        employeeId: emp.id,
        lastWorkingDay: h.day(10),
        grounds: h.grounds,
      })
      .expect(201);

    const wire = h.dataOf<CaseWire>(response);
    expect(wire).toMatchObject({
      state: 'HANDING_OVER',
      lastWorkingDay: h.day(10),
      heldRights: 0,
    });
    expect(wire.department).toBeNull();

    // Verify no handover duties created
    const duties = h.dataOf<{ items: unknown[] }>(
      await h.duties(`?pageSize=100&employeeId=${emp.id}`).expect(200),
    ).items;
    expect(duties).toEqual([]);

    // Visible to Super Admin in detail and list
    const saDetail = h.dataOf<CaseWire>(await h.readCase(wire.id, h.sa).expect(200));
    expect(saDetail.id).toBe(wire.id);

    // Visible to IT Admin in detail and list
    const itDetail = h.dataOf<CaseWire>(await h.readCase(wire.id, h.it1).expect(200));
    expect(itDetail.id).toBe(wire.id);

    const itList = h.dataOf<{ items: { id: string }[] }>(await h.listCases('', h.it1).expect(200));
    expect(itList.items.some((item) => item.id === wire.id)).toBe(true);
  });

  it('2. offboards employee with scheduled future placement when lastWorkingDay < validFrom, cancelling the placement', async () => {
    const emp = await createUnplacedEmployee();

    // Place for first time at day(15)
    await request(h.server())
      .post(`/api/v1/employees/${emp.id}/first-placements`)
      .set(h.as(h.sa))
      .send({
        departmentId: des.id,
        effectiveFrom: h.day(15),
      })
      .expect(201);

    const { rows: placementsBefore } = await h.ctx.sql.query<{ id: string }>(
      'SELECT id FROM employee_placements WHERE employee_id = $1',
      [emp.id],
    );
    expect(placementsBefore).toHaveLength(1);
    const scheduledPlacementId = placementsBefore[0].id;

    // Record offboarding with lastWorkingDay = day(5) < validFrom (day(15))
    const response = await h
      .recordCase({
        employeeId: emp.id,
        lastWorkingDay: h.day(5),
        grounds: h.grounds,
      })
      .expect(201);

    const wire = h.dataOf<CaseWire>(response);
    expect(wire.state).toBe('HANDING_OVER');

    // Verify scheduled placement was removed from employee_placements
    const { rows: placementsAfter } = await h.ctx.sql.query(
      'SELECT id FROM employee_placements WHERE employee_id = $1',
      [emp.id],
    );
    expect(placementsAfter).toHaveLength(0);

    // Verify offboarding_cases row recorded the cancelled placement columns
    const { rows: caseRows } = await h.ctx.sql.query<{
      department_id: string | null;
      cancelled_placement_id: string | null;
      cancelled_placement_department_id: string | null;
      cancelled_placement_from: string | null;
    }>(
      `SELECT department_id, cancelled_placement_id, cancelled_placement_department_id,
              to_char(cancelled_placement_from, 'YYYY-MM-DD') AS cancelled_placement_from
         FROM offboarding_cases WHERE id = $1`,
      [wire.id],
    );
    expect(caseRows[0]).toMatchObject({
      department_id: null,
      cancelled_placement_id: scheduledPlacementId,
      cancelled_placement_department_id: des.id,
      cancelled_placement_from: h.day(15),
    });

    // Verify audit event EMPLOYEE.FIRST_PLACEMENT_CANCELLED exists
    const [cancelEvent] = await h.auditEventsOf('EMPLOYEE.FIRST_PLACEMENT_CANCELLED', emp.id);
    expect(cancelEvent).toBeDefined();
    expect(cancelEvent.after).toMatchObject({
      department: null,
      offboardingCaseId: wire.id,
    });
    expect(cancelEvent.before).toMatchObject({
      departmentId: des.id,
      effectiveFrom: h.day(15),
    });
  });

  it('3. refuses offboarding with 409 FIRST_PLACEMENT_PENDING when lastWorkingDay >= validFrom of scheduled placement', async () => {
    const emp = await createUnplacedEmployee();

    // Place at day(10)
    await request(h.server())
      .post(`/api/v1/employees/${emp.id}/first-placements`)
      .set(h.as(h.sa))
      .send({
        departmentId: des.id,
        effectiveFrom: h.day(10),
      })
      .expect(201);

    // Attempt offboarding with lastWorkingDay = day(12) >= validFrom (day(10))
    const response = await h
      .recordCase({
        employeeId: emp.id,
        lastWorkingDay: h.day(12),
        grounds: h.grounds,
      })
      .expect(409);

    expect(h.codeOf(response)).toBe('OFFBOARDING_CASE.PLACEMENT_OVERLAP');
    expect((response.body as { error: { details: { reason: string; validFrom: string } } }).error.details).toEqual({
      reason: 'FIRST_PLACEMENT_PENDING',
      validFrom: h.day(10),
    });

    // Verify placement is still intact
    const { rows } = await h.ctx.sql.query('SELECT id FROM employee_placements WHERE employee_id = $1', [emp.id]);
    expect(rows).toHaveLength(1);
  });

  it('4. reschedules last working day: refuses when >= cancelled validFrom, accepts when < cancelled validFrom', async () => {
    const emp = await createUnplacedEmployee();

    // Place at day(15)
    await request(h.server())
      .post(`/api/v1/employees/${emp.id}/first-placements`)
      .set(h.as(h.sa))
      .send({
        departmentId: des.id,
        effectiveFrom: h.day(15),
      })
      .expect(201);

    // Offboard at day(5)
    const rec = h.dataOf<CaseWire>(
      await h
        .recordCase({
          employeeId: emp.id,
          lastWorkingDay: h.day(5),
          grounds: h.grounds,
        })
        .expect(201),
    );

    // Try moving lastWorkingDay to day(16) >= day(15)
    const movingToLate = await h.changeLastDay(rec.id, {
      lastWorkingDay: h.day(16),
      reason: 'Need more time for transition',
    });
    expect([movingToLate.status, h.codeOf(movingToLate)]).toEqual([409, 'OFFBOARDING_CASE.PLACEMENT_OVERLAP']);
    expect((movingToLate.body as { error: { details: { reason: string } } }).error.details.reason).toBe(
      'FIRST_PLACEMENT_PENDING',
    );

    // Move lastWorkingDay to day(8) < day(15)
    const movingToOk = await h.changeLastDay(rec.id, {
      lastWorkingDay: h.day(8),
      reason: 'Adjusted transition window',
    });
    expect(movingToOk.status).toBe(200);
    const updated = h.dataOf<CaseWire>(movingToOk);
    expect(updated.lastWorkingDay).toBe(h.day(8));
  });

  it('5. cancels offboarding: restores placement if department active; does not restore if department inactive', async () => {
    // 5a: Active department -> restored
    const empA = await createUnplacedEmployee();
    await request(h.server())
      .post(`/api/v1/employees/${empA.id}/first-placements`)
      .set(h.as(h.sa))
      .send({
        departmentId: des.id,
        effectiveFrom: h.day(20),
      })
      .expect(201);

    const { rows: rowsA } = await h.ctx.sql.query<{ id: string }>(
      'SELECT id FROM employee_placements WHERE employee_id = $1',
      [empA.id],
    );
    const placementIdA = rowsA[0].id;

    const recA = h.dataOf<CaseWire>(
      await h
        .recordCase({
          employeeId: empA.id,
          lastWorkingDay: h.day(10),
          grounds: h.grounds,
        })
        .expect(201),
    );

    const cancelResA = await h.cancelCase(recA.id, { reason: 'Retained by business' }).expect(200);
    const cancelWireA = h.dataOf<{ firstPlacementRestored?: boolean }>(cancelResA);
    expect(cancelWireA.firstPlacementRestored).toBe(true);

    const { rows: restoredA } = await h.ctx.sql.query<{ id: string; department_id: string; valid_from: string }>(
      `SELECT id, department_id, to_char(valid_from, 'YYYY-MM-DD') AS valid_from
         FROM employee_placements WHERE employee_id = $1`,
      [empA.id],
    );
    expect(restoredA).toHaveLength(1);
    expect(restoredA[0]).toMatchObject({
      id: placementIdA,
      department_id: des.id,
      valid_from: h.day(20),
    });

    // 5b: Inactive department -> not restored
    const tempDept = await h.departmentWithUnit('P-TMP');
    const empB = await createUnplacedEmployee();
    await request(h.server())
      .post(`/api/v1/employees/${empB.id}/first-placements`)
      .set(h.as(h.sa))
      .send({
        departmentId: tempDept.id,
        effectiveFrom: h.day(20),
      })
      .expect(201);

    const recB = h.dataOf<CaseWire>(
      await h
        .recordCase({
          employeeId: empB.id,
          lastWorkingDay: h.day(10),
          grounds: h.grounds,
        })
        .expect(201),
    );

    // Deactivate tempDept in DB
    await h.ctx.sql.query("UPDATE departments SET status = 'INACTIVE', deactivated_at = NOW() WHERE id = $1", [
      tempDept.id,
    ]);

    const cancelResB = await h.cancelCase(recB.id, { reason: 'Retained by business' }).expect(200);
    const cancelWireB = h.dataOf<{ firstPlacementRestored?: boolean }>(cancelResB);
    expect(cancelWireB.firstPlacementRestored).toBe(false);

    const { rows: restoredB } = await h.ctx.sql.query('SELECT id FROM employee_placements WHERE employee_id = $1', [
      empB.id,
    ]);
    expect(restoredB).toHaveLength(0);
  });

  it('6. refuses first placement with 409 EMPLOYEE_LEAVING when employee is in HANDING_OVER state', async () => {
    const emp = await createUnplacedEmployee();
    await h
      .recordCase({
        employeeId: emp.id,
        lastWorkingDay: h.day(10),
        grounds: h.grounds,
      })
      .expect(201);

    const response = await request(h.server())
      .post(`/api/v1/employees/${emp.id}/first-placements`)
      .set(h.as(h.sa))
      .send({
        departmentId: des.id,
        effectiveFrom: h.day(20),
      })
      .expect(409);

    expect(h.codeOf(response)).toBe('EMPLOYEE.EMPLOYEE_LEAVING');
  });

  it('7. refuses department transfer on unplaced employee with 409 PLACEMENT_OVERLAP (UNPLACED)', async () => {
    const emp = await createUnplacedEmployee();

    const response = await request(h.server())
      .post('/api/v1/department-transfers')
      .set(h.as(h.sa))
      .send({
        employeeId: emp.id,
        toDepartmentId: des.id,
        effectiveOn: h.day(5),
        grounds: h.grounds,
      })
      .expect(409);

    expect(h.codeOf(response)).toBe('DEPARTMENT_TRANSFER.PLACEMENT_OVERLAP');
    expect((response.body as { error: { details: { reason: string } } }).error.details.reason).toBe('UNPLACED');
  });

  describe('a person with no placement who holds seats (D-S18) and the day a first placement takes effect (D-S28)', () => {
    const LOCK = { note: 'Đã khóa tài khoản công ty, phiên và token thiết bị' };
    let head: Person;

    beforeAll(async () => {
      head = await h.worker(des, 'H1-UNP');
      await h.makeHead(des, head);
    }, 120000);

    /** A person of `des` with an account and a seat of a plan that loses data when taken away, left with no placement at all. */
    const unplacedWithSeat = async () => {
      const employeeCode = code('NV-SEAT');
      const person = await h.worker(des, employeeCode);
      const assignmentId = await h.seatOf(person, { subscriptionId: tool }, employeeCode);
      await h.stripPlacements(person.employeeId);
      expect(await h.placementCount(person.employeeId)).toBe(0);

      return { person, assignmentId };
    };
    const rightsOf = async (id: string) =>
      h.dataOf<{ items: RightWire[] }>(await h.rightsOf(id, '?pageSize=100').expect(200)).items;

    it('8. opens no handover duty anywhere for the seat of a planned leaver: the IT Admin opens the revocation, the task starts at once, the case closes', async () => {
      const { person, assignmentId } = await unplacedWithSeat();

      const wire = await h.recordedCase(person);
      expect(wire.department ?? null).toBeNull();
      expect(wire.heldRights).toBe(1);
      expect(await h.dutyRows(assignmentId)).toEqual([]);

      expect(await h.workState(person.employeeId)).toBe('ACTIVE/HANDING_OVER');
      await h.markLeft(wire.id).expect(200);
      await h.lockAccount(wire.id, LOCK).expect(200);
      expect(h.dataOf<CaseWire>(await h.readCase(wire.id).expect(200)).accountLock).toMatchObject({ note: LOCK.note });
      const opened = h.dataOf<CaseWire>(
        await h.revokeRights(wire.id, { count: 1, reason: 'Thu hồi quyền của người nghỉ không phòng' }).expect(200),
      );
      expect(opened.revocations).toEqual({ created: 1, reasonAdded: 0 });

      // openFromTask ran for the task: still no duty (a head would be asked for this plan), no wait on the claim.
      expect(await h.dutyRows(assignmentId)).toEqual([]);
      const [right] = await rightsOf(wire.id);
      expect(right).toMatchObject({ dataLossOnRemoval: true, handover: null });
      const taskId = right.revocation?.taskId ?? '';
      await h.claim(taskId).expect(200);
      await h.revoked(taskId, { completion: 'ACCOUNT_REMOVED', evidence: 'đã xóa tài khoản' }).expect(200);
      expect(await h.dutyRows(assignmentId)).toEqual([]);
      const headsDuties = h.dataOf<{ items: unknown[] }>(
        await h.duties(`?pageSize=100&employeeId=${person.employeeId}`, head.account).expect(200),
      ).items;
      expect(headsDuties).toEqual([]);

      const closed = h.dataOf<CaseWire>(await h.closeCase(wire.id).expect(200));
      expect(closed.closed).toBe(true);
      expect(await h.workState(person.employeeId)).toBe('TERMINATED/LEFT');
    });

    it('8b. does the same for an abrupt departure: the person is LEFT at once and the revocation of the seat is not held', async () => {
      const { person, assignmentId } = await unplacedWithSeat();

      const wire = await h.recordedCase(person, { abrupt: true, lastWorkingDay: h.today() });

      expect(wire).toMatchObject({ state: 'LEFT', abrupt: true });
      expect(await h.dutyRows(assignmentId)).toEqual([]);
      await h.revokeRights(wire.id, { count: 1, reason: 'Nghỉ đột ngột', accountLock: LOCK }).expect(200);
      const [right] = await rightsOf(wire.id);
      expect(right.revocation?.source).toBe('ABRUPT_DEPARTURE');
      expect(await h.dutyRows(assignmentId)).toEqual([]);
      const taskId = right.revocation?.taskId ?? '';
      await h.claim(taskId).expect(200);
      await h.revoked(taskId, { completion: 'ACCOUNT_REMOVED', evidence: 'đã xóa tài khoản' }).expect(200);
      expect(h.dataOf<CaseWire>(await h.closeCase(wire.id).expect(200)).closed).toBe(true);
    });

    it('9. refuses a last working day equal to validFrom (D-S28), keeps the placement, and from validFrom on records the normal flow with the head confirming', async () => {
      const employeeCode = code('NV-D28');
      const emp = await createUnplacedEmployee(employeeCode);
      const validFrom = h.day(10);
      await request(h.server())
        .post(`/api/v1/employees/${emp.id}/first-placements`)
        .set(h.as(h.sa))
        .send({ departmentId: des.id, effectiveFrom: validFrom })
        .expect(201);

      const same = await h.recordCase({ employeeId: emp.id, lastWorkingDay: validFrom, grounds: h.grounds });
      expect([same.status, h.codeOf(same)]).toEqual([409, 'OFFBOARDING_CASE.PLACEMENT_OVERLAP']);
      expect(h.detailsOf(same)).toEqual({ reason: 'FIRST_PLACEMENT_PENDING', validFrom });
      expect(await h.placementCount(emp.id)).toBe(1);
      expect(await h.caseCount(emp.id)).toBe(0);
      expect(await h.auditEventsOf('EMPLOYEE.FIRST_PLACEMENT_CANCELLED', emp.id)).toEqual([]);

      // The day the placement takes effect the person is a member: the same call is the normal flow, not the short one.
      const person: Person = { employeeId: emp.id, account: await h.account(employeeCode, emp.id, 'EMPLOYEE') };
      const spy = pretendBusinessToday(h.ctx.app, validFrom);
      try {
        const assignmentId = await h.seatOf(person, { subscriptionId: tool }, employeeCode);
        const wire = h.dataOf<CaseWire>(
          await h.recordCase({ employeeId: emp.id, lastWorkingDay: h.day(20), grounds: h.grounds }).expect(201),
        );

        expect(wire.department).toMatchObject({ id: des.id });
        const row = await h.ctx.sql.query<{ department_id: string | null; cancelled_placement_id: string | null }>(
          'SELECT department_id, cancelled_placement_id FROM offboarding_cases WHERE id = $1',
          [wire.id],
        );
        expect(row.rows[0]).toEqual({ department_id: des.id, cancelled_placement_id: null });
        expect(await h.auditEventsOf('EMPLOYEE.FIRST_PLACEMENT_CANCELLED', emp.id)).toEqual([]);
        expect(await h.placementCount(emp.id)).toBe(1);
        const duties = await h.dutyRows(assignmentId);
        expect(duties).toHaveLength(1);
        expect(duties[0]).toMatchObject({ confirmer_role: 'DEPARTMENT_HEAD', department_id: des.id });
      } finally {
        spy.mockRestore();
      }
    });

    it('10. lets an IT Admin who is in charge of no department read the case of a person with no placement, and nothing of a department they do not serve', async () => {
      const outsider = await h.worker(des, 'IT2-UNP', ['IT_ADMIN']);
      // Every active department names the first IT Admin, so the second one stands in for none of them.
      await h.ctx.sql.query(`UPDATE departments SET it_admin_employee_id = $1 WHERE status = 'ACTIVE'`, [
        h.it1.employeeId,
      ]);
      const unplaced = h.dataOf<CaseWire>(
        await h
          .recordCase({
            employeeId: (await createUnplacedEmployee()).id,
            lastWorkingDay: h.day(10),
            grounds: h.grounds,
          })
          .expect(201),
      );
      const placed = await h.recordedCase(await h.worker(des, code('NV-PLC')));

      const placedRead = await h.readCase(placed.id, outsider.account);
      const unplacedRead = h.dataOf<CaseWire>(await h.readCase(unplaced.id, outsider.account).expect(200));
      const list = h
        .dataOf<{ items: { id: string }[] }>(await h.listCases('?pageSize=100', outsider.account).expect(200))
        .items.map((item) => item.id);

      expect([placedRead.status, h.codeOf(placedRead)]).toEqual([404, 'OFFBOARDING_CASE.NOT_FOUND']);
      expect(unplacedRead.id).toBe(unplaced.id);
      expect(list).toContain(unplaced.id);
      expect(list).not.toContain(placed.id);
      expect((await h.rightsOf(unplaced.id, '', outsider.account)).status).toBe(200);
    });

    it('11. tells the Super Admin that an unplaced IT Admin in charge of a department is leaving, with a null department (ROLE_HOLDER_LEAVING)', async () => {
      const itAdmin = await h.unplacedStaff(code('IT-UNP'), 'IT_ADMIN');
      await h.setItAdminInCharge(des, itAdmin);

      const wire = await h.recordedCase(itAdmin);

      expect(wire.department ?? null).toBeNull();
      const { rows } = await h.ctx.sql.query<{ recipient_employee_id: string; params: Record<string, unknown> }>(
        `SELECT recipient_employee_id, params FROM in_app_notifications WHERE code = 'ROLE_HOLDER_LEAVING' AND subject_id = $1`,
        [wire.id],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].recipient_employee_id).toBe(h.sa.employeeId);
      expect(rows[0].params).toMatchObject({
        employeeId: itAdmin.employeeId,
        departmentId: null,
        roleFlag: 'IT_ADMIN_IN_CHARGE',
      });
    });
  });
});
