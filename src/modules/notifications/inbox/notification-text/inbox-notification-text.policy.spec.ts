import {
  nameLookupKey,
  nameRefsOfTemplate,
  renderTemplate,
  TEMPLATE_FORMATS,
  templateSyntaxIssues,
  templateVariables,
  type RenderContext,
} from './inbox-notification-text.policy';
import { NAME_FALLBACK, NAME_KIND_BY_KEY, type NotificationLocale } from './notification-text.types';

const UUID = '00000000-0000-4000-8000-000000000001';
const FORBIDDEN = ['{', '}', '[', ']', 'undefined', 'null', 'NaN', '[object'];

function ctx(
  locale: NotificationLocale,
  params: Record<string, unknown> = {},
  extra: Partial<Pick<RenderContext, 'names' | 'labelOf'>> = {},
): RenderContext {
  return { params, locale, names: new Map(), labelOf: () => undefined, ...extra };
}

function render(
  template: Parameters<typeof renderTemplate>[0],
  locale: NotificationLocale,
  params: Record<string, unknown> = {},
) {
  return renderTemplate(template, ctx(locale, params));
}

function expectClean(text: string): void {
  for (const bad of FORBIDDEN) expect(text).not.toContain(bad);
}

describe('renderTemplate: plain text and {key}', () => {
  it('returns a plain sentence unchanged', () => {
    expect(render('Nhu cầu đã được duyệt', 'vi')).toBe('Nhu cầu đã được duyệt');
  });

  it('prints strings, numbers and booleans raw', () => {
    expect(render('{a} {b} {c} {d}', 'vi', { a: 'X', b: 3, c: true, d: false })).toBe('X 3 true false');
  });

  it('prints a missing, null or empty variable as nothing, and never throws on empty params', () => {
    expect(render('Có {a} và {b} và {c}.', 'en', { a: null, c: '' })).toBe('Có và và .');
    expect(render('{a}{b}', 'vi', {})).toBe('');
  });

  it('prints a non-finite number or an object as nothing, an array as its joined items', () => {
    expect(render('{a}|{b}|{c}|{d}', 'vi', { a: NaN, b: Infinity, c: { x: 1 }, d: ['A', 'B'] })).toBe('|||A,B');
  });

  it('collapses the double space left by an empty variable and trims the ends', () => {
    expect(render('Yêu cầu {a} đã duyệt', 'vi', {})).toBe('Yêu cầu đã duyệt');
    expect(render(' {a} Xong ', 'vi', {})).toBe('Xong');
  });

  it('leaves a literal brace that is not a variable as text', () => {
    expect(render('a { b } c {1x} {a:} {}', 'vi', { a: 'X' })).toBe('a { b } c {1x} {a:} {}');
  });
});

describe('renderTemplate: {key:date}', () => {
  const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  it.each(MONTHS_EN.map((name, i) => [i + 1, name] as const))('formats month %i in both locales', (month, name) => {
    const mm = String(month).padStart(2, '0');
    expect(render('{d:date}', 'vi', { d: `2026-${mm}-05` })).toBe(`05/${mm}/2026`);
    expect(render('{d:date}', 'en', { d: `2026-${mm}-05` })).toBe(`05 ${name} 2026`);
  });

  it('keeps the two-digit day and accepts a leap day', () => {
    expect(render('{d:date}', 'vi', { d: '2028-02-29' })).toBe('29/02/2028');
    expect(render('{d:date}', 'en', { d: '2026-12-01' })).toBe('01 Dec 2026');
  });

  it.each([
    '2026-13-01',
    '2026-02-30',
    '2027-02-29',
    '2026-00-10',
    '2026-01-00',
    '2026-1-2',
    '01/12/2026',
    '2026-12-01T10:00:00Z',
    'abc',
  ])('returns the raw value for the malformed date %s', (value) => {
    expect(render('{d:date}', 'vi', { d: value })).toBe(value);
    expect(render('{d:date}', 'en', { d: value })).toBe(value);
  });

  it('prints nothing for an absent date', () => {
    expect(render('Đến {d:date}.', 'vi', {})).toBe('Đến .');
  });
});

