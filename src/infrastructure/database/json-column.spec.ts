import { z } from 'zod';
import { Prisma } from '../../generated/prisma/client';
import { JsonColumnShapeError } from './json-column.errors';
import { jsonColumn, nullableJsonColumn } from './json-column';

const schema = z.object({ name: z.string(), seats: z.number().int(), tags: z.array(z.enum(['A', 'B'])) });
const encode = (value: z.output<typeof schema>) => ({ name: value.name, seats: value.seats, tags: [...value.tags] });

const required = jsonColumn({ table: 'sample_things', column: 'payload', schema, encode });
const optional = nullableJsonColumn({ table: 'sample_things', column: 'detail', schema, encode });

const valid: z.output<typeof schema> = { name: 'ana@example.com', seats: 3, tags: ['A', 'B'] };

describe('jsonColumn (the codec of a JSON column that always has a value)', () => {
  it('reads a value of the right shape as the domain type', () => {
    expect(required.decode(valid)).toEqual(valid);
  });

  it('writes the JSON the encoder gives, and a value read back is the value written', () => {
    expect(required.encode(valid)).toEqual({ name: 'ana@example.com', seats: 3, tags: ['A', 'B'] });
    expect(required.decode(JSON.parse(JSON.stringify(required.encode(valid))))).toEqual(valid);
  });

  it.each([
    ['a missing field', { name: 'x', tags: [] }],
    ['a field of the wrong type', { ...valid, seats: '3' }],
    ['a value of a list that is not allowed', { ...valid, tags: ['C'] }],
    ['null', null],
    ['undefined', undefined],
    ['a string', 'ana@example.com'],
  ])('refuses %s with the table and the column, and never the value', (_label, value) => {
    const failure = (() => {
      try {
        required.decode(value);
      } catch (error) {
        return error;
      }
      return undefined;
    })();

    expect(failure).toBeInstanceOf(JsonColumnShapeError);
    expect(failure).toMatchObject({ table: 'sample_things', column: 'payload', name: 'JsonColumnShapeError' });
    expect((failure as Error).message).toContain('sample_things.payload');
    expect((failure as Error).message).not.toContain('ana@example.com');
  });

  it('names where in the value it went wrong and what kind of fault it is, without the faulty value', () => {
    const failure = (() => {
      try {
        required.decode({ name: 'ana@example.com', seats: 'many', tags: ['A', 'secret-tag'] });
      } catch (error) {
        return error as JsonColumnShapeError;
      }
      throw new Error('it should have thrown');
    })();

    expect(failure.issues).toEqual([
      { path: 'seats', code: 'invalid_type' },
      { path: 'tags.1', code: 'invalid_value' },
    ]);
    expect(failure.message).not.toContain('secret-tag');
    expect(failure.message).not.toContain('many');
  });

  it('shortens a long list of faults and a long key', () => {
    const issues = Array.from({ length: 8 }, (_, index) => ({ path: ['k'.repeat(100), index], code: 'invalid_type' }));
    const message = new JsonColumnShapeError('t', 'c', issues).message;

    expect(message).toContain('and 3 more');
    expect(message).not.toContain('k'.repeat(41));
  });
});

describe('nullableJsonColumn (the codec of a JSON column that may be NULL)', () => {
  it('reads NULL as null and a value of the right shape as the domain type', () => {
    expect(optional.decode(null)).toBeNull();
    expect(optional.decode(undefined)).toBeNull();
    expect(optional.decode(valid)).toEqual(valid);
  });

  it('writes null as the database NULL and a value as its JSON', () => {
    expect(optional.encode(null)).toBe(Prisma.DbNull);
    expect(optional.encode(valid)).toEqual({ name: 'ana@example.com', seats: 3, tags: ['A', 'B'] });
  });

  it('still refuses a value of the wrong shape', () => {
    expect(() => optional.decode({ name: 1 })).toThrow(JsonColumnShapeError);
    expect(() => optional.decode('text')).toThrow('sample_things.detail');
  });
});
