// HELD-OUT en -> vi fixtures. Written BEFORE the 4.3.1 benchmark run and never used to tune any guard.
// New wordings (not paraphrases of en-vi.mjs), invented names/codes, *.example domains. Source English, reference an
// AI-drafted Vietnamese translation (AI draft, not human gold). Polarity checks are keyword groups with synonyms; they are
// independent of lib/polarity.mjs.
import { makeItem, G } from './helpers.mjs';

const mk = makeItem('vi');
const g = G.vi;

const NEG = [['không', 'chưa', 'chẳng', 'đừng', 'chớ']];
const APPROVE = [['duyệt', 'chấp thuận', 'đồng ý', 'chấp nhận', 'tán thành', 'phê chuẩn', 'cấp']];
const REJECT = [['từ chối', 'bác bỏ', 'không duyệt', 'không được duyệt', 'không thể duyệt', 'không chấp', 'không đồng ý', 'khước từ', 'không được trưởng phòng duyệt', 'không được chấp thuận', 'không được chấp nhận']];
const REVOKE = [['thu hồi', 'rút quyền', 'hủy quyền', 'gỡ quyền', 'tước quyền']];
const CHECKS = {
  negation: { c: NEG, n: [] },
  approve: { c: APPROVE, n: ['từ chối', 'bác bỏ'] },
  reject: { c: REJECT, n: ['đã được duyệt', 'đã duyệt', 'đã phê duyệt', 'được phê duyệt'] },
  revoke: { c: REVOKE, n: [] },
};

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

