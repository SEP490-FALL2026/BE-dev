import { z } from 'zod';
import { isBusinessDate } from '../../../core/business-date';
import { businessDate, businessDateSchema, businessDay, responseBusinessDate } from './business-date.dto';

/** What every DTO wrote by hand before the shared schema: the same string, the same refine, the same message. */
const handWritten = (message: string) => z.string().refine(isBusinessDate, { message });

const issuesOf = (schema: z.ZodType, value: unknown) => {
  const result = schema.safeParse(value);

  return result.success ? 'ok' : result.error.issues.map(({ code, message, path }) => ({ code, message, path }));
};

describe('the business date of a request: a calendar date as YYYY-MM-DD that exists', () => {
  it.each(['2028-02-29', '2000-02-29', '0000-01-01', '9999-12-31', '2026-12-31', '2026-01-01'])(
    'accepts %s',
    (value) => {
      expect(businessDate.safeParse(value).success).toBe(true);
    },
  );

  it.each([
    '2100-02-29',
    '1900-02-29',
    '2026-02-30',
    '2026-13-01',
    '2026-00-10',
    '2026-04-31',
    '2026-2-3',
    ' 2026-11-02',
    '2026-11-02 ',
    '2026-11-02T00:00:00Z',
    '02/11/2026',
    '',
  ])('refuses %j', (value) => {
    expect(businessDate.safeParse(value).success).toBe(false);
  });

  it('refuses what is not a string, with the issue of a string and not of a date', () => {
    expect(issuesOf(businessDate, 20261102)).toEqual([expect.objectContaining({ code: 'invalid_type', path: [] })]);
  });

  it.each([
    ['the shared date', businessDate, 'Must be a real date as YYYY-MM-DD.'],
    ['the day of a personnel event', businessDay, 'The day must be a real date as YYYY-MM-DD.'],
    [
      'a date with its own message',
      businessDateSchema('issuedOn must be a real date as YYYY-MM-DD.'),
      'issuedOn must be a real date as YYYY-MM-DD.',
    ],
  ])('answers %s with the same issue as the hand-written refine: code, message and path', (_name, schema, message) => {
    for (const value of ['2026-02-30', '', 'tomorrow']) {
      expect(issuesOf(schema, value)).toEqual(issuesOf(handWritten(message), value));
    }
    expect(issuesOf(schema, '2026-02-30')).toEqual([{ code: 'custom', message, path: [] }]);
  });

  it('keeps the path of the field when it sits in an object or an array, as the hand-written refine did', () => {
    const shape = (date: z.ZodType) => z.strictObject({ lines: z.array(z.strictObject({ on: date.optional() })) });
    const value = { lines: [{ on: '2026-02-30' }] };

    expect(issuesOf(shape(businessDate), value)).toEqual(
      issuesOf(shape(handWritten('Must be a real date as YYYY-MM-DD.')), value),
    );
  });

  it('says in the document that it is a calendar date, as `format: date`, and that it must exist', () => {
    const rendered = z.toJSONSchema(businessDate, { target: 'openapi-3.0', io: 'input', unrepresentable: 'any' });

    expect(rendered).toMatchObject({ type: 'string', format: 'date' });
    expect(rendered.description).toMatch(/calendar date/);
    expect(rendered.description).toMatch(/2026-02-30/);
    expect(rendered.pattern).toBeUndefined();
  });

  it('keeps `format: date` when the field is optional, nullable or inside an array', () => {
    const rendered = z.toJSONSchema(
      z.strictObject({
        a: businessDate.optional(),
        b: businessDate.nullable().optional(),
        c: z.array(businessDate).max(3),
      }),
      { target: 'openapi-3.0', io: 'input', unrepresentable: 'any' },
    );
    const properties = rendered.properties as Record<string, { format?: string; items?: { format?: string } }>;

    expect(properties.a.format).toBe('date');
    expect(properties.b.format).toBe('date');
    expect(properties.c.items?.format).toBe('date');
  });

  it('words the date of a response for the reader of the answer: the same rule and `format: date`, no instruction to a sender', () => {
    const rendered = z.toJSONSchema(responseBusinessDate, {
      target: 'openapi-3.0',
      io: 'input',
      unrepresentable: 'any',
    });

    expect(rendered).toMatchObject({ type: 'string', format: 'date', description: 'A calendar date as YYYY-MM-DD.' });
    expect(rendered.description).not.toMatch(/must exist|refused/);
    for (const value of ['2026-02-30', '2026-13-01', '', 'tomorrow', '2028-02-29']) {
      expect(issuesOf(responseBusinessDate, value)).toEqual(issuesOf(businessDate, value));
    }
  });

  it('writes no internal code in the description a client reads', () => {
    const description = z.toJSONSchema(businessDate, { target: 'openapi-3.0', io: 'input' }).description ?? '';

    expect(description).not.toMatch(/\b(?:US|AC|FR|OQ|R|N|T)-\d|QĐ-|⟹/);
  });

  describe('agrees with the date of Zod itself on every day it can tell apart (a bounded sweep)', () => {
    const iso = z.iso.date();
    const years = new Set<number>();
    for (let year = 0; year <= 9999; year += 100) {
      for (const near of [-1, 0, 1]) if (year + near >= 0 && year + near <= 9999) years.add(year + near);
    }
    for (let year = 1890; year <= 2110; year += 1) years.add(year);
    for (const year of [0, 4, 96, 400, 1600, 2000, 2400, 9996, 9999]) years.add(year);

    it('has leap centuries, ordinary centuries, the first and last year and the years around today in the sweep', () => {
      expect(years.has(0) && years.has(1900) && years.has(2000) && years.has(2100) && years.has(9999)).toBe(true);
      expect(years.size).toBeGreaterThan(300);
    });

    it('accepts and refuses the same strings: every month 00-13 and day 00-32 of each year of the sweep', () => {
      const differences: string[] = [];
      for (const year of years) {
        for (let month = 0; month <= 13; month += 1) {
          for (let day = 0; day <= 32; day += 1) {
            const text = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            if (businessDate.safeParse(text).success !== iso.safeParse(text).success) differences.push(text);
          }
        }
      }

      expect(differences).toEqual([]);
    });
  });
});
