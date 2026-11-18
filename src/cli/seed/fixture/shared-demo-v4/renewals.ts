import type { DemoRenewal } from '../demo-fixture.types';

export const RENEWALS: DemoRenewal[] = [
  {
    subscription: 'adobe-cc-teams',
    by: 'NV-ITA2',
    outcome: 'AS_DECIDED',
    nextPeriod: true,
    outcomeNote: '[SV-SBF20-ADOBE] Nhà cung cấp xác nhận số ghế cho kỳ năm tiếp theo theo nhu cầu đã rà soát.',
  },
  {
    subscription: 'zoom-pro',
    by: 'NV-ITA2',
    outcome: 'VENDOR_REFUSED',
    nextPeriod: false,
    outcomeNote: '[SV-SBF20-ZOOM] Nhà cung cấp chưa chấp thuận điều chỉnh; IT cần tiếp tục làm việc và báo Finance.',
  },
];
