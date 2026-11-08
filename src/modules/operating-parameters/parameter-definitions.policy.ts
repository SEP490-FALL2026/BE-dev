export type ParameterValue = number | string | number[];
export type ParameterValues = Record<string, ParameterValue>;

/** The groups the screen sorts the parameters into, in the order it shows them. */
export const PARAMETER_GROUPS = [
  'WORKFLOW',
  'BUDGET',
  'PERSONNEL',
  'PROVISIONING',
  'ACCOUNT',
  'DOCUMENT',
  'SUBSCRIPTION',
  'USAGE',
  'AI',
] as const;
export type ParameterGroup = (typeof PARAMETER_GROUPS)[number];

/** What the screen shows for each group, in Vietnamese. */
export const GROUP_LABELS: Record<ParameterGroup, string> = {
  WORKFLOW: 'Phê duyệt và quy trình',
  BUDGET: 'Ngân sách và chi phí',
  PERSONNEL: 'Nhân sự và bàn giao',
  PROVISIONING: 'Cấp phát và báo lỗi SaaS',
  ACCOUNT: 'Tài khoản',
  DOCUMENT: 'Tài liệu',
  SUBSCRIPTION: 'Thuê bao và gia hạn',
  USAGE: 'Sử dụng và lãng phí',
  AI: 'Trợ lý AI',
};

/** Most choices an enum parameter offers; the registry of nested arrays records the same bound. */
export const ENUM_OPTIONS_MAX = 10;

type Shape =
  | { kind: 'int'; min: number; max: number }
  /** `optionLabels` holds the Vietnamese label of each option, keyed by the option. */
  | { kind: 'enum'; options: readonly string[]; optionLabels: Readonly<Record<string, string>> }
  /** Whole numbers within [min, max], `length` of them, strictly rising or falling. */
  | {
      kind: 'int-list';
      min: number;
      max: number;
      length: { min: number; max: number };
      order: 'ascending' | 'descending';
    };

export interface ParameterDefinition {
  key: string;
  /** What the screen shows for the parameter, in Vietnamese. */
  label: string;
  group: ParameterGroup;
  shape: Shape;
  default: ParameterValue;
  unit: string;
  /** The unit in Vietnamese. */
  unitLabel: string;
  description: string;
  /** Where the story that fixes it says so. */
  source: string;
  /** Who sets it (`QĐ-103z`(1), L1-19): the Super Admin unless the definition says Finance. */
  owner?: 'SUPER_ADMIN' | 'FINANCE';
}

/**
 * Every parameter the Super Admin can set (`US-01-04`), with the domain a value must stay in and the value a new
 * installation starts with (AC-7). The domains are the ones the stories give; where a story leaves the number
 * to the technical design (`OQ-A-05`) the default here is that design's choice and is meant to be changed.
 *
 * The list is ordered by group (the order of {@link PARAMETER_GROUPS}), so the screen shows it as it comes.
 *
 * The budget period is the calendar year (`FR-5.1`, `QĐ-104e`(1)), so there is no parameter for when it begins, none for
 * its kind and none for a high-value threshold or a 50 % rate (`QĐ-82c`).
 *
 * Not here on purpose: the time zone (set once at installation, `QĐ-47d`), and the reporting currency, which lock
 * once rates or priced subscriptions exist (AC-9) — it joins when the slice that holds those exists. The same goes
 * for the notice text of the device collector (AC-2) and the per-application detection thresholds (AC-1, AC-5).
 */
