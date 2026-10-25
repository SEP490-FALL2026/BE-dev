import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { TransferHarness, type TransferWire } from '../support/transfer-harness';
import type { Department, Person } from '../support/request-harness';

const h = new TransferHarness();

/** US-03-01 (AC-1, AC-2, AC-4 -> AC-8, AC-11, AC-13 -> AC-18, AC-21, AC-22): recording a transfer, over HTTP, on real PostgreSQL. */
describe('recording a transfer of a person (integration, real PostgreSQL)', () => {
  let des: Department;
  let fin: Department;
  let designer: string;
  let senior: string;
  const NO = { personToPersonMessaging: false, callsOrMeetings: false, mailbox: false };

  beforeAll(async () => {
    await h.start();
    des = await h.departmentWithUnit('P-DES');
    fin = await h.departmentWithUnit('P-FIN');
    designer = await h.title();
    senior = await h.jobTitle('Senior Designer');
  }, 300000);

  afterAll(async () => {
    await h.stop();
  });

  let sequence = 0;
  const code = (prefix: string) => `${prefix}${(sequence += 1)}`;
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

  describe('an IT Admin who is the only one may record an event about themselves (AC-22)', () => {
    it('records it, flags it as done on oneself and leaves a trace for the Super Admin', async () => {
      const wire = await h.recorded(body(h.it1.employeeId, { toDepartmentId: des.id }), h.it1);

      expect(wire.selfExecuted).toBe(true);
      expect((await h.auditEventsOf('PERSONNEL.SELF_EXECUTED', wire.id)).length).toBe(1);
      expect(await h.auditEventsOf('DEPARTMENT_TRANSFER.RECORDED', wire.id)).toHaveLength(1);
      await h.cancelTransfer(wire.id, { reason: 'The move is not needed', grounds: h.grounds }, h.it1).expect(200);
    });
  });

  it('records the move of E1 from P-DES to P-FIN on a day to come: the old period ends on it and the new one begins on it (AC-1)', async () => {
    const e1 = await h.veteran(des, code('E'));
    const effectiveOn = h.day(30);

    const wire = await h.recorded(body(e1.employeeId));

    expect(wire).toMatchObject({
      status: 'PENDING',
      changes: 'DEPARTMENT',
      effectiveOn,
      from: { department: { code: 'P-DES' } },
      to: { department: { code: 'P-FIN' } },
      grounds: h.grounds,
      selfExecuted: false,
      warnings: [],
    });
    expect(await h.placements(e1.employeeId)).toEqual([
      expect.objectContaining({ department_id: des.id, valid_from: '2026-01-05', valid_to: effectiveOn }),
      expect.objectContaining({ department_id: fin.id, valid_from: effectiveOn, valid_to: null }),
    ]);
    const owning = async (day: string) =>
      (await h.organizationService().getOwningUnits([e1.employeeId], day)).get(e1.employeeId)?.costCenter.id;
    expect(await owning(h.day(29))).toBe(des.unitId);
    expect(await owning(effectiveOn)).toBe(fin.unitId);
    expect(await h.auditEventsOf('DEPARTMENT_TRANSFER.RECORDED', wire.id)).toEqual([
      expect.objectContaining({
        actor_app_user_id: h.it1.appUserId,
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
        `INSERT INTO employee_placements (id, organization_id, employee_id, department_id, job_title_id, valid_from)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)`,
        [h.seed.organizationId, person.employeeId, h.seed.departmentId, designer, h.day(15)],
      )
      .catch((error: { code?: string }) => error);
    expect((fault as { code?: string }).code).toBe('23P01');

    const other = await h.veteran(des, code('E'));
    await h.ctx.sql.query(`UPDATE employee_placements SET valid_to = $2 WHERE employee_id = $1`, [
      other.employeeId,
      h.day(40),
    ]);
    await h.ctx.sql.query(
      `INSERT INTO employee_placements (id, organization_id, employee_id, department_id, job_title_id, valid_from)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5)`,
      [h.seed.organizationId, other.employeeId, fin.id, designer, h.day(40)],
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

    it('naming a new head changes neither the members nor the Cost Center of the department (AC-4)', async () => {
      const { department, head } = await headOf('P-AC4');
      const members = [await h.veteran(department, code('M')), await h.veteran(department, code('M'))];
      const next = await h.veteran(department, code('H'));
      const before = await h.organizationService().getDepartmentMemberIds(department.id);

      await h.makeHead(department, next);

      expect([...((await h.organizationService().getDepartmentMemberIds(department.id)) ?? [])].sort()).toEqual(
        [...(before ?? [])].sort(),
      );
      expect(members).toHaveLength(2);
      expect(head.employeeId).not.toBe(next.employeeId);
      const unit = (await h.organizationService().getOwningUnits([next.employeeId], h.today())).get(next.employeeId);
      expect(unit?.costCenter.id).toBe(department.unitId);
    });

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
      const heir = await h.veteran(department, code('H'));
      const effectiveOn = h.day(30);

      const wire = await h.recorded(
        body(head.employeeId, { effectiveOn, successor: { kind: 'EMPLOYEE', employeeId: heir.employeeId } }),
      );

      expect(wire.headSuccessor).toMatchObject({ kind: 'EMPLOYEE', employee: { id: heir.employeeId } });
      expect(await h.headPeriods(department.id)).toEqual([
        { employee_id: head.employeeId, valid_from: h.today(), valid_to: effectiveOn },
        { employee_id: heir.employeeId, valid_from: effectiveOn, valid_to: null },
      ]);
      expect(
        (await h.organizationService().getDepartmentHeads([department.id], h.day(29))).get(department.id)?.employeeId,
      ).toBe(head.employeeId);
      expect(
        (await h.organizationService().getDepartmentHeads([department.id], effectiveOn)).get(department.id)?.employeeId,
      ).toBe(heir.employeeId);
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

    it('keeps the head a head when only the title changes (AC-11)', async () => {
      const { department, head } = await headOf('P-HEAD5');

      await h.recorded({
        employeeId: head.employeeId,
        toJobTitleId: senior,
        effectiveOn: h.day(30),
        grounds: h.grounds,
      });

      expect(await h.headPeriods(department.id)).toEqual([
        { employee_id: head.employeeId, valid_from: h.today(), valid_to: null },
      ]);
    });
  });

  it('changes only the title inside the department: a new period of the title, the department and the Cost Center the same (AC-11)', async () => {
    const person = await h.veteran(des, code('E'));
    const effectiveOn = h.day(45);

    const wire = await h.recorded({
      employeeId: person.employeeId,
      toJobTitleId: senior,
      effectiveOn,
      grounds: h.grounds,
    });

    expect(wire).toMatchObject({ changes: 'JOB_TITLE', from: { jobTitle: { name: expect.any(String) as unknown } } });
    expect(await h.placements(person.employeeId)).toEqual([
      expect.objectContaining({ department_id: des.id, job_title_id: designer, valid_to: effectiveOn }),
      expect.objectContaining({ department_id: des.id, job_title_id: senior, valid_from: effectiveOn, valid_to: null }),
    ]);
    const unit = async (day: string) =>
      (await h.organizationService().getOwningUnits([person.employeeId], day)).get(person.employeeId)?.costCenter.id;
    expect(await unit(h.day(44))).toBe(des.unitId);
    expect(await unit(effectiveOn)).toBe(des.unitId);
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
        code: 'BUSINESS_OWNER_REPLACEMENT_NEEDED',
        applications: [expect.objectContaining({ name: expect.any(String) as unknown })],
        totalApplications: 1,
      },
    ]);
  });

  describe('who may record one (AC-14)', () => {
    it('refuses Finance, a department head, an employee and the Super Admin, and changes nothing', async () => {
      const person = await h.veteran(des, code('E'));
      const head = await h.veteran(fin, code('H'), []);
      await h.makeHead(fin, head);
      const before = await state(person);
      const attempts = [h.finance, head.account, h.employee, { ...h.it1, accessToken: h.admin }];

      for (const account of attempts) {
        const response = await h.recordTransfer(body(person.employeeId), account);
        expect(response.status).toBe(403);
        expect((await h.listTransfers('', account)).status).toBe(403);
      }

      expect(await state(person)).toEqual(before);
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
    expect((await h.organizationService().getEmployeePlacement(person.employeeId, h.today()))?.departmentId).toBe(
      fin.id,
    );

    const later = await h.veteran(des, code('E'));
    await h.recorded(body(later.employeeId, { effectiveOn: h.day(1) }));
  });

  it('wants a day after the first day of the placement the person has (a person recorded today cannot move today)', async () => {
    const fresh = await h.staff(des, code('E'));

    const response = await h.recordTransfer(body(fresh.employeeId, { effectiveOn: h.today() }));

    expect([response.status, codeOf(response)]).toEqual([
      422,
      'DEPARTMENT_TRANSFER.EFFECTIVE_DATE_NOT_AFTER_CURRENT_PERIOD',
    ]);
  });

  describe('the job title comes from the catalogue (AC-17)', () => {
    it('refuses a title that is not there, and one that is not in use, without adding or reviving either', async () => {
      const person = await h.veteran(des, code('E'));
      const retired = await h.jobTitle(h.unique('Retired title'));
      await h.ctx.sql.query(`UPDATE job_titles SET status = 'INACTIVE' WHERE id = $1`, [retired]);
      const titles = async () =>
        (await h.ctx.sql.query<{ id: string; status: string }>(`SELECT id, status FROM job_titles ORDER BY id`)).rows;
      const before = await titles();

      const unknown = await h.recordTransfer(body(person.employeeId, { toJobTitleId: randomUUID() }));
      const inactive = await h.recordTransfer(body(person.employeeId, { toJobTitleId: retired }));

      expect([unknown.status, codeOf(unknown)]).toEqual([422, 'DEPARTMENT_TRANSFER.JOB_TITLE_NOT_FOUND']);
      expect([inactive.status, codeOf(inactive)]).toEqual([422, 'DEPARTMENT_TRANSFER.JOB_TITLE_INACTIVE']);
      expect(await titles()).toEqual(before);
    });

    it('accepts the title the person keeps even when it is not in use any more', async () => {
      const person = await h.veteran(des, code('E'));
      await h.ctx.sql.query(`UPDATE job_titles SET status = 'INACTIVE' WHERE id = $1`, [designer]);
      try {
        await h.recorded(body(person.employeeId));
      } finally {
        await h.ctx.sql.query(`UPDATE job_titles SET status = 'ACTIVE' WHERE id = $1`, [designer]);
      }
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

      expect([none.status, codeOf(none)]).toEqual([422, 'DEPARTMENT_TRANSFER.GROUNDS_REQUIRED']);
      expect([partial.status, codeOf(partial)]).toEqual([422, 'DEPARTMENT_TRANSFER.GROUNDS_INCOMPLETE']);
      expect(h.detailsOf(partial)).toEqual({ missing: ['issuer'] });
      expect([notice.status, codeOf(notice)]).toEqual([422, 'DEPARTMENT_TRANSFER.GROUNDS_IS_NOTICE']);
      expect(await state(person)).toEqual(before);
    });

    it('is kept with the transfer and in the Audit Trail when it is a decision with a number', async () => {
      const person = await h.veteran(des, code('E'));

      const wire = await h.recorded(body(person.employeeId, { grounds: { ...h.grounds, reference: 'QD-77/2026' } }));

      expect(wire.grounds.reference).toBe('QD-77/2026');
      const [event] = await h.auditEventsOf('DEPARTMENT_TRANSFER.RECORDED', wire.id);
      expect((event.after as { grounds: { reference: string } }).grounds.reference).toBe('QD-77/2026');
    });
  });

  it('lets a person have one transfer waiting at a time, and the database keeps it too (AC-21)', async () => {
    const person = await h.veteran(des, code('E'));
    const first = await h.recorded(body(person.employeeId, { effectiveOn: h.day(30) }));

    const second = await h.recordTransfer(
      body(person.employeeId, { toDepartmentId: des.id, toJobTitleId: senior, effectiveOn: h.day(60) }),
    );

    expect([second.status, codeOf(second)]).toEqual([409, 'DEPARTMENT_TRANSFER.PENDING_EVENT_EXISTS']);
    expect(h.detailsOf(second)).toEqual({ kind: 'TRANSFER', effectiveOn: first.effectiveOn });
    const fault = await h.ctx.sql
      .query(
        `INSERT INTO department_transfers (id, organization_id, employee_id, from_department_id, to_department_id,
           from_job_title_id, to_job_title_id, effective_on, closes_placement_id, opens_placement_id, grounds_type,
           grounds_reference, grounds_issuer, grounds_issued_on, recorded_by_app_user_id)
         SELECT gen_random_uuid(), organization_id, employee_id, to_department_id, from_department_id, from_job_title_id,
                to_job_title_id, effective_on + 10, gen_random_uuid(), gen_random_uuid(), 'X', 'X', 'X', current_date, recorded_by_app_user_id
           FROM department_transfers WHERE id = $1`,
        [first.id],
      )
      .catch((error: { code?: string }) => error);
    expect((fault as { code?: string }).code).toBe('23505');
  });

  describe('an IT Admin recording an event about themselves while another can act (AC-22)', () => {
    let it2: Person;

    beforeAll(async () => {
      it2 = await h.veteran(fin, 'E-IT2B', ['IT_ADMIN']);
    });

    it('is refused for themselves, accepted when the other one does it, and the first one is never flagged', async () => {
      const own = await h.recordTransfer(body(h.it1.employeeId, { toDepartmentId: des.id }), h.it1);
      expect([own.status, codeOf(own)]).toEqual([409, 'DEPARTMENT_TRANSFER.SELF_EVENT_NEEDS_ANOTHER_IT_ADMIN']);

      const wire = await h.recorded(body(h.it1.employeeId, { toDepartmentId: des.id }), it2.account);
      expect(wire.selfExecuted).toBe(false);
      expect(await h.auditEventsOf('PERSONNEL.SELF_EXECUTED', wire.id)).toEqual([]);
      await h.cancelTransfer(wire.id, { reason: 'Not needed', grounds: h.grounds }, it2.account).expect(200);
    });
  });
});
