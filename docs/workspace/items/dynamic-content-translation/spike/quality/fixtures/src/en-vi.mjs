// en -> vi fixtures. Source is English, reference is an AI-drafted Vietnamese translation.
import { makeItem, longItem, G } from './helpers.mjs';

const it = makeItem('vi');
const g = G.vi;

export const enVi = [
  // ---- negation
  it(
    'en-001',
    'I do not need administrator rights on this laptop.',
    'Tôi không cần quyền quản trị trên máy tính xách tay này.',
    ['negation', 'plain'],
  ),
  it(
    'en-002',
    'The request has not been approved yet because the justification is incomplete.',
    'Yêu cầu chưa được duyệt vì lý do giải trình chưa đầy đủ.',
    ['negation', 'plain'],
  ),
  it('en-003', 'This tool is not on the approved list.', 'Công cụ này không nằm trong danh sách được duyệt.', [
    'negation',
    'plain',
  ]),
  it(
    'en-004',
    'Do not share your Figma password with anyone.',
    'Không chia sẻ mật khẩu Figma của bạn với bất kỳ ai.',
    ['negation', 'software'],
    { p: ['Figma'] },
  ),
  it(
    'en-005',
    'We cannot renew the Jira license before the budget is confirmed.',
    'Chúng tôi không thể gia hạn giấy phép Jira trước khi ngân sách được xác nhận.',
    ['negation', 'software', 'glossary'],
    { p: ['Jira'], c: g.renew },
  ),
  it(
    'en-006',
    'No seat is available in the current plan.',
    'Không còn seat nào trong gói hiện tại.',
    ['negation', 'glossary'],
    { c: g.seat },
  ),
  it(
    'en-007',
    'The employee no longer works in the Finance department.',
    'Nhân viên này không còn làm việc ở phòng Tài chính nữa.',
    ['negation', 'glossary'],
    { c: g.department },
  ),
  it(
    'en-008',
    'Please do not revoke the account until the handover is complete.',
    'Vui lòng không thu hồi tài khoản cho đến khi bàn giao xong.',
    ['negation', 'revoke', 'glossary'],
    { c: g.handover },
  ),
  it(
    'en-009',
    'The tool is not in the standard catalogue, so I am requesting an exception.',
    'Công cụ này không có trong danh mục chuẩn nên tôi xin ngoại lệ.',
    ['negation', 'plain'],
  ),
  it(
    'en-010',
    'The Spending Approver has not confirmed the amount of 4,500,000 VND.',
    'Người duyệt chi chưa xác nhận số tiền 4,500,000 VND.',
    ['negation', 'number', 'glossary'],
    { p: ['4,500,000 VND'], c: g.approver },
  ),
  it(
    'en-011',
    'This is not a personal account, and it must not be used for private projects.',
    'Đây không phải tài khoản cá nhân và không được dùng cho dự án riêng.',
    ['negation', 'plain'],
  ),
  it(
    'en-012',
    'Nobody from Engineering objected to the renewal.',
    'Không ai ở phòng Kỹ thuật phản đối việc gia hạn.',
    ['negation', 'glossary'],
    { c: g.renew },
  ),

  // ---- approve
  it(
    'en-013',
    'I approve the request to install Visual Studio Code for the whole team.',
    'Tôi duyệt yêu cầu cài đặt Visual Studio Code cho cả nhóm.',
    ['approve', 'software'],
    { p: ['Visual Studio Code'] },
  ),
  it(
    'en-014',
    'Request REQ-2026-0042 has been approved.',
    'Yêu cầu REQ-2026-0042 đã được duyệt.',
    ['approve', 'code'],
    { p: ['REQ-2026-0042'] },
  ),
  it(
    'en-015',
    'The department head approved the exception for Notion.',
    'Trưởng phòng đã duyệt ngoại lệ cho Notion.',
    ['approve', 'software', 'glossary'],
    { p: ['Notion'], c: g.head },
  ),
  it(
    'en-016',
    'The Spending Approver approved an expense of 2,400,000 VND for the Postman license.',
    'Người duyệt chi đã duyệt khoản chi 2,400,000 VND cho giấy phép Postman.',
    ['approve', 'number', 'software', 'glossary'],
    { p: ['2,400,000 VND', 'Postman'], c: g.approver },
  ),
  it(
    'en-017',
    'Approved: renew Slack for another 12 months.',
    'Đã duyệt: gia hạn Slack thêm 12 tháng.',
    ['approve', 'software', 'glossary'],
    { p: ['Slack'], c: g.renew },
  ),
  it(
    'en-018',
    "We approve Phạm Quỳnh Anh's proposal to use Figma instead of Adobe XD.",
    'Chúng tôi chấp thuận đề xuất của Phạm Quỳnh Anh về việc dùng Figma thay cho Adobe XD.',
    ['approve', 'name', 'software'],
    { p: ['Phạm Quỳnh Anh', 'Figma', 'Adobe XD'] },
  ),
  it('en-019', 'The request is valid, so I approve it right away.', 'Yêu cầu hợp lệ nên tôi duyệt ngay.', [
    'approve',
    'plain',
  ]),
  it(
    'en-020',
    'Approved with conditions: only 3 seats until 31/12/2026.',
    'Duyệt có điều kiện: chỉ cấp 3 seat đến hết 31/12/2026.',
    ['approve', 'number', 'date', 'glossary'],
    { p: ['31/12/2026'], c: g.seat },
  ),

  // ---- reject
  it(
    'en-021',
    'The request is rejected because the tool duplicates Microsoft Teams.',
    'Yêu cầu bị từ chối vì công cụ trùng với Microsoft Teams.',
    ['reject', 'software'],
    { p: ['Microsoft Teams'] },
  ),
  it(
    'en-022',
    'Rejected: Jira was already provided to Engineering, so no extra purchase is needed.',
    'Từ chối: Jira đã được cấp cho phòng Kỹ thuật, không cần mua thêm.',
    ['reject', 'negation', 'software'],
    { p: ['Jira'] },
  ),
  it(
    'en-023',
    "I reject the proposal to buy Tableau because this quarter's budget is used up.",
    'Tôi từ chối đề xuất mua Tableau vì ngân sách quý này đã hết.',
    ['reject', 'software'],
    { p: ['Tableau'] },
  ),
  it(
    'en-024',
    'The department head rejected request REQ-2026-0107: no Cost Center was provided.',
    'Trưởng phòng đã từ chối yêu cầu REQ-2026-0107: chưa cung cấp Cost Center.',
    ['reject', 'code', 'glossary'],
    { p: ['REQ-2026-0107', 'Cost Center'], c: g.head },
  ),
  it(
    'en-025',
    'The Spending Approver rejected the 18,000,000 VND expense because it exceeds the limit.',
    'Người duyệt chi đã từ chối khoản chi 18,000,000 VND vì vượt hạn mức.',
    ['reject', 'number', 'glossary'],
    { p: ['18,000,000 VND'], c: g.approver },
  ),
  it(
    'en-026',
    "The request was declined because Đặng Minh Khoa's signature is missing.",
    'Yêu cầu bị từ chối vì thiếu chữ ký của Đặng Minh Khoa.',
    ['reject', 'name'],
    { p: ['Đặng Minh Khoa'] },
  ),
  it(
    'en-027',
    'The proposal is turned down because of the security risk of this software.',
    'Đề xuất bị bác bỏ vì rủi ro bảo mật của phần mềm này.',
    ['reject', 'plain'],
  ),
  it(
    'en-028',
    'Unfortunately, we cannot approve installing Docker Desktop on personal computers.',
    'Rất tiếc, chúng tôi không thể duyệt việc cài Docker Desktop trên máy tính cá nhân.',
    ['reject', 'negation', 'software'],
    { p: ['Docker Desktop'] },
  ),

  // ---- revoke / handover
  it(
    'en-029',
    "Revoke Võ Thanh Hà's GitHub seat because she resigned.",
    'Thu hồi seat GitHub của Võ Thanh Hà vì cô ấy đã nghỉ việc.',
    ['revoke', 'name', 'software', 'glossary'],
    { p: ['Võ Thanh Hà', 'GitHub'], c: g.seat },
  ),
  it(
    'en-030',
    "Bùi Gia Huy's Confluence access will be revoked on 15/11/2026.",
    'Quyền truy cập Confluence của Bùi Gia Huy sẽ bị thu hồi vào ngày 15/11/2026.',
    ['revoke', 'name', 'software', 'date'],
    { p: ['Bùi Gia Huy', 'Confluence', '15/11/2026'] },
  ),
  it(
    'en-031',
    'The Adobe Photoshop license has been revoked and handed over to the IT department.',
    'Giấy phép Adobe Photoshop đã bị thu hồi và bàn giao lại cho phòng IT.',
    ['revoke', 'software', 'glossary'],
    { p: ['Adobe Photoshop'], c: [...g.handover, ...g.department] },
  ),
  it(
    'en-032',
    'Hoàng Ngọc Lan moved to Sales, so her old Slack seat must be revoked and a new seat issued.',
    'Hoàng Ngọc Lan chuyển sang bộ phận Kinh doanh nên cần thu hồi seat Slack cũ và cấp seat mới.',
    ['revoke', 'name', 'software', 'glossary'],
    { p: ['Hoàng Ngọc Lan', 'Slack'], c: g.seat },
  ),
  it(
    'en-033',
    'Revoke all seats that have not been used for 90 days.',
    'Thu hồi toàn bộ seat chưa được dùng trong 90 ngày.',
    ['revoke', 'negation', 'number', 'glossary'],
    { c: g.seat },
  ),
  it(
    'en-034',
    "The revocation of Đỗ Thế Vinh's Figma seat was confirmed by the department head.",
    'Việc thu hồi seat Figma của Đỗ Thế Vinh đã được trưởng phòng xác nhận.',
    ['revoke', 'name', 'software', 'glossary'],
    { p: ['Đỗ Thế Vinh', 'Figma'], c: [...g.seat, ...g.head] },
  ),
  it(
    'en-035',
    'Access is revoked immediately when an employee leaves the company.',
    'Quyền truy cập bị thu hồi ngay khi nhân viên rời công ty.',
    ['revoke', 'plain'],
  ),
  it(
    'en-036',
    'Phạm Quỳnh Anh will hand over all Jira accounts to Ngô Phương Thảo before 20/11/2026.',
    'Phạm Quỳnh Anh sẽ bàn giao toàn bộ tài khoản Jira cho Ngô Phương Thảo trước ngày 20/11/2026.',
    ['name', 'software', 'date', 'glossary'],
    { p: ['Phạm Quỳnh Anh', 'Ngô Phương Thảo', 'Jira', '20/11/2026'], c: g.handover },
  ),
  it(
    'en-037',
    'The handover of the Slack workspace was completed on 12/10/2026.',
    'Việc bàn giao không gian làm việc Slack đã hoàn tất vào ngày 12/10/2026.',
    ['software', 'date', 'glossary'],
    { p: ['Slack', '12/10/2026'], c: g.handover },
  ),

  // ---- renewal, cancellation deadline, amounts
  it(
    'en-038',
    'The cancellation deadline for the Zoom license is 01/10/2026.',
    'Hạn báo hủy giấy phép Zoom là 01/10/2026.',
    ['glossary', 'date', 'software'],
    { p: ['Zoom', '01/10/2026'], c: g.deadline },
  ),
  it(
    'en-039',
    'The cancellation deadline is 30 days before renewal.',
    'Hạn báo hủy là 30 ngày trước khi gia hạn.',
    ['glossary', 'number'],
    { c: [...g.deadline, ...g.renew] },
  ),
  it(
    'en-040',
    'Microsoft Office 365 must be renewed before December 15, 2026, otherwise the license will expire.',
    'Microsoft Office 365 cần được gia hạn trước ngày 15 tháng 12 năm 2026, nếu không giấy phép sẽ hết hạn.',
    ['date', 'software', 'glossary'],
    { p: ['Microsoft Office 365'], c: [...g.renew, ['15 tháng 12']] },
  ),
  it(
    'en-041',
    'Reminder: the Tableau cancellation deadline is 5 days away; if not cancelled it will renew automatically for 12 months.',
    'Nhắc nhở: hạn báo hủy Tableau còn 5 ngày; nếu không hủy, giấy phép sẽ tự động gia hạn 12 tháng.',
    ['glossary', 'number', 'software'],
    { p: ['Tableau'], c: [...g.deadline, ...g.renew] },
  ),
  it(
    'en-042',
    "This year's renewal costs 36,500,000 VND, 8.5% more than last year.",
    'Chi phí gia hạn năm nay là 36,500,000 VND, tăng 8.5% so với năm trước.',
    ['number', 'glossary'],
    { p: ['36,500,000 VND', '8.5%'], c: g.renew },
  ),
  it(
    'en-043',
    'Total proposed budget: 12,000,000 VND for 5 Notion seats.',
    'Tổng ngân sách đề xuất: 12,000,000 VND cho 5 seat Notion.',
    ['number', 'software', 'glossary'],
    { p: ['12,000,000 VND', 'Notion'], c: g.seat },
  ),
  it(
    'en-044',
    'Each JetBrains IntelliJ IDEA seat costs 649 USD per year.',
    'Mỗi seat JetBrains IntelliJ IDEA có giá 649 USD mỗi năm.',
    ['number', 'software', 'glossary'],
    { p: ['JetBrains IntelliJ IDEA', '649 USD'], c: g.seat },
  ),
  it(
    'en-045',
    'A 15% discount applies when buying 10 seats or more.',
    'Giảm giá 15% khi mua từ 10 seat trở lên.',
    ['number', 'glossary'],
    { p: ['15%'], c: g.seat },
  ),
  it(
    'en-046',
    'The total is $1,250.50, excluding 10% VAT.',
    'Tổng cộng là $1,250.50, chưa bao gồm VAT 10%.',
    ['number'],
    { p: ['$1,250.50', '10%'] },
  ),

  // ---- dates
  it(
    'en-047',
    'The employee has been using the tool since 01/10/2026.',
    'Nhân viên đã dùng công cụ này từ 01/10/2026.',
    ['date', 'plain'],
    { p: ['01/10/2026'] },
  ),
  it(
    'en-048',
    'The processing deadline is 25/11/2026 and the reporting deadline is 05/12/2026.',
    'Hạn xử lý là 25/11/2026 và hạn báo cáo là 05/12/2026.',
    ['date'],
    { p: ['25/11/2026', '05/12/2026'] },
  ),
  it(
    'en-049',
    'The license is valid from 2026-10-01 to 2027-09-30.',
    'Giấy phép có hiệu lực từ 2026-10-01 đến 2027-09-30.',
    ['date'],
    { p: ['2026-10-01', '2027-09-30'] },
  ),
  it(
    'en-050',
    'The budget review meeting is on November 3.',
    'Cuộc họp xem xét ngân sách diễn ra vào ngày 3 tháng 11.',
    ['date'],
    { c: [['3 tháng 11']] },
  ),
  it(
    'en-051',
    'Please finish before 17:00 on 28/11/2026.',
    'Vui lòng hoàn tất trước 17:00 ngày 28/11/2026.',
    ['date'],
    { p: ['28/11/2026'] },
  ),

  // ---- emails
  it(
    'en-052',
    'Please send your justification to an.nguyen@acme-demo.example or it-helpdesk@acme-demo.example.',
    'Vui lòng gửi lý do giải trình tới an.nguyen@acme-demo.example hoặc it-helpdesk@acme-demo.example.',
    ['email'],
    { p: ['an.nguyen@acme-demo.example', 'it-helpdesk@acme-demo.example'] },
  ),
  it(
    'en-053',
    'Contact Trần Thị Bích (bich.tran@acme-demo.example) to hand over the account.',
    'Liên hệ Trần Thị Bích (bich.tran@acme-demo.example) để bàn giao tài khoản.',
    ['email', 'name', 'glossary'],
    { p: ['Trần Thị Bích', 'bich.tran@acme-demo.example'], c: g.handover },
  ),
  it(
    'en-054',
    'A notification was sent to finance-approvers@acme-demo.example and the department head.',
    'Thông báo đã được gửi tới finance-approvers@acme-demo.example và trưởng phòng.',
    ['email', 'glossary'],
    { p: ['finance-approvers@acme-demo.example'], c: g.head },
  ),

  // ---- codes
  it(
    'en-055',
    'See request REQ-2026-0042 and contract HD-2026-15 for details.',
    'Xem yêu cầu REQ-2026-0042 và hợp đồng HD-2026-15 để biết chi tiết.',
    ['code'],
    { p: ['REQ-2026-0042', 'HD-2026-15'] },
  ),
  it(
    'en-056',
    'License code LIC-2026-0007-2 belongs to Cost Center CC-0042.',
    'Mã giấy phép LIC-2026-0007-2 thuộc Cost Center CC-0042.',
    ['code', 'glossary'],
    { p: ['LIC-2026-0007-2', 'CC-0042', 'Cost Center'], c: g.costCenter },
  ),
  it(
    'en-057',
    'Purchase order PO-2026-118 was sent to the vendor.',
    'Đơn mua PO-2026-118 đã được gửi cho nhà cung cấp.',
    ['code'],
    { p: ['PO-2026-118'] },
  ),
  it(
    'en-058',
    'Ticket INC-2026-0555 is linked to request REQ-2026-0042.',
    'Phiếu INC-2026-0555 được liên kết với yêu cầu REQ-2026-0042.',
    ['code'],
    { p: ['INC-2026-0555', 'REQ-2026-0042'] },
  ),

  // ---- names
  it(
    'en-059',
    'Lê Hoàng Nam asks for an additional Docker Desktop seat for the DevOps team.',
    'Lê Hoàng Nam đề nghị cấp thêm seat Docker Desktop cho nhóm DevOps.',
    ['name', 'software', 'glossary'],
    { p: ['Lê Hoàng Nam', 'Docker Desktop', 'DevOps'], c: g.seat },
  ),
  it(
    'en-060',
    'According to Đỗ Thế Vinh and Ngô Phương Thảo, this tool is necessary for the testing process.',
    'Theo ý kiến của Đỗ Thế Vinh và Ngô Phương Thảo, công cụ này cần thiết cho quy trình kiểm thử.',
    ['name'],
    { p: ['Đỗ Thế Vinh', 'Ngô Phương Thảo'] },
  ),
  it(
    'en-061',
    'Ms. Hoàng Ngọc Lan is in charge of the budget of Acme Demo Co.',
    'Chị Hoàng Ngọc Lan phụ trách ngân sách của Acme Demo Co.',
    ['name'],
    { p: ['Hoàng Ngọc Lan', 'Acme Demo Co'] },
  ),
  it(
    'en-062',
    'Mr. Bùi Gia Huy is the Spending Approver of Acme Demo Co.',
    'Ông Bùi Gia Huy là Người duyệt chi của Acme Demo Co.',
    ['name', 'glossary'],
    { p: ['Bùi Gia Huy', 'Acme Demo Co'], c: g.approver },
  ),
  it(
    'en-063',
    'Nguyễn Văn An and Trần Thị Bích submitted the joint request.',
    'Nguyễn Văn An và Trần Thị Bích đã gửi yêu cầu chung.',
    ['name'],
    { p: ['Nguyễn Văn An', 'Trần Thị Bích'] },
  ),

  // ---- software
  it(
    'en-064',
    'We use GitHub Actions to run tests and Postman to test APIs.',
    'Chúng tôi dùng GitHub Actions để chạy kiểm thử và Postman để kiểm thử API.',
    ['software'],
    { p: ['GitHub Actions', 'Postman'] },
  ),
  it(
    'en-065',
    'Please install MATLAB and AutoCAD for the laboratory.',
    'Vui lòng cài MATLAB và AutoCAD cho phòng thí nghiệm.',
    ['software'],
    { p: ['MATLAB', 'AutoCAD'] },
  ),
  it(
    'en-066',
    'Adobe Photoshop is too expensive compared with Figma.',
    'Adobe Photoshop quá đắt so với Figma.',
    ['software'],
    { p: ['Adobe Photoshop', 'Figma'] },
  ),
  it(
    'en-067',
    'The data team needs Tableau and Microsoft Power BI to build dashboards.',
    'Nhóm dữ liệu cần Tableau và Microsoft Power BI để làm dashboard.',
    ['software'],
    { p: ['Tableau', 'Microsoft Power BI'] },
  ),
  it(
    'en-068',
    'We propose switching from Slack to Microsoft Teams to save costs.',
    'Chúng tôi đề xuất chuyển từ Slack sang Microsoft Teams để tiết kiệm chi phí.',
    ['software'],
    { p: ['Slack', 'Microsoft Teams'] },
  ),
  it(
    'en-069',
    'Using ChatGPT for work requires a security review.',
    'Dùng ChatGPT cho công việc cần được xem xét bảo mật.',
    ['software'],
    { p: ['ChatGPT'] },
  ),

  // ---- more glossary
  it(
    'en-070',
    'Each department must name one Spending Approver and one Cost Center.',
    'Mỗi phòng phải chỉ định một Người duyệt chi và một Cost Center.',
    ['glossary'],
    { p: ['Cost Center'], c: [...g.department, ...g.approver] },
  ),
  it(
    'en-071',
    'Please renew the Zoom seats of the Marketing department.',
    'Vui lòng gia hạn các seat Zoom của phòng Marketing.',
    ['glossary', 'software'],
    { p: ['Zoom'], c: [...g.renew, ...g.seat, ...g.department] },
  ),

  // ---- mixed English / Vietnamese
  it(
    'en-072',
    'Please approve my request for 2 seats, anh Nam đã confirm rồi.',
    'Vui lòng duyệt yêu cầu 2 seat của tôi, anh Nam đã xác nhận rồi.',
    ['mixed', 'approve', 'glossary'],
    { c: g.seat },
  ),
  it(
    'en-073',
    'The tool is not in the catalog nên em xin exception từ trưởng phòng.',
    'Công cụ không có trong catalog nên em xin exception từ trưởng phòng.',
    ['mixed', 'negation', 'glossary'],
    { p: ['nên em xin exception từ trưởng phòng'], c: g.head },
  ),
  it(
    'en-074',
    'Deadline là 15/11/2026, so please renew soon.',
    'Deadline là 15/11/2026, vì vậy vui lòng gia hạn sớm.',
    ['mixed', 'date', 'glossary'],
    { p: ['15/11/2026'], c: g.renew },
  ),

  // ---- collision with placeholder-looking text
  it(
    'en-075',
    'The reference code <x0> in the old record is still used for REQ-2026-0042.',
    'Mã tham chiếu <x0> trong bản ghi cũ vẫn dùng cho REQ-2026-0042.',
    ['collision', 'code'],
    { p: ['<x0>', 'REQ-2026-0042'] },
  ),
  it(
    'en-076',
    'The form shows <x1> instead of the name Trần Thị Bích.',
    'Biểu mẫu hiển thị <x1> thay vì tên Trần Thị Bích.',
    ['collision', 'name'],
    { p: ['<x1>', 'Trần Thị Bích'] },
  ),
  it(
    'en-077',
    'Sample values: <x0>, <x1>, <x2> are not real data.',
    'Giá trị mẫu: <x0>, <x1>, <x2> không phải là dữ liệu thật.',
    ['collision', 'negation'],
    { p: ['<x0>', '<x1>', '<x2>'] },
  ),

  // ---- multi-sentence
  it(
    'en-078',
    'I am a software engineer in the Engineering department. The new project requires interface design in Figma. The team currently has only 2 seats, which is not enough. Please grant 3 more seats until 31/03/2027.',
    'Tôi là kỹ sư phần mềm thuộc phòng Kỹ thuật. Dự án mới yêu cầu thiết kế giao diện trên Figma. Hiện nhóm chỉ có 2 seat nên không đủ. Đề nghị cấp thêm 3 seat đến hết 31/03/2027.',
    ['plain', 'software', 'number', 'date', 'glossary'],
    { p: ['Figma', '31/03/2027'], c: [...g.seat, ...g.department] },
  ),
  it(
    'en-079',
    'Reason for rejection: the tool duplicates the functionality of Slack. Please use the existing Slack. If you still need it, resubmit the request with a quotation.',
    'Lý do từ chối: công cụ trùng chức năng với Slack. Vui lòng dùng Slack hiện có. Nếu vẫn cần, hãy gửi lại yêu cầu kèm báo giá.',
    ['reject', 'software'],
    { p: ['Slack'] },
  ),
  it(
    'en-080',
    'Handover complete. The Jira seat has been transferred to Ngô Phương Thảo. The old account has been revoked.',
    'Bàn giao hoàn tất. Seat Jira đã chuyển cho Ngô Phương Thảo. Tài khoản cũ đã bị thu hồi.',
    ['revoke', 'name', 'software', 'glossary'],
    { p: ['Jira', 'Ngô Phương Thảo'], c: [...g.seat, ...g.handover] },
  ),

  // ---- long single sentences
  longItem('en', 'en-L1', 18),
  longItem('en', 'en-L2', 24),
  longItem('en', 'en-L3', 29),
  longItem('en', 'en-L4', 40),
];