export const PARAMETER_DEFINITIONS: readonly ParameterDefinition[] = [
  {
    key: 'APPROVAL_SLA_WORKING_DAYS',
    label: 'Hạn xử lý một bước phê duyệt',
    group: 'WORKFLOW',
    shape: { kind: 'int', min: 1, max: 30 },
    default: 2,
    unit: 'working days',
    unitLabel: 'ngày làm việc',
    description: 'How long an approval step may wait before it is flagged slow, counted in working days.',
    source: 'FR-3.8, OI-14a',
  },
  {
    key: 'BACKLOG_ALERT_THRESHOLD',
    label: 'Ngưỡng tồn đọng bước phê duyệt',
    group: 'WORKFLOW',
    shape: { kind: 'int', min: 1, max: 500 },
    default: 10,
    unit: 'steps',
    unitLabel: 'bước',
    description: 'How many approval steps one person may hold before the Super Admin is told of the backlog.',
    source: 'FR-3.8, US-05-10',
  },
  {
    key: 'SPEND_SUBMISSION_WAIT_WORKING_DAYS',
    label: 'Hạn chờ trình duyệt chi',
    group: 'WORKFLOW',
    shape: { kind: 'int', min: 1, max: 30 },
    default: 2,
    unit: 'working days',
    unitLabel: 'ngày làm việc',
    description: 'How long a spending request may wait to be submitted for approval before it is reminded.',
    source: 'FR-8.2, QĐ-82e',
  },
  {
    key: 'FORECAST_ERROR_THRESHOLD_PERCENT',
    label: 'Ngưỡng sai số dự báo chi phí',
    group: 'BUDGET',
    shape: { kind: 'int', min: 10, max: 40 },
    default: 25,
    unit: 'percent',
    unitLabel: '%',
    description: 'The error a cost forecast may show on back-testing before it is withheld.',
    source: 'FR-5.7, OQ-09',
  },
  {
    key: 'BUDGET_RESERVE_DEFAULT_PERCENT',
    label: 'Tỷ lệ dự phòng mặc định của ngân sách năm',
    group: 'BUDGET',
    shape: { kind: 'int', min: 0, max: 100 },
    default: 10,
    unit: 'percent',
    unitLabel: '%',
    description: 'The share of the base budget a new version sets aside as its reserve when Finance gives none.',
    source: 'QĐ-98, US-06-09 AC-30',
    owner: 'FINANCE',
  },
  {
    key: 'TRANSFER_REVIEW_WORKING_DAYS',
    label: 'Hạn rà soát quyền sau điều chuyển',
    group: 'PERSONNEL',
    shape: { kind: 'int', min: 1, max: 30 },
    default: 5,
    unit: 'working days',
    unitLabel: 'ngày làm việc',
    description:
      'How long the new head of a department has to review every right a transferred person holds, paid or internal, counted in working days from the day the transfer takes effect.',
    source: 'FR-8.2, QĐ-50b, QĐ-56a',
  },
  {
    key: 'PERSONNEL_NOTICE_REVIEW_WORKING_DAYS',
    label: 'Hạn xử lý thông báo biến động nhân sự',
    group: 'PERSONNEL',
    shape: { kind: 'int', min: 1, max: 30 },
    default: 2,
    unit: 'working days',
    unitLabel: 'ngày làm việc',
    description:
      'How long the Super Admin has to verify and record, or reject, the notice of a department head about a change coming for one of their people.',
    source: 'FR-2.14, FR-8.2',
  },
  {
    key: 'ABRUPT_DEPARTURE_HOLD_WORKING_DAYS',
    label: 'Thời gian giữ công cụ khi nghỉ đột xuất',
    group: 'PERSONNEL',
    shape: { kind: 'int', min: 1, max: 30 },
    default: 1,
    unit: 'working days',
    unitLabel: 'ngày làm việc',
    description: 'How long a tool that may lose data is kept before it is released when a person leaves suddenly.',
    source: 'QĐ-62e',
  },
  {
    key: 'HANDOVER_SHORT_DEADLINE_WORKING_DAYS',
    label: 'Hạn ngắn xác nhận bàn giao dữ liệu',
    group: 'PERSONNEL',
    shape: { kind: 'int', min: 1, max: 10 },
    default: 1,
    unit: 'working days',
    unitLabel: 'ngày làm việc',
    description: 'The short deadline for confirming a data handover in the cases that cannot wait the usual time.',
    source: 'FR-2.12, QĐ-63b, OQ-A-05',
  },
  {
    key: 'PROVISIONING_RETRY_COUNT',
    label: 'Số lần thử lại cấp/thu hồi',
    group: 'PROVISIONING',
    shape: { kind: 'int', min: 0, max: 10 },
    default: 3,
    unit: 'attempts',
    unitLabel: 'lần',
    description: 'How many times a failed grant or revocation is retried before it is handed to the IT Admin.',
    source: 'FR-2.5, QĐ-62i, OQ-A-05',
  },
  {
    key: 'SAAS_ISSUE_RESPONSE_WORKING_DAYS',
    label: 'Hạn tiếp nhận báo lỗi SaaS',
    group: 'PROVISIONING',
    shape: { kind: 'int', min: 1, max: 30 },
    default: 1,
    unit: 'working days',
    unitLabel: 'ngày làm việc',
    description:
      'How long the IT Admin in charge has to take up a new report of an error in a SaaS right before they are reminded; the report is never reassigned or closed by the reminder.',
    source: 'FR-2.15, FR-8.2',
  },
  {
    key: 'SAAS_ISSUE_REOPEN_WORKING_DAYS',
    label: 'Hạn mở lại báo lỗi SaaS',
    group: 'PROVISIONING',
    shape: { kind: 'int', min: 1, max: 30 },
    default: 5,
    unit: 'working days',
    unitLabel: 'ngày làm việc',
    description:
      'How long after a report of an error in a SaaS right is resolved its reporter may reopen it; after that it is closed and only a new report can be sent.',
    source: 'FR-2.15, FR-8.2',
  },
  {
    key: 'INVITATION_REMINDER_DAYS',
    label: 'Nhắc lời mời chưa kích hoạt sau',
    group: 'ACCOUNT',
    shape: { kind: 'int', min: 1, max: 60 },
    default: 3,
    unit: 'days',
    unitLabel: 'ngày',
    description: 'After how many days a pending invitation is reminded (the N of the pending invitation).',
    source: 'QĐ-62j, OQ-A-05',
  },
  {
    key: 'INVITATION_WITHDRAW_DAYS',
    label: 'Thu hồi lời mời chưa kích hoạt sau',
    group: 'ACCOUNT',
    shape: { kind: 'int', min: 2, max: 90 },
    default: 14,
    unit: 'days',
    unitLabel: 'ngày',
    description: 'After how many days a pending invitation is taken back; later than the reminder (the M).',
    source: 'QĐ-62j, OQ-A-05',
  },
  {
    key: 'DOCUMENT_MAX_SIZE_MB',
    label: 'Dung lượng tối đa của tệp tài liệu',
    group: 'DOCUMENT',
    shape: { kind: 'int', min: 1, max: 50 },
    default: 10,
    unit: 'MB',
    unitLabel: 'MB',
    description:
      'The largest file the system keeps: a contract or purchase document, or a document of an annual budget proposal or version; a larger file is refused.',
    source: 'US-04-04 AC-10',
  },
  {
    key: 'RENEWAL_ALERT_DAYS_BEFORE_DEADLINE',
    label: 'Cảnh báo trước hạn báo hủy thuê bao',
    group: 'SUBSCRIPTION',
    shape: { kind: 'int-list', min: 1, max: 180, length: { min: 1, max: 5 }, order: 'descending' },
    default: [15, 7],
    unit: 'days',
    unitLabel: 'ngày',
    description: 'How many days before the cancellation deadline of a subscription an alert is sent.',
    source: 'FR-1.4',
  },
  {
    key: 'ACTIVITY_WINDOW_MINUTES',
    label: 'Số phút tính là một ngày có hoạt động',
    group: 'USAGE',
    shape: { kind: 'int', min: 1, max: 120 },
    default: 5,
    unit: 'minutes per day',
    unitLabel: 'phút mỗi ngày',
    description: 'How many minutes of use in a day count as a day of activity (the N of the activity rule).',
    source: 'BR-45.5, OI-14b',
  },
  {
    key: 'DETECTION_THRESHOLD_DAYS',
    label: 'Ngưỡng ngày không dùng của ghế',
    group: 'USAGE',
    shape: { kind: 'int-list', min: 1, max: 365, length: { min: 3, max: 3 }, order: 'ascending' },
    default: [30, 60, 90],
    unit: 'days',
    unitLabel: 'ngày',
    description: 'Days without use after which a seat is flagged: to watch, to review, to reclaim.',
    source: 'FR-4.12',
  },
  {
    key: 'RULE_SCHEDULE_G1_G2',
    label: 'Lịch chạy luật lãng phí (dữ liệu nội bộ)',
    group: 'USAGE',
    shape: {
      kind: 'enum',
      options: ['DAILY', 'WEEKLY'],
      optionLabels: { DAILY: 'Hằng ngày', WEEKLY: 'Hằng tuần' },
    },
    default: 'DAILY',
    unit: 'schedule',
    unitLabel: 'lịch',
    description: 'How often the waste rules that use only internal data run.',
    source: 'FR-4.12b',
  },
  {
    key: 'RULE_SCHEDULE_G3_G4',
    label: 'Lịch chạy luật lãng phí (dữ liệu usage)',
    group: 'USAGE',
    shape: {
      kind: 'enum',
      options: ['DAILY', 'WEEKLY'],
      optionLabels: { DAILY: 'Hằng ngày', WEEKLY: 'Hằng tuần' },
    },
    default: 'WEEKLY',
    unit: 'schedule',
    unitLabel: 'lịch',
    description: 'How often the waste rules that use usage data run.',
    source: 'FR-4.12b',
  },
  {
    key: 'AI_ENABLED',
    label: 'Công tắc tổng của các tính năng AI',
    group: 'AI',
    shape: { kind: 'enum', options: ['ON', 'OFF'], optionLabels: { ON: 'Bật', OFF: 'Tắt' } },
    default: 'OFF',
    unit: 'switch',
    unitLabel: 'công tắc',
    description:
      'Công tắc tổng: khi tắt, hệ thống không gọi dịch vụ AI cho bất kỳ tính năng nào và mọi luồng làm việc chạy thủ công như cũ.',
    source: 'OQ-G-08, US-15-05',
  },
  {
    key: 'AI_ACCESS_REQUEST_SUMMARY_ENABLED',
    label: 'Tóm tắt hàng chờ duyệt bằng AI',
    group: 'AI',
    shape: { kind: 'enum', options: ['ON', 'OFF'], optionLabels: { ON: 'Bật', OFF: 'Tắt' } },
    default: 'OFF',
    unit: 'switch',
    unitLabel: 'công tắc',
    description:
      'Cho phép người được giao bước duyệt bấm "Tóm tắt bằng AI" trên hàng chờ của mình; chỉ có hiệu lực khi công tắc tổng của AI đang bật.',
    source: 'OQ-G-08, US-15-05',
  },
];

