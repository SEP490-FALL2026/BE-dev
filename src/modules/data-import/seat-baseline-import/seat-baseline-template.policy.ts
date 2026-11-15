import type { ImportTemplateDefinition } from '../../policies/public/policies.types';

/**
 * What the template of the seat baseline file says (`QĐ-111as`, `US-02-05`): who holds a seat of the plan, from when and until when. It lists
 * the columns of `seat-baseline-import.types.ts`. The example people and accounts are fictitious.
 */
export const SEAT_BASELINE_TEMPLATE: ImportTemplateDefinition = {
  kind: 'seat-baseline',
  formats: ['csv'],
  title: 'Hiện trạng ai đang giữ seat của một gói',
  columns: [
    {
      key: 'employee_code',
      description: 'Mã nhân viên đang giữ seat.',
      required: true,
      format: 'Mã đã có trong hệ thống',
      example: 'NV0101',
      constraint: 'Nhân viên phải tồn tại và đang làm việc.',
    },
    {
      key: 'account_identifier',
      description:
        'Tài khoản của nhân viên ở nhà cung cấp: email công ty hoặc tên đăng nhập. Không bao giờ là mật khẩu hay khóa.',
      required: true,
      format: 'Email hoặc tên đăng nhập',
      example: 'minh.anh@congty.example',
      constraint: 'Mỗi tài khoản một seat; chuỗi giống mật khẩu hoặc khóa bị che và dòng bị từ chối.',
    },
    {
      key: 'kind',
      description: 'Kiểu quyền. Để trống thì hiểu là quyền cá nhân (PERSONAL).',
      required: false,
      format: 'PERSONAL',
      example: 'PERSONAL',
      constraint: 'Tài khoản dùng chung không được hỗ trợ.',
    },
    {
      key: 'granted_on',
      description: 'Ngày seat bắt đầu có hiệu lực.',
      required: false,
      format: 'YYYY-MM-DD',
      example: '2025-03-10',
      constraint: 'Không trước ngày vào làm; để trống thì lấy ngày ghi nhận.',
    },
    {
      key: 'expected_end_date',
      description: 'Ngày dự kiến kết thúc, chỉ cho nhân sự có thời hạn.',
      required: false,
      format: 'YYYY-MM-DD',
      example: '',
      constraint: 'Sau ngày bắt đầu; nhà thầu, freelancer và thực tập phải có.',
    },
  ],
  sampleRows: [
    ['NV0101', 'minh.anh@congty.example', 'PERSONAL', '2025-03-10', ''],
    ['NV0102', 'quoc.bao@congty.example', 'PERSONAL', '2024-09-20', ''],
  ],
  notes: [
    'Tối đa 1.000 dòng một file.',
    'Số seat đã giữ không vượt số đã mua của thuê bao; dòng làm vượt sẽ bị từ chối trong bản xem trước.',
    'Các dòng ví dụ là người giả; xóa chúng trước khi nhập hiện trạng thật.',
  ],
};
