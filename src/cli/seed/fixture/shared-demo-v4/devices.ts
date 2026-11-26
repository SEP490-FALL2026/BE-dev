import type { DemoDepartmentSubstitute, DemoDevice, DemoMonitoringNotice, DemoNewDevice } from '../demo-fixture.types';

export const MONITORING_NOTICE: DemoMonitoringNotice = {
  collected:
    '[SV] Số lượt phản hồi, tổng token theo công cụ AI và ngày; trạng thái đăng nhập, hạn mức và cửa sổ sử dụng trên máy công ty.',
  notCollected:
    'Không thu nội dung prompt, câu trả lời, mã nguồn, mật khẩu, token đăng nhập hoặc lịch sử duyệt web cá nhân.',
  purpose: 'Đối soát mức sử dụng công cụ AI do công ty cấp và hỗ trợ phân bổ chi phí; dữ liệu demo được mô phỏng.',
  retention: 'Dữ liệu được lưu theo chính sách lưu giữ của công ty và chỉ người có quyền mới được xem.',
  stopRight: 'Người giữ máy có thể gửi yêu cầu dừng trong Thiết bị của tôi; IT Admin xử lý và xác nhận dừng thu thập.',
  includesToolStatus: true,
  requiresReacknowledgement: true,
};

/** What every old laptop is: the Windows that came with it, and (but the last, taken out of use) one activation of the Office key it already ran. */
const old = (
  n: number,
  rest: Omit<DemoDevice, 'assetCode' | 'deviceType' | 'serialNumber' | 'bundled'>,
): DemoDevice => ({
  assetCode: `SV-LT-00${n}`,
  deviceType: 'LAP',
  serialNumber: `SV-SN-LT-00${n}`,
  bundled: ['windows-11-pro-oem'],
  ...rest,
});

/**
 * The seven old machines, entered through the initial record before the seat baseline closes (W2-13): their holder, their bundled Windows and,
 * for six of them, the activation of the Office key they already ran. The last one is taken out of use.
 */
export const DEVICES: DemoDevice[] = [
  old(1, {
    holder: 'NV-DEV5',
    signature: true,
    acknowledge: true,
    tools: ['CLAUDE_CODE', 'CODEX'],
    initialKeyOf: 'office-home-business-2024',
  }),
  old(2, {
    holder: 'NV-ITO1',
    signature: true,
    acknowledge: true,
    tools: ['CLAUDE_CODE'],
    initialKeyOf: 'office-home-business-2024',
  }),
  old(3, {
    holder: 'NV-BOD1',
    signature: true,
    acknowledge: true,
    tools: ['CLAUDE_CODE', 'CODEX'],
    stop: 'COMPLETED',
    initialKeyOf: 'office-home-business-2024',
  }),
  old(4, {
    holder: 'NV-BOD4',
    signature: true,
    acknowledge: true,
    stop: 'OPEN',
    initialKeyOf: 'office-home-business-2024',
  }),
  old(5, { holder: 'NV-FIN2', signature: true, acknowledge: false, initialKeyOf: 'office-home-business-2024' }),
  old(6, {
    holder: 'NV-ITO2',
    signature: false,
    acknowledge: false,
    changeTo: 'NV-ITOH',
    initialKeyOf: 'office-home-business-2024',
  }),
  old(7, { holder: 'NV-DEV6', signature: false, acknowledge: false, retire: true }),
];

/**
 * The machines bought after the baseline (their code is given by the system: `LAP-26-0001` …): two wait in the stock, one of them running Office;
 * one is broken and still held; the last two are handed to the two people who leave, before the people move, so their records of departure
 * find an open registration and give a task of return (the IT Admin who leaves in three days: a task that waits; the one who is blocked now: a
 * machine awaiting its return).
 */
export const NEW_DEVICES: DemoNewDevice[] = [
  { hostname: 'SV-NEW-0001', serialNumber: 'SV-SN-NEW-0001', deviceType: 'LAP', bundled: ['windows-11-pro-oem'] },
  {
    hostname: 'SV-NEW-0002',
    serialNumber: 'SV-SN-NEW-0002',
    deviceType: 'LAP',
    bundled: ['windows-11-pro-oem'],
    keyOf: 'office-home-business-2024',
  },
  {
    hostname: 'SV-NEW-0003',
    serialNumber: 'SV-SN-NEW-0003',
    deviceType: 'LAP',
    bundled: ['windows-11-pro-oem'],
    holder: 'NV-DES1',
    keyOf: 'office-home-business-2024',
    condition: 'BROKEN',
  },
  {
    hostname: 'SV-NEW-0004',
    serialNumber: 'SV-SN-NEW-0004',
    deviceType: 'LAP',
    bundled: ['windows-11-pro-oem'],
    holder: 'NV-ITA4',
    keyOf: 'office-home-business-2024',
  },
  {
    hostname: 'SV-NEW-0005',
    serialNumber: 'SV-SN-NEW-0005',
    deviceType: 'LAP',
    bundled: ['windows-11-pro-oem'],
    holder: 'NV-OFF1',
    keyOf: 'office-home-business-2024',
  },
];

/** The department of the IT Admin who leaves is covered, from the day the Super Admin names someone, by another IT Admin (QĐ-118). */
export const DEPARTMENT_SUBSTITUTES: DemoDepartmentSubstitute[] = [
  {
    department: 'ITO',
    substitute: 'NV-ITA2',
    reason: '[SV] NV-ITA4 leaves in three days: NV-ITA2 stands in for the department while its work is handed over.',
  },
];
