import type { DemoDevice, DemoMonitoringNotice } from '../demo-fixture.types';

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

export const DEVICES: DemoDevice[] = [
  { assetCode: 'SV-LT-001', holder: 'NV-DEV5', signature: true, acknowledge: true },
  { assetCode: 'SV-LT-002', holder: 'NV-ITO1', signature: true, acknowledge: true },
  { assetCode: 'SV-LT-003', holder: 'NV-BOD1', signature: true, acknowledge: true },
  { assetCode: 'SV-LT-004', holder: 'NV-BOD4', signature: true, acknowledge: true },
  { assetCode: 'SV-LT-005', holder: 'NV-FIN2', signature: true, acknowledge: false },
  { assetCode: 'SV-LT-006', holder: 'NV-ITO2', signature: false, acknowledge: false, changeTo: 'NV-ITOH' },
  { assetCode: 'SV-LT-007', holder: 'NV-DEV6', signature: false, acknowledge: false, retire: true },
];
