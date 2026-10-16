// Synthetic business sentences (no real data). Each request text is made unique with a counter so the cache never hits
// unless a scenario wants it to.
export const VI = [
  'Giấy phép phần mềm sẽ hết hạn vào cuối tháng này.',
  'Vui lòng liên hệ bộ phận hỗ trợ để gia hạn.',
  'Chúng tôi cần thêm năm chỗ ngồi cho phòng kế toán.',
  'Yêu cầu của bạn đã được trưởng phòng phê duyệt.',
  'Hạn báo hủy là ngày mười lăm của tháng sau.',
  'Xin cho biết lý do cần thay đổi nhà cung cấp.',
  'Nhân viên mới phải được cấp quyền truy cập hệ thống.',
  'Hóa đơn tháng mười đã được gửi qua thư điện tử.',
  'Gói doanh nghiệp bao gồm năm mươi giấy phép người dùng.',
  'Quản trị viên có thể thu hồi giấy phép của nhân viên đã nghỉ việc.',
  'Hợp đồng tự động gia hạn nếu không có thông báo hủy.',
  'Báo cáo sử dụng phần mềm được cập nhật mỗi tuần.',
  'Thiết bị này đã đạt số lần kích hoạt tối đa.',
  'Chúng tôi từ chối yêu cầu vì ngân sách quý này đã hết.',
  'Vui lòng đính kèm báo giá của nhà cung cấp.',
  'Phần mềm thiết kế được dùng bởi nhóm tiếp thị.',
];
export const EN = [
  'The license will expire at the end of this month.',
  'Please contact support to renew your subscription.',
  'We need five more seats for the accounting department.',
  'Your request has been approved by the department head.',
  'The cancellation deadline is the fifteenth of next month.',
  'Please state the reason for changing the vendor.',
  'New employees must be granted access to the system.',
  'The October invoice has been emailed to the customer.',
  'The enterprise plan includes fifty user licenses.',
  'An administrator can revoke the license of an employee who has left.',
  'The contract renews automatically unless a cancellation notice is given.',
  'The software usage report is updated every week.',
  'This device has reached the maximum number of activations.',
  'We rejected the request because this quarter budget is exhausted.',
  'Please attach the quotation from the vendor.',
  'The design software is used by the marketing team.',
];

let counter = 0;
/** Unique text of about `chars` characters made of whole sentences. */
export function makeText(lang, chars, uniq = ++counter) {
  const pool = lang === 'vi' ? VI : EN;
  let text = lang === 'vi' ? `Mã yêu cầu số ${uniq}.` : `Request number ${uniq}.`;
  let i = uniq % pool.length;
  while (text.length < chars) {
    text += ' ' + pool[i % pool.length];
    i++;
  }
  return text;
}
