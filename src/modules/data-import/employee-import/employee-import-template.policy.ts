import type { ImportTemplateDefinition } from '../../policies/public/policies.types';

/**
 * What the template of the people file says (`QĐ-111as`, `US-02-01`): the columns `employee-import-row.types.ts` lists, with the rules
 * `row-validation/` judges them by. The example people are fictitious; the file reads back without a single error when the departments exist.
 */
export const EMPLOYEE_IMPORT_TEMPLATE: ImportTemplateDefinition = {
  kind: 'employees',
  title: 'Danh sách nhân viên (hồ sơ nhân sự)',
  columns: [
    {
      key: 'employee_code',
      description: 'Mã nhân viên do công ty cấp; khóa nhận diện, không đổi sau khi đã tạo.',
      required: true,
      format: 'Chữ và số, không dấu cách; hoa thường như nhau',
      example: 'NV0101',
      constraint: 'Duy nhất trong file và trong hệ thống; một mã đã có thì dòng được so với hồ sơ hiện tại.',
    },
    {
      key: 'full_name',
      description: 'Họ và tên đầy đủ như trên hồ sơ.',
      required: true,
      format: 'Văn bản, có dấu',
      example: 'Nguyễn Minh Anh',
      constraint: 'Không để trống.',
    },
    {
      key: 'work_email',
      description: 'Email công việc thuộc tên miền công ty; là tài khoản duy nhất được cấp quyền trả phí.',
      required: false,
      format: 'Địa chỉ email',
      example: 'minh.anh@congty.example',
      constraint: 'Mỗi email chỉ một người; tên miền phải là tên miền công ty.',
    },
    {
      key: 'employment_type',
      description: 'Loại nhân sự.',
      required: true,
      format: 'Một trong: STAFF, CONTRACTOR, FREELANCER, INTERN',
      example: 'STAFF',
      constraint: 'Nhà thầu, freelancer và thực tập có ngày hết hợp đồng nhập riêng sau khi tạo hồ sơ.',
    },
    {
      key: 'hire_date',
      description: 'Ngày vào làm.',
      required: true,
      format: 'YYYY-MM-DD',
      example: '2025-03-01',
      constraint: 'Ngày có thật; không sau ngày nhập.',
    },
    {
      key: 'department_code',
      description: 'Mã phòng ban đang hoạt động. Để trống thì nhân viên được tạo ở trạng thái chưa xếp phòng.',
      required: false,
      format: 'Mã phòng ban đã có trong hệ thống',
      example: 'P-ENG',
      constraint: 'Phải là phòng ban có thật và đang hoạt động.',
    },
    {
      key: 'job_title',
      description: 'Chức vụ, chữ tự do (không có danh mục chức vụ).',
      required: false,
      format: 'Văn bản',
      example: 'Kỹ sư phần mềm',
      constraint: 'Có thể để trống.',
    },
  ],
  sampleRows: [
    ['NV0101', 'Nguyễn Minh Anh', 'minh.anh@congty.example', 'STAFF', '2025-03-01', 'P-ENG', 'Kỹ sư phần mềm'],
    ['NV0102', 'Trần Quốc Bảo', 'quoc.bao@congty.example', 'STAFF', '2024-09-16', 'P-ENG', ''],
    ['NV0103', 'Lê Thu Hà', '', 'INTERN', '2026-06-01', '', ''],
  ],
  notes: [
    'Tối đa 1.000 dòng một file; nhiều hơn thì chia thành nhiều file.',
    'Hệ thống xem trước kết quả từng dòng rồi mới ghi; không ai bị đánh dấu nghỉ việc vì không có trong file.',
    'Các dòng ví dụ trong sheet Dữ liệu là người giả; xóa chúng trước khi nhập danh sách thật.',
    'Tên cột có thể viết có dấu hoặc bằng tên tiếng Anh quen thuộc (ví dụ: ma_nhan_vien, ho_ten, email); cột không biết sẽ bị bỏ qua và được báo trong bản xem trước.',
  ],
};
