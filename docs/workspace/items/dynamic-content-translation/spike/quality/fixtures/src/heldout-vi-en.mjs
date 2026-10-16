// HELD-OUT vi -> en fixtures. Written BEFORE the 4.3.1 benchmark run and never used to tune any guard.
// New wordings (not paraphrases of vi-en.mjs), invented names/codes, *.example domains. Source Vietnamese, reference an
// AI-drafted English translation (AI draft, not human gold). Polarity checks are keyword groups with synonyms; they are
// independent of lib/polarity.mjs.
import { makeItem, G } from './helpers.mjs';

const mk = makeItem('en');
const g = G.en;

const NEG = [['not', "n't", 'no ', 'never', 'cannot', 'unable', 'without', 'nobody', 'none', 'neither', 'nothing']];
const APPROVE = [['approv', 'endors', 'accept', 'agree', 'grant', 'signed off', 'sign off']];
const REJECT = [['reject', 'declin', 'denied', 'deny', 'refus', 'turned down', 'not approv', 'not accept', 'not agree', 'disagree', 'cannot approve', 'cannot accept', 'unable to approve']];
const REVOKE = [['revok', 'withdr', 'remov', 'rescind']];
const CHECKS = {
  negation: { c: NEG, n: [] },
  approve: { c: APPROVE, n: ['reject', 'declin', 'denied', 'refus', 'turned down'] },
  reject: { c: REJECT, n: ['has been approved', 'is approved', 'was approved'] },
  revoke: { c: REVOKE, n: [] },
};

// it(id, source, reference, categories, { p, c, n })  - polarity categories add the synonym groups above
const it = (id, source, reference, categories, o = {}) => {
  const c = [...(o.c ?? [])];
  const n = [...(o.n ?? [])];
  for (const cat of categories) {
    if (!CHECKS[cat]) continue;
    c.push(...CHECKS[cat].c);
    n.push(...CHECKS[cat].n);
  }
  return mk(id, source, reference, categories, { p: o.p ?? [], c, n, custom: true });
};

