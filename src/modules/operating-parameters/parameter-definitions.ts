export type ParameterValue = number | string | number[];
export type ParameterValues = Record<string, ParameterValue>;

type Shape =
  | { kind: 'int'; min: number; max: number }
  | { kind: 'enum'; options: readonly string[] }
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
  shape: Shape;
  default: ParameterValue;
  unit: string;
  description: string;
  /** Where the story that fixes it says so. */
  source: string;
}

/**
 * Every parameter the Super Admin can set (`US-01-04`), with the domain a value must stay in and the value a new
 * installation starts with (AC-7). The domains are the ones the stories give; where a story leaves the number
 * to the technical design (`OQ-A-05`) the default here is that design's choice and is meant to be changed.
 *
 * The budget period is the fiscal year (`FR-5.1`, `QĐ-82e`), so there is no parameter for its kind and none for a
 * high-value threshold or a 50 % rate (`QĐ-82c`). The two choices that remain are when the fiscal year begins and how
 * long a request may wait to be submitted; the lock on the month once a budget version exists belongs to the budget
 * (G5), which does not exist yet.
 *
 * Not here on purpose: the time zone (set once at installation, `QĐ-47d`), and the reporting currency, which lock
 * once rates or priced subscriptions exist (AC-9) — it joins when the slice that holds those exists. The same goes
 * for the notice text of the device collector (AC-2) and the per-application detection thresholds (AC-1, AC-5).
 */
export const PARAMETER_DEFINITIONS: readonly ParameterDefinition[] = [
  {
    key: 'APPROVAL_SLA_WORKING_DAYS',
    shape: { kind: 'int', min: 1, max: 30 },
    default: 2,
    unit: 'working days',
    description: 'How long an approval step may wait before it is flagged slow, counted in working days.',
    source: 'FR-3.8, OI-14a',
  },
  {
    key: 'ACTIVITY_WINDOW_MINUTES',
    shape: { kind: 'int', min: 1, max: 120 },
    default: 5,
    unit: 'minutes per day',
    description: 'How many minutes of use in a day count as a day of activity (the N of the activity rule).',
    source: 'BR-45.5, OI-14b',
  },
  {
    key: 'FISCAL_YEAR_START_MONTH',
    shape: { kind: 'int', min: 1, max: 12 },
    default: 1,
    unit: 'month of the year',
    description: 'The month the fiscal year, which is the budget period of the whole organization, begins.',
    source: 'FR-8.2, FR-5.1, QĐ-82c',
  },
  {
    key: 'SPEND_SUBMISSION_WAIT_WORKING_DAYS',
    shape: { kind: 'int', min: 1, max: 30 },
    default: 2,
    unit: 'working days',
    description: 'How long a spending request may wait to be submitted for approval before it is reminded.',
    source: 'FR-8.2, QĐ-82e',
  },
  {
    key: 'TRANSFER_REVIEW_WORKING_DAYS',
    shape: { kind: 'int', min: 1, max: 30 },
    default: 5,
    unit: 'working days',
    description: 'How long the new head of a department has to review tools outside its standard set after a transfer.',
    source: 'FR-8.2, QĐ-50b, QĐ-56a',
  },
  {
    key: 'ABRUPT_DEPARTURE_HOLD_WORKING_DAYS',
    shape: { kind: 'int', min: 1, max: 30 },
    default: 1,
    unit: 'working days',
    description: 'How long a tool that may lose data is kept before it is released when a person leaves suddenly.',
    source: 'QĐ-62e',
  },
  {
    key: 'PROVISIONING_RETRY_COUNT',
    shape: { kind: 'int', min: 0, max: 10 },
    default: 3,
    unit: 'attempts',
    description: 'How many times a failed grant or revocation is retried before it is handed to the IT Admin.',
    source: 'FR-2.5, QĐ-62i, OQ-A-05',
  },
  {
    key: 'INVITATION_REMINDER_DAYS',
    shape: { kind: 'int', min: 1, max: 60 },
    default: 3,
    unit: 'days',
    description: 'After how many days a pending invitation is reminded (the N of the pending invitation).',
    source: 'QĐ-62j, OQ-A-05',
  },
  {
    key: 'INVITATION_WITHDRAW_DAYS',
    shape: { kind: 'int', min: 2, max: 90 },
    default: 14,
    unit: 'days',
    description: 'After how many days a pending invitation is taken back; later than the reminder (the M).',
    source: 'QĐ-62j, OQ-A-05',
  },
  {
    key: 'HANDOVER_SHORT_DEADLINE_WORKING_DAYS',
    shape: { kind: 'int', min: 1, max: 10 },
    default: 1,
    unit: 'working days',
    description: 'The short deadline for confirming a data handover in the cases that cannot wait the usual time.',
    source: 'FR-2.12, QĐ-63b, OQ-A-05',
  },
  {
    key: 'DOCUMENT_MAX_SIZE_MB',
    shape: { kind: 'int', min: 1, max: 50 },
    default: 10,
    unit: 'MB',
    description: 'The largest file kept for a contract or a purchase document; a larger file is refused.',
    source: 'US-04-04 AC-10',
  },
  {
    key: 'DETECTION_THRESHOLD_DAYS',
    shape: { kind: 'int-list', min: 1, max: 365, length: { min: 3, max: 3 }, order: 'ascending' },
    default: [30, 60, 90],
    unit: 'days',
    description: 'Days without use after which a seat is flagged: to watch, to review, to reclaim.',
    source: 'FR-4.12',
  },
  {
    key: 'RENEWAL_ALERT_DAYS_BEFORE_DEADLINE',
    shape: { kind: 'int-list', min: 1, max: 180, length: { min: 1, max: 5 }, order: 'descending' },
    default: [15, 7],
    unit: 'days',
    description: 'How many days before the cancellation deadline of a subscription an alert is sent.',
    source: 'FR-1.4',
  },
  {
    key: 'RULE_SCHEDULE_G1_G2',
    shape: { kind: 'enum', options: ['DAILY', 'WEEKLY'] },
    default: 'DAILY',
    unit: 'schedule',
    description: 'How often the waste rules that use only internal data run.',
    source: 'FR-4.12b',
  },
  {
    key: 'RULE_SCHEDULE_G3_G4',
    shape: { kind: 'enum', options: ['DAILY', 'WEEKLY'] },
    default: 'WEEKLY',
    unit: 'schedule',
    description: 'How often the waste rules that use usage data run.',
    source: 'FR-4.12b',
  },
  {
    key: 'FORECAST_ERROR_THRESHOLD_PERCENT',
    shape: { kind: 'int', min: 10, max: 40 },
    default: 25,
    unit: 'percent',
    description: 'The error a cost forecast may show on back-testing before it is withheld.',
    source: 'FR-5.7, OQ-09',
  },
];

const BY_KEY = new Map(PARAMETER_DEFINITIONS.map((definition) => [definition.key, definition]));

export function definitionOf(key: string): ParameterDefinition | undefined {
  return BY_KEY.get(key);
}

export function defaultValues(): ParameterValues {
  return Object.fromEntries(PARAMETER_DEFINITIONS.map((definition) => [definition.key, definition.default]));
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
