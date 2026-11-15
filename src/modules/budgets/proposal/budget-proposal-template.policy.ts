import type { ImportTemplateDefinition } from '../../policies/public/policies.types';

/**
 * What the form `BM-10` says (`QĐ-111ab`, `QĐ-111as`): the department head attaches at least one file made from it to the proposal of the year,
 * next to the amount asked for. The system keeps the file and reads nothing in it (no line of a proposal is a record any more), so the form is
 * written for people, as a company writes one: a title, who made it for which department and year, headers in plain words, amounts as numbers
 * (VND, before tax) with the amount of a line worked out from its cells, and a total to compare with the amount asked for. The software the
 * department expects to need, for how long and for how much, and why. The example lines are fictitious.
 */
export const BUDGET_PROPOSAL_TEMPLATE: ImportTemplateDefinition = {
  kind: 'budget-proposal',
  formats: ['xlsx'],
  title: 'Biểu mẫu BM-10: đề nghị ngân sách phần mềm năm của phòng',
  form: {
    title: 'BM-10 — Đề nghị ngân sách phần mềm năm của phòng',
    fields: ['Phòng ban / Cost Center:', 'Năm ngân sách:', 'Người lập:', 'Ngày lập:'],
    totalLabel: 'Tổng cộng (khớp số tiền đề nghị nhập ở màn nộp BM-10)',
  },
  columns: [
    {
      key: 'software',
      label: 'Phần mềm',
      description: 'Phần mềm phòng dự kiến cần trong năm.',
      required: true,
      format: 'Tên phần mềm',
      example: 'Figma',
      constraint: 'Phần mềm đã có hoặc đề xuất mới; phần mềm miễn phí bên ngoài không cần ghi.',
    },
    {
      key: 'plan',
      label: 'Gói',
      description: 'Gói dự kiến dùng.',
      required: false,
      format: 'Tên gói',
      example: 'Professional',
      constraint: 'Để trống nếu chưa chọn gói.',
    },
    {
      key: 'seats',
      label: 'Số seat',
      kind: 'integer',
      description: 'Số người dùng (seat) dự kiến.',
      required: true,
      format: 'Số nguyên dương',
      example: '6',
      constraint: 'Không vượt số người của phòng.',
    },
    {
      key: 'monthly_price_vnd',
      label: 'Đơn giá / seat / tháng (VND, chưa thuế)',
      kind: 'vnd',
      description: 'Giá một seat một tháng, VND, giá gốc chưa thuế.',
      required: true,
      format: 'Số, định dạng hàng nghìn',
      example: '375000',
      constraint: 'Theo báo giá hoặc hóa đơn gần nhất.',
    },
    {
      key: 'months',
      label: 'Số tháng',
      kind: 'integer',
      description: 'Số tháng dùng trong năm.',
      required: true,
      format: 'Số nguyên từ 1 đến 12',
      example: '12',
      constraint: 'Quyền dùng lâu dài tính đủ 12 tháng.',
    },
    {
      key: 'amount_vnd',
      label: 'Thành tiền (VND, chưa thuế)',
      kind: 'vnd',
      formula: 'C{row}*D{row}*E{row}',
      description: 'Thành tiền dòng này, VND chưa thuế: seat × giá tháng × số tháng (ô tự tính).',
      required: true,
      format: 'Số, định dạng hàng nghìn; công thức',
      example: '27000000',
      constraint: 'Tổng các dòng nên khớp số tiền đề nghị nhập ở màn nộp BM-10.',
    },
    {
      key: 'reason',
      label: 'Lý do cần',
      description: 'Vì sao phòng cần: công việc, dự án, thay thế công cụ nào.',
      required: false,
      format: 'Văn bản ngắn',
      example: 'Thiết kế giao diện cho dự án khách hàng mới',
      constraint: 'Giúp Finance và Người duyệt chi đọc nhanh; không ghi thông tin cá nhân.',
    },
  ],
  sampleRows: [
    ['Figma', 'Professional', '6', '375000', '12', '27000000', 'Thiết kế giao diện cho dự án khách hàng mới'],
    ['Jira', 'Standard', '20', '180000', '12', '43200000', 'Theo dõi công việc nhóm kỹ thuật'],
  ],
  notes: [
    'Điền phòng ban, năm ngân sách, người lập và ngày lập ở các ô phía trên bảng.',
    'Nộp ít nhất một file theo mẫu này cùng số tiền đề nghị của cả năm; ghi chú là tùy chọn.',
    'Hệ thống lưu file làm căn cứ để Finance chốt số cơ sở và dự phòng; không đọc nội dung từng dòng.',
    'Hết hạn nộp thì kỳ lập ngân sách khóa; phòng không nộp thì Finance chốt số từ số liệu nền và đánh cờ.',
    'Các dòng ví dụ là số liệu giả; thay bằng số liệu của phòng.',
  ],
};