const BY_KEY = new Map(PARAMETER_DEFINITIONS.map((definition) => [definition.key, definition]));

export function definitionOf(key: string): ParameterDefinition | undefined {
  return BY_KEY.get(key);
}

/** Who sets the parameter: the role named by its definition, the Super Admin by default. */
export const parameterOwnerOf = (key: string): 'SUPER_ADMIN' | 'FINANCE' => definitionOf(key)?.owner ?? 'SUPER_ADMIN';

/** Whether a holder of these roles sets the parameter: only the role that owns it does (the Super Admin does not set Finance's). */
export const rolesMaySet = (roles: readonly string[], key: string): boolean => roles.includes(parameterOwnerOf(key));

/** Whether a holder of these roles reads the parameter and its history: the Super Admin reads all, Finance only its own. */
export const rolesMayRead = (roles: readonly string[], key: string): boolean =>
  roles.includes('SUPER_ADMIN') || rolesMaySet(roles, key);

export function defaultValues(): ParameterValues {
  return Object.fromEntries(PARAMETER_DEFINITIONS.map((definition) => [definition.key, definition.default]));
}

/** The effective value of each parameter: the one set by the Super Admin, or the default. */
export function effectiveValues(rows: readonly { key: string; value: ParameterValue }[]): ParameterValues {
  const values = defaultValues();
  for (const row of rows) if (definitionOf(row.key)) values[row.key] = row.value;

  return values;
}

