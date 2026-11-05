import { isHandoverDateValid, judgeHolder, normalizeAssetCode, validUntilOf } from './registry.policy';

describe('judgeHolder', () => {
  it('accepts a person who works or is on long leave', () => {
    expect(judgeHolder({ status: 'ACTIVE', workState: 'WORKING' })).toBe('OK');
    expect(judgeHolder({ status: 'ACTIVE', workState: 'ON_LONG_LEAVE' })).toBe('OK');
  });

  it('refuses a person who left, is handing over or was terminated, and one who does not exist', () => {
    expect(judgeHolder({ status: 'ACTIVE', workState: 'HANDING_OVER' })).toBe('NOT_WORKING');
    expect(judgeHolder({ status: 'ACTIVE', workState: 'LEFT' })).toBe('NOT_WORKING');
    expect(judgeHolder({ status: 'TERMINATED', workState: 'WORKING' })).toBe('NOT_WORKING');
    expect(judgeHolder(null)).toBe('NOT_FOUND');
  });
});

describe('isHandoverDateValid', () => {
  const base = { today: '2026-11-05', hireDate: '2026-01-10' };

  it('accepts the hire day, today and a day between', () => {
    expect(isHandoverDateValid({ ...base, handedOverOn: '2026-01-10' })).toBe(true);
    expect(isHandoverDateValid({ ...base, handedOverOn: '2026-11-05' })).toBe(true);
  });

  it('refuses tomorrow and the day before the hire date', () => {
    expect(isHandoverDateValid({ ...base, handedOverOn: '2026-11-06' })).toBe(false);
    expect(isHandoverDateValid({ ...base, handedOverOn: '2026-01-09' })).toBe(false);
  });
});

describe('normalizeAssetCode', () => {
  it('gives one key to codes that differ by case and blanks', () => {
    expect(normalizeAssetCode('  AS-0042 ')).toBe(normalizeAssetCode('as-0042'));
  });
});

describe('validUntilOf', () => {
  it('is the day the registration ended in the zone of the organization', () => {
    expect(validUntilOf('2026-11-01', new Date('2026-11-05T20:00:00.000Z'), 'Asia/Ho_Chi_Minh')).toBe('2026-11-06');
  });

  it('is never before the day it began', () => {
    expect(validUntilOf('2026-11-05', new Date('2026-11-05T01:00:00.000Z'), 'Asia/Ho_Chi_Minh')).toBe('2026-11-05');
    expect(validUntilOf('2026-11-07', new Date('2026-11-05T01:00:00.000Z'), 'Asia/Ho_Chi_Minh')).toBe('2026-11-07');
  });
});
