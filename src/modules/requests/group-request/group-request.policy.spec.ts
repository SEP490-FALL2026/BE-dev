import {
  GROUP_EMPLOYEE_MAX,
  GROUP_HEAD_MAX,
  checkGroupPlan,
  checkLineCount,
  checkLines,
  maxLines,
  needsTermConfirmation,
  type LineFacts,
} from './group-request.policy';

const person = (over: Partial<LineFacts> = {}): LineFacts => ({
  employeeId: 'e1',
  departmentId: 'P-DES',
  active: true,
  workEmail: 'e1@acme.vn',
  employmentType: 'STAFF',
  hireDate: '2026-01-05',
  expectedEndDate: undefined,
  holdsAccess: false,
  hasOpenRequest: false,
  isHeadOwnLine: false,
  ...over,
});

describe('which plans take a group of people (US-05-17 AC-14)', () => {
  it('takes a plan that gives each person an account of their own, whatever its name', () => {
    expect(checkGroupPlan({ applicationKind: 'SAAS', provisioningType: 'K2' })).toBeNull();
    expect(checkGroupPlan({ applicationKind: 'LICENSED', provisioningType: 'K2' })).toBeNull();
  });

  it.each(['K1', 'K3', 'K4', 'K5'] as const)('refuses the kind %s: it does not give each person an account', (kind) => {
    expect(checkGroupPlan({ applicationKind: 'SAAS', provisioningType: kind })).toBe('KIND_NOT_MULTI_SEAT');
  });

  it('refuses internal software as not paid, before it looks at the kind', () => {
    expect(checkGroupPlan({ applicationKind: 'INTERNAL', provisioningType: 'K5' })).toBe('NOT_PAID_SOFTWARE');
    expect(checkGroupPlan({ applicationKind: 'INTERNAL', provisioningType: 'K2' })).toBe('NOT_PAID_SOFTWARE');
  });

  it('is decided by the facts of the plan and never reads its name', () => {
    const plan = { applicationKind: 'SAAS', provisioningType: 'K2', planName: 'Figma Organization' } as const;
    const renamed = { ...plan, planName: 'Anything else' };

    expect(checkGroupPlan(plan)).toBe(checkGroupPlan(renamed));
  });
});

describe('how many people a request names (US-05-17 AC-2, AC-13)', () => {
  const ids = (count: number) => Array.from({ length: count }, (_, index) => `e${index}`);

  it('lets an Employee name ten people and not eleven, and a head up to a hundred', () => {
    expect(maxLines(false)).toBe(GROUP_EMPLOYEE_MAX);
    expect(maxLines(true)).toBe(GROUP_HEAD_MAX);
    expect(checkLineCount({ senderIsHead: false, requested: ids(10) }).tooMany).toBeNull();
    expect(checkLineCount({ senderIsHead: false, requested: ids(11) }).tooMany).toEqual({ max: 10 });
    expect(checkLineCount({ senderIsHead: true, requested: ids(25) }).tooMany).toBeNull();
    expect(checkLineCount({ senderIsHead: true, requested: ids(100) }).tooMany).toBeNull();
    expect(checkLineCount({ senderIsHead: true, requested: ids(101) }).tooMany).toEqual({ max: 100 });
  });

  it('names the people who are named more than once, each once', () => {
    expect(checkLineCount({ senderIsHead: false, requested: ['a', 'b', 'a', 'c', 'a', 'b'] }).duplicates).toEqual([
      'a',
      'b',
    ]);
    expect(checkLineCount({ senderIsHead: false, requested: ['a', 'b'] }).duplicates).toEqual([]);
  });
});