describe('renderTemplate: {key:vnd}', () => {
  it('groups an integer string by thousands per locale', () => {
    expect(render('{m:vnd}', 'vi', { m: '29000000' })).toBe('29.000.000 ₫');
    expect(render('{m:vnd}', 'en', { m: '29000000' })).toBe('29,000,000 VND');
  });

  it('handles small, zero, padded, negative and number inputs', () => {
    expect(render('{m:vnd}', 'vi', { m: '0' })).toBe('0 ₫');
    expect(render('{m:vnd}', 'vi', { m: '999' })).toBe('999 ₫');
    expect(render('{m:vnd}', 'vi', { m: '1000' })).toBe('1.000 ₫');
    expect(render('{m:vnd}', 'en', { m: '0012345' })).toBe('12,345 VND');
    expect(render('{m:vnd}', 'en', { m: '-1500' })).toBe('-1,500 VND');
    expect(render('{m:vnd}', 'vi', { m: 1500000 })).toBe('1.500.000 ₫');
  });

  it('keeps an integer larger than a double exact', () => {
    expect(render('{m:vnd}', 'en', { m: '12345678901234567890' })).toBe('12,345,678,901,234,567,890 VND');
  });

  it.each(['12.5', '1e6', 'abc', '1 000', '', '+5'])('returns the raw value for the malformed amount "%s"', (value) => {
    expect(render('{m:vnd}', 'vi', { m: value })).toBe(value);
  });
});

describe('renderTemplate: {key:quarter}', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])('maps month %i to its quarter', (month) => {
    const n = Math.ceil(month / 3);
    expect(render('{month:quarter}', 'vi', { month })).toBe(`quý ${n}`);
    expect(render('{month:quarter}', 'en', { month: String(month) })).toBe(`Q${n}`);
  });

  it.each(['0', '13', '-1', '1.5', 'abc', '100'])('returns the raw value for the invalid month "%s"', (value) => {
    expect(render('{month:quarter}', 'vi', { month: value })).toBe(value);
  });

  it('reads as a phrase inside a sentence', () => {
    expect(render('Đề xuất {month:quarter} năm {year}.', 'vi', { month: 5, year: 2027 })).toBe(
      'Đề xuất quý 2 năm 2027.',
    );
    expect(render('The {month:quarter} {year} proposal.', 'en', { month: 5, year: 2027 })).toBe(
      'The Q2 2027 proposal.',
    );
  });
});

describe('renderTemplate: {key:enum} and {key:list}', () => {
  const labelOf = (key: string, value: string) =>
    ({ by: { NEED: 'duyệt nhu cầu', SPEND: 'duyệt chi' } })[key as 'by']?.[value as 'NEED'];

  it('prints the label when there is one and the raw value when there is not', () => {
    expect(renderTemplate('Ở bước {by:enum}.', ctx('vi', { by: 'NEED' }, { labelOf }))).toBe('Ở bước duyệt nhu cầu.');
    expect(renderTemplate('Ở bước {by:enum}.', ctx('vi', { by: 'STRANGE' }, { labelOf }))).toBe('Ở bước STRANGE.');
    expect(renderTemplate('Ở bước {other:enum}.', ctx('vi', { other: 'NEED' }, { labelOf }))).toBe('Ở bước NEED.');
    expect(renderTemplate('Ở bước {by:enum}.', ctx('vi', {}, { labelOf }))).toBe('Ở bước .');
  });

  it('passes the key and the raw value to labelOf', () => {
    const labelOfSpy = jest.fn().mockReturnValue('X');
    renderTemplate('{kind:enum}', ctx('en', { kind: 'A' }, { labelOf: labelOfSpy }));
    expect(labelOfSpy).toHaveBeenCalledWith('kind', 'A');
  });

  it('splits a list on commas, trims, labels each item and joins with ", "', () => {
    expect(renderTemplate('{by:list}', ctx('vi', { by: 'NEED, SPEND ,NEW' }, { labelOf }))).toBe(
      'duyệt nhu cầu, duyệt chi, NEW',
    );
  });

  it('accepts an array and drops empty items', () => {
    expect(renderTemplate('{by:list}', ctx('vi', { by: ['NEED', 'SPEND'] }, { labelOf }))).toBe(
      'duyệt nhu cầu, duyệt chi',
    );
    expect(renderTemplate('{by:list}', ctx('vi', { by: 'NEED,,  ,SPEND,' }, { labelOf }))).toBe(
      'duyệt nhu cầu, duyệt chi',
    );
  });

  it('prints nothing for an empty or absent list', () => {
    expect(render('Có: {l:list}.', 'vi', { l: '' })).toBe('Có: .');
    expect(render('Có: {l:list}.', 'vi', {})).toBe('Có: .');
    expect(render('Có: {l:list}.', 'vi', { l: [] })).toBe('Có: .');
  });
});

