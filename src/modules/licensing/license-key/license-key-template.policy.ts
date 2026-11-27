import type { ImportTemplateDefinition } from '../../policies/public/policies.types';

/**
 * What the template of a batch of license keys says (`QĐ-111as`, `US-04-12`): one key a line, as `judgeBatch` reads it. The keys are given to
 * `POST /license-keys/imports` as a list, so the file is where the IT Admin gathers them. The example keys are not keys of any product.
 */
export const LICENSE_KEY_TEMPLATE: ImportTemplateDefinition = {
  kind: 'license-keys',
  formats: ['csv'],
  title: 'Lô khóa K4',
  columns: [
    {
      key: 'Khóa bản quyền',
      description: 'Khóa bản quyền đúng như nhà cung cấp cấp; mỗi dòng một khóa.',
      required: true,
      format: '8 đến 128 ký tự gồm chữ, số và - _ . = + /',
      example: 'MAU-0001-AAAA-BBBB',
      constraint:
        'Phân biệt hoa thường; khóa lặp trong lô hoặc đã có trong kho bị báo theo số dòng, không bao giờ in lại khóa.',
    },
  ],
  sampleRows: [['MAU-0001-AAAA-BBBB'], ['MAU-0002-CCCC-DDDD'], ['MAU-0003-EEEE-FFFF']],
  notes: [
    'Dòng đầu là tên cột và không phải một khóa: khi gửi lô, bỏ dòng đầu; nếu gửi cả dòng đầu thì dòng đó bị báo INVALID_FORMAT và không được lưu.',
    'Tối đa 1.000 khóa một lô; một dòng sai không làm hỏng các dòng khác.',
    'Khóa được niêm phong khi lưu, danh sách chỉ hiện bốn ký tự cuối.',
    'Các dòng ví dụ không phải khóa của sản phẩm nào; xóa chúng trước khi nhập khóa thật.',
  ],
};
