import { isReservedCostCenterName } from './cost-center-name';
import { COST_CENTER_CODE_PATTERN } from './cost-center.types';

describe('cost center names (US-04-09 AC-4)', () => {
  it.each(['Chưa phân loại', '  chưa   PHÂN loại ', 'Chua phan loai', 'CHƯA PHÂN BỔ COST CENTER', 'Unclassified'])(
    'refuses %p, a place to gather people without a code',
    (name) => {
      expect(isReservedCostCenterName(name)).toBe(true);
    },
  );

  it.each(['Design', 'Chưa phân loại - Design', 'Phân loại', 'Operations'])('allows %p', (name) => {
    expect(isReservedCostCenterName(name)).toBe(false);
  });

  it.each(['CC-DES', 'cc.ops_1', 'A1'])('accepts the code %p', (code) => {
    expect(COST_CENTER_CODE_PATTERN.test(code)).toBe(true);
  });

  it.each(['-CC', ' CC', 'CC DES', 'CC/1', ''])('refuses the code %p', (code) => {
    expect(COST_CENTER_CODE_PATTERN.test(code)).toBe(false);
  });
});
