import { parseArgs } from 'node:util';
import { GROUNDS_TYPES } from '../../modules/personnel/public/personnel.types';
import { isBusinessDate } from '../../core/business-date';
import { InvalidEmailError, normalizeEmail } from '../../core/email';
import type { EmploymentType } from '../../modules/organization/public/organization.types';
import {
  SUPER_ADMIN_EVENT_MODES,
  VERIFICATION_METHODS,
  type EventSuccessor,
  type NoticeSource,
  type ParsedSuperAdminEventArguments,
  type ProfileCorrection,
  type SuperAdminEventContext,
  type SuperAdminEventModeName,
  type SuperAdminEventParameters,
} from '../../modules/personnel/public/super-admin-event.types';

export class SuperAdminEventArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SuperAdminEventArgumentError';
  }
}

export const SUPER_ADMIN_EVENT_USAGE = `Usage: pnpm ops:record-super-admin-event <mode> [options]

Records an event of the personnel context (a transfer, a long leave, a departure) or the correction of the official fields of the record
(profile-correct) about the person who holds the Super Admin role, under an approved written ticket. The application refuses such an event about the Super Admin themselves (QĐ-87c); this command is the one
controlled way. It writes the event by the same rules as the application (one pending event, the day, the basis, the head who goes,
the notices) and nothing else: it does not change a role, a role holder, a password, a session or the lock of an account, and it does not
replace \`pnpm ops:recover transfer-role\`. Nothing printed is a name, an email, a code of a person, a basis or a reason.

Modes (the options of a mode are the fields of the body of the write it stands for)
  transfer-record          --to-department-id <uuid> --effective-on <YYYY-MM-DD> [--successor-employee-id <uuid> | --successor-none]
                           [--from-notice <BM-09 id>]
  transfer-reschedule      --transfer <uuid> --new-effective-on <YYYY-MM-DD> --reason <text> [--successor-employee-id <uuid> | --successor-none]
  transfer-cancel          --transfer <uuid> --reason <text>
  leave-start              --started-on <YYYY-MM-DD> --approved-return-on <YYYY-MM-DD> [--from-notice <BM-09 id>]
  leave-return             --leave <uuid> --returned-on <YYYY-MM-DD>
  departure-record         --last-working-day <YYYY-MM-DD> [--successor-employee-id <uuid> | --successor-none]
                           [--cancel-transfer-reason <text>] [--from-notice <BM-09 id>]
  departure-change         --case <uuid> --last-working-day <YYYY-MM-DD> --reason <text> [--successor-employee-id <uuid> | --successor-none]
  departure-cancel         --case <uuid> --reason <text>
  abrupt-departure-record  --last-working-day <YYYY-MM-DD> [--successor-employee-id <uuid> | --successor-none]
                           [--cancel-transfer-reason <text>] [--from-notice <BM-09 id>]
  profile-correct          at least one of --full-name <text> | --work-email <email> | --clear-work-email |
                           --employment-type STAFF|CONTRACTOR|FREELANCER|INTERN | --hire-date <YYYY-MM-DD> (one that has not come yet) |
                           --job-title <text> | --clear-job-title
                           Corrects the official fields of the record of the Super Admin, on the basis below; the department, the status,
                           the account, its roles and the login email are never changed here. What is typed is personal data: it is
                           written to the record and to the Audit Trail only, and never printed back.

  --from-notice (the four recording modes) records the event from a notice of a head (BM-09) about the person: the notice becomes RECORDED
  with the record of how it was checked, as the application writes it. --verification-method ATTACHED_DOCUMENT|EMAIL_FROM_ISSUER|
  DIRECT_CONTACT (default ATTACHED_DOCUMENT) and --verification-reference <text> (default the reference of the basis) go with it.

Required for every mode
  --ticket <reference>         The approved ticket (for example R-2026-031). The same reference with the same parameters does nothing twice.
  --approved-by <reference>    Who approved it, in writing (a reference, never a secret).
  --operator <reference>       Who runs the command. In SHARED it differs from the approver; in every environment neither is the
                               person the event is about (by employee code, login email or work email).
  --environment <name>         LOCAL_TEST or SHARED (recorded in the Audit Trail).
  --subject-code <code>        The employee code of the person who holds the Super Admin role.
  --basis-type <text> --basis-reference <text> --basis-issuer <text> --basis-issued-on <YYYY-MM-DD>
                               The authoritative document outside the system the event rests on.
  --help

Runs like \`pnpm ops:recover\`: the full environment of the application and the runtime database role. One transaction: the ticket, the event,
the Audit Trail (actor OPERATOR) and the notices of the event, or nothing.

Exit codes: 0 recorded · 2 nothing to do (the same ticket with the same parameters was already recorded) · 1 refused or failed (nothing was changed).`;