export const heldoutViEn = [
  // ---- negation
  it('h-vi-001', 'Chúng tôi chẳng có đủ ngân sách để mua thêm giấy phép.', 'We do not have enough budget to buy additional licenses.', ['negation', 'plain']),
  it('h-vi-002', 'Đừng gửi mật khẩu qua email.', 'Do not send passwords by email.', ['negation', 'plain']),
  it('h-vi-003', 'Nhân viên mới chưa được cấp quyền truy cập kho mã nguồn.', 'The new employee has not been granted access to the code repository.', ['negation', 'plain']),
  it('h-vi-004', 'Không ai trong nhóm biết ai đã tạo tài khoản này.', 'Nobody on the team knows who created this account.', ['negation', 'plain']),
  it('h-vi-005', 'Hợp đồng không tự động gia hạn nếu không có thông báo.', 'The contract does not renew automatically without notice.', ['negation', 'glossary'], { c: g.renew }),
  it('h-vi-006', 'Chớ cài đặt phần mềm từ nguồn không rõ ràng.', 'Never install software from unclear sources.', ['negation', 'plain']),
  it('h-vi-007', 'Chúng tôi không thể thanh toán hóa đơn trước hạn.', 'We cannot pay the invoice before the due date.', ['negation', 'plain']),
  it('h-vi-008', 'Báo cáo tuần này cho thấy không có seat nào bị bỏ phí.', "This week's report shows that no seats were wasted.", ['negation', 'glossary'], { c: g.seat }),
  it('h-vi-009', 'Công cụ này chưa từng được dùng ở phòng Marketing.', 'This tool has never been used in the Marketing department.', ['negation', 'glossary'], { c: g.department }),
  it('h-vi-010', 'Hệ thống không cho phép đăng nhập từ hai thiết bị cùng lúc.', 'The system does not allow signing in from two devices at the same time.', ['negation', 'plain']),

  // ---- approve
  it('h-vi-011', 'Giám đốc tài chính đã chấp thuận ngân sách cho dự án Orion.', 'The finance director approved the budget for project Orion.', ['approve', 'name'], { p: ['Orion'] }),
  it('h-vi-012', 'Chúng tôi đồng ý gia hạn gói Zoom thêm một năm.', 'We agree to renew the Zoom plan for another year.', ['approve', 'software', 'glossary'], { p: ['Zoom'], c: g.renew }),
  it('h-vi-013', 'Đề nghị mua Postman đã được phê duyệt sáng nay.', 'The request to buy Postman was approved this morning.', ['approve', 'software'], { p: ['Postman'] }),
  it('h-vi-014', 'Người duyệt chi tán thành việc chuyển sang gói Microsoft Teams.', 'The Spending Approver endorses switching to the Microsoft Teams plan.', ['approve', 'software', 'glossary'], { p: ['Microsoft Teams'], c: g.approver }),
  it('h-vi-015', 'Yêu cầu nâng cấp Notion được chấp nhận với điều kiện giảm bớt 2 seat.', 'The Notion upgrade request is accepted on condition that 2 seats are cut.', ['approve', 'software', 'number', 'glossary'], { p: ['Notion'], c: g.seat }),
  it('h-vi-016', 'Trưởng phòng ký duyệt đề xuất của Đặng Minh Khoa.', 'The department head signed off on the proposal of Đặng Minh Khoa.', ['approve', 'name', 'glossary'], { p: ['Đặng Minh Khoa'], c: g.head }),
  it('h-vi-017', 'Sau khi xem xét, tôi chấp thuận cấp thêm 4 seat Jira.', 'After review, I approve granting 4 more Jira seats.', ['approve', 'software', 'number', 'glossary'], { p: ['Jira'], c: g.seat }),
  it('h-vi-018', 'Ban quản lý đồng ý cho phép dùng Slack trong dự án Atlas.', 'Management agrees to allow the use of Slack in project Atlas.', ['approve', 'software'], { p: ['Slack', 'Atlas'] }),

  // ---- reject
  it('h-vi-019', 'Chúng tôi xin từ chối báo giá của nhà cung cấp vì quá cao.', "We decline the vendor's quotation because it is too high.", ['reject', 'plain']),
  it('h-vi-020', 'Đề xuất dùng Dropbox bị bác bỏ do chưa qua đánh giá bảo mật.', 'The proposal to use Dropbox was rejected because it has not passed a security assessment.', ['reject', 'negation', 'software'], { p: ['Dropbox'] }),
  it('h-vi-021', 'Yêu cầu REQ-2026-0211 không được chấp thuận.', 'Request REQ-2026-0211 is not approved.', ['reject', 'negation', 'code'], { p: ['REQ-2026-0211'] }),
  it('h-vi-022', 'Trưởng phòng không đồng ý cấp thêm seat Figma cho nhóm thử nghiệm.', 'The department head does not agree to grant additional Figma seats to the pilot team.', ['reject', 'negation', 'software', 'glossary'], { p: ['Figma'], c: [...g.head, ...g.seat] }),
  it('h-vi-023', 'Người duyệt chi đã từ chối khoản 9.500.000 đồng cho khóa đào tạo.', 'The Spending Approver rejected the 9.500.000 đồng expense for the training course.', ['reject', 'number', 'glossary'], { p: ['9.500.000 đồng'], c: g.approver }),
  it('h-vi-024', 'Rất tiếc, đơn xin cấp quyền quản trị của Lê Hoàng Nam bị bác.', 'Unfortunately, the administrator-rights application of Lê Hoàng Nam was turned down.', ['reject', 'name'], { p: ['Lê Hoàng Nam'] }),
  it('h-vi-025', 'Khoản chi này không được duyệt vì chưa có Cost Center.', 'This expense is not approved because there is no Cost Center yet.', ['reject', 'negation', 'glossary'], { p: ['Cost Center'] }),
  it('h-vi-026', 'Phòng IT khước từ yêu cầu cài phần mềm chưa được kiểm định.', 'The IT department refuses the request to install unverified software.', ['reject', 'glossary'], { c: g.department }),

  // ---- revoke / handover
  it('h-vi-027', 'Quản trị viên đã rút quyền truy cập của Phạm Quỳnh Anh sau khi chị chuyển công tác.', "The administrator withdrew Phạm Quỳnh Anh's access after she was reassigned.", ['revoke', 'name'], { p: ['Phạm Quỳnh Anh'] }),
  it('h-vi-028', 'Cần thu hồi giấy phép MATLAB từ các máy không còn sử dụng.', 'The MATLAB licenses must be revoked from machines that are no longer in use.', ['revoke', 'software', 'negation', 'glossary'], { p: ['MATLAB'], c: g.revoke }),
  it('h-vi-029', 'Quyền quản trị của tài khoản dùng chung sẽ bị hủy quyền vào cuối tháng.', 'The admin rights of the shared account will be revoked at the end of the month.', ['revoke', 'plain']),
  it('h-vi-030', 'Chúng tôi đã thu hồi 12 seat Tableau chưa kích hoạt.', 'We revoked 12 unactivated Tableau seats.', ['revoke', 'software', 'number', 'glossary'], { p: ['Tableau'], c: g.seat }),
  it('h-vi-031', 'Sau khi bàn giao, tài khoản cũ của Hoàng Ngọc Lan bị thu hồi ngay.', "After the handover, Hoàng Ngọc Lan's old account is revoked immediately.", ['revoke', 'name', 'glossary'], { p: ['Hoàng Ngọc Lan'], c: g.handover }),
  it('h-vi-032', 'Yêu cầu tước quyền truy cập của nhà thầu đã hết hạn hợp đồng.', 'Request to remove the access of the contractor whose contract has expired.', ['revoke', 'plain']),
  it('h-vi-033', 'Không thu hồi seat của nhân viên đang nghỉ thai sản.', 'Do not revoke the seat of employees on maternity leave.', ['revoke', 'negation', 'glossary'], { c: g.seat }),
  it('h-vi-034', 'Hạn bàn giao thiết bị và thu hồi tài khoản là 30/12/2026.', 'The deadline to hand over the equipment and revoke the accounts is 30/12/2026.', ['revoke', 'date', 'glossary'], { p: ['30/12/2026'], c: [...g.handover, ...g.revoke] }),

  // ---- names, software, numbers, dates, e-mail, codes
  it('h-vi-035', 'Công ty Sao Mai Demo thanh toán 18.750.000 đồng cho gói Atlassian.', 'Công ty Sao Mai Demo pays 18.750.000 đồng for the Atlassian plan.', ['name', 'number', 'software'], { p: ['Công ty Sao Mai Demo', '18.750.000 đồng', 'Atlassian'] }),
  it('h-vi-036', 'Hóa đơn INV-2026-0881 sẽ gửi tới ke.toan@sao-mai-demo.example trước ngày 5 tháng 12 năm 2026.', 'Invoice INV-2026-0881 will be sent to ke.toan@sao-mai-demo.example before ngày 5 tháng 12 năm 2026.', ['code', 'email', 'date'], { p: ['INV-2026-0881', 'ke.toan@sao-mai-demo.example', 'ngày 5 tháng 12 năm 2026'] }),
  it('h-vi-037', 'Cuộc họp rà soát giấy phép diễn ra vào 14/01/2027 tại phòng họp tầng 2.', 'The license review meeting takes place on 14/01/2027 in the meeting room on the 2nd floor.', ['date', 'glossary'], { p: ['14/01/2027'], c: [['room']], n: ['department'] }),
  it('h-vi-038', 'Phan Văn Tài đề nghị cài GitLab và SonarQube cho nhóm kiểm thử.', 'Phan Văn Tài asks to install GitLab and SonarQube for the testing team.', ['name', 'software'], { p: ['Phan Văn Tài', 'GitLab', 'SonarQube'] }),
  it('h-vi-039', 'Hợp đồng HD-2027-03 có giá trị 24.000 USD và thời hạn 24 tháng.', 'Contract HD-2027-03 is worth 24.000 USD with a term of 24 months.', ['code', 'number'], { p: ['HD-2027-03', '24.000 USD'] }),
  it('h-vi-040', 'Thông tin truy cập đã gửi tới tai.pham@sao-mai-demo.example.', 'The access details were sent to tai.pham@sao-mai-demo.example.', ['email'], { p: ['tai.pham@sao-mai-demo.example'] }),
  it('h-vi-041', 'Hạn báo hủy hợp đồng Dropbox là 31/12/2026, sau mốc đó sẽ tự động gia hạn.', 'The Dropbox contract cancellation deadline is 31/12/2026; after that it renews automatically.', ['glossary', 'date', 'software'], { p: ['Dropbox', '31/12/2026'], c: [...g.deadline, ...g.renew] }),
  it('h-vi-042', 'Giá niêm yết 3,2 triệu đồng mỗi năm, giảm 12% cho hợp đồng ba năm.', 'The list price is 3,2 triệu đồng per year, with a 12% discount for a three-year contract.', ['number'], { p: ['3,2 triệu đồng', '12%'] }),

  // ---- unaccented Vietnamese
  it('h-vi-043', 'Yeu cau cai dat Visual Studio Code da duoc phe duyet.', 'The request to install Visual Studio Code has been approved.', ['unaccented', 'approve', 'software'], { p: ['Visual Studio Code'] }),
  it('h-vi-044', 'Chung toi khong the thu hoi tai khoan truoc ngay 20/12/2026.', 'We cannot revoke the account before 20/12/2026.', ['unaccented', 'negation', 'revoke', 'date'], { p: ['20/12/2026'] }),
  it('h-vi-045', 'Truong phong tu choi de xuat mua them seat Slack.', 'The department head rejected the proposal to buy more Slack seats.', ['unaccented', 'reject', 'software', 'glossary'], { p: ['Slack'], c: [...g.head, ...g.seat] }),

  // ---- mixed Vietnamese / English
  it('h-vi-046', 'Anh ơi, please approve giúp em request này trước thứ Sáu nhé.', 'Hey, please approve this request for me before Friday.', ['mixed', 'approve']),
  it('h-vi-047', 'Team em không cần license mới, chỉ cần renew seat cũ thôi.', 'Our team does not need a new license, only to renew the old seats.', ['mixed', 'negation', 'glossary'], { c: [...g.renew, ...g.seat] }),

  // ---- collision with placeholder-looking text
  it('h-vi-048', 'Trường <x0> trong mẫu in không phải là mã yêu cầu thật.', 'The <x0> field in the print template is not a real request code.', ['collision', 'negation'], { p: ['<x0>'] }),
  it('h-vi-049', 'Mẫu thư dùng <x2> thay cho tên Phan Văn Tài, không được xóa.', 'The letter template uses <x2> in place of the name Phan Văn Tài and must not be deleted.', ['collision', 'negation', 'name'], { p: ['<x2>', 'Phan Văn Tài'] }),

  // ---- multi-sentence notes
  it(
    'h-vi-050',
    'Dự án Orion cần thêm công cụ kiểm thử tải. Đề nghị cấp 6 seat JMeter Cloud đến hết 30/06/2027. Ngân sách đã được chấp thuận.',
    'Project Orion needs an additional load-testing tool. Please grant 6 JMeter Cloud seats until 30/06/2027. The budget has been approved.',
    ['approve', 'software', 'date', 'glossary'],
    { p: ['Orion', 'JMeter Cloud', '30/06/2027'], c: g.seat },
  ),
  it(
    'h-vi-051',
    'Chúng tôi từ chối gia hạn Dropbox. Nhóm sẽ chuyển dữ liệu sang kho lưu trữ nội bộ. Tài khoản cũ sẽ bị thu hồi sau 30 ngày.',
    'We decline to renew Dropbox. The team will move the data to internal storage. The old accounts will be revoked after 30 days.',
    ['reject', 'revoke', 'software', 'glossary'],
    { p: ['Dropbox'], c: g.renew },
  ),
  it(
    'h-vi-052',
    'Đừng tắt xác thực hai lớp. Chính sách bảo mật không cho phép ngoại lệ. Liên hệ it-helpdesk@sao-mai-demo.example nếu cần hỗ trợ.',
    'Do not turn off two-factor authentication. The security policy does not allow exceptions. Contact it-helpdesk@sao-mai-demo.example if you need support.',
    ['negation', 'email'],
    { p: ['it-helpdesk@sao-mai-demo.example'] },
  ),

  // ---- long single sentences (clause splitting by real tokens)
  {
    ...it(
      'h-vi-L1',
      'Chúng tôi viết đề nghị này để trình bày kế hoạch dùng chung công cụ đo kiểm hiệu năng cho ba nhóm sản phẩm, trong đó nhóm thanh toán cần mười seat Datadog để theo dõi độ trễ của giao dịch, nhóm tìm kiếm cần năm seat để so sánh số liệu trước và sau mỗi lần cập nhật hệ thống, và nhóm di động cần thêm bốn seat vì số sự cố trong quý này tăng gần gấp đôi, nhưng ngân sách hiện tại chỉ đủ cho tám seat, nên chúng tôi đề nghị phòng Tài chính xem xét tạm ứng khoản chi cho phần còn thiếu, để cả ba nhóm có thể bắt đầu từ đầu quý sau.',
      'We are writing this request to present a plan for sharing a performance-monitoring tool across three product teams, in which the payments team needs ten Datadog seats to track transaction latency, the search team needs five seats to compare figures before and after each system update, and the mobile team needs four more seats because the number of incidents this quarter has almost doubled, but the current budget covers only eight seats, so we ask the Finance department to consider advancing the expense for the missing part, so that all three teams can start at the beginning of next quarter.',
      ['long', 'software', 'glossary'],
      { p: ['Datadog'], c: g.seat },
    ),
  },
  {
    ...it(
      'h-vi-L2',
      'Báo cáo kiểm kê giấy phép cuối năm cho thấy phòng Vận hành còn mười hai seat Confluence chưa dùng, phòng Kỹ thuật đang chia sẻ một tài khoản GitHub giữa ba người dù chính sách không cho phép, nhóm thiết kế đã mua trùng hai gói Figma do hai trưởng nhóm cùng gửi yêu cầu, trong khi nhóm kiểm thử vẫn chưa có công cụ quản lý ca kiểm thử nào ngoài bảng tính, vì vậy chúng tôi đề xuất thu hồi các seat chưa dùng, hợp nhất gói Figma, cấp riêng tài khoản cho từng người và mua một công cụ quản lý ca kiểm thử trong quý sau, miễn là tổng chi phí không vượt hạn mức đã được duyệt cho năm 2027.',
      'The year-end license inventory shows that the Operations department still has twelve unused Confluence seats, the Engineering department is sharing one GitHub account among three people although the policy does not allow it, the design team bought two duplicate Figma plans because two team leads submitted the same request, while the testing team still has no test-case management tool other than a spreadsheet, so we propose to revoke the unused seats, merge the Figma plans, issue a separate account to each person and buy a test-case management tool next quarter, provided that the total cost does not exceed the limit approved for 2027.',
      ['long', 'negation', 'revoke', 'software', 'glossary'],
      { p: ['Confluence', 'GitHub', 'Figma'], c: [...g.seat, ...g.department] },
    ),
  },
];