export type ParameterValidation =
  { ok: true } | { ok: false; reason: 'UNKNOWN_KEY' | 'WRONG_TYPE' | 'OUT_OF_RANGE' | 'INCONSISTENT' };

const isWhole = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value);

function validateShape(shape: Shape, value: unknown): ParameterValidation {
  if (shape.kind === 'int') {
    if (!isWhole(value)) return { ok: false, reason: 'WRONG_TYPE' };

    return value >= shape.min && value <= shape.max ? { ok: true } : { ok: false, reason: 'OUT_OF_RANGE' };
  }
  if (shape.kind === 'enum') {
    return typeof value === 'string' && shape.options.includes(value)
      ? { ok: true }
      : { ok: false, reason: 'OUT_OF_RANGE' };
  }
  if (!Array.isArray(value) || !value.every(isWhole)) return { ok: false, reason: 'WRONG_TYPE' };
  if (value.length < shape.length.min || value.length > shape.length.max) return { ok: false, reason: 'OUT_OF_RANGE' };
  if (value.some((item) => item < shape.min || item > shape.max)) return { ok: false, reason: 'OUT_OF_RANGE' };
  const ordered = value.every((item, index) =>
    index === 0 ? true : shape.order === 'ascending' ? item > value[index - 1] : item < value[index - 1],
  );

  return ordered ? { ok: true } : { ok: false, reason: 'OUT_OF_RANGE' };
}

/**
 * Whether `value` is allowed for `key`, given the other parameters as they are now (`current`): a value must be in
 * its own domain, and the withdrawal of a pending invitation must come after its reminder.
 */
export function validateParameterValue(key: string, value: unknown, current: ParameterValues): ParameterValidation {
  const definition = definitionOf(key);
  if (!definition) return { ok: false, reason: 'UNKNOWN_KEY' };

  const own = validateShape(definition.shape, value);
  if (!own.ok) return own;

  if (key === 'INVITATION_WITHDRAW_DAYS' && (value as number) <= (current.INVITATION_REMINDER_DAYS as number)) {
    return { ok: false, reason: 'INCONSISTENT' };
  }
  if (key === 'INVITATION_REMINDER_DAYS' && (value as number) >= (current.INVITATION_WITHDRAW_DAYS as number)) {
    return { ok: false, reason: 'INCONSISTENT' };
  }

  return { ok: true };
}
