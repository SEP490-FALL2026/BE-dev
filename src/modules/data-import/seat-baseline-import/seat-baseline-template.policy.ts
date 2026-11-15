import type { ImportTemplateDefinition } from '../../policies/public/policies.types';

/**
 * What the template of the seat baseline file says (`QĐ-111as`, `US-02-05`): who holds a seat of the plan, from when and until when. It lists
 * the columns of `seat-baseline-import.types.ts` and, for each, the codes `seat-baseline-rows.policy.ts` answers with, so every code the parser can
 * give is said on the instruction sheet (the spec checks it). The example people and accounts are fictitious.
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
      constraint:
        'Nhân viên phải tồn tại và đang làm việc; với thuê bao dùng chung, phòng của nhân viên phải là phòng sở hữu thuê bao.',
      refusedWith: ['EMPLOYEE_NOT_FOUND', 'EMPLOYEE_NOT_ACTIVE', 'SUBSCRIPTION_DEPARTMENT_MISMATCH'],
    },
    {
      key: 'account_identifier',
      description:
        'Tài khoản của nhân viên ở nhà cung cấp: email công ty hoặc tên đăng nhập. Không bao giờ là mật khẩu hay khóa.',
      required: true,
      format: 'Email hoặc tên đăng nhập',
      example: 'minh.anh@congty.example',
      constraint:
        'Mỗi tài khoản một seat và là tài khoản công ty (tên miền công ty); không vượt số seat đã mua; không trùng thời gian với seat khác của người đó; chuỗi giống mật khẩu hoặc khóa bị che và dòng bị từ chối.',
      refusedWith: [
        'ACCOUNT_IDENTIFIER_MISSING',
        'ACCOUNT_IDENTIFIER_INVALID',
        'ACCOUNT_IDENTIFIER_LOOKS_LIKE_SECRET',
        'ACCOUNT_IDENTIFIER_IN_USE',
        'NOT_COMPANY_ACCOUNT',
        'SHARED_ACCOUNT_NOT_SUPPORTED',
        'OVERLAP',
        'SEAT_LIMIT_EXCEEDED',
      ],
    },
    {
      key: 'kind',
      description: 'Kiểu quyền. Để trống thì hiểu là quyền cá nhân (PERSONAL).',
      required: false,
      format: 'PERSONAL',
      example: 'PERSONAL',
      constraint: 'Tài khoản dùng chung và tài khoản dịch vụ không được hỗ trợ.',
      refusedWith: ['KIND_INVALID', 'SERVICE_ACCOUNT_NOT_SUPPORTED'],
    },
    {
      key: 'granted_on',
      description: 'Ngày seat bắt đầu có hiệu lực.',
      required: false,
      format: 'YYYY-MM-DD',
      example: '2025-03-10',
      constraint: 'Ngày có thật, không sau ngày ghi nhận và không trước ngày vào làm; để trống thì lấy ngày ghi nhận.',
      refusedWith: ['GRANTED_ON_INVALID', 'GRANTED_ON_IN_FUTURE', 'EFFECTIVE_BEFORE_HIRE'],
    },
    {
      key: 'expected_end_date',
      description: 'Ngày dự kiến kết thúc, chỉ cho nhân sự có thời hạn.',
      required: false,
      format: 'YYYY-MM-DD',
      example: '',
      constraint: 'Không trước ngày bắt đầu (bằng ngày bắt đầu thì được); nhà thầu, freelancer và thực tập phải có.',
      refusedWith: ['EXPECTED_END_REQUIRED', 'EXPECTED_END_INVALID'],
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
