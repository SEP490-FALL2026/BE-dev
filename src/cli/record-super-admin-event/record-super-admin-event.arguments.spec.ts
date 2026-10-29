import { SUPER_ADMIN_EVENT_USAGE, parseSuperAdminEventArguments } from './record-super-admin-event.arguments';
import { SUPER_ADMIN_EVENT_MODES } from '../../modules/personnel/public/super-admin-event.types';

const ID = '0191a3b4-0000-7000-8000-000000000001';
const OTHER = '0191a3b4-0000-7000-8000-000000000002';

const COMMON = [
  '--ticket',
  'R-2026-031',
  '--approved-by',
  'cto-office',
  '--operator',
  'ops-2',
  '--environment',
  'SHARED',
  '--subject-code',
  'E-SA',
  '--basis-type',
  'DECISION',
  '--basis-reference',
  'QD-31/2026',
  '--basis-issuer',
  'Board of Directors',
  '--basis-issued-on',
  '2026-10-20',
];

const MODE_ARGUMENTS: Record<(typeof SUPER_ADMIN_EVENT_MODES)[number], string[]> = {
  'transfer-record': ['--to-department-id', ID, '--effective-on', '2026-11-03'],
  'transfer-reschedule': [
    '--transfer',
    ID,
    '--new-effective-on',
    '2026-11-10',
    '--reason',
    'The department asked for later',
  ],
  'transfer-cancel': ['--transfer', ID, '--reason', 'No longer needed'],
  'leave-start': ['--started-on', '2026-10-01', '--approved-return-on', '2026-12-01'],
  'leave-return': ['--leave', ID, '--returned-on', '2026-12-01'],
  'departure-record': ['--last-working-day', '2026-11-30'],
  'departure-change': ['--case', ID, '--last-working-day', '2026-12-15', '--reason', 'Handover takes longer'],
  'departure-cancel': ['--case', ID, '--reason', 'The person stays'],
  'abrupt-departure-record': ['--last-working-day', '2026-10-20'],
  'profile-correct': ['--full-name', 'Nguyen Van An', '--clear-job-title'],
};

const parse = (mode: string, ...rest: string[]) => parseSuperAdminEventArguments([mode, ...COMMON, ...rest]);
const refused = (args: readonly string[]) => () => parseSuperAdminEventArguments(args);

