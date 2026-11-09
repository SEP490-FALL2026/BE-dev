import {
  ENUM_OPTIONS_MAX,
  GROUP_LABELS,
  PARAMETER_DEFINITIONS,
  PARAMETER_GROUPS,
  defaultValues,
  definitionOf,
  validateParameterValue,
} from './parameter-definitions.policy';

describe('operating parameter definitions (US-01-04)', () => {
  it('starts every parameter at the default the stories fix (AC-7)', () => {
    const defaults = defaultValues();

    expect(defaults.APPROVAL_SLA_WORKING_DAYS).toBe(2);
    expect(defaults.ACTIVITY_WINDOW_MINUTES).toBe(5);
    expect(defaults.SPEND_SUBMISSION_WAIT_WORKING_DAYS).toBe(2);
    expect(defaults.TRANSFER_REVIEW_WORKING_DAYS).toBe(5);
    expect(defaults.PERSONNEL_NOTICE_REVIEW_WORKING_DAYS).toBe(2);
    expect(defaults.SAAS_ISSUE_RESPONSE_WORKING_DAYS).toBe(1);
    expect(defaults.SAAS_ISSUE_REOPEN_WORKING_DAYS).toBe(5);
    expect(defaults.ABRUPT_DEPARTURE_HOLD_WORKING_DAYS).toBe(1);
    expect(defaults.BACKLOG_ALERT_THRESHOLD).toBe(10);
    expect(defaults.DETECTION_THRESHOLD_DAYS).toEqual([30, 60, 90]);
    expect(defaults.RENEWAL_ALERT_DAYS_BEFORE_DEADLINE).toEqual([15, 7]);
    expect(defaults.GHOST_SEAT_DECISION_WORKING_DAYS).toBe(5);
    expect(defaults.GHOST_SEAT_REVOCATION_GRACE_DAYS).toBe(7);
    expect(defaults.RULE_SCHEDULE_G1_G2).toBe('DAILY');
    expect(defaults.RULE_SCHEDULE_G3_G4).toBe('WEEKLY');
  });

  it('has no budget period kind and no high-value threshold: the budget period is the fiscal year (AC-8, AC-14)', () => {
    const keys = PARAMETER_DEFINITIONS.map((definition) => definition.key);

    expect(definitionOf('BUDGET_PERIOD_KIND')).toBeUndefined();
    expect(keys.filter((key) => /BUDGET_PERIOD|HIGH_VALUE|THRESHOLD_PERCENT/.test(key))).toEqual([
      'FORECAST_ERROR_THRESHOLD_PERCENT',
    ]);
    expect(keys).toEqual(expect.arrayContaining(['SPEND_SUBMISSION_WAIT_WORKING_DAYS']));
    expect(definitionOf('FISCAL_YEAR_START_MONTH')).toBeUndefined();
  });

  it('gives every parameter a key, a unit, a description and a default that is itself valid', () => {
    expect(new Set(PARAMETER_DEFINITIONS.map((definition) => definition.key)).size).toBe(PARAMETER_DEFINITIONS.length);
    for (const definition of PARAMETER_DEFINITIONS) {
      expect(definition.description.length).toBeGreaterThan(10);
      expect(validateParameterValue(definition.key, definition.default, defaultValues())).toEqual({ ok: true });
    }
  });

  it('keeps the domains: a forecast error of 50% is refused, one of 25% is not (AC-3)', () => {
    expect(validateParameterValue('FORECAST_ERROR_THRESHOLD_PERCENT', 50, defaultValues())).toEqual({
      ok: false,
      reason: 'OUT_OF_RANGE',
    });
    expect(validateParameterValue('FORECAST_ERROR_THRESHOLD_PERCENT', 9, defaultValues())).toEqual({
      ok: false,
      reason: 'OUT_OF_RANGE',
    });
    expect(validateParameterValue('FORECAST_ERROR_THRESHOLD_PERCENT', 10, defaultValues())).toEqual({ ok: true });
    expect(validateParameterValue('FORECAST_ERROR_THRESHOLD_PERCENT', 40, defaultValues())).toEqual({ ok: true });
  });

  it.each([
    ['a number given as text', 'APPROVAL_SLA_WORKING_DAYS', '3'],
    ['a fraction', 'APPROVAL_SLA_WORKING_DAYS', 2.5],
    ['zero days', 'APPROVAL_SLA_WORKING_DAYS', 0],
    ['no value', 'APPROVAL_SLA_WORKING_DAYS', null],
    ['no waiting days', 'SPEND_SUBMISSION_WAIT_WORKING_DAYS', 0],
    ['more than thirty waiting days', 'SPEND_SUBMISSION_WAIT_WORKING_DAYS', 31],
    ['a backlog threshold of none', 'BACKLOG_ALERT_THRESHOLD', 0],
    ['a backlog threshold above five hundred', 'BACKLOG_ALERT_THRESHOLD', 501],
    ['a backlog threshold with a fraction', 'BACKLOG_ALERT_THRESHOLD', 10.5],
    ['thresholds out of order', 'DETECTION_THRESHOLD_DAYS', [60, 30, 90]],
    ['thresholds with a repeat', 'DETECTION_THRESHOLD_DAYS', [30, 30, 90]],
    ['two thresholds instead of three', 'DETECTION_THRESHOLD_DAYS', [30, 60]],
    ['alerts that do not fall', 'RENEWAL_ALERT_DAYS_BEFORE_DEADLINE', [7, 15]],
    ['an empty alert list', 'RENEWAL_ALERT_DAYS_BEFORE_DEADLINE', []],
    ['a schedule that is not one', 'RULE_SCHEDULE_G1_G2', 'HOURLY'],
  ])('refuses %s', (_name, key, value) => {
    expect(validateParameterValue(key, value, defaultValues())).toMatchObject({ ok: false });
  });

  it('refuses a withdrawal that comes no later than the reminder (N before M)', () => {
    const current = { ...defaultValues(), INVITATION_REMINDER_DAYS: 5 };

    expect(validateParameterValue('INVITATION_WITHDRAW_DAYS', 5, current)).toEqual({
      ok: false,
      reason: 'INCONSISTENT',
    });
    expect(validateParameterValue('INVITATION_WITHDRAW_DAYS', 6, current)).toEqual({ ok: true });
    expect(
      validateParameterValue('INVITATION_REMINDER_DAYS', 14, { ...defaultValues(), INVITATION_WITHDRAW_DAYS: 14 }),
    ).toEqual({ ok: false, reason: 'INCONSISTENT' });
  });

  it('keeps the largest file between one and fifty megabytes, ten to begin with (US-04-04 AC-10)', () => {
    expect(defaultValues().DOCUMENT_MAX_SIZE_MB).toBe(10);
    expect(validateParameterValue('DOCUMENT_MAX_SIZE_MB', 25, defaultValues())).toEqual({ ok: true });
    for (const value of [0, 51, 1.5, -1]) {
      expect(validateParameterValue('DOCUMENT_MAX_SIZE_MB', value, defaultValues()).ok).toBe(false);
    }
  });

  it('knows its own keys and nothing else', () => {
    expect(definitionOf('APPROVAL_SLA_WORKING_DAYS')?.unit).toBe('working days');
    expect(definitionOf('TIME_ZONE')).toBeUndefined();
    expect(validateParameterValue('TIME_ZONE', 'UTC', defaultValues())).toEqual({ ok: false, reason: 'UNKNOWN_KEY' });
  });
});

