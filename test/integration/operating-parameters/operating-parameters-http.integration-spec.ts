import request from 'supertest';
import { Client } from 'pg';
import { OperatingParametersApi } from '../../../src/modules/operating-parameters/public/operating-parameters.api';
import { ApiAccount, adminToken, createActivatedAccount } from '../../support/api-accounts';
import { HttpTestApp, SeededInstallation, createHttpTestApp, seedInstallation } from '../../support/http-test-app';
import { changeRoleTo } from '../../support/builders/account.builder';

interface ParameterWire {
  key: string;
  value: unknown;
  default: unknown;
  isDefault: boolean;
  unit: string;
  unitLabel: string;
  label: string;
  group: string;
  groupLabel: string;
  description: string;
  constraints: Record<string, unknown>;
  changedAt: string | null;
}

const ORG_TIME_ZONE = 'Asia/Ho_Chi_Minh';

function today(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: ORG_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? '';

  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}

function addDays(date: string, days: number): string {
  const moved = new Date(`${date}T00:00:00.000Z`);
  moved.setUTCDate(moved.getUTCDate() + days);

  return moved.toISOString().slice(0, 10);
}

describe('the operating parameters and the non-working dates over HTTP (integration, real PostgreSQL)', () => {
  let ctx: HttpTestApp;
  let seed: SeededInstallation;
  let admin: string;
  let it1: ApiAccount;
  let head: ApiAccount;
  const server = () => ctx.app.getHttpServer();
  const asAdmin = () => ({ Authorization: `Bearer ${admin}` });
  const as = (account: ApiAccount) => ({ Authorization: `Bearer ${account.accessToken}` });

  beforeAll(async () => {
    ctx = await createHttpTestApp();
    seed = await seedInstallation(ctx.app);
    admin = await adminToken(ctx, seed);
    it1 = await createActivatedAccount(ctx, seed, { code: 'E-IT1', email: 'it1@acme.vn', role: 'IT_ADMIN', admin });
    head = await createActivatedAccount(ctx, seed, { code: 'E-HEAD', email: 'head@acme.vn', role: 'EMPLOYEE', admin });
    await changeRoleTo(ctx, admin, head.employeeId, 'MANAGER');
    await request(server())
      .post(`/api/v1/departments/${seed.departmentId}/head-assignments`)
      // The head of a department is named by the Super Admin (QĐ-87).
      .set(asAdmin())
      .send({ employeeId: head.employeeId, effectiveFrom: today() })
      .expect(200);
  }, 120000);

  afterAll(async () => {
    await ctx?.close();
  });

  const list = async (): Promise<Map<string, ParameterWire>> =>
    new Map(
      (
        (await request(server()).get('/api/v1/operating-parameters').set(asAdmin()).expect(200)).body as {
          data: { items: ParameterWire[] };
        }
      ).data.items.map((item) => [item.key, item]),
    );
  const setParameter = (key: string, value: unknown, headers = asAdmin()) =>
    request(server()).put(`/api/v1/operating-parameters/${key}`).set(headers).send({ value });
  const errorOf = (response: request.Response) =>
    (response.body as { error: { code: string; details?: Record<string, unknown> } }).error;
  const auditFor = async (resourceId: string) =>
    (
      await ctx.sql.query<{ action: string; before: unknown; after: unknown }>(
        `SELECT action, before, after FROM audit_events WHERE resource_type IN ('OperatingParameter', 'NonWorkingDate')
          AND resource_id = $1 ORDER BY occurred_at, id`,
        [resourceId],
      )
    ).rows;
  const rows = async (key: string) =>
    (
      await ctx.sql.query<{ value: unknown; valid_to: string | null }>(
        'SELECT value, valid_to FROM parameter_values WHERE key = $1 ORDER BY valid_from, id',
        [key],
      )
    ).rows;

  describe('the parameters (US-01-04 AC-3, AC-6, AC-7, AC-12, AC-13)', () => {
    it('starts every parameter at the default the stories fix, and says so (AC-7)', async () => {
      const parameters = await list();

      expect(parameters.get('APPROVAL_SLA_WORKING_DAYS')).toMatchObject({ value: 2, isDefault: true, changedAt: null });
      expect(parameters.get('ACTIVITY_WINDOW_MINUTES')?.value).toBe(5);
      expect(parameters.get('FISCAL_YEAR_START_MONTH')?.value).toBe(1);
      expect(parameters.get('SPEND_SUBMISSION_WAIT_WORKING_DAYS')?.value).toBe(2);
      expect(parameters.has('BUDGET_PERIOD_KIND')).toBe(false);
      expect([...parameters.keys()].filter((key) => /HIGH_VALUE/.test(key))).toEqual([]);
      expect(parameters.get('TRANSFER_REVIEW_WORKING_DAYS')?.value).toBe(5);
      expect(parameters.get('PERSONNEL_NOTICE_REVIEW_WORKING_DAYS')?.value).toBe(2);
      expect(parameters.get('SAAS_ISSUE_RESPONSE_WORKING_DAYS')?.value).toBe(1);
      expect(parameters.get('SAAS_ISSUE_REOPEN_WORKING_DAYS')?.value).toBe(5);
      expect(parameters.get('ABRUPT_DEPARTURE_HOLD_WORKING_DAYS')?.value).toBe(1);
      expect(parameters.get('DETECTION_THRESHOLD_DAYS')?.value).toEqual([30, 60, 90]);
      expect(parameters.get('RENEWAL_ALERT_DAYS_BEFORE_DEADLINE')?.value).toEqual([15, 7]);
      expect(parameters.get('RULE_SCHEDULE_G1_G2')?.value).toBe('DAILY');
      expect(parameters.get('RULE_SCHEDULE_G3_G4')?.value).toBe('WEEKLY');
      for (const parameter of parameters.values()) {
        expect(parameter.unit.length).toBeGreaterThan(0);
        expect(parameter.constraints).toHaveProperty('kind');
      }
    });

    it('lists the parameters by group, each with its label, group, group name and unit label (QĐ93-PARAM-LABEL)', async () => {
      const response = await request(server()).get('/api/v1/operating-parameters').set(asAdmin()).expect(200);
      const items = (response.body as { data: { items: ParameterWire[] } }).data.items;

      expect(items.map((item) => item.key)).toEqual([
        'APPROVAL_SLA_WORKING_DAYS',
        'BACKLOG_ALERT_THRESHOLD',
        'SPEND_SUBMISSION_WAIT_WORKING_DAYS',
        'FISCAL_YEAR_START_MONTH',
        'FORECAST_ERROR_THRESHOLD_PERCENT',
        'BUDGET_RESERVE_DEFAULT_PERCENT',
        'TRANSFER_REVIEW_WORKING_DAYS',
        'PERSONNEL_NOTICE_REVIEW_WORKING_DAYS',
        'ABRUPT_DEPARTURE_HOLD_WORKING_DAYS',
        'HANDOVER_SHORT_DEADLINE_WORKING_DAYS',
        'PROVISIONING_RETRY_COUNT',
        'SAAS_ISSUE_RESPONSE_WORKING_DAYS',
        'SAAS_ISSUE_REOPEN_WORKING_DAYS',
        'INVITATION_REMINDER_DAYS',
        'INVITATION_WITHDRAW_DAYS',
        'DOCUMENT_MAX_SIZE_MB',
        'RENEWAL_ALERT_DAYS_BEFORE_DEADLINE',
        'ACTIVITY_WINDOW_MINUTES',
        'DETECTION_THRESHOLD_DAYS',
        'RULE_SCHEDULE_G1_G2',
        'RULE_SCHEDULE_G3_G4',
        'AI_ENABLED',
        'AI_ACCESS_REQUEST_SUMMARY_ENABLED',
        'AI_PROVIDER_MODE',
      ]);
      expect([...new Set(items.map((item) => item.group))]).toEqual([
        'WORKFLOW',
        'BUDGET',
        'PERSONNEL',
        'PROVISIONING',
        'ACCOUNT',
        'DOCUMENT',
        'SUBSCRIPTION',
        'USAGE',
        'AI',
      ]);
      const byKey = new Map(items.map((item) => [item.key, item]));
      expect(byKey.get('APPROVAL_SLA_WORKING_DAYS')).toMatchObject({
        label: 'Hạn xử lý một bước phê duyệt',
        group: 'WORKFLOW',
        groupLabel: 'Phê duyệt và quy trình',
        unit: 'working days',
        unitLabel: 'ngày làm việc',
      });
      expect(byKey.get('TRANSFER_REVIEW_WORKING_DAYS')).toMatchObject({
        label: 'Hạn rà soát quyền sau điều chuyển',
        group: 'PERSONNEL',
        groupLabel: 'Nhân sự và bàn giao',
      });
      expect(byKey.get('FORECAST_ERROR_THRESHOLD_PERCENT')).toMatchObject({
        group: 'BUDGET',
        groupLabel: 'Ngân sách và chi phí',
        unit: 'percent',
        unitLabel: '%',
      });
      expect(byKey.get('DETECTION_THRESHOLD_DAYS')).toMatchObject({
        label: 'Ngưỡng ngày không dùng của ghế',
        group: 'USAGE',
        groupLabel: 'Sử dụng và lãng phí',
        unitLabel: 'ngày',
        value: [30, 60, 90],
        constraints: { kind: 'int-list', min: 1, max: 365, length: { min: 3, max: 3 }, order: 'ascending' },
      });
      expect(byKey.get('RULE_SCHEDULE_G1_G2')).toMatchObject({
        label: 'Lịch chạy luật lãng phí (dữ liệu nội bộ)',
        unitLabel: 'lịch',
        value: 'DAILY',
        constraints: {
          kind: 'enum',
          options: ['DAILY', 'WEEKLY'],
          optionLabels: { DAILY: 'Hằng ngày', WEEKLY: 'Hằng tuần' },
        },
      });
      expect(byKey.get('APPROVAL_SLA_WORKING_DAYS')?.constraints).toEqual({ kind: 'int', min: 1, max: 30 });
      for (const item of items) {
        expect(item.label.length).toBeGreaterThan(0);
        expect(item.groupLabel.length).toBeGreaterThan(0);
        expect(item.unitLabel.length).toBeGreaterThan(0);
        expect(item).toMatchObject({ isDefault: true, changedAt: null });
      }
    });

    it('answers a change with the same label, group, group name and unit label (QĐ93-PARAM-LABEL)', async () => {
      const response = await setParameter('APPROVAL_SLA_WORKING_DAYS', 3).expect(200);

      expect((response.body as { data: ParameterWire }).data).toMatchObject({
        key: 'APPROVAL_SLA_WORKING_DAYS',
        label: 'Hạn xử lý một bước phê duyệt',
        group: 'WORKFLOW',
        groupLabel: 'Phê duyệt và quy trình',
        unitLabel: 'ngày làm việc',
        value: 3,
        default: 2,
        isDefault: false,
      });
      await setParameter('APPROVAL_SLA_WORKING_DAYS', 2).expect(200);
    });

    it('changes the hand-over review deadline from 5 to 3 working days, and records 5 → 3 (AC-12)', async () => {
      const response = await setParameter('TRANSFER_REVIEW_WORKING_DAYS', 3).expect(200);

      expect((response.body as { message: string }).message).toBe('PARAMETER.SET');
      expect((response.body as { data: ParameterWire }).data).toMatchObject({ value: 3, default: 5, isDefault: false });
      expect(await auditFor('TRANSFER_REVIEW_WORKING_DAYS')).toEqual([
        { action: 'PARAMETER.CHANGED', before: { value: 5 }, after: { value: 3 } },
      ]);
      // What is created after the change reads the new value; the service other modules call is the same one.
      await expect(ctx.app.get(OperatingParametersApi).getValue('TRANSFER_REVIEW_WORKING_DAYS')).resolves.toBe(3);
    });

    it('keeps the history, newest first, and closes the value it replaces', async () => {
      await setParameter('ABRUPT_DEPARTURE_HOLD_WORKING_DAYS', 2).expect(200);
      await setParameter('ABRUPT_DEPARTURE_HOLD_WORKING_DAYS', 4).expect(200);

      const history = await request(server())
        .get('/api/v1/operating-parameters/ABRUPT_DEPARTURE_HOLD_WORKING_DAYS/history')
        .set(asAdmin())
        .expect(200);

      expect(
        (history.body as { data: { items: { value: unknown; until: string | null }[] } }).data.items.map((entry) => [
          entry.value,
          entry.until === null,
        ]),
      ).toEqual([
        [4, true],
        [2, false],
      ]);
      expect((await rows('ABRUPT_DEPARTURE_HOLD_WORKING_DAYS')).filter((row) => row.valid_to === null)).toHaveLength(1);
    });

    it('answers the same value with the parameter and records nothing', async () => {
      await setParameter('ACTIVITY_WINDOW_MINUTES', 5).expect(200);
      await setParameter('FORECAST_ERROR_THRESHOLD_PERCENT', 30).expect(200);
      await setParameter('FORECAST_ERROR_THRESHOLD_PERCENT', 30).expect(200);

      expect(await auditFor('ACTIVITY_WINDOW_MINUTES')).toEqual([]);
      expect(await rows('ACTIVITY_WINDOW_MINUTES')).toEqual([]);
      expect(await auditFor('FORECAST_ERROR_THRESHOLD_PERCENT')).toHaveLength(1);
    });

    it('refuses a forecast error of 50%, outside 10 to 40, and changes nothing (AC-3)', async () => {
      const before = (await list()).get('FORECAST_ERROR_THRESHOLD_PERCENT');

      const response = await setParameter('FORECAST_ERROR_THRESHOLD_PERCENT', 50).expect(422);

      expect(errorOf(response)).toMatchObject({
        code: 'PARAMETER.VALUE_INVALID',
        details: { key: 'FORECAST_ERROR_THRESHOLD_PERCENT', problem: 'OUT_OF_RANGE' },
      });
      expect((await list()).get('FORECAST_ERROR_THRESHOLD_PERCENT')).toEqual(before);
    });

    it.each([
      ['a number sent as text', 'APPROVAL_SLA_WORKING_DAYS', '3', 'WRONG_TYPE'],
      ['zero days', 'APPROVAL_SLA_WORKING_DAYS', 0, 'OUT_OF_RANGE'],
      ['a month that does not exist', 'FISCAL_YEAR_START_MONTH', 13, 'OUT_OF_RANGE'],
      ['month zero', 'FISCAL_YEAR_START_MONTH', 0, 'OUT_OF_RANGE'],
      ['no days to wait', 'SPEND_SUBMISSION_WAIT_WORKING_DAYS', 0, 'OUT_OF_RANGE'],
      ['thresholds that do not rise', 'DETECTION_THRESHOLD_DAYS', [90, 60, 30], 'OUT_OF_RANGE'],
    ])('refuses %s and leaves the value as it was', async (_name, key, value, problem) => {
      const before = (await list()).get(key);

      const response = await setParameter(key, value).expect(422);

      expect(errorOf(response).details).toMatchObject({ problem });
      expect((await list()).get(key)).toEqual(before);
    });

    it('sets the retry count, the reminder and the withdrawal, and the short deadline, and refuses a withdrawal before the reminder (AC-13)', async () => {
      await setParameter('PROVISIONING_RETRY_COUNT', 5).expect(200);
      await setParameter('HANDOVER_SHORT_DEADLINE_WORKING_DAYS', 2).expect(200);
      await setParameter('INVITATION_REMINDER_DAYS', 4).expect(200);
      await setParameter('INVITATION_WITHDRAW_DAYS', 20).expect(200);

      const refused = await setParameter('INVITATION_WITHDRAW_DAYS', 4).expect(422);
      const refusedReminder = await setParameter('INVITATION_REMINDER_DAYS', 20).expect(422);

      expect(errorOf(refused).details).toMatchObject({ problem: 'INCONSISTENT' });
      expect(errorOf(refusedReminder).details).toMatchObject({ problem: 'INCONSISTENT' });
      const parameters = await list();
      expect(parameters.get('PROVISIONING_RETRY_COUNT')?.value).toBe(5);
      expect(parameters.get('HANDOVER_SHORT_DEADLINE_WORKING_DAYS')?.value).toBe(2);
      expect(parameters.get('INVITATION_REMINDER_DAYS')?.value).toBe(4);
      expect(parameters.get('INVITATION_WITHDRAW_DAYS')?.value).toBe(20);
      expect((await auditFor('PROVISIONING_RETRY_COUNT'))[0]).toMatchObject({
        before: { value: 3 },
        after: { value: 5 },
      });
    });

    it('keeps the backlog threshold between 1 and 500, records before and after, and answers what was in force at a moment (US-05-10 AC-1)', async () => {
      const service = ctx.app.get(OperatingParametersApi);
      const beforeAny = new Date(Date.now() - 60_000);
      expect((await list()).get('BACKLOG_ALERT_THRESHOLD')).toMatchObject({ value: 10, isDefault: true });
      await expect(service.getValueAt('BACKLOG_ALERT_THRESHOLD', beforeAny)).resolves.toBe(10);

      for (const refused of [0, 501]) {
        expect(errorOf(await setParameter('BACKLOG_ALERT_THRESHOLD', refused).expect(422)).details).toMatchObject({
          problem: 'OUT_OF_RANGE',
        });
      }
      await setParameter('BACKLOG_ALERT_THRESHOLD', 12).expect(200);
      const changedAt = new Date();
      await setParameter('BACKLOG_ALERT_THRESHOLD', 20).expect(200);

      expect(await auditFor('BACKLOG_ALERT_THRESHOLD')).toEqual([
        expect.objectContaining({ action: 'PARAMETER.CHANGED', before: { value: 10 }, after: { value: 12 } }),
        expect.objectContaining({ action: 'PARAMETER.CHANGED', before: { value: 12 }, after: { value: 20 } }),
      ]);
      await expect(service.getValueAt('BACKLOG_ALERT_THRESHOLD', beforeAny)).resolves.toBe(10);
      await expect(service.getValueAt('BACKLOG_ALERT_THRESHOLD', changedAt)).resolves.toBe(12);
      await expect(service.getValueAt('BACKLOG_ALERT_THRESHOLD', new Date(Date.now() + 60_000))).resolves.toBe(20);
      await expect(service.getValueAt('NO_SUCH_PARAMETER', changedAt)).rejects.toThrow();
    });

    it('answers the non-working days of a range as a set, so the calendar of the workflows reads one place', async () => {
      const first = addDays(today(), 400);
      await request(server())
        .post('/api/v1/non-working-dates')
        .set(asAdmin())
        .send({ date: first, reason: 'Range probe' })
        .expect(201);

      const found = await ctx.app.get(OperatingParametersApi).getNonWorkingDates(first, addDays(first, 3));

      expect([...found]).toEqual([first]);
    });

    it('starts both AI switches off, turns one on and off by its key with an audit, and takes nothing but ON or OFF', async () => {
      const key = 'AI_ACCESS_REQUEST_SUMMARY_ENABLED';
      const before = await list();

      expect(before.get('AI_ENABLED')).toMatchObject({ value: 'OFF', default: 'OFF', group: 'AI', isDefault: true });
      expect(before.get(key)).toMatchObject({ value: 'OFF', default: 'OFF', group: 'AI', isDefault: true });

      await setParameter(key, 'ON').expect(200);
      expect((await list()).get(key)).toMatchObject({ value: 'ON', isDefault: false });
      expect((await auditFor(key))[0]).toMatchObject({ before: { value: 'OFF' }, after: { value: 'ON' } });
      expect(errorOf(await setParameter(key, 'MAYBE').expect(422)).details).toMatchObject({ problem: 'OUT_OF_RANGE' });
      await setParameter(key, 'OFF').expect(200);
      expect((await list()).get(key)).toMatchObject({ value: 'OFF' });
    });

    it('starts the source of the AI answers at the simulation, lets the Super Admin choose the model with an audit, and takes nothing else', async () => {
      const key = 'AI_PROVIDER_MODE';

      expect((await list()).get(key)).toMatchObject({
        value: 'SIMULATED',
        default: 'SIMULATED',
        isDefault: true,
        label: 'Nguồn trả lời của AI',
        group: 'AI',
        groupLabel: 'Trợ lý AI',
        unit: 'mode',
        unitLabel: 'chế độ',
        constraints: {
          kind: 'enum',
          options: ['SIMULATED', 'MODEL'],
          optionLabels: { SIMULATED: 'Giả lập (không gọi model)', MODEL: 'Model AI' },
        },
      });

      await setParameter(key, 'MODEL').expect(200);
      expect((await list()).get(key)).toMatchObject({ value: 'MODEL', isDefault: false });
      expect(await auditFor(key)).toEqual([
        { action: 'PARAMETER.CHANGED', before: { value: 'SIMULATED' }, after: { value: 'MODEL' } },
      ]);
      await expect(ctx.app.get(OperatingParametersApi).getValue(key)).resolves.toBe('MODEL');
      for (const refused of ['OPENAI', 'model', 'ON']) {
        expect(errorOf(await setParameter(key, refused).expect(422)).details).toMatchObject({
          key,
          problem: 'OUT_OF_RANGE',
        });
      }
      await setParameter(key, 'MODEL', as(it1)).expect(403);
      expect((await list()).get(key)).toMatchObject({ value: 'MODEL' });

      await setParameter(key, 'SIMULATED').expect(200);
      expect((await list()).get(key)).toMatchObject({ value: 'SIMULATED' });
      expect((await auditFor(key)).map((event) => [event.before, event.after])).toEqual([
        [{ value: 'SIMULATED' }, { value: 'MODEL' }],
        [{ value: 'MODEL' }, { value: 'SIMULATED' }],
      ]);
    });

    it('does not return, and does not fail on, a budget period kind stored before it was removed (AC-8)', async () => {
      await ctx.sql.query(
        `INSERT INTO parameter_values (id, organization_id, key, value, valid_from)
         VALUES (gen_random_uuid(), $1, 'BUDGET_PERIOD_KIND', '"MONTH"'::jsonb, now())`,
        [seed.organizationId],
      );

      const parameters = await list();

      expect(parameters.has('BUDGET_PERIOD_KIND')).toBe(false);
      expect(parameters.size).toBe(24);
    });

    it('is 404 for a parameter that does not exist, the time zone included (AC-11)', async () => {
      for (const key of ['NO_SUCH_PARAMETER', 'TIME_ZONE', 'REPORTING_CURRENCY', 'BUDGET_PERIOD_KIND']) {
        expect(errorOf(await setParameter(key, 'x').expect(404)).code).toBe('PARAMETER.NOT_FOUND');
      }
      await request(server()).get('/api/v1/operating-parameters/NO_SUCH_PARAMETER/history').set(asAdmin()).expect(404);
      const organization = await ctx.sql.query('SELECT time_zone FROM organizations');
      expect(organization.rows).toEqual([{ time_zone: ORG_TIME_ZONE }]);
    });

    it('refuses the IT Admin and a department head, and changes nothing (AC-6)', async () => {
      const before = (await list()).get('APPROVAL_SLA_WORKING_DAYS');

      for (const headers of [as(it1), as(head)]) {
        await setParameter('APPROVAL_SLA_WORKING_DAYS', 9, headers).expect(403);
        await request(server()).get('/api/v1/operating-parameters').set(headers).expect(403);
      }

      expect((await list()).get('APPROVAL_SLA_WORKING_DAYS')).toEqual(before);
    });

    it('does not let the database hold two current values for one key, even if two writers meet', async () => {
      const key = 'ACTIVITY_WINDOW_MINUTES';
      await setParameter(key, 6).expect(200);
      const answers = await Promise.all([setParameter(key, 7), setParameter(key, 8), setParameter(key, 9)]);

      expect(answers.map((answer) => answer.status)).toEqual([200, 200, 200]);
      expect((await rows(key)).filter((row) => row.valid_to === null)).toHaveLength(1);
      await expect(
        ctx.sql.query(
          `INSERT INTO parameter_values (id, organization_id, key, value) VALUES (gen_random_uuid(), $1, $2, '1')`,
          [seed.organizationId, key],
        ),
      ).rejects.toMatchObject({ code: '23505' });
    });
  });

  describe('the non-working dates (AC-10)', () => {
    const addDate = (date: string, reason = 'Public holiday', headers = asAdmin()) =>
      request(server()).post('/api/v1/non-working-dates').set(headers).send({ date, reason });
    const insertPast = (date: string, reason: string) =>
      ctx.sql.query(
        `INSERT INTO non_working_dates (id, organization_id, date, reason) VALUES (gen_random_uuid(), $1, $2, $3)`,
        [seed.organizationId, date, reason],
      );

    it('adds, renames and removes a day from today on, and records each (AC-10)', async () => {
      const day = addDays(today(), 40);

      const added = await addDate(day, 'National day').expect(201);
      const renamed = await request(server())
        .patch(`/api/v1/non-working-dates/${day}`)
        .set(asAdmin())
        .send({ reason: 'National day (bridge)' })
        .expect(200);
      const listed = await request(server())
        .get(`/api/v1/non-working-dates?from=${day}&to=${day}`)
        .set(asAdmin())
        .expect(200);
      const removed = await request(server()).delete(`/api/v1/non-working-dates/${day}`).set(asAdmin()).expect(200);

      expect((added.body as { data: unknown }).data).toEqual({ date: day, reason: 'National day' });
      expect((renamed.body as { data: unknown }).data).toEqual({ date: day, reason: 'National day (bridge)' });
      expect((listed.body as { data: { items: unknown[] } }).data.items).toEqual([
        { date: day, reason: 'National day (bridge)' },
      ]);
      expect((removed.body as { data: unknown }).data).toEqual({ date: day, reason: 'National day (bridge)' });
      expect((await auditFor(day)).map((event) => event.action)).toEqual([
        'NON_WORKING_DATE.ADDED',
        'NON_WORKING_DATE.RENAMED',
        'NON_WORKING_DATE.REMOVED',
      ]);
      expect((await auditFor(day))[1]).toMatchObject({
        before: { reason: 'National day' },
        after: { reason: 'National day (bridge)' },
      });
    });

    it('lets today itself be added and removed, but nothing before it', async () => {
      await addDate(today(), 'Closed today').expect(201);
      await request(server()).delete(`/api/v1/non-working-dates/${today()}`).set(asAdmin()).expect(200);

      const yesterday = addDays(today(), -1);
      const add = await addDate(yesterday).expect(422);
      expect(errorOf(add)).toMatchObject({ code: 'NON_WORKING_DATE.IN_PAST', details: { date: yesterday } });
      const remove = await request(server())
        .delete(`/api/v1/non-working-dates/${yesterday}`)
        .set(asAdmin())
        .expect(422);
      expect(errorOf(remove).code).toBe('NON_WORKING_DATE.IN_PAST');
    });

    it('never changes a day that has passed: not removed, not renamed, not added beside it', async () => {
      const past = addDays(today(), -30);
      await insertPast(past, 'Past holiday');

      for (const response of [
        await request(server()).delete(`/api/v1/non-working-dates/${past}`).set(asAdmin()).expect(422),
        await request(server())
          .patch(`/api/v1/non-working-dates/${past}`)
          .set(asAdmin())
          .send({ reason: 'Edited' })
          .expect(422),
        await addDate(addDays(past, 13), 'Another past day').expect(422),
      ]) {
        expect(errorOf(response).code).toBe('NON_WORKING_DATE.IN_PAST');
      }
      const rowsNow = await ctx.sql.query(`SELECT reason FROM non_working_dates WHERE date = $1`, [past]);
      expect(rowsNow.rows).toEqual([{ reason: 'Past holiday' }]);
      expect(await auditFor(past)).toEqual([]);
    });

    it('refuses a day that is already one, a missing one, and an empty or long reason', async () => {
      const day = addDays(today(), 50);
      await addDate(day).expect(201);

      expect(errorOf(await addDate(day).expect(409)).code).toBe('NON_WORKING_DATE.TAKEN');
      expect(errorOf(await addDate(addDays(today(), 51), '   ').expect(422)).code).toBe(
        'NON_WORKING_DATE.REASON_INVALID',
      );
      expect(errorOf(await addDate(addDays(today(), 51), 'R'.repeat(201)).expect(422)).code).toBe(
        'NON_WORKING_DATE.REASON_INVALID',
      );
      expect(
        errorOf(
          await request(server())
            .delete(`/api/v1/non-working-dates/${addDays(today(), 60)}`)
            .set(asAdmin())
            .expect(404),
        ).code,
      ).toBe('NON_WORKING_DATE.NOT_FOUND');
      expect(
        errorOf(
          await request(server())
            .patch(`/api/v1/non-working-dates/${addDays(today(), 60)}`)
            .set(asAdmin())
            .send({ reason: 'x' })
            .expect(404),
        ).code,
      ).toBe('NON_WORKING_DATE.NOT_FOUND');
    });

    it('pages the list by date with the total of the range, whatever the range (LD-15)', async () => {
      const start = addDays(today(), 200);
      for (let offset = 0; offset < 5; offset += 1) await addDate(addDays(start, offset), `Page ${offset}`).expect(201);

      const second = await request(server())
        .get(`/api/v1/non-working-dates?from=${start}&to=${addDays(start, 4)}&pageSize=2&page=2`)
        .set(asAdmin())
        .expect(200);
      const everything = await request(server())
        .get('/api/v1/non-working-dates?pageSize=100')
        .set(asAdmin())
        .expect(200);

      const data = (second.body as { data: { items: { date: string }[]; pagination: unknown } }).data;
      expect(data.items.map((item) => item.date)).toEqual([addDays(start, 2), addDays(start, 3)]);
      expect(data.pagination).toEqual({ page: 2, pageSize: 2, totalItems: 5, totalPages: 3 });
      expect((everything.body as { data: { items: unknown[] } }).data.items.length).toBeLessThanOrEqual(100);
      await request(server()).get('/api/v1/non-working-dates?pageSize=101').set(asAdmin()).expect(422);
    });

    it('lists in date order and refuses everyone but the Super Admin', async () => {
      const first = addDays(today(), 70);
      const second = addDays(today(), 71);
      await addDate(second, 'B').expect(201);
      await addDate(first, 'A').expect(201);

      const response = await request(server())
        .get(`/api/v1/non-working-dates?from=${first}&to=${second}`)
        .set(asAdmin())
        .expect(200);

      expect((response.body as { data: { items: { date: string }[] } }).data.items.map((item) => item.date)).toEqual([
        first,
        second,
      ]);
      for (const headers of [as(it1), as(head)]) {
        await request(server()).get('/api/v1/non-working-dates').set(headers).expect(403);
        await addDate(addDays(today(), 80), 'x', headers).expect(403);
      }
      expect(
        (await ctx.sql.query('SELECT 1 FROM non_working_dates WHERE date = $1', [addDays(today(), 80)])).rows,
      ).toEqual([]);
    });

    it('does not add one day twice when two writers meet', async () => {
      const day = addDays(today(), 90);
      const holder = new Client({ connectionString: ctx.database.url });
      await holder.connect();
      try {
        const answers = await Promise.all([addDate(day, 'one'), addDate(day, 'two'), addDate(day, 'three')]);

        expect(answers.map((answer) => answer.status).sort()).toEqual([201, 409, 409]);
        expect((await ctx.sql.query('SELECT 1 FROM non_working_dates WHERE date = $1', [day])).rows).toHaveLength(1);
      } finally {
        await holder.end();
      }
    });
  });
});