describe('the arguments of ops:record-super-admin-event', () => {
  it.each(SUPER_ADMIN_EVENT_MODES)('parses %s with the common parameters and its own', (mode) => {
    const parsed = parse(mode, ...MODE_ARGUMENTS[mode]);

    expect(parsed).toMatchObject({
      help: false,
      command: {
        context: {
          ticketRef: 'R-2026-031',
          approvedBy: 'cto-office',
          operator: 'ops-2',
          environment: 'SHARED',
          subjectCode: 'E-SA',
          basis: { type: 'DECISION', reference: 'QD-31/2026', issuer: 'Board of Directors', issuedOn: '2026-10-20' },
        },
        parameters: { mode },
      },
    });
  });

  it('ignores the `--` that pnpm forwards and answers --help with the usage text, for every mode', () => {
    expect(
      parseSuperAdminEventArguments(['--', 'transfer-cancel', ...COMMON, ...MODE_ARGUMENTS['transfer-cancel']]),
    ).toMatchObject({
      help: false,
    });
    expect(parseSuperAdminEventArguments(['--help'])).toEqual({ help: true });
    expect(parseSuperAdminEventArguments(['leave-start', '--help'])).toEqual({ help: true });
    for (const mode of SUPER_ADMIN_EVENT_MODES) expect(SUPER_ADMIN_EVENT_USAGE).toContain(mode);
  });

  describe('profile-correct, the tenth mode', () => {
    const profile = (...rest: string[]) => parse('profile-correct', ...rest);

    it('is one of the ten modes and carries the fields to correct as the parameters of the mode', () => {
      expect(SUPER_ADMIN_EVENT_MODES).toHaveLength(10);
      expect(
        profile(
          '--full-name',
          '  Nguyen Van An ',
          '--work-email',
          'An@Acme.vn',
          '--employment-type',
          'CONTRACTOR',
          '--hire-date',
          '2027-01-04',
          '--job-title',
          'Site lead',
        ),
      ).toMatchObject({
        command: {
          parameters: {
            mode: 'profile-correct',
            fullName: 'Nguyen Van An',
            workEmail: 'An@Acme.vn',
            employmentType: 'CONTRACTOR',
            hireDate: '2027-01-04',
            jobTitle: 'Site lead',
          },
        },
      });
    });

    it('clears the work email or the job title with its own option and gives null, never an empty text', () => {
      expect(profile('--clear-work-email', '--clear-job-title')).toMatchObject({
        command: { parameters: { mode: 'profile-correct', workEmail: null, jobTitle: null } },
      });
    });

    it.each([
      ['no field at all', [], 'profile-correct needs at least one of'],
      ['a value and its clear option', ['--work-email', 'a@acme.vn', '--clear-work-email'], 'not both'],
      ['a job title and its clear option', ['--job-title', 'Lead', '--clear-job-title'], 'not both'],
      ['a blank full name', ['--full-name', '   '], '--full-name is required'],
      ['a full name over 200 characters', ['--full-name', 'x'.repeat(201)], '--full-name is at most 200'],
      ['a work email that cannot be normalized', ['--work-email', 'not-an-email'], '--work-email must be an email'],
      ['a kind of staff that does not exist', ['--employment-type', 'BOSS'], '--employment-type must be one of'],
      ['a hire date that is not a date', ['--hire-date', '2027-13-45'], '--hire-date must be a real date'],
      ['a job title over 1000 characters', ['--job-title', 'x'.repeat(1001)], '--job-title is at most 1000'],
      [
        'a department, which is an event and not a correction',
        ['--to-department-id', ID],
        'does not belong to profile-correct',
      ],
      ['the login email', ['--login-email', 'a@acme.vn'], 'Unknown option'],
    ])('refuses %s', (_name, rest, message) => {
      expect(refused(['profile-correct', ...COMMON, ...rest])).toThrow(message);
    });

    it('is named in the usage with every field and says the typed data is never printed back', () => {
      for (const option of ['--full-name', '--work-email', '--employment-type', '--hire-date', '--job-title']) {
        expect(SUPER_ADMIN_EVENT_USAGE).toContain(option);
      }
      expect(SUPER_ADMIN_EVENT_USAGE).toContain('never printed back');
    });
  });

  describe.each([['password'], ['pass'], ['pwd'], ['secret'], ['token'], ['code'], ['link']])(
    'refuses --%s by name before anything is read',
    (name) => {
      it('as a flag, with a value and with `=`', () => {
        const mode = ['transfer-cancel', ...COMMON, ...MODE_ARGUMENTS['transfer-cancel']];

        expect(refused([...mode, `--${name}`, 'x'])).toThrow('takes no password, token, code or link');
        expect(refused([...mode, `--${name}=x`])).toThrow('takes no password, token, code or link');
        expect(refused([...mode, `-${name}`, 'x'])).toThrow('takes no password, token, code or link');
      });
    },
  );

  it('does not mistake --subject-code for the forbidden --code', () => {
    expect(() => parse('leave-start', ...MODE_ARGUMENTS['leave-start'])).not.toThrow();
  });

  it.each([
    ['no mode', [], 'A mode is required'],
    ['an unknown mode', ['transfer-move', ...COMMON], 'Unknown mode'],
    [
      'a missing ticket',
      ['transfer-cancel', ...COMMON.slice(2), ...MODE_ARGUMENTS['transfer-cancel']],
      '--ticket is required',
    ],
    [
      'a missing basis part',
      ['transfer-cancel', ...COMMON.filter((_, index) => index < 16), ...MODE_ARGUMENTS['transfer-cancel']],
      '--basis-issued-on is required',
    ],
    [
      'an unknown environment',
      [
        'transfer-cancel',
        ...COMMON.map((part) => (part === 'SHARED' ? 'PRODUCTION' : part)),
        ...MODE_ARGUMENTS['transfer-cancel'],
      ],
      '--environment must be LOCAL_TEST or SHARED',
    ],
    [
      'a basis day that is not a date',
      [
        'transfer-cancel',
        ...COMMON.map((part) => (part === '2026-10-20' ? '2026-13-45' : part)),
        ...MODE_ARGUMENTS['transfer-cancel'],
      ],
      '--basis-issued-on must be a real date',
    ],
  ])('refuses %s', (_name, args, message) => {
    expect(refused(args)).toThrow(message);
  });

  it.each([
    ['transfer-record', ['--effective-on', '2026-11-03'], '--to-department-id is required'],
    [
      'transfer-record',
      ['--to-department-id', 'not-a-uuid', '--effective-on', '2026-11-03'],
      '--to-department-id must be a UUID',
    ],
    ['transfer-record', ['--to-department-id', ID, '--effective-on', 'tomorrow'], '--effective-on must be a real date'],
    ['transfer-cancel', ['--transfer', ID], '--reason is required'],
    ['leave-return', ['--returned-on', '2026-12-01'], '--leave is required'],
    ['departure-record', [], '--last-working-day is required'],
  ])('refuses %s when %j is not whole', (mode, args, message) => {
    expect(refused([mode, ...COMMON, ...args])).toThrow(message);
  });

  it('refuses an option that does not belong to the mode, by name', () => {
    expect(
      refused(['transfer-cancel', ...COMMON, ...MODE_ARGUMENTS['transfer-cancel'], '--effective-on', '2026-11-03']),
    ).toThrow('--effective-on does not belong to transfer-cancel');
    expect(refused(['leave-start', ...COMMON, ...MODE_ARGUMENTS['leave-start'], '--successor-none'])).toThrow(
      '--successor-none does not belong to leave-start',
    );
  });

  describe('who follows the head of the department', () => {
    it('is an employee, or nobody, and never both', () => {
      const withEmployee = parse(
        'departure-record',
        ...MODE_ARGUMENTS['departure-record'],
        '--successor-employee-id',
        OTHER,
      );
      const withNobody = parse('departure-record', ...MODE_ARGUMENTS['departure-record'], '--successor-none');

      expect(withEmployee).toMatchObject({
        command: { parameters: { successor: { kind: 'EMPLOYEE', employeeId: OTHER } } },
      });
      expect(withNobody).toMatchObject({ command: { parameters: { successor: { kind: 'NONE' } } } });
      expect(
        refused([
          'departure-record',
          ...COMMON,
          ...MODE_ARGUMENTS['departure-record'],
          '--successor-employee-id',
          OTHER,
          '--successor-none',
        ]),
      ).toThrow('not both');
    });
  });

  describe('--from-notice (the four recording modes)', () => {
    it('takes the notice and how it was checked, defaulting to the document of the basis', () => {
      const plain = parse('transfer-record', ...MODE_ARGUMENTS['transfer-record'], '--from-notice', OTHER);
      const full = parse(
        'abrupt-departure-record',
        ...MODE_ARGUMENTS['abrupt-departure-record'],
        '--from-notice',
        OTHER,
        '--verification-method',
        'DIRECT_CONTACT',
        '--verification-reference',
        'call with the issuer',
      );

      expect(plain).toMatchObject({
        command: { parameters: { fromNotice: { noticeId: OTHER, verificationMethod: 'ATTACHED_DOCUMENT' } } },
      });
      expect(full).toMatchObject({
        command: {
          parameters: {
            fromNotice: {
              noticeId: OTHER,
              verificationMethod: 'DIRECT_CONTACT',
              verificationReference: 'call with the issuer',
            },
          },
        },
      });
    });

    it('is refused for the modes that change a record, and the verification options need the notice', () => {
      expect(
        refused(['transfer-cancel', ...COMMON, ...MODE_ARGUMENTS['transfer-cancel'], '--from-notice', OTHER]),
      ).toThrow('--from-notice does not belong to transfer-cancel');
      expect(
        refused([
          'leave-start',
          ...COMMON,
          ...MODE_ARGUMENTS['leave-start'],
          '--verification-method',
          'DIRECT_CONTACT',
        ]),
      ).toThrow('--verification-method goes with --from-notice');
      expect(
        refused([
          'leave-start',
          ...COMMON,
          ...MODE_ARGUMENTS['leave-start'],
          '--from-notice',
          OTHER,
          '--verification-method',
          'GUESS',
        ]),
      ).toThrow('--verification-method must be one of');
    });
  });
});
