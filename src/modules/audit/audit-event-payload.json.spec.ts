import { Prisma } from '../../generated/prisma/client';
import { JsonColumnShapeError } from '../../infrastructure/database/json-column.errors';
import { auditEventAfterJson, auditEventBeforeJson } from './audit-event-payload.json';

const snapshot = {
  state: 'PENDING',
  amountMinor: '1200',
  approvers: ['e-1', 'e-2'],
  detail: { note: null, urgent: true },
};

describe.each([
  ['auditEventBeforeJson', auditEventBeforeJson, 'audit_events.before'],
  ['auditEventAfterJson', auditEventAfterJson, 'audit_events.after'],
])('%s (%s)', (_name, codec, where) => {
  it('reads a snapshot as an object of JSON values, nested as deep as it was written, and NULL as none', () => {
    expect(codec.decode(snapshot)).toEqual(snapshot);
    expect(codec.decode({})).toEqual({});
    expect(codec.decode(null)).toBeNull();
  });

  it.each([
    ['a list', ['PENDING']],
    ['a bare string', 'PENDING'],
    ['a number', 7],
    ['a value that is not JSON', { when: new Date() }],
  ])('refuses %s with the table and the column, and never the value', (_label, value) => {
    expect(() => codec.decode(value)).toThrow(JsonColumnShapeError);
    expect(() => codec.decode(value)).toThrow(where);
    expect(() => codec.decode(value)).not.toThrow(/PENDING/);
  });

  it('writes the snapshot as it has always been written: the object itself; none is the database NULL', () => {
    expect(codec.encode(snapshot)).toEqual({
      state: 'PENDING',
      amountMinor: '1200',
      approvers: ['e-1', 'e-2'],
      detail: { note: null, urgent: true },
    });
    expect(codec.encode(null)).toBe(Prisma.DbNull);
  });
});
