// vi -> en fixtures. Source is Vietnamese, reference is an AI-drafted English translation.
import { makeItem, longItem, G } from './helpers.mjs';

const it = makeItem('en');
const g = G.en;

export const viEn = [
  // ---- negation
  it('vi-001', 'Tôi không cần cài đặt thêm phần mềm nào khác cho dự án này.', 'I do not need any other software installed for this project.', ['negation', 'plain']),
  it('vi-002', 'Yêu cầu của Nguyễn Văn An chưa được duyệt vì thiếu lý do chi tiết.', 'The request from Nguyễn Văn An has not been approved because detailed justification is missing.', ['negation', 'name'], { p: ['Nguyễn Văn An'] }),
  it('vi-003', 'Công cụ này không nằm trong danh mục chuẩn của công ty.', "This tool is not in the company's standard catalogue.", ['negation', 'plain']),
  it('vi-004', 'Tôi không đồng ý với đề xuất thu hồi seat của Trần Thị Bích.', "I do not agree with the proposal to revoke Trần Thị Bích's seat.", ['negation', 'revoke', 'name', 'glossary'], { p: ['Trần Thị Bích'], c: g.seat }),
  it('vi-005', 'Không được phép chia sẻ tài khoản Figma giữa các thành viên.', 'Sharing a Figma account between members is not allowed.', ['negation', 'software'], { p: ['Figma'] }),
  it('vi-006', 'Đội ngũ không thể hoàn thành bàn giao trước ngày 30/11/2026.', 'The team cannot complete the handover before 30/11/2026.', ['negation', 'date', 'glossary'], { p: ['30/11/2026'], c: g.handover }),
  it('vi-007', 'Chúng tôi chưa gia hạn giấy phép Jira vì ngân sách chưa được phê duyệt.', 'We have not renewed the Jira license because the budget has not been approved.', ['negation', 'software', 'glossary'], { p: ['Jira'], c: g.renew }),
  it('vi-008', 'Nhân viên này không còn làm việc ở phòng Kỹ thuật nữa.', 'This employee no longer works in the Engineering department.', ['negation', 'glossary'], { c: g.department }),
  it('vi-009', 'Không có seat nào còn trống trong gói Slack hiện tại.', 'There are no seats available in the current Slack plan.', ['negation', 'software', 'glossary'], { p: ['Slack'], c: g.seat }),
  it('vi-010', 'Yêu cầu này không được tự động duyệt; trưởng phòng phải xác nhận trước.', 'This request is not approved automatically; the department head must confirm first.', ['negation', 'glossary'], { c: g.head }),
  it('vi-011', 'Đừng thu hồi tài khoản của Lê Hoàng Nam trước khi bàn giao dữ liệu.', "Do not revoke Lê Hoàng Nam's account before handing over the data.", ['negation', 'revoke', 'name', 'glossary'], { p: ['Lê Hoàng Nam'], c: g.handover }),
  it('vi-012', 'Báo cáo này không chứa dữ liệu cá nhân của khách hàng.', 'This report does not contain any personal customer data.', ['negation', 'plain']),

  // ---- approve
  it('vi-013', 'Tôi đã duyệt yêu cầu cài đặt Visual Studio Code cho cả nhóm.', 'I have approved the request to install Visual Studio Code for the whole team.', ['approve', 'software'], { p: ['Visual Studio Code'] }),
  it('vi-014', 'Yêu cầu REQ-2026-0042 được phê duyệt.', 'Request REQ-2026-0042 is approved.', ['approve', 'code'], { p: ['REQ-2026-0042'] }),
  it('vi-015', 'Trưởng phòng đã phê duyệt ngoại lệ cho công cụ Notion vì nhóm marketing cần cộng tác theo thời gian thực.', 'The department head approved the exception for Notion because the marketing team needs real-time collaboration.', ['approve', 'software', 'glossary'], { p: ['Notion'], c: g.head }),
  it('vi-016', 'Người duyệt chi đã phê duyệt khoản chi 2.400.000 đồng cho giấy phép Postman.', 'The Spending Approver approved the expense of 2.400.000 đồng for the Postman license.', ['approve', 'number', 'software', 'glossary'], { p: ['Postman', '2.400.000 đồng'], c: g.approver }),
  it('vi-017', 'Đã duyệt: gia hạn Slack thêm 12 tháng.', 'Approved: renew Slack for another 12 months.', ['approve', 'software', 'glossary'], { p: ['Slack'], c: g.renew }),
  it('vi-018', 'Chúng tôi chấp thuận đề xuất của Phạm Quỳnh Anh về việc dùng Figma thay cho Adobe XD.', "We approve Phạm Quỳnh Anh's proposal to use Figma instead of Adobe XD.", ['approve', 'name', 'software'], { p: ['Phạm Quỳnh Anh', 'Figma', 'Adobe XD'] }),
  it('vi-019', 'Yêu cầu hợp lệ nên tôi duyệt ngay.', 'The request is valid, so I approve it immediately.', ['approve', 'plain']),
  it('vi-020', 'Phê duyệt có điều kiện: chỉ cấp 3 seat cho nhóm thiết kế đến hết 31/12/2026.', 'Conditionally approved: only 3 seats granted to the design team until 31/12/2026.', ['approve', 'number', 'date', 'glossary'], { p: ['31/12/2026'], c: g.seat }),

  // ---- reject
  it('vi-021', 'Yêu cầu bị từ chối vì công cụ trùng với Microsoft Teams đang có.', 'The request is rejected because the tool duplicates Microsoft Teams, which we already have.', ['reject', 'software'], { p: ['Microsoft Teams'] }),
  it('vi-022', 'Từ chối: Jira đã được cấp cho phòng Kỹ thuật, không cần mua thêm.', 'Rejected: Jira has already been provided to the Engineering department, no need to buy more.', ['reject', 'negation', 'software', 'glossary'], { p: ['Jira'], c: g.department }),
  it('vi-023', 'Tôi từ chối đề xuất mua Tableau vì ngân sách quý này đã hết.', "I reject the proposal to buy Tableau because this quarter's budget has run out.", ['reject', 'software'], { p: ['Tableau'] }),
  it('vi-024', 'Trưởng phòng từ chối yêu cầu REQ-2026-0107, lý do: chưa có Cost Center.', 'The department head rejected request REQ-2026-0107, reason: no Cost Center yet.', ['reject', 'code', 'glossary'], { p: ['REQ-2026-0107', 'Cost Center'], c: g.head }),
  it('vi-025', 'Người duyệt chi từ chối khoản 18.000.000 đồng vì vượt hạn mức.', 'The Spending Approver rejected the 18.000.000 đồng expense because it exceeds the limit.', ['reject', 'number', 'glossary'], { p: ['18.000.000 đồng'], c: g.approver }),
  it('vi-026', 'Yêu cầu không được chấp nhận do thiếu chữ ký của Đặng Minh Khoa.', 'The request is not accepted due to the missing signature of Đặng Minh Khoa.', ['reject', 'negation', 'name'], { p: ['Đặng Minh Khoa'] }),
  it('vi-027', 'Đề xuất bị bác bỏ vì rủi ro bảo mật của phần mềm này.', 'The proposal is rejected because of the security risk of this software.', ['reject', 'plain']),
  it('vi-028', 'Rất tiếc, chúng tôi không thể duyệt yêu cầu cài Docker Desktop trên máy cá nhân.', 'Unfortunately, we cannot approve the request to install Docker Desktop on personal computers.', ['reject', 'negation', 'software'], { p: ['Docker Desktop'] }),

  // ---- revoke / handover
  it('vi-029', 'Thu hồi seat GitHub của Võ Thanh Hà vì nghỉ việc.', "Revoke Võ Thanh Hà's GitHub seat because of resignation.", ['revoke', 'name', 'software', 'glossary'], { p: ['Võ Thanh Hà', 'GitHub'], c: g.seat }),
  it('vi-030', 'Quyền truy cập Confluence của Bùi Gia Huy sẽ bị thu hồi vào ngày 15/11/2026.', "Bùi Gia Huy's Confluence access will be revoked on 15/11/2026.", ['revoke', 'name', 'software', 'date'], { p: ['Bùi Gia Huy', 'Confluence', '15/11/2026'] }),
  it('vi-031', 'Đã thu hồi giấy phép Adobe Photoshop và bàn giao lại cho phòng IT.', 'The Adobe Photoshop license has been revoked and handed over to the IT department.', ['revoke', 'software', 'glossary'], { p: ['Adobe Photoshop'], c: [...g.handover, ...g.department] }),
  it('vi-032', 'Hoàng Ngọc Lan chuyển sang phòng Kinh doanh nên cần thu hồi seat Slack cũ và cấp seat mới.', 'Hoàng Ngọc Lan moved to the Sales department, so the old Slack seat must be revoked and a new seat issued.', ['revoke', 'name', 'software', 'glossary'], { p: ['Hoàng Ngọc Lan', 'Slack'], c: [...g.seat, ...g.department] }),
  it('vi-033', 'Không thu hồi tài khoản trước khi bàn giao xong.', 'Do not revoke the account before the handover is complete.', ['revoke', 'negation', 'glossary'], { c: g.handover }),
  it('vi-034', 'Yêu cầu thu hồi toàn bộ seat chưa dùng trong 90 ngày.', 'Request to revoke all seats unused for 90 days.', ['revoke', 'number', 'glossary'], { c: g.seat }),
  it('vi-035', 'Việc thu hồi seat Figma của Đỗ Thế Vinh đã được trưởng phòng xác nhận.', "The revocation of Đỗ Thế Vinh's Figma seat has been confirmed by the department head.", ['revoke', 'name', 'software', 'glossary'], { p: ['Đỗ Thế Vinh', 'Figma'], c: [...g.seat, ...g.head] }),
  it('vi-036', 'Phạm Quỳnh Anh bàn giao toàn bộ tài khoản Jira cho Ngô Phương Thảo trước ngày 20/11/2026.', 'Phạm Quỳnh Anh hands over all Jira accounts to Ngô Phương Thảo before 20/11/2026.', ['name', 'software', 'date', 'glossary'], { p: ['Phạm Quỳnh Anh', 'Ngô Phương Thảo', 'Jira', '20/11/2026'], c: g.handover }),

  // ---- renewal, cancellation deadline, amounts
  it('vi-037', 'Hạn báo hủy của giấy phép Zoom là 01/10/2026.', 'The cancellation deadline for the Zoom license is 01/10/2026.', ['glossary', 'date', 'software'], { p: ['Zoom', '01/10/2026'], c: g.deadline }),
  it('vi-038', 'Hạn báo hủy là 30 ngày trước khi gia hạn.', 'The cancellation deadline is 30 days before renewal.', ['glossary', 'number'], { c: [...g.deadline, ...g.renew] }),
  it('vi-039', 'Cần gia hạn Microsoft Office 365 trước ngày 15 tháng 12 năm 2026, nếu không giấy phép sẽ hết hạn.', 'Microsoft Office 365 must be renewed before December 15, 2026, otherwise the license will expire.', ['date', 'software', 'glossary'], { p: ['Microsoft Office 365'], c: [...g.renew, ['december']] }),
  it('vi-040', 'Nhắc: hạn báo hủy Tableau còn 5 ngày, nếu không hủy sẽ tự động gia hạn 12 tháng.', 'Reminder: the Tableau cancellation deadline is 5 days away; if not cancelled it will renew automatically for 12 months.', ['glossary', 'number', 'software'], { p: ['Tableau'], c: [...g.deadline, ...g.renew] }),
  it('vi-041', 'Chi phí gia hạn năm nay là 36.500.000 đồng, tăng 8,5% so với năm trước.', "This year's renewal cost is 36.500.000 đồng, up 8,5% from last year.", ['number', 'glossary'], { p: ['36.500.000 đồng', '8,5%'], c: g.renew }),
  it('vi-042', 'Tổng ngân sách đề xuất: 12.000.000 đồng cho 5 seat Notion.', 'Total proposed budget: 12.000.000 đồng for 5 Notion seats.', ['number', 'software', 'glossary'], { p: ['12.000.000 đồng', 'Notion'], c: g.seat }),
  it('vi-043', 'Mỗi seat JetBrains IntelliJ IDEA có giá 649 USD mỗi năm.', 'Each JetBrains IntelliJ IDEA seat costs 649 USD per year.', ['number', 'software', 'glossary'], { p: ['JetBrains IntelliJ IDEA', '649 USD'], c: g.seat }),
  it('vi-044', 'Giảm giá 15% nếu mua từ 10 seat trở lên.', 'A 15% discount applies when buying 10 seats or more.', ['number', 'glossary'], { p: ['15%'], c: g.seat }),
  it('vi-045', 'Tổng chi phí là 1.250.000 đồng, chưa gồm VAT 10%.', 'The total cost is 1.250.000 đồng, excluding 10% VAT.', ['number'], { p: ['1.250.000 đồng', '10%'] }),

  // ---- dates
  it('vi-046', 'Nhân viên bắt đầu dùng công cụ từ 01/10/2026.', 'The employee has been using the tool since 01/10/2026.', ['date', 'plain'], { p: ['01/10/2026'] }),
  it('vi-047', 'Hạn xử lý yêu cầu là 25/11/2026 và hạn báo cáo là 05/12/2026.', 'The request processing deadline is 25/11/2026 and the reporting deadline is 05/12/2026.', ['date'], { p: ['25/11/2026', '05/12/2026'] }),
  it('vi-048', 'Giấy phép có hiệu lực từ 2026-10-01 đến 2027-09-30.', 'The license is valid from 2026-10-01 to 2027-09-30.', ['date'], { p: ['2026-10-01', '2027-09-30'] }),
  it('vi-049', 'Cuộc họp duyệt ngân sách diễn ra vào ngày 3 tháng 11.', 'The budget approval meeting takes place on November 3.', ['date'], { c: [['november']] }),
  it('vi-050', 'Vui lòng hoàn tất trước 17:00 ngày 28/11/2026.', 'Please complete before 17:00 on 28/11/2026.', ['date'], { p: ['28/11/2026'] }),

  // ---- emails
  it('vi-051', 'Vui lòng gửi lý do qua email an.nguyen@acme-demo.example hoặc it-helpdesk@acme-demo.example.', 'Please send your justification by email to an.nguyen@acme-demo.example or it-helpdesk@acme-demo.example.', ['email'], { p: ['an.nguyen@acme-demo.example', 'it-helpdesk@acme-demo.example'] }),
  it('vi-052', 'Liên hệ Trần Thị Bích (bich.tran@acme-demo.example) để bàn giao tài khoản.', 'Contact Trần Thị Bích (bich.tran@acme-demo.example) to hand over the account.', ['email', 'name', 'glossary'], { p: ['Trần Thị Bích', 'bich.tran@acme-demo.example'], c: g.handover }),
  it('vi-053', 'Thông báo đã gửi tới finance-approvers@acme-demo.example và trưởng phòng.', 'A notification was sent to finance-approvers@acme-demo.example and the department head.', ['email', 'glossary'], { p: ['finance-approvers@acme-demo.example'], c: g.head }),

  // ---- codes
  it('vi-054', 'Xem chi tiết yêu cầu REQ-2026-0042 và hợp đồng HD-2026-15.', 'See the details of request REQ-2026-0042 and contract HD-2026-15.', ['code'], { p: ['REQ-2026-0042', 'HD-2026-15'] }),
  it('vi-055', 'Mã giấy phép LIC-2026-0007-2 thuộc Cost Center CC-0042.', 'License code LIC-2026-0007-2 belongs to Cost Center CC-0042.', ['code', 'glossary'], { p: ['LIC-2026-0007-2', 'CC-0042', 'Cost Center'], c: g.costCenter }),
  it('vi-056', 'Đơn mua PO-2026-118 đã gửi cho nhà cung cấp.', 'Purchase order PO-2026-118 has been sent to the vendor.', ['code'], { p: ['PO-2026-118'] }),

  // ---- names
  it('vi-057', 'Lê Hoàng Nam đề nghị cấp thêm seat Docker Desktop cho nhóm DevOps.', 'Lê Hoàng Nam asks for an additional Docker Desktop seat for the DevOps team.', ['name', 'software', 'glossary'], { p: ['Lê Hoàng Nam', 'Docker Desktop', 'DevOps'], c: g.seat }),
  it('vi-058', 'Theo ý kiến của Đỗ Thế Vinh và Ngô Phương Thảo, công cụ này cần thiết cho quy trình kiểm thử.', 'According to Đỗ Thế Vinh and Ngô Phương Thảo, this tool is necessary for the testing process.', ['name'], { p: ['Đỗ Thế Vinh', 'Ngô Phương Thảo'] }),
  it('vi-059', 'Chị Hoàng Ngọc Lan phụ trách ngân sách của Công ty TNHH Sao Mai Demo.', 'Ms. Hoàng Ngọc Lan is in charge of the budget of Công ty TNHH Sao Mai Demo.', ['name'], { p: ['Hoàng Ngọc Lan', 'Công ty TNHH Sao Mai Demo'] }),
  it('vi-060', 'Ông Bùi Gia Huy là Người duyệt chi của Acme Demo Co.', 'Mr. Bùi Gia Huy is the Spending Approver of Acme Demo Co.', ['name', 'glossary'], { p: ['Bùi Gia Huy', 'Acme Demo Co'], c: g.approver }),

  // ---- software
  it('vi-061', 'Chúng tôi dùng GitHub Actions để chạy kiểm thử và Postman để kiểm thử API.', 'We use GitHub Actions to run tests and Postman to test APIs.', ['software'], { p: ['GitHub Actions', 'Postman'] }),
  it('vi-062', 'Đề nghị cài MATLAB và AutoCAD cho phòng thí nghiệm.', 'Please install MATLAB and AutoCAD for the laboratory.', ['software', 'glossary'], { p: ['MATLAB', 'AutoCAD'], c: [['laborator', ' lab']], n: ['department'] }),
  it('vi-063', 'Adobe Photoshop quá đắt so với Figma.', 'Adobe Photoshop is too expensive compared with Figma.', ['software'], { p: ['Adobe Photoshop', 'Figma'] }),
  it('vi-064', 'Nhóm dữ liệu cần Tableau và Microsoft Power BI để làm dashboard.', 'The data team needs Tableau and Microsoft Power BI to build dashboards.', ['software'], { p: ['Tableau', 'Microsoft Power BI'] }),
  it('vi-065', 'Chúng tôi đề xuất chuyển từ Slack sang Microsoft Teams để tiết kiệm chi phí.', 'We propose switching from Slack to Microsoft Teams to save costs.', ['software'], { p: ['Slack', 'Microsoft Teams'] }),
  it('vi-066', 'Dùng ChatGPT cho công việc cần được xem xét bảo mật.', 'Using ChatGPT for work requires a security review.', ['software'], { p: ['ChatGPT'] }),
  it('vi-067', 'Phòng họp tầng 3 đã được đặt cho buổi duyệt ngân sách.', 'The meeting room on the 3rd floor has been booked for the budget review.', ['glossary'], { c: [['room']], n: ['department'] }),

  // ---- unaccented Vietnamese
  it('vi-068', 'Toi can cai dat Figma cho du an moi cua phong thiet ke.', 'I need to install Figma for the new project of the design department.', ['unaccented', 'software'], { p: ['Figma'] }),
  it('vi-069', 'Yeu cau chua duoc duyet vi thieu ly do chi tiet.', 'The request has not been approved because detailed justification is missing.', ['unaccented', 'negation']),
  it('vi-070', 'Truong phong tu choi yeu cau REQ-2026-0042 vi vuot ngan sach.', 'The department head rejected request REQ-2026-0042 because it exceeds the budget.', ['unaccented', 'reject', 'code', 'glossary'], { p: ['REQ-2026-0042'], c: g.head }),
  it('vi-071', 'Han bao huy la 15/11/2026, can gia han som.', 'The cancellation deadline is 15/11/2026, renewal is needed soon.', ['unaccented', 'glossary', 'date'], { p: ['15/11/2026'], c: [...g.deadline, ...g.renew] }),

  // ---- mixed Vietnamese / English
  it('vi-072', 'Em cần request thêm 2 seat cho project Atlas, đã confirm với team lead.', 'I need to request 2 more seats for project Atlas, already confirmed with the team lead.', ['mixed', 'glossary'], { p: ['Atlas'], c: g.seat }),
  it('vi-073', 'Please approve giúp em yêu cầu REQ-2026-0042 nhé, deadline là 15/11/2026.', 'Please approve request REQ-2026-0042 for me, the deadline is 15/11/2026.', ['mixed', 'approve', 'code', 'date'], { p: ['REQ-2026-0042', '15/11/2026'] }),
  it('vi-074', 'Tool này không có trong catalog nên em xin exception từ trưởng phòng.', 'This tool is not in the catalog, so I am asking for an exception from the department head.', ['mixed', 'negation', 'glossary'], { c: g.head }),

  // ---- collision with placeholder-looking text
  it('vi-075', 'Mã tham chiếu <x0> trong bản ghi cũ vẫn dùng cho REQ-2026-0042.', 'The reference code <x0> in the old record is still used for REQ-2026-0042.', ['collision', 'code'], { p: ['<x0>', 'REQ-2026-0042'] }),
  it('vi-076', 'Biểu mẫu hiển thị <x1> thay vì tên Trần Thị Bích.', 'The form shows <x1> instead of the name Trần Thị Bích.', ['collision', 'name'], { p: ['<x1>', 'Trần Thị Bích'] }),
  it('vi-077', 'Giá trị mẫu: <x0>, <x1>, <x2> không phải là dữ liệu thật.', 'Sample values: <x0>, <x1>, <x2> are not real data.', ['collision', 'negation'], { p: ['<x0>', '<x1>', '<x2>'] }),

  // ---- multi-sentence justifications / notes
  it(
    'vi-078',
    'Tôi là kỹ sư phần mềm thuộc phòng Kỹ thuật. Dự án mới yêu cầu thiết kế giao diện trên Figma. Hiện nhóm chỉ có 2 seat nên không đủ. Đề nghị cấp thêm 3 seat đến hết 31/03/2027.',
    'I am a software engineer in the Engineering department. The new project requires interface design in Figma. The team currently has only 2 seats, which is not enough. Please grant 3 more seats until 31/03/2027.',
    ['plain', 'software', 'number', 'date', 'glossary'],
    { p: ['Figma', '31/03/2027'], c: [...g.seat, ...g.department] },
  ),
  it(
    'vi-079',
    'Lý do từ chối: công cụ trùng chức năng với Slack. Vui lòng dùng Slack hiện có. Nếu vẫn cần, hãy gửi lại yêu cầu kèm báo giá.',
    'Reason for rejection: the tool duplicates the functionality of Slack. Please use the existing Slack. If you still need it, resubmit the request with a quotation.',
    ['reject', 'software'],
    { p: ['Slack'] },
  ),
  it(
    'vi-080',
    'Bàn giao hoàn tất. Seat Jira đã chuyển cho Ngô Phương Thảo. Tài khoản cũ đã bị thu hồi.',
    'Handover complete. The Jira seat has been transferred to Ngô Phương Thảo. The old account has been revoked.',
    ['revoke', 'name', 'software', 'glossary'],
    { p: ['Jira', 'Ngô Phương Thảo'], c: [...g.seat, ...g.handover] },
  ),

  // ---- long single sentences (token guard); counts 18 and 24 clauses stay under 512 tokens, 29 is over the limit once protected, 40 exceeds it even raw
  longItem('vi', 'vi-L1', 18),
  longItem('vi', 'vi-L2', 24),
  longItem('vi', 'vi-L3', 29),
  longItem('vi', 'vi-L4', 40),
];