describe('renderTemplate: {key:name}', () => {
  const names = new Map([
    [nameLookupKey('REQUEST', UUID), 'Figma – Team'],
    [nameLookupKey('EMPLOYEE', UUID), 'Nguyễn Văn A'],
  ]);

  it('prints the name found for the kind of the key', () => {
    expect(
      renderTemplate(
        'Yêu cầu {requestId:name} của {employeeId:name}.',
        ctx('vi', { requestId: UUID, employeeId: UUID }, { names }),
      ),
    ).toBe('Yêu cầu Figma – Team của Nguyễn Văn A.');
  });

  it('looks a name up by the kind of the key, not by the id alone', () => {
    expect(renderTemplate('{departmentId:name}', ctx('en', { departmentId: UUID }, { names }))).toBe('(unnamed)');
  });

  it.each(Object.entries(NAME_KIND_BY_KEY))(
    'falls back to the generic phrase of %s (%s) in both locales',
    (key, kind) => {
      expect(renderTemplate(`{${key}:name}`, ctx('vi', { [key]: UUID }))).toBe(NAME_FALLBACK[kind].vi);
      expect(renderTemplate(`{${key}:name}`, ctx('en', { [key]: UUID }))).toBe(NAME_FALLBACK[kind].en);
    },
  );

  it('prints nothing when the id itself is absent, null or empty (an old row)', () => {
    expect(render('Yêu cầu {requestId:name} xong.', 'vi', {})).toBe('Yêu cầu xong.');
    expect(render('Request {requestId:name} done.', 'en', { requestId: null })).toBe('Request done.');
    expect(render('Request {requestId:name} done.', 'en', { requestId: '' })).toBe('Request done.');
  });

  it('never prints a raw id: a key with no known kind prints nothing', () => {
    expect(render('Gói {returnRequestId:name} xong.', 'vi', { returnRequestId: UUID })).toBe('Gói xong.');
  });

  it('uses a custom nameKindOf when given', () => {
    const custom = { ...ctx('vi', { whatever: UUID }, { names }), nameKindOf: () => 'EMPLOYEE' as const };
    expect(renderTemplate('{whatever:name}', custom)).toBe('Nguyễn Văn A');
  });
});

