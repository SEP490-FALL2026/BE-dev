import { canConcludeAbsence, detectableGroups, judgeTemplate, limitationOf } from './vendor-source.policy';
import type { SourceCapabilities, SourceTemplate } from './vendor-source.types';

const members: SourceCapabilities = { memberList: true, lastActivity: false, eventDetail: false, maxHistoryDays: null };
const lastActivity: SourceCapabilities = { ...members, lastActivity: true };
const events: SourceCapabilities = { ...lastActivity, eventDetail: true, maxHistoryDays: 90 };

const aggregate: SourceTemplate = { columns: { identifier: 'email', lastActivityDate: 'last' }, eventClasses: {} };
const eventTemplate: SourceTemplate = {
  columns: { identifier: 'email', date: 'day', eventType: 'event' },
  eventClasses: { open: 'VALUE' },
};

describe('FR-4.4 detectableGroups and limitation (US-08-01 AC-2)', () => {
  it('a source that only lists members detects G1 and G2 and says so', () => {
    expect(detectableGroups(members)).toEqual(['G1', 'G2']);
    expect(limitationOf(members, 'POSITIVE_ONLY')).toContain('chỉ cho biết ai là thành viên');
  });

  it('a source with the last activity or the detail of events detects G1 to G4', () => {
    expect(detectableGroups(lastActivity)).toEqual(['G1', 'G2', 'G3', 'G4']);
    expect(detectableGroups(events)).toEqual(['G1', 'G2', 'G3', 'G4']);
  });

  it('DA6-14: a source that tells only the positive, or only members, never concludes an absence', () => {
    expect(canConcludeAbsence('POSITIVE_ONLY', lastActivity)).toBe(false);
    expect(canConcludeAbsence('POSITIVE_AND_NEGATIVE', members)).toBe(false);
    expect(canConcludeAbsence('POSITIVE_AND_NEGATIVE', lastActivity)).toBe(true);
    expect(limitationOf(lastActivity, 'POSITIVE_ONLY')).toContain('không được hiểu là không dùng');
    expect(limitationOf(lastActivity, 'POSITIVE_AND_NEGATIVE')).toBeNull();
  });
});

describe('FR-4.2 judgeTemplate: the template fits the shape and the capabilities', () => {
  it('accepts an aggregated report with the last activity and an event report with its classes', () => {
    expect(judgeTemplate('AGGREGATE', aggregate, lastActivity)).toBeNull();
    expect(judgeTemplate('EVENT', eventTemplate, events)).toBeNull();
  });

  it('accepts a roster of members with no date column', () => {
    expect(judgeTemplate('AGGREGATE', { columns: { identifier: 'email' }, eventClasses: {} }, members)).toBeNull();
  });

  it('TEMPLATE_CAPABILITY_MISMATCH: a date column of a vendor that tells no dates, or a capability with no column for it', () => {
    expect(judgeTemplate('AGGREGATE', aggregate, members)).toBe('CAPABILITY_MISMATCH');
    expect(judgeTemplate('AGGREGATE', { columns: { identifier: 'email' }, eventClasses: {} }, lastActivity)).toBe(
      'AGGREGATE_NEEDS_DATE_COLUMN',
    );
    expect(judgeTemplate('AGGREGATE', aggregate, { ...lastActivity, eventDetail: true })).toBe('CAPABILITY_MISMATCH');
  });

  it('an event report needs a date, a type and the table that sorts the types', () => {
    expect(judgeTemplate('EVENT', { ...eventTemplate, eventClasses: {} }, events)).toBe('EVENT_NEEDS_CLASSES');
    expect(judgeTemplate('EVENT', aggregate, events)).toBe('EVENT_NEEDS_DATE_AND_TYPE');
  });

  it('refuses one column named twice', () => {
    expect(
      judgeTemplate(
        'AGGREGATE',
        { columns: { identifier: 'a', lastActivityDate: 'A' }, eventClasses: {} },
        lastActivity,
      ),
    ).toBe('COLUMN_USED_TWICE');
  });
});