describe('what each person named must have (US-05-17 AC-2, AC-8, AC-12, AC-15)', () => {
  const check = (people: LineFacts[]) => checkLines('P-DES', people, '2026-10-24');

  it('lists nobody when every person may be named', () => {
    expect(check([person({ employeeId: 'a' }), person({ employeeId: 'b' })])).toEqual([]);
  });

  it.each([
    ['somebody of another department', { departmentId: 'P-ENG' }, 'OUTSIDE_DEPARTMENT'],
    ['somebody who is in no department', { departmentId: null }, 'OUTSIDE_DEPARTMENT'],
    ['a person who left', { active: false }, 'NOT_ACTIVE'],
    ['a person with no work email', { workEmail: null }, 'EMAIL_REQUIRED'],
    ['an intern with no day the access ends', { employmentType: 'INTERN' }, 'END_DATE_REQUIRED'],
    [
      'an end before the access can begin',
      { employmentType: 'CONTRACTOR', expectedEndDate: '2026-10-01' },
      'END_DATE_TOO_EARLY',
    ],
    ['a person who already holds the plan', { holdsAccess: true }, 'HAS_ACCESS'],
    ['a person with a request for the plan open', { hasOpenRequest: true }, 'HAS_OPEN_REQUEST'],
  ] as const)('refuses %s', (_name, change, reason) => {
    expect(check([person({ employeeId: 'x', ...change })])).toEqual([{ employeeId: 'x', reason }]);
  });

  it('takes an intern who has a day of their own that is not before today', () => {
    expect(check([person({ employmentType: 'INTERN', expectedEndDate: '2026-12-31' })])).toEqual([]);
  });

  it('gives the first reason of a person in the order a caller should learn it', () => {
    const many = person({ employeeId: 'x', departmentId: 'P-ENG', active: false, workEmail: null, holdsAccess: true });

    expect(check([many])).toEqual([{ employeeId: 'x', reason: 'OUTSIDE_DEPARTMENT' }]);
    expect(check([{ ...many, departmentId: 'P-DES' }])).toEqual([{ employeeId: 'x', reason: 'NOT_ACTIVE' }]);
    expect(check([{ ...many, departmentId: 'P-DES', active: true }])).toEqual([
      { employeeId: 'x', reason: 'EMAIL_REQUIRED' },
    ]);
    expect(check([{ ...many, departmentId: 'P-DES', active: true, workEmail: 'x@acme.vn' }])).toEqual([
      { employeeId: 'x', reason: 'HAS_ACCESS' },
    ]);
  });

  it('gathers the reasons of every person, not only the first person who fails', () => {
    const refused = check([
      person({ employeeId: 'a', departmentId: 'P-ENG' }),
      person({ employeeId: 'b' }),
      person({ employeeId: 'c', holdsAccess: true }),
      person({ employeeId: 'd', hasOpenRequest: true }),
    ]);

    expect(refused).toEqual([
      { employeeId: 'a', reason: 'OUTSIDE_DEPARTMENT' },
      { employeeId: 'c', reason: 'HAS_ACCESS' },
      { employeeId: 'd', reason: 'HAS_OPEN_REQUEST' },
    ]);
  });

  it("asks no email and no end day of the head in their own line, as it does of a head's own request", () => {
    const own = person({ isHeadOwnLine: true, workEmail: null, employmentType: 'INTERN' });

    expect(check([own])).toEqual([]);
    expect(check([{ ...own, active: false }])).toEqual([{ employeeId: 'e1', reason: 'NOT_ACTIVE' }]);
  });
});

describe('the confirmation of a long term', () => {
  const base = { senderIsHead: true, termMonths: 13, confirmed: false, longTermMonths: 12 };

  it('is asked of the head who sends a term over twelve months, in so many words', () => {
    expect(needsTermConfirmation(base)).toBe(true);
    expect(needsTermConfirmation({ ...base, confirmed: true })).toBe(false);
    expect(needsTermConfirmation({ ...base, termMonths: 12 })).toBe(false);
  });

  it('is left to the head who decides when an Employee sent it', () => {
    expect(needsTermConfirmation({ ...base, senderIsHead: false })).toBe(false);
  });
});