describe('renderTemplate: [ optional groups ]', () => {
  const TEMPLATE = 'Bị từ chối.[ Lý do: {reason}.][ Gói thay thế: {suggestedPlanId:name}.]';

  it('shows a group when every variable inside has a value', () => {
    const names = new Map([[nameLookupKey('PLAN', UUID), 'Figma – Pro']]);
    expect(renderTemplate(TEMPLATE, ctx('vi', { reason: 'Hết ngân sách', suggestedPlanId: UUID }, { names }))).toBe(
      'Bị từ chối. Lý do: Hết ngân sách. Gói thay thế: Figma – Pro.',
    );
  });

  it('hides a group for a null, absent or empty variable and leaves no stray space', () => {
    expect(render(TEMPLATE, 'vi', { reason: null, suggestedPlanId: null })).toBe('Bị từ chối.');
    expect(render(TEMPLATE, 'vi', {})).toBe('Bị từ chối.');
    expect(render(TEMPLATE, 'vi', { reason: '', suggestedPlanId: UUID })).toMatch(/^Bị từ chối\. Gói thay thế: \(.+/);
  });

  it('needs every variable inside a group, not just one', () => {
    expect(render('Xong.[ Từ {a} đến {b}.]', 'vi', { a: 'X' })).toBe('Xong.');
    expect(render('Xong.[ Từ {a} đến {b}.]', 'vi', { a: 'X', b: 'Y' })).toBe('Xong. Từ X đến Y.');
  });

  it('counts false as present', () => {
    expect(render('Xong.[ Cờ {f}.]', 'vi', { f: false })).toBe('Xong. Cờ false.');
  });

  it('shows a group that holds no variable', () => {
    expect(render('Xong.[ Hết.]', 'vi', {})).toBe('Xong. Hết.');
  });

  it('keeps an id-backed name visible when the name is unknown', () => {
    expect(render('Xong.[ Gói {planId:name}.]', 'vi', { planId: UUID })).toBe('Xong. Gói (không rõ tên).');
  });

  it('treats nested, stray or unclosed brackets as literal text without throwing', () => {
    expect(render('a [b [c] d] e', 'vi')).toBe('a b [c d] e');
    expect(render('a ] b', 'vi')).toBe('a ] b');
    expect(render('a [b {x}', 'vi', { x: 1 })).toBe('a [b 1');
  });
});

describe('renderTemplate: variants', () => {
  const variant = {
    by: 'audience',
    cases: { SUPER_ADMIN: 'Cho Super Admin: {employeeId:name}.', IT_ADMIN: 'Cho IT: {employeeId:name}.' },
    otherwise: 'Cho bạn: {employeeId:name}.',
  };
  const names = new Map([[nameLookupKey('EMPLOYEE', UUID), 'A']]);

  it('picks the case matching the param', () => {
    expect(renderTemplate(variant, ctx('vi', { audience: 'IT_ADMIN', employeeId: UUID }, { names }))).toBe(
      'Cho IT: A.',
    );
    expect(renderTemplate(variant, ctx('vi', { audience: 'SUPER_ADMIN', employeeId: UUID }, { names }))).toBe(
      'Cho Super Admin: A.',
    );
  });

  it('uses otherwise for a missing, null or unknown value', () => {
    expect(renderTemplate(variant, ctx('vi', { employeeId: UUID }, { names }))).toBe('Cho bạn: A.');
    expect(renderTemplate(variant, ctx('vi', { audience: null, employeeId: UUID }, { names }))).toBe('Cho bạn: A.');
    expect(renderTemplate(variant, ctx('vi', { audience: 'OTHER', employeeId: UUID }, { names }))).toBe('Cho bạn: A.');
  });

  it('does not read inherited object keys as cases', () => {
    expect(renderTemplate(variant, ctx('vi', { audience: 'constructor', employeeId: UUID }, { names }))).toBe(
      'Cho bạn: A.',
    );
    expect(renderTemplate(variant, ctx('vi', { audience: '__proto__', employeeId: UUID }, { names }))).toBe(
      'Cho bạn: A.',
    );
  });

  it('compares booleans and numbers as strings', () => {
    const boolVariant = {
      by: 'requiresReacknowledgement',
      cases: { true: 'phải xác nhận lại', false: 'không cần xác nhận lại' },
      otherwise: 'x',
    };
    expect(render(boolVariant, 'vi', { requiresReacknowledgement: true })).toBe('phải xác nhận lại');
    expect(render(boolVariant, 'vi', { requiresReacknowledgement: false })).toBe('không cần xác nhận lại');
    expect(render(boolVariant, 'vi', { requiresReacknowledgement: 'true' })).toBe('phải xác nhận lại');
    expect(render({ by: 'n', cases: { '3': 'ba' }, otherwise: 'khác' }, 'vi', { n: 3 })).toBe('ba');
  });

  it('renders formatters and groups inside the chosen case', () => {
    const t = { by: 'kind', cases: { A: 'Từ {d:date}.[ Lý do: {reason}.]' }, otherwise: 'Không.' };
    expect(render(t, 'vi', { kind: 'A', d: '2026-01-02' })).toBe('Từ 02/01/2026.');
    expect(render(t, 'en', { kind: 'A', d: '2026-01-02', reason: 'R' })).toBe('Từ 02 Jan 2026. Lý do: R.');
  });
});

describe('renderTemplate: edge cases never leak syntax or placeholders', () => {
  const messy = [
    'Yêu cầu {requestId:name} ({d:date}) {m:vnd} {q:quarter} {e:enum} {l:list} {x}[ Lý do: {reason}.]',
    { by: 'v', cases: { A: '{requestId:name} [ {reason}]' }, otherwise: '{requestId:name} {d:date}' },
  ] as const;

  it.each([
    ['empty params', {}],
    ['null params', { requestId: null, d: null, m: null, q: null, e: null, l: null, x: null, reason: null, v: null }],
    ['empty strings', { requestId: '', d: '', m: '', q: '', e: '', l: '', x: '', reason: '', v: '' }],
    ['garbage values', { requestId: 'zz', d: 'zz', m: 'zz', q: 'zz', e: 'zz', l: 'zz', x: 'zz', reason: 'zz', v: 'A' }],
  ])('%s', (_label, params) => {
    for (const locale of ['vi', 'en'] as const) {
      for (const template of messy) {
        expect(() => render(template, locale, params)).not.toThrow();
        const out = render(template, locale, params);
        expectClean(out);
      }
    }
  });

  it('keeps an unknown formatter as the raw value', () => {
    expect(render('{a:mb}', 'vi', { a: 5 })).toBe('5');
    expect(render('{a:mb}', 'vi', {})).toBe('');
  });
});

describe('template analysis', () => {
  it('lists the variables of a string with their formatter and whether they sit in a group', () => {
    expect(templateVariables('A {a} {b:date}.[ Lý do {c:enum}.]')).toEqual([
      { key: 'a', format: undefined, optional: false },
      { key: 'b', format: 'date', optional: false },
      { key: 'c', format: 'enum', optional: true },
    ]);
  });

  it('lists the variables of every branch of a variant (not its "by" key)', () => {
    const t = { by: 'audience', cases: { X: '{a:name}', Y: '{b:list}' }, otherwise: '{c}' };
    expect(templateVariables(t).map((v) => v.key)).toEqual(['a', 'b', 'c']);
  });

  it('reports no issue for a well-formed template and one for each broken construct', () => {
    expect(templateSyntaxIssues('Xong {a:name}.[ Vì {b}.]')).toEqual([]);
    expect(templateSyntaxIssues('a [ b [ c ] ]')).toHaveLength(2);
    expect(templateSyntaxIssues('a ] b')).toHaveLength(1);
    expect(templateSyntaxIssues('a [ b')).toHaveLength(1);
    expect(templateSyntaxIssues('a { b } c')).toHaveLength(1);
    expect(templateSyntaxIssues('{a:mb}')).toHaveLength(1);
    expect(templateSyntaxIssues({ by: 'k', cases: { A: 'ok', B: '[ {x}' }, otherwise: 'ok' })).toHaveLength(1);
  });

  it('exposes exactly the formatters the renderer implements', () => {
    expect([...TEMPLATE_FORMATS].sort()).toEqual(['date', 'enum', 'list', 'name', 'quarter', 'vnd']);
  });

  it('collects the {kind,id} pairs a template needs, only from the branch and the groups that will show', () => {
    const t = {
      by: 'audience',
      cases: { SUPER_ADMIN: '{employeeId:name} và {planId:name}', IT_ADMIN: '{departmentId:name}' },
      otherwise: '{employeeId:name}[ gói {suggestedPlanId:name}]',
    };
    expect(
      nameRefsOfTemplate(t, { audience: 'SUPER_ADMIN', employeeId: 'e1', planId: 'p1', departmentId: 'd1' }),
    ).toEqual([
      { kind: 'EMPLOYEE', id: 'e1' },
      { kind: 'PLAN', id: 'p1' },
    ]);
    expect(nameRefsOfTemplate(t, { audience: 'X', employeeId: 'e1', suggestedPlanId: 'p2' })).toEqual([
      { kind: 'EMPLOYEE', id: 'e1' },
      { kind: 'PLAN', id: 'p2' },
    ]);
    expect(nameRefsOfTemplate(t, { audience: 'X', employeeId: 'e1', suggestedPlanId: null })).toEqual([
      { kind: 'EMPLOYEE', id: 'e1' },
    ]);
  });

  it('skips absent ids and keys with no kind, and lists a repeated pair once', () => {
    expect(
      nameRefsOfTemplate('{requestId:name} {requestId:name} {employeeId:name} {returnRequestId:name} {x:name}', {
        requestId: 'r',
        returnRequestId: 'q',
        x: 'y',
      }),
    ).toEqual([{ kind: 'REQUEST', id: 'r' }]);
  });
});
