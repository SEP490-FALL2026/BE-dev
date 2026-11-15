import type { ImportTemplateDefinition } from '../../policies/public/policies.types';
import type { SourceTemplate } from '../vendor-source/vendor-source.types';

/**
 * The column names of the template of a usage report: what a source reads when its IT Admin declares the shape `AGGREGATE` with an email as the
 * identifier and the last day of activity (`QĐ-111as`, `FR-4.2`). A source names its own columns; these are the ones to start from, and the
 * template says so.
 */
export const USAGE_TEMPLATE_COLUMNS: SourceTemplate['columns'] = {
  identifier: 'email',
  lastActivityDate: 'last_active_date',
};

export const USAGE_REPORT_TEMPLATE: ImportTemplateDefinition = {
  kind: 'usage-csv',
  formats: ['csv'],
  title: 'Báo cáo sử dụng xuất từ trang quản trị của nhà cung cấp',
  columns: [
    {
      key: USAGE_TEMPLATE_COLUMNS.identifier,
      description:
        'Định danh của người dùng ở nhà cung cấp: email công ty, tên đăng nhập hoặc mã tài khoản, đúng loại nguồn đã khai.',
      required: true,
      format: 'Email, tên đăng nhập hoặc mã tài khoản',
      example: 'minh.anh@congty.example',
      constraint: 'Chuỗi giống mật khẩu hoặc khóa bị che và dòng bị từ chối; email so không phân biệt hoa thường.',
    },
    {
      key: USAGE_TEMPLATE_COLUMNS.lastActivityDate ?? 'last_active_date',
      description: 'Ngày hoạt động gần nhất của người dùng theo báo cáo của nhà cung cấp.',
      required: true,
      format: 'YYYY-MM-DD, có thể kèm giờ; định dạng DD/MM/YYYY hoặc MM/DD/YYYY nếu nguồn đã khai',
      example: '2026-11-10',
      constraint: 'Không ở tương lai; phải nằm trong cửa sổ dữ liệu của file.',
    },
  ],
  sampleRows: [
    ['minh.anh@congty.example', '2026-11-10'],
    ['quoc.bao@congty.example', '2026-10-28'],
    ['thu.ha@congty.example', '2026-09-30'],
  ],
  notes: [
    'Tên cột phải đúng với mẫu cột đã khai cho nguồn dữ liệu của ứng dụng; cột thừa không được đọc, cột thiếu làm cả file bị từ chối.',
    'Tối đa số dòng mỗi báo cáo theo giới hạn nhập báo cáo; file không có họ tên, ảnh hay nội dung hoạt động.',
    'Báo cáo dạng sự kiện (mỗi dòng một ngày) có thêm cột ngày và loại sự kiện theo mẫu cột của nguồn.',
    'Các dòng ví dụ là người giả; xóa chúng trước khi nhập báo cáo thật.',
  ],
};
