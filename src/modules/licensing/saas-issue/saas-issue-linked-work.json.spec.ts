import { Prisma } from '../../../generated/prisma/client';
import { JsonColumnShapeError } from '../../../infrastructure/database/json-column.errors';
import { linkedWorkJson } from './saas-issue-linked-work.json';

describe('linkedWorkJson (saas_issues.linked_work)', () => {
  it('reads the pointers a report keeps, some or none of them, and NULL as no pointer', () => {
    expect(linkedWorkJson.decode({ grantTaskId: 't-1', requestId: 'r-1' })).toEqual({
      grantTaskId: 't-1',
      requestId: 'r-1',
    });
    expect(linkedWorkJson.decode({})).toEqual({});
    expect(linkedWorkJson.decode(null)).toBeNull();
  });

  it.each([
    ['a pointer that is a number', { grantTaskId: 7 }],
    ['a list', ['t-1']],
    ['a bare string', 't-1'],
  ])('refuses %s with the table and the column, and never the value', (_label, value) => {
    expect(() => linkedWorkJson.decode(value)).toThrow(JsonColumnShapeError);
    expect(() => linkedWorkJson.decode(value)).toThrow('saas_issues.linked_work');
    expect(() => linkedWorkJson.decode(value)).not.toThrow(/t-1/);
  });

  it('writes the pointers as they have always been written: a copy of the object; none is the database NULL', () => {
    const work = { discrepancyId: 'd-1', returnId: 'x-1' };

    expect(linkedWorkJson.encode(work)).toEqual({ discrepancyId: 'd-1', returnId: 'x-1' });
    expect(linkedWorkJson.encode(work)).not.toBe(work);
    expect(linkedWorkJson.encode(null)).toBe(Prisma.DbNull);
  });
});