const EXPECTED_KEYS = [
  'APPROVAL_SLA_WORKING_DAYS',
  'BACKLOG_ALERT_THRESHOLD',
  'SPEND_SUBMISSION_WAIT_WORKING_DAYS',
  'REQUEST_OPEN_NEW_LIMIT',
  'PAID_SOFTWARE_FLAG_THRESHOLD',
  'RENEWAL_WINDOW_DAYS',
  'FORECAST_ERROR_THRESHOLD_PERCENT',
  'BUDGET_RESERVE_DEFAULT_PERCENT',
  'BUDGET_ZBB_KPI3_BELOW_PERCENT',
  'BUDGET_ZBB_PRICE_INCREASE_PERCENT',
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
  'GHOST_SEAT_NEW_ASSIGNMENT_GRACE_DAYS',
  'GHOST_SEAT_DECISION_WORKING_DAYS',
  'GHOST_SEAT_REVOCATION_GRACE_DAYS',
  'RULE_SCHEDULE_G1_G2',
  'RULE_SCHEDULE_G3_G4',
  'AI_ENABLED',
  'AI_ACCESS_REQUEST_SUMMARY_ENABLED',
];

describe('operating parameter labels and groups (QĐ93-PARAM-LABEL)', () => {
  it('pins the twenty-six keys, ordered by group and, inside a group, as the spec table lists them', () => {
    expect(PARAMETER_DEFINITIONS.map((definition) => definition.key)).toEqual(EXPECTED_KEYS);
  });

  it('gives every parameter a Vietnamese label (not empty, at most 80, not its key, never repeated), a group and a unit label', () => {
    const labels = PARAMETER_DEFINITIONS.map((definition) => definition.label);

    for (const definition of PARAMETER_DEFINITIONS) {
      expect(definition.label.trim()).not.toBe('');
      expect(definition.label.length).toBeLessThanOrEqual(80);
      expect(definition.label).not.toBe(definition.key);
      expect(PARAMETER_GROUPS).toContain(definition.group);
      expect(definition.unitLabel.trim()).not.toBe('');
    }
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('names every group, in the display order, and keeps the parameters of a group together', () => {
    expect(PARAMETER_GROUPS).toEqual([
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
    expect(GROUP_LABELS).toEqual({
      WORKFLOW: 'Phê duyệt và quy trình',
      BUDGET: 'Ngân sách và chi phí',
      PERSONNEL: 'Nhân sự và bàn giao',
      PROVISIONING: 'Cấp phát và báo lỗi SaaS',
      ACCOUNT: 'Tài khoản',
      DOCUMENT: 'Tài liệu',
      SUBSCRIPTION: 'Thuê bao và gia hạn',
      USAGE: 'Sử dụng và lãng phí',
      AI: 'Trợ lý AI',
    });
    const runs = PARAMETER_DEFINITIONS.map((definition) => definition.group).filter(
      (group, index, all) => index === 0 || group !== all[index - 1],
    );

    expect(runs).toEqual([...PARAMETER_GROUPS]);
  });

  it('gives the label, group and unit label the spec table fixes to each parameter', () => {
    const table = PARAMETER_DEFINITIONS.map((definition) => [
      definition.key,
      definition.label,
      definition.group,
      definition.unit,
      definition.unitLabel,
    ]);

    expect(table).toEqual([
      ['APPROVAL_SLA_WORKING_DAYS', 'Hạn xử lý một bước phê duyệt', 'WORKFLOW', 'working days', 'ngày làm việc'],
      ['BACKLOG_ALERT_THRESHOLD', 'Ngưỡng tồn đọng bước phê duyệt', 'WORKFLOW', 'steps', 'bước'],
      ['SPEND_SUBMISSION_WAIT_WORKING_DAYS', 'Hạn chờ trình duyệt chi', 'WORKFLOW', 'working days', 'ngày làm việc'],
      ['REQUEST_OPEN_NEW_LIMIT', 'Số Request cấp mới đang mở tối đa của một người', 'WORKFLOW', 'requests', 'Request'],
      [
        'PAID_SOFTWARE_FLAG_THRESHOLD',
        'Ngưỡng số phần mềm trả phí cần lý do khi xin thêm',
        'WORKFLOW',
        'applications',
        'phần mềm',
      ],
      ['RENEWAL_WINDOW_DAYS', 'Cửa sổ gửi Request tiếp tục trước ngày kết thúc', 'WORKFLOW', 'days', 'ngày'],
      ['FORECAST_ERROR_THRESHOLD_PERCENT', 'Ngưỡng sai số dự báo chi phí', 'BUDGET', 'percent', '%'],
      ['BUDGET_RESERVE_DEFAULT_PERCENT', 'Tỷ lệ dự phòng mặc định của ngân sách năm', 'BUDGET', 'percent', '%'],
      [
        'BUDGET_ZBB_KPI3_BELOW_PERCENT',
        'Ngưỡng sử dụng dưới đó dòng ngân sách cần giải trình ZBB',
        'BUDGET',
        'percent',
        '%',
      ],
      ['BUDGET_ZBB_PRICE_INCREASE_PERCENT', 'Ngưỡng tăng đơn giá cần giải trình ZBB', 'BUDGET', 'percent', '%'],
      [
        'TRANSFER_REVIEW_WORKING_DAYS',
        'Hạn rà soát quyền sau điều chuyển',
        'PERSONNEL',
        'working days',
        'ngày làm việc',
      ],
      [
        'PERSONNEL_NOTICE_REVIEW_WORKING_DAYS',
        'Hạn xử lý thông báo biến động nhân sự',
        'PERSONNEL',
        'working days',
        'ngày làm việc',
      ],
      [
        'ABRUPT_DEPARTURE_HOLD_WORKING_DAYS',
        'Thời gian giữ công cụ khi nghỉ đột xuất',
        'PERSONNEL',
        'working days',
        'ngày làm việc',
      ],
      [
        'HANDOVER_SHORT_DEADLINE_WORKING_DAYS',
        'Hạn ngắn xác nhận bàn giao dữ liệu',
        'PERSONNEL',
        'working days',
        'ngày làm việc',
      ],
      ['PROVISIONING_RETRY_COUNT', 'Số lần thử lại cấp/thu hồi', 'PROVISIONING', 'attempts', 'lần'],
      [
        'SAAS_ISSUE_RESPONSE_WORKING_DAYS',
        'Hạn tiếp nhận báo lỗi SaaS',
        'PROVISIONING',
        'working days',
        'ngày làm việc',
      ],
      ['SAAS_ISSUE_REOPEN_WORKING_DAYS', 'Hạn mở lại báo lỗi SaaS', 'PROVISIONING', 'working days', 'ngày làm việc'],
      ['INVITATION_REMINDER_DAYS', 'Nhắc lời mời chưa kích hoạt sau', 'ACCOUNT', 'days', 'ngày'],
      ['INVITATION_WITHDRAW_DAYS', 'Thu hồi lời mời chưa kích hoạt sau', 'ACCOUNT', 'days', 'ngày'],
      ['DOCUMENT_MAX_SIZE_MB', 'Dung lượng tối đa của tệp tài liệu', 'DOCUMENT', 'MB', 'MB'],
      ['RENEWAL_ALERT_DAYS_BEFORE_DEADLINE', 'Cảnh báo trước hạn báo hủy thuê bao', 'SUBSCRIPTION', 'days', 'ngày'],
      ['ACTIVITY_WINDOW_MINUTES', 'Số phút tính là một ngày có hoạt động', 'USAGE', 'minutes per day', 'phút mỗi ngày'],
      ['DETECTION_THRESHOLD_DAYS', 'Ngưỡng ngày không dùng của ghế', 'USAGE', 'days', 'ngày'],
      ['GHOST_SEAT_NEW_ASSIGNMENT_GRACE_DAYS', 'Ân hạn cho ghế mới cấp', 'USAGE', 'days', 'ngày'],
      [
        'GHOST_SEAT_DECISION_WORKING_DAYS',
        'Hạn trưởng phòng quyết định ghost seat',
        'USAGE',
        'working days',
        'ngày làm việc',
      ],
      ['GHOST_SEAT_REVOCATION_GRACE_DAYS', 'Ân hạn trước khi gỡ ghost seat', 'USAGE', 'calendar days', 'ngày lịch'],
      ['RULE_SCHEDULE_G1_G2', 'Lịch chạy luật lãng phí (dữ liệu nội bộ)', 'USAGE', 'schedule', 'lịch'],
      ['RULE_SCHEDULE_G3_G4', 'Lịch chạy luật lãng phí (dữ liệu usage)', 'USAGE', 'schedule', 'lịch'],
      ['AI_ENABLED', 'Công tắc tổng của các tính năng AI', 'AI', 'switch', 'công tắc'],
      ['AI_ACCESS_REQUEST_SUMMARY_ENABLED', 'Tóm tắt hàng chờ duyệt bằng AI', 'AI', 'switch', 'công tắc'],
    ]);
  });

  it('labels every option of an enum parameter, no more and no fewer, within the bound the registry records', () => {
    const enums = PARAMETER_DEFINITIONS.filter((definition) => definition.shape.kind === 'enum');

    expect(enums.map((definition) => definition.key)).toEqual([
      'RULE_SCHEDULE_G1_G2',
      'RULE_SCHEDULE_G3_G4',
      'AI_ENABLED',
      'AI_ACCESS_REQUEST_SUMMARY_ENABLED',
    ]);
    expect(ENUM_OPTIONS_MAX).toBe(10);
    for (const definition of enums) {
      if (definition.shape.kind !== 'enum') continue;
      expect(Object.keys(definition.shape.optionLabels).sort()).toEqual([...definition.shape.options].sort());
      expect(definition.shape.options.length).toBeLessThanOrEqual(ENUM_OPTIONS_MAX);
      expect(definition.shape.optionLabels).toEqual(
        definition.group === 'AI' ? { ON: 'Bật', OFF: 'Tắt' } : { DAILY: 'Hằng ngày', WEEKLY: 'Hằng tuần' },
      );
    }
  });

  it('keeps the two AI switches off until the Super Admin turns them on, and takes nothing but ON or OFF', () => {
    const keys = ['AI_ENABLED', 'AI_ACCESS_REQUEST_SUMMARY_ENABLED'];

    for (const key of keys) {
      const definition = definitionOf(key);

      expect(definition?.group).toBe('AI');
      expect(definition?.shape).toMatchObject({ kind: 'enum', options: ['ON', 'OFF'] });
      expect(definition?.default).toBe('OFF');
      expect(defaultValues()[key]).toBe('OFF');
      expect(definition?.description.length).toBeGreaterThan(10);
      expect(validateParameterValue(key, 'ON', defaultValues())).toEqual({ ok: true });
      expect(validateParameterValue(key, 'OFF', defaultValues())).toEqual({ ok: true });
      for (const value of ['on', 'TRUE', true, 1, null]) {
        expect(validateParameterValue(key, value, defaultValues())).toMatchObject({ ok: false });
      }
    }
    expect(definitionOf('AI_FINANCE_NARRATIVE_ENABLED')).toBeUndefined();
  });

  it('describes the notice review as the Super Admin task and the transfer review as every right a person holds (API-DOC-F07)', () => {
    expect(definitionOf('PERSONNEL_NOTICE_REVIEW_WORKING_DAYS')?.description).toBe(
      'How long the Super Admin has to verify and record, or reject, the notice of a department head about a change coming for one of their people.',
    );
    expect(definitionOf('TRANSFER_REVIEW_WORKING_DAYS')?.description).toBe(
      'How long the new head of a department has to review every right a transferred person holds, paid or internal, counted in working days from the day the transfer takes effect.',
    );
    for (const definition of PARAMETER_DEFINITIONS) {
      expect(definition.description).not.toMatch(
        /IT Admin has to verify|standard set|fallback|substitute|conflict approver/i,
      );
    }
  });

  it('leaves the description of the document size parameter as it is (another item changes it)', () => {
    expect(definitionOf('DOCUMENT_MAX_SIZE_MB')?.description).toBe(
      'The largest file the system keeps: a contract or purchase document, or a document of an annual budget proposal or version; a larger file is refused.',
    );
  });
});