const OPTIONS = {
  ticket: { type: 'string' },
  'approved-by': { type: 'string' },
  operator: { type: 'string' },
  environment: { type: 'string' },
  'subject-code': { type: 'string' },
  'basis-type': { type: 'string' },
  'basis-reference': { type: 'string' },
  'basis-issuer': { type: 'string' },
  'basis-issued-on': { type: 'string' },
  'to-department-id': { type: 'string' },
  'effective-on': { type: 'string' },
  'successor-employee-id': { type: 'string' },
  'successor-none': { type: 'boolean' },
  transfer: { type: 'string' },
  'new-effective-on': { type: 'string' },
  reason: { type: 'string' },
  'started-on': { type: 'string' },
  'approved-return-on': { type: 'string' },
  leave: { type: 'string' },
  'returned-on': { type: 'string' },
  'last-working-day': { type: 'string' },
  case: { type: 'string' },
  'cancel-transfer-reason': { type: 'string' },
  'full-name': { type: 'string' },
  'work-email': { type: 'string' },
  'clear-work-email': { type: 'boolean' },
  'employment-type': { type: 'string' },
  'hire-date': { type: 'string' },
  'job-title': { type: 'string' },
  'clear-job-title': { type: 'boolean' },
  'from-notice': { type: 'string' },
  'verification-method': { type: 'string' },
  'verification-reference': { type: 'string' },
  help: { type: 'boolean' },
} as const;

type OptionName = keyof typeof OPTIONS;

const COMMON: readonly OptionName[] = [
  'ticket',
  'approved-by',
  'operator',
  'environment',
  'subject-code',
  'basis-type',
  'basis-reference',
  'basis-issuer',
  'basis-issued-on',
  'help',
];
const SUCCESSOR: readonly OptionName[] = ['successor-employee-id', 'successor-none'];
const NOTICE: readonly OptionName[] = ['from-notice', 'verification-method', 'verification-reference'];
const PROFILE: readonly OptionName[] = [
  'full-name',
  'work-email',
  'clear-work-email',
  'employment-type',
  'hire-date',
  'job-title',
  'clear-job-title',
];
const EMPLOYMENT_TYPES = ['STAFF', 'CONTRACTOR', 'FREELANCER', 'INTERN'] as const;
/** The bounds of the form of the people file (`employee.dto.ts`); the service judges the shorter bound of the stored title. */
const FULL_NAME_MAX = 200;
const JOB_TITLE_ARGUMENT_MAX = 1000;

/** The options each mode takes beyond the common ones: the required first, the optional after. Any other option is refused by name. */
const MODE_OPTIONS: Record<
  SuperAdminEventModeName,
  { required: readonly OptionName[]; optional: readonly OptionName[] }