export const heldoutEnVi = [
  // ---- negation
  it('h-en-001', 'We have no spare licenses for the new interns.', 'Chúng tôi không còn giấy phép dự phòng nào cho các thực tập sinh mới.', ['negation', 'plain']),
  it('h-en-002', 'Never reuse the same password for two tools.', 'Đừng bao giờ dùng lại cùng một mật khẩu cho hai công cụ.', ['negation', 'plain']),
  it('h-en-003', 'The invoice has not been paid, and the vendor will not extend the deadline.', 'Hóa đơn chưa được thanh toán và nhà cung cấp sẽ không gia hạn thời hạn.', ['negation', 'plain']),
  it('h-en-004', 'Nobody in procurement has seen this contract.', 'Không ai ở bộ phận mua sắm từng xem hợp đồng này.', ['negation', 'plain']),
  it('h-en-005', "The new hire doesn't have access to the billing portal yet.", 'Nhân viên mới chưa có quyền truy cập cổng thanh toán.', ['negation', 'plain']),
  it('h-en-006', 'You cannot install plugins without administrator approval.', 'Bạn không thể cài plugin nếu không có sự phê duyệt của quản trị viên.', ['negation', 'approve']),
  it('h-en-007', 'This subscription does not renew automatically.', 'Gói đăng ký này không tự động gia hạn.', ['negation', 'glossary'], { c: g.renew }),
  it('h-en-008', 'There is no seat left in the Marketing department plan.', 'Gói của phòng Marketing không còn seat nào.', ['negation', 'glossary'], { c: [...g.seat, ...g.department] }),
  it('h-en-009', 'The team never received the activation key.', 'Nhóm chưa bao giờ nhận được khóa kích hoạt.', ['negation', 'plain']),
  it('h-en-010', 'Without a Cost Center, the purchase cannot proceed.', 'Nếu không có Cost Center, việc mua hàng không thể tiếp tục.', ['negation', 'glossary'], { p: ['Cost Center'] }),

  // ---- approve
  it('h-en-011', 'The budget committee endorsed the plan to consolidate three analytics tools.', 'Ủy ban ngân sách tán thành kế hoạch hợp nhất ba công cụ phân tích.', ['approve', 'plain']),
  it('h-en-012', 'I am happy to approve the extra seats for the design team.', 'Tôi sẵn lòng duyệt thêm seat cho nhóm thiết kế.', ['approve', 'glossary'], { c: g.seat }),
  it('h-en-013', 'Your request to install Docker Desktop was approved yesterday.', 'Yêu cầu cài Docker Desktop của bạn đã được duyệt hôm qua.', ['approve', 'software'], { p: ['Docker Desktop'] }),
  it('h-en-014', 'The Spending Approver agreed to cover the cost of the Postman upgrade.', 'Người duyệt chi đồng ý chi trả khoản nâng cấp Postman.', ['approve', 'software', 'glossary'], { p: ['Postman'], c: g.approver }),
  it('h-en-015', 'We accept the vendor offer of 14,000 USD for two years.', 'Chúng tôi chấp nhận đề nghị 14,000 USD trong hai năm của nhà cung cấp.', ['approve', 'number'], { p: ['14,000 USD'] }),
  it('h-en-016', "The department head signed off on Tạ Minh Châu's laptop request.", 'Trưởng phòng đã ký duyệt yêu cầu laptop của Tạ Minh Châu.', ['approve', 'name', 'glossary'], { p: ['Tạ Minh Châu'], c: g.head }),
  it('h-en-017', 'Access to the analytics workspace is granted to all team leads.', 'Quyền truy cập không gian phân tích được cấp cho mọi trưởng nhóm.', ['approve', 'plain']),
  it('h-en-018', 'Finance has authorised the purchase order PO-2027-009.', 'Phòng Tài chính đã duyệt đơn mua PO-2027-009.', ['approve', 'code'], { p: ['PO-2027-009'] }),

  // ---- reject
  it('h-en-019', 'Management declined to fund the extra Jira seats.', 'Ban quản lý từ chối tài trợ thêm seat Jira.', ['reject', 'software', 'glossary'], { p: ['Jira'], c: g.seat }),
  it('h-en-020', 'The security team denied access to the production dashboard.', 'Nhóm bảo mật từ chối quyền truy cập bảng điều khiển sản xuất.', ['reject', 'plain']),
  it('h-en-021', 'Request REQ-2027-0044 was not approved by the department head.', 'Yêu cầu REQ-2027-0044 không được trưởng phòng duyệt.', ['reject', 'negation', 'code', 'glossary'], { p: ['REQ-2027-0044'], c: g.head }),
  it('h-en-022', 'We rejected the offer because the renewal price rose by 22%.', 'Chúng tôi từ chối đề nghị vì giá gia hạn tăng 22%.', ['reject', 'number', 'glossary'], { p: ['22%'], c: g.renew }),
  it('h-en-023', 'Unfortunately the exception was turned down.', 'Rất tiếc, ngoại lệ đã bị bác bỏ.', ['reject', 'plain']),
  it('h-en-024', 'The Spending Approver refused the 7,800,000 VND expense.', 'Người duyệt chi từ chối khoản chi 7,800,000 VND.', ['reject', 'number', 'glossary'], { p: ['7,800,000 VND'], c: g.approver }),
  it('h-en-025', 'IT cannot approve the installation of unverified browser extensions.', 'Phòng IT không thể duyệt việc cài các tiện ích trình duyệt chưa được kiểm định.', ['reject', 'negation', 'glossary'], { c: g.department }),
  it('h-en-026', 'The proposal to share one Zoom account was disapproved.', 'Đề xuất dùng chung một tài khoản Zoom không được chấp thuận.', ['reject', 'software'], { p: ['Zoom'] }),

  // ---- revoke / handover
  it('h-en-027', 'The administrator withdrew access for Phan Văn Tài after the audit.', 'Quản trị viên đã rút quyền truy cập của Phan Văn Tài sau đợt kiểm toán.', ['revoke', 'name'], { p: ['Phan Văn Tài'] }),
  it('h-en-028', 'Licenses of inactive laptops will be revoked next week.', 'Giấy phép của các laptop không hoạt động sẽ bị thu hồi vào tuần sau.', ['revoke', 'glossary'], { c: g.revoke }),
  it('h-en-029', 'We removed access to the shared drive for former contractors.', 'Chúng tôi đã gỡ quyền truy cập ổ đĩa chung của các nhà thầu cũ.', ['revoke', 'plain']),
  it('h-en-030', 'Revocation of the old API key is scheduled for 15/02/2027.', 'Việc thu hồi khóa API cũ được lên lịch vào 15/02/2027.', ['revoke', 'date', 'glossary'], { p: ['15/02/2027'], c: g.revoke }),
  it('h-en-031', 'Please do not revoke the badge until the handover meeting.', 'Vui lòng không thu hồi thẻ cho đến khi họp bàn giao.', ['revoke', 'negation', 'glossary'], { c: g.handover }),
  it('h-en-032', 'The vendor will rescind the discount if we cancel early.', 'Nhà cung cấp sẽ thu hồi ưu đãi giảm giá nếu chúng tôi hủy sớm.', ['revoke', 'plain']),
  it('h-en-033', "After the handover, the departing manager's seat is revoked at once.", 'Sau khi bàn giao, seat của quản lý nghỉ việc bị thu hồi ngay.', ['revoke', 'glossary'], { c: [...g.seat, ...g.handover] }),
  it('h-en-034', 'Remove access for the intern account today.', 'Hãy gỡ quyền truy cập của tài khoản thực tập sinh ngay hôm nay.', ['revoke', 'plain']),

  // ---- names, software, numbers, dates, e-mail, codes
  it('h-en-035', 'Acme Demo Co will pay 31,500,000 VND for the Atlassian bundle.', 'Acme Demo Co sẽ thanh toán 31,500,000 VND cho gói Atlassian.', ['name', 'number', 'software'], { p: ['Acme Demo Co', '31,500,000 VND', 'Atlassian'] }),
  it('h-en-036', 'Invoice INV-2027-0123 goes to accounting@acme-demo.example before December 8, 2026.', 'Hóa đơn INV-2027-0123 được gửi tới accounting@acme-demo.example trước December 8, 2026.', ['code', 'email', 'date'], { p: ['INV-2027-0123', 'accounting@acme-demo.example', 'December 8, 2026'] }),
  it('h-en-037', 'The audit meeting is on 21/01/2027 in the meeting room on floor 4.', 'Cuộc họp kiểm toán diễn ra vào 21/01/2027 tại phòng họp tầng 4.', ['date', 'glossary'], { p: ['21/01/2027'], c: [['phòng họp']] }),
  it('h-en-038', 'Tạ Minh Châu needs GitLab and SonarQube for the QA team.', 'Tạ Minh Châu cần GitLab và SonarQube cho nhóm QA.', ['name', 'software'], { p: ['Tạ Minh Châu', 'GitLab', 'SonarQube'] }),
  it('h-en-039', 'Contract HD-2027-08 costs 19,500 USD for 36 months.', 'Hợp đồng HD-2027-08 có giá 19,500 USD cho 36 tháng.', ['code', 'number'], { p: ['HD-2027-08', '19,500 USD'] }),
  it('h-en-040', 'Login details were emailed to hoa.ly@acme-demo.example this morning.', 'Thông tin đăng nhập đã được gửi tới hoa.ly@acme-demo.example sáng nay.', ['email'], { p: ['hoa.ly@acme-demo.example'] }),
  it('h-en-041', 'The cancellation deadline for Dropbox is 15/01/2027, otherwise it renews for a year.', 'Hạn báo hủy Dropbox là 15/01/2027, nếu không sẽ gia hạn một năm.', ['glossary', 'date', 'software'], { p: ['Dropbox', '15/01/2027'], c: [...g.deadline, ...g.renew] }),
  it('h-en-042', 'List price is $4,800 per year, with a 9% discount on three-year deals.', 'Giá niêm yết là $4,800 mỗi năm, giảm 9% cho hợp đồng ba năm.', ['number'], { p: ['$4,800', '9%'] }),

  // ---- mixed English / Vietnamese
  it('h-en-043', 'Could you approve the ticket please? Chị Mai đã check xong rồi.', 'Bạn duyệt giúp phiếu này nhé? Chị Mai đã check xong rồi.', ['mixed', 'approve'], { p: ['Chị Mai đã check xong rồi.'] }),
  it('h-en-044', 'We do not need the premium tier, chỉ cần gói basic thôi.', 'Chúng tôi không cần gói premium, chỉ cần gói basic thôi.', ['mixed', 'negation'], { p: ['chỉ cần gói basic thôi'] }),

  // ---- collision with placeholder-looking text
  it('h-en-045', 'The field <x0> in the report template is not a real code.', 'Trường <x0> trong mẫu báo cáo không phải là mã thật.', ['collision', 'negation'], { p: ['<x0>'] }),
  it('h-en-046', 'The template uses <x3> instead of the name Tạ Minh Châu and must not be removed.', 'Mẫu dùng <x3> thay cho tên Tạ Minh Châu và không được xóa.', ['collision', 'negation', 'name'], { p: ['<x3>', 'Tạ Minh Châu'] }),

  // ---- multi-sentence notes
  it(
    'h-en-047',
    'Project Orion needs a load-testing tool. Please grant 6 JMeter Cloud seats until 30/06/2027. The budget was approved last week.',
    'Dự án Orion cần một công cụ kiểm thử tải. Đề nghị cấp 6 seat JMeter Cloud đến hết 30/06/2027. Ngân sách đã được duyệt tuần trước.',
    ['approve', 'software', 'date', 'glossary'],
    { p: ['Orion', 'JMeter Cloud', '30/06/2027'], c: g.seat },
  ),
  it(
    'h-en-048',
    'We will not renew Dropbox. The team will migrate the files to internal storage. The old accounts will be revoked after 30 days.',
    'Chúng tôi sẽ không gia hạn Dropbox. Nhóm sẽ chuyển tệp sang kho lưu trữ nội bộ. Các tài khoản cũ sẽ bị thu hồi sau 30 ngày.',
    ['negation', 'revoke', 'software', 'glossary'],
    { p: ['Dropbox'], c: g.renew },
  ),
  it(
    'h-en-049',
    'Never turn off two-factor authentication. The security policy does not allow exceptions. Contact it-helpdesk@acme-demo.example for support.',
    'Đừng bao giờ tắt xác thực hai lớp. Chính sách bảo mật không cho phép ngoại lệ. Liên hệ it-helpdesk@acme-demo.example để được hỗ trợ.',
    ['negation', 'email'],
    { p: ['it-helpdesk@acme-demo.example'] },
  ),

  // ---- long single sentences (clause splitting by real tokens)
  it(
    'h-en-L1',
    'We are writing this request to present a plan for sharing a performance-monitoring tool across three product teams, in which the payments team needs ten Datadog seats to track transaction latency, the search team needs five seats to compare figures before and after each system update, and the mobile team needs four more seats because the number of incidents this quarter has almost doubled, but the current budget covers only eight seats, so we ask the Finance department to consider advancing the expense for the missing part, so that all three teams can start at the beginning of next quarter.',
    'Chúng tôi viết đề nghị này để trình bày kế hoạch dùng chung công cụ đo kiểm hiệu năng cho ba nhóm sản phẩm, trong đó nhóm thanh toán cần mười seat Datadog để theo dõi độ trễ giao dịch, nhóm tìm kiếm cần năm seat để so sánh số liệu trước và sau mỗi lần cập nhật hệ thống, và nhóm di động cần thêm bốn seat vì số sự cố trong quý này đã tăng gần gấp đôi, nhưng ngân sách hiện tại chỉ đủ cho tám seat, nên chúng tôi đề nghị phòng Tài chính xem xét tạm ứng khoản chi cho phần còn thiếu, để cả ba nhóm có thể bắt đầu từ đầu quý sau.',
    ['long', 'software', 'glossary'],
    { p: ['Datadog'], c: [...g.seat, ...g.department] },
  ),
  it(
    'h-en-L2',
    'The year-end license inventory shows that the Operations department still has twelve unused Confluence seats, the Engineering department is sharing one GitHub account among three people although the policy does not allow it, the design team bought two duplicate Figma plans because two team leads submitted the same request, while the testing team still has no test-case management tool other than a spreadsheet, so we propose to revoke the unused seats, merge the Figma plans, issue a separate account to each person and buy a test-case management tool next quarter, provided that the total cost does not exceed the limit approved for 2027.',
    'Báo cáo kiểm kê giấy phép cuối năm cho thấy phòng Vận hành còn mười hai seat Confluence chưa dùng, phòng Kỹ thuật đang chia sẻ một tài khoản GitHub giữa ba người dù chính sách không cho phép, nhóm thiết kế đã mua trùng hai gói Figma do hai trưởng nhóm cùng gửi yêu cầu, trong khi nhóm kiểm thử vẫn chưa có công cụ quản lý ca kiểm thử nào ngoài bảng tính, vì vậy chúng tôi đề xuất thu hồi các seat chưa dùng, hợp nhất gói Figma, cấp riêng tài khoản cho từng người và mua một công cụ quản lý ca kiểm thử trong quý sau, miễn là tổng chi phí không vượt hạn mức đã được duyệt cho năm 2027.',
    ['long', 'negation', 'revoke', 'software', 'glossary'],
    { p: ['Confluence', 'GitHub', 'Figma'], c: [...g.seat, ...g.department] },
  ),
];
