import { postgresSessionOptions } from './prisma.service';

describe('postgresSessionOptions', () => {
  it('pins the time zone of a default session and leaves it writable', () => {
    expect(postgresSessionOptions(undefined)).toBe('-c TimeZone=UTC');
    expect(postgresSessionOptions({ readOnly: false })).toBe('-c TimeZone=UTC');
  });

  it('opens a read-only session for a read-only command graph', () => {
    expect(postgresSessionOptions({ readOnly: true })).toBe('-c TimeZone=UTC -c default_transaction_read_only=on');
  });
});