> = {
  'transfer-record': { required: ['to-department-id', 'effective-on'], optional: [...SUCCESSOR, ...NOTICE] },
  'transfer-reschedule': { required: ['transfer', 'new-effective-on', 'reason'], optional: SUCCESSOR },
  'transfer-cancel': { required: ['transfer', 'reason'], optional: [] },
  'leave-start': { required: ['started-on', 'approved-return-on'], optional: NOTICE },
  'leave-return': { required: ['leave', 'returned-on'], optional: [] },
  'departure-record': { required: ['last-working-day'], optional: [...SUCCESSOR, 'cancel-transfer-reason', ...NOTICE] },
  'departure-change': { required: ['case', 'last-working-day', 'reason'], optional: SUCCESSOR },
  'departure-cancel': { required: ['case', 'reason'], optional: [] },
  'abrupt-departure-record': {
    required: ['last-working-day'],
    optional: [...SUCCESSOR, 'cancel-transfer-reason', ...NOTICE],
  },
  'profile-correct': { required: [], optional: PROFILE },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Values = Partial<Record<OptionName, string | boolean>>;

/** An option that carries a secret is refused by name before anything is parsed or loaded: the command takes no password, code or link. */
const SECRET_OPTION = /^--?(password|pass|pwd|secret|token|code|link)(=|$)/i;

/**
 * Turns argv into one command. A leading `--` (forwarded by pnpm) is ignored; a secret in an option is refused by name; an option that
 * does not belong to the mode is refused; every date is a real date and every id a UUID. Nothing here reads the environment.
 */
export function parseSuperAdminEventArguments(argv: readonly string[]): ParsedSuperAdminEventArguments {
  const args = argv[0] === '--' ? argv.slice(1) : [...argv];
  if (args.some((arg) => SECRET_OPTION.test(arg))) {
    throw new SuperAdminEventArgumentError('The command takes no password, token, code or link as an option.');
  }
  if (args.length === 0) throw new SuperAdminEventArgumentError('A mode is required.');
  if (args[0] === '--help' || args[0] === '-h') return { help: true };
  const [mode, ...rest] = args;
  if (!(SUPER_ADMIN_EVENT_MODES as readonly string[]).includes(mode)) {
    throw new SuperAdminEventArgumentError(`Unknown mode ${mode}: use one of ${SUPER_ADMIN_EVENT_MODES.join(', ')}.`);
  }
  const modeName = mode as SuperAdminEventModeName;

  let values: Values;
  try {
    values = parseArgs({ args: rest, options: OPTIONS, allowPositionals: false, strict: true }).values;
  } catch (error) {
    throw new SuperAdminEventArgumentError(error instanceof Error ? error.message : String(error));
  }
  if (values.help) return { help: true };

  const allowed = new Set<OptionName>([
    ...COMMON,
    ...MODE_OPTIONS[modeName].required,
    ...MODE_OPTIONS[modeName].optional,
  ]);
  const stray = (Object.keys(values) as OptionName[]).find((name) => !allowed.has(name));
  if (stray) throw new SuperAdminEventArgumentError(`--${stray} does not belong to ${modeName}.`);

  return { help: false, command: { context: contextOf(values), parameters: parametersOf(modeName, values) } };
}

const text = (values: Values, name: OptionName): string => {
  const value = values[name];
  if (typeof value !== 'string' || value.trim() === '')
    throw new SuperAdminEventArgumentError(`--${name} is required.`);

  return value.trim();
};

const optionalText = (values: Values, name: OptionName): string | undefined => {
  const value = values[name];

  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
};

const day = (values: Values, name: OptionName): string => {
  const value = text(values, name);
  if (!isBusinessDate(value)) throw new SuperAdminEventArgumentError(`--${name} must be a real date as YYYY-MM-DD.`);

  return value;
};

const uuid = (values: Values, name: OptionName): string => {
  const value = text(values, name);
  if (!UUID.test(value)) throw new SuperAdminEventArgumentError(`--${name} must be a UUID.`);

  return value;
};

function contextOf(values: Values): SuperAdminEventContext {
  const environment = text(values, 'environment');
  if (environment !== 'LOCAL_TEST' && environment !== 'SHARED') {
    throw new SuperAdminEventArgumentError('--environment must be LOCAL_TEST or SHARED.');
  }

  return {
    ticketRef: text(values, 'ticket'),
    approvedBy: text(values, 'approved-by'),
    operator: text(values, 'operator'),
    environment,
    subjectCode: text(values, 'subject-code'),
    basis: {
      type: basisType(values),
      reference: text(values, 'basis-reference'),
      issuer: text(values, 'basis-issuer'),
      issuedOn: day(values, 'basis-issued-on'),
    },
  };
}

/** The kind of the basis is one of the closed list every personnel operation takes (`BM-04`). */
function basisType(values: Values): string {
  const type = text(values, 'basis-type');
  if (!(GROUNDS_TYPES as readonly string[]).includes(type))
    throw new SuperAdminEventArgumentError(`--basis-type must be one of ${GROUNDS_TYPES.join(', ')}.`);

  return type;
}

/** Who follows the head of the department the person leaves; at most one of the two options. */
function successorOf(values: Values): { successor?: EventSuccessor } {
  const employee = optionalText(values, 'successor-employee-id');
  if (employee && values['successor-none']) {
    throw new SuperAdminEventArgumentError('Give --successor-employee-id or --successor-none, not both.');
  }
  if (employee) return { successor: { kind: 'EMPLOYEE', employeeId: uuid(values, 'successor-employee-id') } };

  return values['successor-none'] ? { successor: { kind: 'NONE' } } : {};
}

/** The notice of a head the event is recorded from, with how it was checked; the verification options need the notice. */
function noticeOf(values: Values): { fromNotice?: NoticeSource } {
  const noticeId = optionalText(values, 'from-notice');
  if (!noticeId) {
    const orphan = (['verification-method', 'verification-reference'] as const).find(
      (name) => values[name] !== undefined,
    );
    if (orphan) throw new SuperAdminEventArgumentError(`--${orphan} goes with --from-notice.`);

    return {};
  }
  const method = optionalText(values, 'verification-method') ?? 'ATTACHED_DOCUMENT';
  if (!(VERIFICATION_METHODS as readonly string[]).includes(method)) {
    throw new SuperAdminEventArgumentError(`--verification-method must be one of ${VERIFICATION_METHODS.join(', ')}.`);
  }
  const reference = optionalText(values, 'verification-reference');

  return {
    fromNotice: {
      noticeId: uuid(values, 'from-notice'),
      verificationMethod: method as NoticeSource['verificationMethod'],
      ...(reference ? { verificationReference: reference } : {}),
    },
  };
}

/** A field given as a value or cleared by its `--clear-...`: never both, and a value given is not blank. */
function valueOrClear(values: Values, name: OptionName, clear: OptionName): string | null | undefined {
  const given = optionalText(values, name);
  if (given && values[clear]) throw new SuperAdminEventArgumentError(`Give --${name} or --${clear}, not both.`);
  if (values[clear]) return null;
  if (values[name] !== undefined && !given) throw new SuperAdminEventArgumentError(`--${name} is required.`);

  return given;
}

/** `--full-name`: not blank when given, within the bound of the people form. */
function fullNameOf(values: Values): string | undefined {
  const fullName = optionalText(values, 'full-name');
  if (values['full-name'] !== undefined && !fullName)
    throw new SuperAdminEventArgumentError('--full-name is required.');
  if (fullName !== undefined && [...fullName].length > FULL_NAME_MAX) {
    throw new SuperAdminEventArgumentError(`--full-name is at most ${FULL_NAME_MAX} characters.`);
  }

  return fullName;
}

/** `--work-email` or `--clear-work-email`; a value is an email address. */
function workEmailOf(values: Values): string | null | undefined {
  const workEmail = valueOrClear(values, 'work-email', 'clear-work-email');
  if (typeof workEmail === 'string') {
    try {
      normalizeEmail(workEmail);
    } catch (error) {
      if (error instanceof InvalidEmailError)
        throw new SuperAdminEventArgumentError('--work-email must be an email address.');
      throw error;
    }
  }

  return workEmail;
}

/** `--job-title` or `--clear-job-title`; a value within the bound of the people form. */
function jobTitleOf(values: Values): string | null | undefined {
  const jobTitle = valueOrClear(values, 'job-title', 'clear-job-title');
  if (typeof jobTitle === 'string' && [...jobTitle].length > JOB_TITLE_ARGUMENT_MAX) {
    throw new SuperAdminEventArgumentError(`--job-title is at most ${JOB_TITLE_ARGUMENT_MAX} characters.`);
  }

  return jobTitle;
}

/** `--employment-type`: not blank when given, one of the four types. */
function employmentTypeOf(values: Values): EmploymentType | undefined {
  const employmentType = optionalText(values, 'employment-type');
  if (values['employment-type'] !== undefined && !employmentType) {
    throw new SuperAdminEventArgumentError('--employment-type is required.');
  }
  if (employmentType !== undefined && !(EMPLOYMENT_TYPES as readonly string[]).includes(employmentType)) {
    throw new SuperAdminEventArgumentError(`--employment-type must be one of ${EMPLOYMENT_TYPES.join(', ')}.`);
  }

  return employmentType as EmploymentType | undefined;
}

/** The fields to correct: at least one; a value or its `--clear-...`, never both. */
function profileOf(values: Values): ProfileCorrection {
  const fullName = fullNameOf(values);
  const workEmail = workEmailOf(values);
  const jobTitle = jobTitleOf(values);
  const employmentType = employmentTypeOf(values);
  const hireDate = values['hire-date'] === undefined ? undefined : day(values, 'hire-date');
  const correction: ProfileCorrection = {
    mode: 'profile-correct',
    ...(fullName !== undefined ? { fullName } : {}),
    ...(workEmail !== undefined ? { workEmail } : {}),
    ...(employmentType !== undefined ? { employmentType } : {}),
    ...(hireDate !== undefined ? { hireDate } : {}),
    ...(jobTitle !== undefined ? { jobTitle } : {}),
  };
  if (Object.keys(correction).length === 1) {
    throw new SuperAdminEventArgumentError(
      'profile-correct needs at least one of --full-name, --work-email, --clear-work-email, --employment-type, --hire-date, --job-title, --clear-job-title.',
    );
  }

  return correction;
}

/** A departure, recorded ahead or abrupt: the pending transfer it ends is cancelled with the reason given, if any. */
function departureOf(mode: 'departure-record' | 'abrupt-departure-record', values: Values): SuperAdminEventParameters {
  const cancelTransferReason = optionalText(values, 'cancel-transfer-reason');

  return {
    mode,
    lastWorkingDay: day(values, 'last-working-day'),
    ...successorOf(values),
    ...(cancelTransferReason ? { cancelTransferReason } : {}),
    ...noticeOf(values),
  };
}

function parametersOf(mode: SuperAdminEventModeName, values: Values): SuperAdminEventParameters {
  const missing = MODE_OPTIONS[mode].required.find((name) => values[name] === undefined);
  if (missing) throw new SuperAdminEventArgumentError(`--${missing} is required.`);

  switch (mode) {
    case 'transfer-record':
      return {
        mode,
        toDepartmentId: uuid(values, 'to-department-id'),
        effectiveOn: day(values, 'effective-on'),
        ...successorOf(values),
        ...noticeOf(values),
      };
    case 'transfer-reschedule':
      return {
        mode,
        transferId: uuid(values, 'transfer'),
        newEffectiveOn: day(values, 'new-effective-on'),
        reason: text(values, 'reason'),
        ...successorOf(values),
      };
    case 'transfer-cancel':
      return { mode, transferId: uuid(values, 'transfer'), reason: text(values, 'reason') };
    case 'leave-start':
      return {
        mode,
        startedOn: day(values, 'started-on'),
        approvedReturnOn: day(values, 'approved-return-on'),
        ...noticeOf(values),
      };
    case 'leave-return':
      return { mode, leaveId: uuid(values, 'leave'), returnedOn: day(values, 'returned-on') };
    case 'departure-record':
    case 'abrupt-departure-record':
      return departureOf(mode, values);
    case 'departure-change':
      return {
        mode,
        caseId: uuid(values, 'case'),
        lastWorkingDay: day(values, 'last-working-day'),
        reason: text(values, 'reason'),
        ...successorOf(values),
      };
    case 'departure-cancel':
      return { mode, caseId: uuid(values, 'case'), reason: text(values, 'reason') };
    case 'profile-correct':
      return profileOf(values);
  }
}
