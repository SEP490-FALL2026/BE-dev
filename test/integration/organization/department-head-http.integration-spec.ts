import { insertEmployeeFixture } from '../../support/http-test-app';
import { OrganizationHistoryApi } from '../../../src/modules/organization/public/organization-history.api';
import { HR_BASIS } from '../../support/hr-basis';
import { DepartmentHarness, today, addDays } from '../../support/department-harness';

describe('department profiles, heads and the derived MANAGER role over HTTP (integration, real PostgreSQL): the head, the successor and the notices handed to the first head', () => {
  const h = new DepartmentHarness();
  const {
    asFinance,
    asIt,
    asAdmin,
    as,
    api,
    unique,
    errorOf,
    dataOf,
    messageOf,
    newDepartment,
    getDepartment,
    accountIn,
    assignHead,
    auditOf,
    closePlacements,
  } = h;

  beforeAll(async () => {
    await h.start();
  }, 120000);

  afterEach(() => h.afterEach());

  /** The people of a department and its head began days ago: a change for today then ends their period instead of cancelling it. */
  const backdateHeadPeriods = async (departmentId: string) => {
    await h.ctx.sql.query('UPDATE employee_placements SET valid_from = valid_from - 10 WHERE department_id = $1', [
      departmentId,
    ]);
    await h.ctx.sql.query(
      'UPDATE department_head_periods SET valid_from = valid_from - 4 WHERE department_id = $1 AND valid_to IS NULL',
      [departmentId],
    );
  };

  /** Puts the members back as they were recorded, so the coverage check at the end of the file still holds. */
  const putMembersBack = async (departmentId: string) => {
    await h.ctx.sql.query('DELETE FROM department_head_periods WHERE department_id = $1', [departmentId]);
    await h.ctx.sql.query('UPDATE employee_placements SET valid_from = valid_from + 10 WHERE department_id = $1', [
      departmentId,
    ]);
  };

  /** The head changes of a department the transaction of the route told, by kind (`organization_change_announcements`). */
  const announcedHeadChanges = async (departmentId: string): Promise<Record<string, number>> => {
    const rows = await h.ctx.sql.query<{ kind: string; n: number }>(
      `SELECT a.kind::text AS kind, count(*)::int AS n
         FROM organization_change_announcements a
         JOIN department_head_periods p ON p.id = a.subject_id
        WHERE p.department_id = $1 AND a.kind IN ('HEAD_PERIOD_START', 'HEAD_PERIOD_END')
        GROUP BY a.kind`,
      [departmentId],
    );

    return Object.fromEntries(rows.rows.map((row) => [row.kind, row.n]));
  };

  afterAll(async () => {
    await h.stop();
  });

  describe('naming the head of a department (AC-5 → AC-9, AC-18)', () => {
    it('heads the department from today with a member, and records it (AC-5)', async () => {
      const department = await newDepartment();
      const member = await accountIn(department.code);

      const response = await assignHead(department.id, member.employeeId).expect(200);

      expect(messageOf(response)).toBe('DEPARTMENT.HEAD_ASSIGNED');
      expect(dataOf(response).head).toMatchObject({ employeeId: member.employeeId, since: today() });
      expect(dataOf(response).warnings).not.toContain('MISSING_HEAD');
      expect(dataOf(response).headHistory).toEqual([
        expect.objectContaining({ employeeCode: member.code, validFrom: today(), validTo: null }),
      ]);
      expect((await auditOf(department.id)).at(-1)).toMatchObject({
        action: 'DEPARTMENT.HEAD_ASSIGNED',
        before: { head: null },
        after: { head: member.code, effectiveFrom: today() },
      });
    });

    it('takes no HR basis: the audit has no hrBasis, and the head period of today is announced in the same transaction (QĐ-93f, US-03-06 AC-22)', async () => {
      const department = await newDepartment();
      const first = await accountIn(department.code);
      const second = await accountIn(department.code);

      await assignHead(department.id, first.employeeId).expect(200);
      await assignHead(department.id, second.employeeId).expect(200);

      const audit = (await auditOf(department.id)).filter((event) => event.action === 'DEPARTMENT.HEAD_ASSIGNED');
      expect(audit).toHaveLength(2);
      for (const event of audit) {
        expect(event.after).not.toHaveProperty('hrBasis');
      }
      expect(audit[1]).toEqual({
        action: 'DEPARTMENT.HEAD_ASSIGNED',
        before: { head: first.code },
        after: {
          head: second.code,
          effectiveFrom: today(),
          endedPeriods: 0,
          cancelledPeriods: [`${first.code}@${today()}`],
        },
      });
      expect(await announcedHeadChanges(department.id)).toEqual({ HEAD_PERIOD_START: 1 });
    });

    it('announces the end of the head they replace in the same transaction when that head began before today (QĐ-93f, US-03-06 AC-22)', async () => {
      const department = await newDepartment();
      const first = await accountIn(department.code);
      const second = await accountIn(department.code);
      await assignHead(department.id, first.employeeId).expect(200);
      await backdateHeadPeriods(department.id);

      await assignHead(department.id, second.employeeId).expect(200);

      expect((await auditOf(department.id)).at(-1)).toEqual({
        action: 'DEPARTMENT.HEAD_ASSIGNED',
        before: { head: first.code },
        after: { head: second.code, effectiveFrom: today(), endedPeriods: 1, cancelledPeriods: [] },
      });
      expect(await announcedHeadChanges(department.id)).toEqual({ HEAD_PERIOD_START: 2, HEAD_PERIOD_END: 1 });
      await putMembersBack(department.id);
    });

    it('turns away an HR basis, which no head assignment takes any more: 422 and nobody is named (QĐ-93f)', async () => {
      const department = await newDepartment();
      const member = await accountIn(department.code);

      const response = await assignHead(department.id, member.employeeId).send({ hrBasis: HR_BASIS }).expect(422);

      expect(errorOf(response).code).toBe('VALIDATION_ERROR');
      expect((await getDepartment(department.id)).head).toBeNull();
    });

    it('ends the head before the day the next one begins: one head on each day, no overlap (AC-5)', async () => {
      const department = await newDepartment();
      const first = await accountIn(department.code);
      const second = await accountIn(department.code);
      const from = addDays(today(), 3);
      await assignHead(department.id, first.employeeId).expect(200);

      const response = await assignHead(department.id, second.employeeId, from).expect(200);

      // Until day `from` the first is still the head; the second is the head from `from`.
      expect(dataOf(response).head).toMatchObject({ employeeCode: first.code });
      expect(dataOf(response).headHistory).toEqual([
        expect.objectContaining({ employeeCode: second.code, validFrom: from, validTo: null }),
        expect.objectContaining({ employeeCode: first.code, validFrom: today(), validTo: from }),
      ]);
      const overlap = await h.ctx.sql.query(
        `SELECT 1 FROM department_head_periods a JOIN department_head_periods b
           ON a.department_id = b.department_id AND a.id < b.id
          AND daterange(a.valid_from, a.valid_to, '[)') && daterange(b.valid_from, b.valid_to, '[)')
        WHERE a.department_id = $1`,
        [department.id],
      );
      expect(overlap.rows).toEqual([]);
    });

    it('replaces a head who has not begun yet, instead of leaving two plans on the same days', async () => {
      const department = await newDepartment();
      const planned = await accountIn(department.code);
      const instead = await accountIn(department.code);
      const from = addDays(today(), 5);
      await assignHead(department.id, planned.employeeId, from).expect(200);

      const response = await assignHead(department.id, instead.employeeId, addDays(today(), 2)).expect(200);

      expect(dataOf(response).headHistory).toEqual([
        expect.objectContaining({ employeeCode: instead.code, validFrom: addDays(today(), 2), validTo: null }),
      ]);
      expect((await auditOf(department.id)).at(-1)).toMatchObject({
        after: { cancelledPeriods: [`${planned.code}@${from}`] },
      });
    });

    it('answers the person who already heads it with the profile and records nothing', async () => {
      const department = await newDepartment();
      const head = await accountIn(department.code);
      await assignHead(department.id, head.employeeId).expect(200);
      const events = (await auditOf(department.id)).length;

      await assignHead(department.id, head.employeeId, addDays(today(), 4)).expect(200);

      expect(await auditOf(department.id)).toHaveLength(events);
      expect((await getDepartment(department.id)).headHistory).toHaveLength(1);
    });

    it('refuses a person who is not a member of the department on that day, and does not move them (AC-18)', async () => {
      const department = await newDepartment();
      const elsewhere = await accountIn('P-OPS');
      const first = await accountIn(department.code);
      await assignHead(department.id, first.employeeId).expect(200);

      const response = await assignHead(department.id, elsewhere.employeeId).expect(422);

      expect(errorOf(response).code).toBe('DEPARTMENT.HEAD_NOT_A_MEMBER_ON_DATE');
      expect((await getDepartment(department.id)).head).toMatchObject({ employeeCode: first.code });
      const placements = await h.ctx.sql.query(
        'SELECT department_id FROM employee_placements WHERE employee_id = $1 AND valid_to IS NULL',
        [elsewhere.employeeId],
      );
      expect(placements.rows).toEqual([{ department_id: h.seed.departmentId }]);
    });

    it('refuses a date before the person became a member, and a date in the past (AC-18)', async () => {
      const department = await newDepartment();
      const member = await accountIn(department.code);

      const past = await assignHead(department.id, member.employeeId, addDays(today(), -1)).expect(422);

      expect(errorOf(past).code).toBe('DEPARTMENT.HEAD_DATE_IN_PAST');
      expect((await getDepartment(department.id)).head).toBeNull();
    });

    it('refuses the Super Admin as a head and leaves the department as it was (AC-7)', async () => {
      const response = await assignHead(h.seed.departmentId, h.seed.superAdmin.employeeId).expect(422);

      expect(errorOf(response).code).toBe('DEPARTMENT.HEAD_SUPER_ADMIN_CANNOT_HEAD');
      expect(
        (
          await h.ctx.sql.query('SELECT 1 FROM department_head_periods WHERE employee_id = $1', [
            h.seed.superAdmin.employeeId,
          ])
        ).rows,
      ).toEqual([]);
    });

    it('refuses a person who has left, a person who does not exist, and a retired department (AC-8)', async () => {
      const department = await newDepartment();
      const left = await insertEmployeeFixture(h.ctx.app, h.seed, {
        code: unique('E-GONE'),
        email: null,
        terminated: true,
      });
      await closePlacements(left.employeeId);

      expect(errorOf(await assignHead(h.seed.departmentId, left.employeeId).expect(422)).code).toBe(
        'DEPARTMENT.HEAD_EMPLOYEE_NOT_ACTIVE',
      );
      expect(errorOf(await assignHead(department.id, '3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11').expect(422)).code).toBe(
        'DEPARTMENT.HEAD_EMPLOYEE_NOT_FOUND',
      );
      await api().post(`/api/v1/departments/${department.id}/deactivate`).set(asAdmin()).expect(200);
      const member = await insertEmployeeFixture(h.ctx.app, h.seed, { code: unique('E-OK'), email: null });
      expect(errorOf(await assignHead(department.id, member.employeeId).expect(409)).code).toBe('DEPARTMENT.INACTIVE');
    });

    it('records that nobody heads it from a day on, and warns (AC-9)', async () => {
      const department = await newDepartment();
      const head = await accountIn(department.code);
      await assignHead(department.id, head.employeeId).expect(200);

      const response = await api()
        .post(`/api/v1/departments/${department.id}/head-vacancies`)
        .set(asAdmin())
        .send({ effectiveFrom: addDays(today(), 2) })
        .expect(200);

      // Until that day the head stays; from it the history shows the end and the warning appears.
      expect(dataOf(response).head).toMatchObject({ employeeCode: head.code });
      expect(dataOf(response).headHistory).toEqual([
        expect.objectContaining({ employeeCode: head.code, validFrom: today(), validTo: addDays(today(), 2) }),
      ]);
      expect((await auditOf(department.id)).at(-1)).toMatchObject({
        action: 'DEPARTMENT.HEAD_VACATED',
        before: { head: head.code },
        after: { head: null, effectiveFrom: addDays(today(), 2) },
      });
      const nobody = await api()
        .post(`/api/v1/departments/${department.id}/head-vacancies`)
        .set(asAdmin())
        .send({ effectiveFrom: today() })
        .expect(200);
      expect(dataOf(nobody).head).toBeNull();
      expect(dataOf(nobody).warnings).toContain('MISSING_HEAD');
    });

    it('takes no HR basis: the audit has no hrBasis, and a vacancy from today announces the end of the head period (QĐ-93f, US-03-06 AC-22)', async () => {
      const department = await newDepartment();
      const head = await accountIn(department.code);
      await assignHead(department.id, head.employeeId).expect(200);
      await backdateHeadPeriods(department.id);

      await api()
        .post(`/api/v1/departments/${department.id}/head-vacancies`)
        .set(asAdmin())
        .send({ effectiveFrom: today() })
        .expect(200);

      const vacated = (await auditOf(department.id)).at(-1);
      expect(vacated).toEqual({
        action: 'DEPARTMENT.HEAD_VACATED',
        before: { head: head.code },
        after: { head: null, effectiveFrom: today(), cancelledPeriods: [] },
      });
      expect(await announcedHeadChanges(department.id)).toEqual({ HEAD_PERIOD_START: 1, HEAD_PERIOD_END: 1 });
      await putMembersBack(department.id);
    });

    it('answers a vacancy that ends nothing with the profile and records nothing', async () => {
      const department = await newDepartment();
      const events = (await auditOf(department.id)).length;

      await api()
        .post(`/api/v1/departments/${department.id}/head-vacancies`)
        .set(asAdmin())
        .send({ effectiveFrom: today() })
        .expect(200);

      expect(await auditOf(department.id)).toHaveLength(events);
    });
  });

  describe('the successor of the head (QĐ-87 D-5, AC-5, AC-22)', () => {
    const designate = (departmentId: string, employeeId: string, effectiveFrom: string, headers = asAdmin()) =>
      api()
        .post(`/api/v1/departments/${departmentId}/successor-designations`)
        .set(headers)
        .send({ employeeId, effectiveFrom });
    const clear = (departmentId: string, headers = asAdmin()) =>
      api().post(`/api/v1/departments/${departmentId}/successor-clearances`).set(headers);

    it('names the successor from a later day, ends the head the day before, shows it on the profile, and takes it back', async () => {
      const department = await newDepartment();
      const head = await accountIn(department.code);
      const next = await accountIn(department.code);
      const from = addDays(today(), 10);
      await assignHead(department.id, head.employeeId).expect(200);

      const named = await designate(department.id, next.employeeId, from).expect(200);

      expect(messageOf(named)).toBe('DEPARTMENT.SUCCESSOR_DESIGNATED');
      expect(dataOf(named).head).toMatchObject({ employeeId: head.employeeId });
      expect(dataOf(named).successor).toMatchObject({
        employeeId: next.employeeId,
        employeeCode: next.code,
        since: from,
      });
      expect(dataOf(named).headHistory).toEqual([
        expect.objectContaining({ employeeCode: next.code, validFrom: from, validTo: null }),
        expect.objectContaining({ employeeCode: head.code, validFrom: today(), validTo: from }),
      ]);
      expect((await auditOf(department.id)).at(-1)).toEqual({
        action: 'DEPARTMENT.SUCCESSOR_DESIGNATED',
        before: { head: head.code, successor: null },
        after: { head: head.code, successor: next.code, effectiveFrom: from },
      });

      const cleared = await clear(department.id).expect(200);

      expect(messageOf(cleared)).toBe('DEPARTMENT.SUCCESSOR_CLEARED');
      expect(dataOf(cleared).successor).toBeNull();
      expect(dataOf(cleared).headHistory).toEqual([
        expect.objectContaining({ employeeCode: head.code, validFrom: today(), validTo: null }),
      ]);
      expect((await auditOf(department.id)).at(-1)).toEqual({
        action: 'DEPARTMENT.SUCCESSOR_CLEARED',
        before: { successor: next.code, effectiveFrom: from },
        after: { successor: null, head: head.code },
      });
      // Nobody is named any more: clearing again changes and records nothing.
      const count = (await auditOf(department.id)).length;
      await clear(department.id).expect(200);
      expect(await auditOf(department.id)).toHaveLength(count);
    });

    it.each([
      ['today', () => today(), 'DEPARTMENT.HEAD_SUCCESSOR_DATE_NOT_FUTURE'],
      ['a day in the past', () => addDays(today(), -3), 'DEPARTMENT.HEAD_SUCCESSOR_DATE_NOT_FUTURE'],
    ])('refuses a successor from %s', async (_name, day, code) => {
      const department = await newDepartment();
      const head = await accountIn(department.code);
      const next = await accountIn(department.code);
      await assignHead(department.id, head.employeeId).expect(200);

      const response = await designate(department.id, next.employeeId, day()).expect(422);

      expect(errorOf(response).code).toBe(code);
      expect((await getDepartment(department.id)).successor).toBeNull();
    });

    it('refuses when nobody heads the department, when it is the head themself, and when one is already named', async () => {
      const department = await newDepartment();
      const head = await accountIn(department.code);
      const next = await accountIn(department.code);
      const other = await accountIn(department.code);
      const from = addDays(today(), 10);

      expect(errorOf(await designate(department.id, next.employeeId, from).expect(422)).code).toBe(
        'DEPARTMENT.HEAD_SUCCESSOR_NEEDS_A_HEAD',
      );
      await assignHead(department.id, head.employeeId).expect(200);
      expect(errorOf(await designate(department.id, head.employeeId, from).expect(422)).code).toBe(
        'DEPARTMENT.HEAD_SUCCESSOR_IS_THE_HEAD',
      );
      await designate(department.id, next.employeeId, from).expect(200);
      expect(errorOf(await designate(department.id, other.employeeId, addDays(today(), 12)).expect(409)).code).toBe(
        'DEPARTMENT.HEAD_SUCCESSOR_ALREADY_NAMED',
      );
    });

    it('refuses a successor for a retired department with 409 DEPARTMENT.INACTIVE and records nothing (API-DOC-F05)', async () => {
      const department = await newDepartment();
      const outsider = await insertEmployeeFixture(h.ctx.app, h.seed, { code: unique('E-OK'), email: null });
      await api().post(`/api/v1/departments/${department.id}/deactivate`).set(asAdmin()).expect(200);
      const events = (await auditOf(department.id)).length;

      const response = await designate(department.id, outsider.employeeId, addDays(today(), 10)).expect(409);

      expect(errorOf(response).code).toBe('DEPARTMENT.INACTIVE');
      expect(await auditOf(department.id)).toHaveLength(events);
    });

    it('judges the successor like any head: a member that day, working, and not the Super Admin', async () => {
      const department = await newDepartment();
      const head = await accountIn(department.code);
      const elsewhere = await accountIn('P-OPS');
      await assignHead(department.id, head.employeeId).expect(200);
      const from = addDays(today(), 10);

      const notMember = await designate(department.id, elsewhere.employeeId, from).expect(422);
      const superAdmin = await designate(department.id, h.seed.superAdmin.employeeId, from).expect(422);

      expect(errorOf(notMember).code).toBe('DEPARTMENT.HEAD_NOT_A_MEMBER_ON_DATE');
      expect(errorOf(superAdmin).code).toBe('DEPARTMENT.HEAD_SUPER_ADMIN_CANNOT_HEAD');
      expect((await getDepartment(department.id)).successor).toBeNull();
    });

    it('is the Super Admin’s alone, takes no HR basis (QĐ-93f), and is 404 for a department that does not exist (F10, F13)', async () => {
      const department = await newDepartment();
      const head = await accountIn(department.code);
      const next = await accountIn(department.code);
      await assignHead(department.id, head.employeeId).expect(200);
      const from = addDays(today(), 10);

      for (const headers of [asIt(), asFinance(), as(head)]) {
        await designate(department.id, next.employeeId, from, headers).expect(403);
        await clear(department.id, headers).expect(403);
      }
      await designate(department.id, next.employeeId, from).send({ hrBasis: HR_BASIS }).expect(422);
      await clear(department.id).send({ hrBasis: HR_BASIS }).expect(422);
      await designate('3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11', next.employeeId, from).expect(404);
      await clear('3f0c7d54-9e1b-4f6a-8d2c-5b7a1e9c0d11').expect(404);
      expect((await getDepartment(department.id)).successor).toBeNull();
    });
  });

  describe('the notices kept for a department with no head are handed to its first head (T-11, F67)', () => {
    const hold = (departmentId: string, key: string) =>
      h.ctx.sql.query(
        `INSERT INTO held_department_notifications (id, organization_id, department_id, code, subject_type, subject_id, params, event_key)
         VALUES (gen_random_uuid(), $1, $2, 'BUDGET_PROPOSAL_TASK_ASSIGNED', NULL, NULL, '{}'::jsonb, $3)`,
        [h.seed.organizationId, departmentId, key],
      );

    it('writes an in-app notice for the person named head, in the transaction that names them, and for nobody else', async () => {
      const department = await newDepartment();
      const head = await accountIn(department.code);
      const other = await accountIn(department.code);
      await hold(department.id, `held-${department.id}`);

      await assignHead(department.id, head.employeeId).expect(200);

      const notices = await h.ctx.sql.query<{ recipient_employee_id: string }>(
        `SELECT recipient_employee_id FROM in_app_notifications
          WHERE code = 'BUDGET_PROPOSAL_TASK_ASSIGNED' AND recipient_employee_id = ANY($1::uuid[])`,
        [[head.employeeId, other.employeeId]],
      );
      expect(notices.rows.map((row) => row.recipient_employee_id)).toEqual([head.employeeId]);
      const held = await h.ctx.sql.query<{ delivered_to_employee_id: string | null }>(
        `SELECT delivered_to_employee_id FROM held_department_notifications WHERE department_id = $1`,
        [department.id],
      );
      expect(held.rows).toEqual([{ delivered_to_employee_id: head.employeeId }]);

      // Naming another head later hands over nothing more: what was kept was delivered once.
      await assignHead(department.id, other.employeeId, addDays(today(), 2)).expect(200);
      expect(
        (
          await h.ctx.sql.query(
            `SELECT 1 FROM in_app_notifications WHERE recipient_employee_id = $1 AND code = 'BUDGET_PROPOSAL_TASK_ASSIGNED'`,
            [other.employeeId],
          )
        ).rows,
      ).toEqual([]);
    });

    /**
     * T-11 (spec amendment): the notices kept for a department are handed to the head when their period STARTS: in the transaction of the
     * assignment when it begins today, otherwise at the announcement of the day (the sweep). Nothing is handed to a head who heads nothing yet.
     */
    describe('when the head period starts (spec amendment of T-11)', () => {
      const keptRows = async (key: string) =>
        (
          await h.ctx.sql.query<{ delivered_to_employee_id: string | null }>(
            `SELECT delivered_to_employee_id FROM held_department_notifications WHERE event_key = $1`,
            [key],
          )
        ).rows;
      const receivers = async (key: string) =>
        (
          await h.ctx.sql.query<{ recipient_employee_id: string }>(
            `SELECT recipient_employee_id FROM in_app_notifications WHERE event_key = $1 ORDER BY recipient_employee_id`,
            [key],
          )
        ).rows.map((row) => row.recipient_employee_id);
      /** The announcement pass of `day`, as the hourly sweep runs it when that day has come. */
      const announce = (day: string) =>
        h.ctx.app.get(OrganizationHistoryApi, { strict: false }).announceDueChanges(day);

      it('hands nothing over when the first head is named for a day that has not come, and hands it over at the announcement of that day', async () => {
        const department = await newDepartment();
        const head = await accountIn(department.code);
        const from = addDays(today(), 3);
        const before = `held-before-${department.id}`;
        const between = `held-between-${department.id}`;
        await hold(department.id, before);

        await assignHead(department.id, head.employeeId, from).expect(200);
        // A notice held on a day between the assignment and the start: nobody heads the department yet, so it is kept as well.
        await hold(department.id, between);

        expect(await keptRows(before)).toEqual([{ delivered_to_employee_id: null }]);
        expect(await keptRows(between)).toEqual([{ delivered_to_employee_id: null }]);
        expect(await receivers(before)).toEqual([]);
        expect(await receivers(between)).toEqual([]);
        await announce(addDays(today(), 2));
        expect(await receivers(before)).toEqual([]);

        await announce(from);

        expect(await receivers(before)).toEqual([head.employeeId]);
        expect(await receivers(between)).toEqual([head.employeeId]);
        expect(await keptRows(before)).toEqual([{ delivered_to_employee_id: head.employeeId }]);
        expect(await keptRows(between)).toEqual([{ delivered_to_employee_id: head.employeeId }]);
        // Told again, the day hands over nothing more and tells nobody twice.
        await announce(from);
        expect(await receivers(before)).toEqual([head.employeeId]);
      });

      it('hands the kept notices to the head of a later assignment for today when the period of the first was to begin later and is taken back', async () => {
        const department = await newDepartment();
        const planned = await accountIn(department.code);
        const real = await accountIn(department.code);
        const from = addDays(today(), 5);
        const key = `held-cancelled-${department.id}`;
        await hold(department.id, key);
        await assignHead(department.id, planned.employeeId, from).expect(200);
        expect(await receivers(key)).toEqual([]);

        // The later assignment, for today, takes the future period back: the person who really begins first is handed what was kept.
        await assignHead(department.id, real.employeeId).expect(200);

        expect(await receivers(key)).toEqual([real.employeeId]);
        expect(await keptRows(key)).toEqual([{ delivered_to_employee_id: real.employeeId }]);
        // The day of the period taken back comes: nobody is told, and the notice is not handed over a second time.
        await announce(from);
        expect(await receivers(key)).toEqual([real.employeeId]);
        expect(
          (
            await h.ctx.sql.query(
              `SELECT 1 FROM in_app_notifications WHERE recipient_employee_id = $1 AND event_key = $2`,
              [planned.employeeId, key],
            )
          ).rows,
        ).toEqual([]);
      });

      it('hands the kept notices over in the transaction of the assignment when the period begins today, not at a later pass', async () => {
        const department = await newDepartment();
        const head = await accountIn(department.code);
        const key = `held-today-${department.id}`;
        await hold(department.id, key);

        await assignHead(department.id, head.employeeId).expect(200);

        expect(await receivers(key)).toEqual([head.employeeId]);
        expect(await keptRows(key)).toEqual([{ delivered_to_employee_id: head.employeeId }]);
      });

      it('leaves what was kept when the assignment is refused or rolled back: nobody is handed a notice for a head who is not named', async () => {
        const department = await newDepartment();
        const elsewhere = await accountIn('P-OPS');
        const key = `held-refused-${department.id}`;
        await hold(department.id, key);

        await assignHead(department.id, elsewhere.employeeId).expect(422);

        expect(await receivers(key)).toEqual([]);
        expect(await keptRows(key)).toEqual([{ delivered_to_employee_id: null }]);
      });
    });
  });

  it('leaves every employee with exactly the placements the invariant I-2 asks for', async () => {
    expect(await h.placementViolations()).toEqual([]);
  });
});
