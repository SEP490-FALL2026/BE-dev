import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { clearSpendingApprover, setSpendingApprover } from '../../support/builders/account.builder';
import { handOthersToSecondItAdmin } from '../../support/second-it-admin';
import { TransferHarness, type TransferWire } from '../../support/transfer-harness';
import type { Department, Person } from '../../support/request-harness';

const h = new TransferHarness();

/**
 * US-03-01 (AC-1, AC-2, AC-4 -> AC-8, AC-11, AC-13 -> AC-18, AC-21): recording a transfer, over HTTP, on real PostgreSQL. The Super
 * Admin records it (`QĐ-87a`, F40); the IT Admin only reads a minimal projection (F12); a transfer changes the department only and
 * is recorded into a department with no Cost Center like any other (F41, F44); the flag "done on oneself" is gone (F45).
 */
describe('recording a transfer of a person (integration, real PostgreSQL)', () => {
  let des: Department;
  let fin: Department;
  const NO = { personToPersonMessaging: false, callsOrMeetings: false, mailbox: false };

  beforeAll(async () => {
    await h.start();
    des = await h.departmentWithUnit('P-DES');
    fin = await h.departmentWithUnit('P-FIN');
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  let sequence = 0;
  const code = (prefix: string) => `${prefix}-${(sequence += 1)}`;
  const codeOf = (response: request.Response) => h.codeOf(response);
  const body = (employeeId: string, extra: object = {}) => ({
    employeeId,
    toDepartmentId: fin.id,
    effectiveOn: h.day(30),
    grounds: h.grounds,
    ...extra,
  });
  const state = async (person: Person) => ({
    placements: await h.placements(person.employeeId),
    transfers: (
      await h.ctx.sql.query<{ n: string }>(`SELECT count(*) AS n FROM department_transfers WHERE employee_id = $1`, [
        person.employeeId,
      ])
    ).rows[0].n,
  });

  describe('the Super Admin records an event about another person, never about themselves (F40, F19)', () => {
    it('refuses the Super Admin about themselves: 403 PERSONNEL.SELF_CHANGE_FORBIDDEN, no row and no audit event', async () => {
      const before = await h.ctx.sql.query<{ n: string }>(
        `SELECT (SELECT count(*) FROM department_transfers) || '/' || (SELECT count(*) FROM audit_events) AS n`,
      );

      const response = await h.recordTransfer(body(h.sa.employeeId, { toDepartmentId: des.id }));

      expect([response.status, codeOf(response)]).toEqual([403, 'PERSONNEL.SELF_CHANGE_FORBIDDEN']);
      const after = await h.ctx.sql.query<{ n: string }>(
        `SELECT (SELECT count(*) FROM department_transfers) || '/' || (SELECT count(*) FROM audit_events) AS n`,
      );
      expect(after.rows).toEqual(before.rows);
    });

    it('records one about an IT Admin without any flag of "done on oneself" (F45): the wire has no selfExecuted and no event says so', async () => {
      const wire = await h.recorded(body(h.it1.employeeId, { toDepartmentId: des.id }));

      expect(Object.keys(wire)).not.toContain('selfExecuted');
      expect(await h.auditEventsOf('PERSONNEL.SELF_EXECUTED', wire.id)).toEqual([]);
      await h.cancelTransfer(wire.id, { reason: 'The move is not needed', grounds: h.grounds }).expect(200);
    });
  });

  it('records the move of E1 from P-DES to P-FIN on a day to come: the old period ends on it and the new one begins on it (AC-1)', async () => {
    const e1 = await h.veteran(des, code('E'));
    const effectiveOn = h.day(30);

    const wire = await h.recorded(body(e1.employeeId));

    expect(wire).toMatchObject({
      status: 'PENDING',
      effectiveOn,
      from: { department: { code: 'P-DES' } },
      to: { department: { code: 'P-FIN' } },
      grounds: h.grounds,
      recordedByAppUserId: h.sa.appUserId,
      recordedByProcedure: false,
      warnings: [],
    });
    expect(await h.placements(e1.employeeId)).toEqual([
      expect.objectContaining({ department_id: des.id, valid_from: '2026-01-05', valid_to: effectiveOn }),
      expect.objectContaining({ department_id: fin.id, valid_from: effectiveOn, valid_to: null }),
    ]);
    const owning = async (day: string) =>
      (await h.organizationReads().getOwningUnits([e1.employeeId], day)).get(e1.employeeId)?.costCenter?.id;
    expect(await owning(h.day(29))).toBe(des.unitId);
    expect(await owning(effectiveOn)).toBe(fin.unitId);
    expect(await h.auditEventsOf('DEPARTMENT_TRANSFER.RECORDED', wire.id)).toEqual([
      expect.objectContaining({
        actor_app_user_id: h.sa.appUserId,
        before: expect.objectContaining({ department: 'P-DES' }) as unknown,
        after: expect.objectContaining({ department: 'P-FIN', effectiveOn, grounds: h.grounds }) as unknown,
      }),
    ]);
    const read = h.dataOf<TransferWire>(await h.readTransfer(wire.id).expect(200));
    expect(read).toMatchObject({ id: wire.id, status: 'PENDING', headSuccessor: null });
    const listed = h.dataOf<{ items: TransferWire[] }>(
      await h.listTransfers(`?employeeId=${e1.employeeId}`).expect(200),
    );
    expect(listed.items.map((item) => item.id)).toEqual([wire.id]);
  });

  it('refuses two placements of one person that meet, in the database and, for a day after a later placement, in the service (AC-2)', async () => {
    const person = await h.veteran(des, code('E'));
    await h.recordTransfer(body(person.employeeId)).expect(201);
    const fault = await h.ctx.sql
      .query(
        `INSERT INTO employee_placements (id, organization_id, employee_id, department_id, valid_from)
         VALUES (gen_random_uuid(), $1, $2, $3, $4)`,
        [h.seed.organizationId, person.employeeId, h.seed.departmentId, h.day(15)],
      )
      .catch((error: { code?: string }) => error);
    expect((fault as { code?: string }).code).toBe('23P01');

    const other = await h.veteran(des, code('E'));
    await h.ctx.sql.query(`UPDATE employee_placements SET valid_to = $2 WHERE employee_id = $1`, [
      other.employeeId,
      h.day(40),
    ]);
    await h.ctx.sql.query(
      `INSERT INTO employee_placements (id, organization_id, employee_id, department_id, valid_from)
       VALUES (gen_random_uuid(), $1, $2, $3, $4)`,
      [h.seed.organizationId, other.employeeId, fin.id, h.day(40)],
    );
    const response = await h.recordTransfer(body(other.employeeId, { effectiveOn: h.day(30) }));
    expect(response.status).toBe(409);
    expect(codeOf(response)).toBe('DEPARTMENT_TRANSFER.PLACEMENT_OVERLAP');
  });

  it('does not touch the seats the person holds nor create a task of revocation (AC-5)', async () => {
    const person = await h.veteran(des, code('E'));
    const count = async () =>
      (
        await h.ctx.sql.query<{ n: string }>(
          `SELECT (SELECT count(*) FROM license_assignments) || '/' || (SELECT count(*) FROM provisioning_tasks) AS n`,
        )
      ).rows[0].n;
    const before = await count();

    await h.recorded(body(person.employeeId));

    expect(await count()).toBe(before);
  });

  describe('the head of the department they leave (AC-4, AC-8)', () => {
    const headOf = async (name: string) => {
      const department = await h.departmentWithUnit(name);
      const head = await h.veteran(department, code('H'));
      await h.makeHead(department, head);

      return { department, head };
    };

    it('wants to know who follows: refuses with the name of the department and writes nothing', async () => {
      const { department, head } = await headOf('P-HEAD1');
      const before = await state(head);

      const response = await h.recordTransfer(body(head.employeeId));

      expect(response.status).toBe(422);
      expect(codeOf(response)).toBe('DEPARTMENT_TRANSFER.HEAD_SUCCESSOR_REQUIRED');
      expect(h.detailsOf(response)).toMatchObject({ departmentName: `Department ${department.code}` });
      expect(await state(head)).toEqual(before);
    });

    it('hands the department to a member from the day: the head ends the day before and the member begins on it', async () => {
      const { department, head } = await headOf('P-HEAD2');
      const heir = await h.veteran(department, code('H'), ['MANAGER']);
      const effectiveOn = h.day(30);

      const wire = await h.recorded(
        body(head.employeeId, { effectiveOn, successor: { kind: 'EMPLOYEE', employeeId: heir.employeeId } }),
      );

      expect(wire.headSuccessor).toMatchObject({ kind: 'EMPLOYEE', employee: { id: heir.employeeId } });
      expect(await h.headPeriods(department.id)).toEqual([
        { employee_id: head.employeeId, valid_from: h.today(), valid_to: effectiveOn },
        { employee_id: heir.employeeId, valid_from: effectiveOn, valid_to: null },
      ]);
    });

    it('refuses a successor without MANAGER or with no account, and the spending approver, and writes nothing (US-03-01 AC-8, US-03-06 AC-23, AC-24)', async () => {
      const { department, head } = await headOf('P-HEAD6');
      const withoutRole = await h.veteran(department, code('N'));
      const approver = await h.veteran(department, code('A'));
      await setSpendingApprover(h.ctx, h.admin, approver.employeeId);
      const before = await state(head);
      const reasonOf = async (employeeId: string) => {
        const response = await h.recordTransfer(body(head.employeeId, { successor: { kind: 'EMPLOYEE', employeeId } }));

        return [response.status, codeOf(response), h.detailsOf(response)];
      };

      expect(await reasonOf(withoutRole.employeeId)).toEqual([
        422,
        'DEPARTMENT_TRANSFER.SUCCESSOR_NOT_A_MEMBER_ON_DATE',
        { reason: 'MANAGER_ROLE_REQUIRED' },
      ]);
      expect(await reasonOf(approver.employeeId)).toEqual([
        422,
        'DEPARTMENT_TRANSFER.SUCCESSOR_NOT_A_MEMBER_ON_DATE',
        { reason: 'SPENDING_APPROVER_CANNOT_HEAD' },
      ]);
      expect(await state(head)).toEqual(before);
      expect(await h.headPeriods(department.id)).toEqual([
        expect.objectContaining({ employee_id: head.employeeId, valid_to: null }),
      ]);
      await clearSpendingApprover(h.ctx, h.admin);
    });

    it('lets the department be left without a head when that is chosen', async () => {
      const { department, head } = await headOf('P-HEAD3');

      const wire = await h.recorded(body(head.employeeId, { successor: { kind: 'NONE' } }));

      expect(wire.headSuccessor).toEqual({ kind: 'NONE', employee: null });
      expect(await h.headPeriods(department.id)).toEqual([
        { employee_id: head.employeeId, valid_from: h.today(), valid_to: h.day(30) },
      ]);
    });

    it('refuses a successor who is a member of another department, and writes nothing', async () => {
      const { head } = await headOf('P-HEAD4');
      const stranger = await h.veteran(fin, code('E'));
      const before = await state(head);

      const response = await h.recordTransfer(
        body(head.employeeId, { successor: { kind: 'EMPLOYEE', employeeId: stranger.employeeId } }),
      );

      expect(response.status).toBe(422);
      expect(codeOf(response)).toBe('DEPARTMENT_TRANSFER.SUCCESSOR_NOT_A_MEMBER_ON_DATE');
      expect(h.detailsOf(response)).toMatchObject({ reason: 'NOT_A_MEMBER_ON_DATE' });
      expect(await state(head)).toEqual(before);
    });
  });

  it('records the move of a person into a department that has no Cost Center, like any other (F44, QĐ-87d(3)): no refusal, the seats of the person stay charged to the old department', async () => {
    // A department the Super Admin created and Finance has not given a Cost Center yet.
    const bare = h.dataOf<{ id: string; code: string }>(
      await request(h.server())
        .post('/api/v1/departments')
        .set({ Authorization: `Bearer ${h.admin}` })
        .send({ code: 'P-BARE', name: 'Department P-BARE' })
        .expect(201),
    );
    const person = await h.veteran(des, code('E'));
    const effectiveOn = h.day(20);

    const wire = await h.recorded(body(person.employeeId, { toDepartmentId: bare.id, effectiveOn }));

    expect(wire).toMatchObject({ status: 'PENDING', to: { department: { code: 'P-BARE' } } });
    expect((await h.placements(person.employeeId)).map((row) => row.department_id)).toEqual([des.id, bare.id]);
    const owning = async (day: string) =>
      (await h.organizationReads().getOwningUnits([person.employeeId], day)).get(person.employeeId)?.costCenter?.id;
    expect(await owning(h.day(19))).toBe(des.unitId);
  });

  it('records the move of a person with the department only: the title is theirs and no job title is a fact of the transfer (F41, QĐ-87e)', async () => {
    const person = await h.veteran(des, code('E'));
    const effectiveOn = h.day(45);

    const wire = await h.recorded(body(person.employeeId, { effectiveOn }));

    expect(Object.keys(wire).sort()).not.toContain('changes');
    expect(wire.from).toEqual({ department: expect.objectContaining({ code: 'P-DES' }) as unknown });
    expect(wire.to).toEqual({ department: expect.objectContaining({ code: 'P-FIN' }) as unknown });
    expect(await h.placements(person.employeeId)).toEqual([
      expect.objectContaining({ department_id: des.id, valid_to: effectiveOn }),
      expect.objectContaining({ department_id: fin.id, valid_from: effectiveOn, valid_to: null }),
    ]);
  });

  it('warns without stopping when the person is the Business Owner of an application (AC-13)', async () => {
    const owner = await h.veteran(des, code('E'));
    await request(h.server())
      .post('/api/v1/applications')
      .set(h.as(h.it1))
      .send({
        name: h.unique('Owned app'),
        kind: 'INTERNAL',
        dataSensitivity: 'LOW',
        businessOwnerEmployeeId: owner.employeeId,
        communication: NO,
      })
      .expect(201);

    const wire = await h.recorded(body(owner.employeeId));

    expect(wire.status).toBe('PENDING');
    expect(wire.warnings).toEqual([
      {
        code: 'BUSINESS_OWNER_KEEP_OR_CHANGE',
        applications: [expect.objectContaining({ name: expect.any(String) as unknown })],
        totalApplications: 1,
      },
    ]);
  });

  describe('who may record one, and who reads what (AC-14, F40, F12, F13)', () => {
    it('refuses Finance, a department head, an employee and the IT Admin on every write, and changes nothing', async () => {
      const person = await h.veteran(des, code('E'));
      const head = await h.veteran(fin, code('H'), []);
      await h.makeHead(fin, head);
      const before = await state(person);

      for (const account of [h.finance, head.account, h.employee, h.it1]) {
        const response = await h.recordTransfer(body(person.employeeId), account);
        expect([response.status, codeOf(response)]).toEqual([403, 'AUTHORIZATION.FORBIDDEN']);
      }
      for (const account of [h.finance, head.account, h.employee]) {
        expect((await h.listTransfers('', account)).status).toBe(403);
      }

      expect(await state(person)).toEqual(before);
    });

    it('gives the IT Admin only the minimal projection of the departments in their charge, and 404 for the rest (F12)', async () => {
      const inCharge = await h.departmentWithUnit('P-INCH');
      const member = await h.veteran(inCharge, code('E'));
      await h.ctx.sql.query(`UPDATE departments SET it_admin_employee_id = $2 WHERE id = $1`, [
        inCharge.id,
        h.it1.employeeId,
      ]);
      // The departments nobody usable is in charge of are the work of every IT Admin (F12): the others have a second IT Admin.
      await handOthersToSecondItAdmin(h);
      const mine = await h.recorded(body(member.employeeId, { toDepartmentId: fin.id }));
      const elsewhere = await h.recorded(body((await h.veteran(des, code('E'))).employeeId));

      const seen = h.dataOf<TransferWire>(await h.readTransfer(mine.id, h.it1).expect(200));
      const hidden = await h.readTransfer(elsewhere.id, h.it1);
      const listed = h.dataOf<{ items: TransferWire[] }>(await h.listTransfers('', h.it1).expect(200));

      expect(seen).toMatchObject({ id: mine.id, status: 'PENDING', grounds: null, headSuccessor: null });
      expect([hidden.status, codeOf(hidden)]).toEqual([404, 'DEPARTMENT_TRANSFER.NOT_FOUND']);
      expect(listed.items.map((item) => item.id)).toContain(mine.id);
      expect(listed.items.map((item) => item.id)).not.toContain(elsewhere.id);
      expect((await h.transferChanges(mine.id, '', h.it1)).status).toBe(403);
    });
  });

  it('refuses a person who has left, and one who does not exist (AC-15)', async () => {
    const gone = await h.veteran(des, code('E'));
    await h.ctx.sql.query(`UPDATE employees SET status = 'TERMINATED' WHERE id = $1`, [gone.employeeId]);

    const left = await h.recordTransfer(body(gone.employeeId));
    const missing = await h.recordTransfer(body(randomUUID()));

    expect([left.status, codeOf(left)]).toEqual([409, 'DEPARTMENT_TRANSFER.EMPLOYEE_LEFT']);
    expect([missing.status, codeOf(missing)]).toEqual([404, 'DEPARTMENT_TRANSFER.EMPLOYEE_NOT_FOUND']);
  });

  it('takes effect from today or a day to come, and never from the past (AC-16)', async () => {
    const person = await h.veteran(des, code('E'));
    const before = await state(person);

    const past = await h.recordTransfer(body(person.employeeId, { effectiveOn: h.day(-1) }));
    expect([past.status, codeOf(past)]).toEqual([422, 'DEPARTMENT_TRANSFER.EFFECTIVE_DATE_IN_PAST']);
    expect(await state(person)).toEqual(before);

    const today = await h.recorded(body(person.employeeId, { effectiveOn: h.today() }));
    expect(today).toMatchObject({ status: 'EFFECTIVE', effectiveOn: h.today() });
    expect(await h.auditEventsOf('DEPARTMENT_TRANSFER.EFFECTIVE', today.id)).toHaveLength(1);
    expect((await h.organizationReads().getEmployeePlacement(person.employeeId, h.today()))?.departmentId).toBe(fin.id);
  });

  it('wants a day after the first day of the placement the person has (a person recorded today cannot move today)', async () => {
    const fresh = await h.staff(des, code('E'));

    const response = await h.recordTransfer(body(fresh.employeeId, { effectiveOn: h.today() }));

    expect([response.status, codeOf(response)]).toEqual([
      422,
      'DEPARTMENT_TRANSFER.EFFECTIVE_DATE_NOT_AFTER_CURRENT_PERIOD',
    ]);
  });

  describe('a job title is not a fact of a transfer (QĐ-87e, AC-17, F41)', () => {
    it('refuses a body that names a job title, with or without a department, and a body that names no department: 422 VALIDATION_ERROR, nothing written', async () => {
      const person = await h.veteran(des, code('E'));
      const before = await state(person);

      const withBoth = await h.recordTransfer(body(person.employeeId, { toJobTitleId: randomUUID() }));
      const titleOnly = await h.recordTransfer({
        employeeId: person.employeeId,
        toJobTitleId: randomUUID(),
        effectiveOn: h.day(30),
        grounds: h.grounds,
      });
      const neither = await h.recordTransfer({
        employeeId: person.employeeId,
        effectiveOn: h.day(30),
        grounds: h.grounds,
      });

      expect([withBoth, titleOnly, neither].map((answer) => [answer.status, codeOf(answer)])).toEqual([
        [422, 'VALIDATION_ERROR'],
        [422, 'VALIDATION_ERROR'],
        [422, 'VALIDATION_ERROR'],
      ]);
      expect(await state(person)).toEqual(before);
    });

    it('answers a move to the department the person is in with NO_CHANGE', async () => {
      const person = await h.veteran(des, code('E'));
      const before = await state(person);

      const same = await h.recordTransfer(body(person.employeeId, { toDepartmentId: des.id }));

      expect([same.status, codeOf(same)]).toEqual([422, 'DEPARTMENT_TRANSFER.NO_CHANGE']);
      expect(await state(person)).toEqual(before);
    });
  });

  describe('the basis (AC-18)', () => {
    it('is required, whole, and not the code of a notice', async () => {
      const person = await h.veteran(des, code('E'));
      const before = await state(person);

      const none = await h.recordTransfer({ ...body(person.employeeId), grounds: undefined });
      const partial = await h.recordTransfer(body(person.employeeId, { grounds: { ...h.grounds, issuer: '' } }));
      const notice = await h.recordTransfer(
        body(person.employeeId, { grounds: { ...h.grounds, reference: 'BM09-2026-000042' } }),
      );

      expect([none.status, codeOf(none)]).toEqual([422, 'VALIDATION_ERROR']);
      expect([partial.status, codeOf(partial)]).toEqual([422, 'VALIDATION_ERROR']);
      expect(JSON.stringify(h.detailsOf(partial))).toContain('grounds.issuer');
      expect([notice.status, codeOf(notice)]).toEqual([422, 'DEPARTMENT_TRANSFER.GROUNDS_IS_NOTICE']);
      expect(await state(person)).toEqual(before);
    });

    it('is kept with the transfer and in the Audit Trail when it is a decision with a number', async () => {
      const person = await h.veteran(des, code('E'));

      const wire = await h.recorded(body(person.employeeId, { grounds: { ...h.grounds, reference: 'QD-77/2026' } }));

      expect(wire.grounds?.reference).toBe('QD-77/2026');
      const [event] = await h.auditEventsOf('DEPARTMENT_TRANSFER.RECORDED', wire.id);
      expect((event.after as { grounds: { reference: string } }).grounds.reference).toBe('QD-77/2026');
    });
  });

  it('lets a person have one transfer waiting at a time, and the database keeps it too (AC-21)', async () => {
    const person = await h.veteran(des, code('E'));
    const first = await h.recorded(body(person.employeeId, { effectiveOn: h.day(30) }));

    const second = await h.recordTransfer(body(person.employeeId, { effectiveOn: h.day(60) }));

    expect([second.status, codeOf(second)]).toEqual([409, 'DEPARTMENT_TRANSFER.PENDING_EVENT_EXISTS']);
    expect(h.detailsOf(second)).toEqual({ kind: 'TRANSFER', effectiveOn: first.effectiveOn });
    const fault = await h.ctx.sql
      .query(
        `INSERT INTO department_transfers (id, organization_id, employee_id, from_department_id, to_department_id,
           effective_on, closes_placement_id, opens_placement_id, grounds_type,
           grounds_reference, grounds_issuer, grounds_issued_on, recorded_by_app_user_id)
         SELECT gen_random_uuid(), organization_id, employee_id, to_department_id, from_department_id,
                effective_on + 10, gen_random_uuid(), gen_random_uuid(), 'X', 'X', 'X', current_date, recorded_by_app_user_id
           FROM department_transfers WHERE id = $1`,
        [first.id],
      )
      .catch((error: { code?: string }) => error);
    expect((fault as { code?: string }).code).toBe('23505');
  });
});
