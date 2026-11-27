import type { DemoFixture, DemoRequestScenario } from '../demo-fixture.types';

const r = (scenario: DemoRequestScenario): DemoRequestScenario => scenario;

/*
 * The eighteen requests of SPEC S10b, sent after the thirty-one of `requests.ts`, in the states the demo still lacked: a refusal of the spending
 * approver, three kinds of return to the requester, a refusal of IT, a grant being worked, two that failed (the task closed as failed by IT, SBF-17;
 * withdrawing a request that is being granted is no longer possible, `QĐ-113d`), a group with one person refused, an internal system, and the queues of the heads. They keep to the invariants of the dataset (SPEC 4.2): no
 * request in Marketing, Design or Sales (R10, R21 and R11 keep their budgets), the old people send nothing but the heads of Finance, the Board and
 * IT, nobody asks for a plan they hold, and a person has at most three requests open at once.
 *
 * The order is the order of sending: the two that complete come first (the pool and the open requests of every person are right when the next is
 * sent), and for the Board the request that fails comes before the group the spending approver decides line by line, so the budget of the Board
 * (`budget-targets.ts`, counted for the requests that hold or wait for money at the end) never holds both at once. A request of one month costs
 * the same on every day of the seed; the ones with no end cost what the year has left.
 */
/*
 * Two seats of the baseline returned by their holders (SPEC S11). The notion-business seat of NV-DEV6 is taken away by IT (it is no longer in the
 * Notion usage file of T17, where NV-DEV6 has no row); the photoshop seat of NV-BOD2 waits for IT. Their requests of the same plan are not sent.
 */
export const RETURNS: DemoFixture['returns'] = [
  {
    key: 'RET1',
    holder: 'NV-DEV6',
    subscription: 'notion-business',
    reason: 'Đã chuyển sang dùng Confluence cho tài liệu của nhóm, không cần ghế Notion nữa.',
    complete: true,
  },
  {
    key: 'RET2',
    holder: 'NV-BOD2',
    subscription: 'adobe-photoshop',
    reason: 'Không còn chỉnh ảnh cho tài liệu của Ban Giám đốc, xin trả ghế Photoshop.',
    complete: false,
  },
];

export const REQUESTS_EXTRA: DemoRequestScenario[] = [
  r({
    key: 'R50',
    requester: 'NV-ITO1',
    plan: 'attendance-access',
    termMonths: null,
    target: 'COMPLETED',
    reason: 'Theo dõi chấm công và ca trực của nhóm hạ tầng.',
    summary: 'Hệ thống nội bộ không phí: trưởng phòng duyệt nhu cầu, IT Admin cấp quyền, không kiểm tra ngân sách.',
  }),
  r({
    key: 'R56',
    requester: 'NV-DEV6',
    plan: 'copilot-pro',
    termMonths: 2,
    target: 'COMPLETED',
    grant: 'PURCHASE',
    reason: 'Gợi ý và hoàn thành mã khi viết tính năng mới để rút ngắn thời gian lập trình.',
    summary:
      'Gói K1 không kiểm soát được (GitHub Copilot): IT mua thêm một ghế khi cấp và ghi chú các bước của danh sách.',
  }),
  r({
    key: 'R58',
    requester: 'NV-BOD1',
    plan: 'adobe-cc-teams',
    termMonths: null,
    target: 'AWAITING_SPEND_DECISION',
    reason: 'Biên tập bộ tài liệu điều hành và ấn phẩm gửi hội đồng quản trị.',
    summary: 'Biên tập bộ tài liệu điều hành bằng Adobe Creative Cloud: trưởng phòng đã trình lô, chờ Người duyệt chi.',
  }),
  r({
    key: 'R47',
    requester: 'NV-BOD1',
    plan: 'adobe-photoshop',
    termMonths: 1,
    target: 'FAILED',
    grant: 'POOL',
    reason: 'Chỉnh sửa hình ảnh cho tài liệu giới thiệu công ty gửi đối tác.',
    summary:
      'Đã duyệt chi nhưng IT không cấp được: nhà cung cấp chưa tạo tài khoản, tác vụ báo lỗi rồi đóng, Request thất bại.',
  }),
  r({
    key: 'R49',
    requester: 'NV-DEP',
    beneficiaries: ['NV-BOD1', 'NV-BOD2'],
    plan: 'm365-standard',
    termMonths: null,
    target: 'AWAITING_EXECUTION',
    rejectedLines: ['NV-BOD2'],
    reason: 'Soạn văn bản, bảng tính và bài trình bày cho các báo cáo của Ban Giám đốc.',
    summary:
      'Request nhóm của trưởng phòng Ban Giám đốc: Người duyệt chi duyệt một người, từ chối người còn lại; chờ IT cấp.',
  }),
  r({
    key: 'R44',
    requester: 'NV-BOD1',
    proposal: {
      softwareName: 'Loom',
      homepageUrl: 'https://www.loom.com',
      dataDescription: 'Video ghi màn hình hướng dẫn nội bộ, không có dữ liệu khách hàng.',
      expectedUsers: 4,
    },
    termMonths: null,
    target: 'AWAITING_REQUESTER_REVISION',
    returnAt: 'ASSESSMENT',
    reason: 'Quay video ngắn hướng dẫn các quy trình nội bộ cho nhân viên mới.',
    summary: 'Đề xuất phần mềm ngoài danh mục: IT trả lại để người đề xuất bổ sung thông tin về dữ liệu.',
  }),
  r({
    key: 'R53',
    requester: 'NV-BOD2',
    plan: 'notion-business',
    termMonths: null,
    target: 'PENDING',
    reason: 'Quản lý kế hoạch, ghi chú họp và danh sách việc của Ban Giám đốc.',
    summary: 'Đang chờ trưởng phòng Ban Giám đốc duyệt nhu cầu.',
  }),
  r({
    key: 'R42',
    requester: 'NV-FINH',
    plan: 'notion-plus',
    termMonths: 1,
    target: 'AWAITING_REQUESTER_REVISION',
    returnAt: 'SPEND',
    confirmReserve: true,
    reason: 'Lập và theo dõi kế hoạch công việc, ghi chú đối soát cho phòng Tài chính.',
    summary: 'Trưởng phòng Tài chính tự gửi (một bước): Người duyệt chi trả về để bổ sung số tháng sử dụng.',
  }),
  r({
    key: 'R55',
    requester: 'NV-FIN2',
    plan: 'zoom-pro',
    termMonths: null,
    target: 'AWAITING_SPEND_DECISION',
    confirmReserve: true,
    reason: 'Tổ chức họp trực tuyến với đối tác và ngân hàng về đối chiếu công nợ.',
    summary: 'Tài chính: dùng dự phòng, trưởng phòng đã xác nhận kèm lý do; đang chờ Người duyệt chi.',
  }),
  r({
    key: 'R52',
    requester: 'NV-FIN2',
    plan: 'confluence-standard',
    termMonths: null,
    target: 'PENDING',
    reason: 'Lưu quy trình đóng sổ cuối tháng và tài liệu hướng dẫn kế toán cho cả phòng.',
    summary: 'Đang chờ trưởng phòng Tài chính duyệt nhu cầu.',
  }),
  r({
    key: 'R40',
    requester: 'NV-DEV5',
    plan: 'confluence-premium',
    termMonths: null,
    target: 'AWAITING_SPEND_DECISION',
    reason: 'Quản lý tài liệu kỹ thuật và quy trình phát hành của nhiều dự án trong một không gian chung.',
    summary: 'Gói năm trong cửa sổ rà soát: trưởng phòng đã trình lô, đang chờ Người duyệt chi.',
  }),
  r({
    key: 'R41',
    requester: 'NV-DEV5',
    plan: 'claude-pro',
    termMonths: 12,
    target: 'REJECTED',
    rejectAt: 'SPEND',
    reason: 'Hỏi đáp, rà soát mã và tóm tắt tài liệu dài khi phân tích lỗi.',
    summary: 'Người duyệt chi từ chối kèm lý do (khác với trưởng phòng từ chối ở bước nhu cầu).',
  }),
  r({
    key: 'R43',
    requester: 'NV-DEV6',
    proposal: {
      softwareName: 'Linear',
      homepageUrl: 'https://linear.app',
      dataDescription: 'Quản lý công việc của nhóm kỹ thuật, không có dữ liệu khách hàng.',
      expectedUsers: 6,
    },
    termMonths: null,
    target: 'IT_REJECTED',
    alternativePlan: 'jira-standard',
    reason: 'Quản lý công việc và kế hoạch phát triển của nhóm kỹ thuật trên một bảng chung.',
    summary: 'Đề xuất phần mềm ngoài danh mục: IT từ chối vì không đủ điều kiện và gợi ý dùng Jira Standard.',
  }),
  r({
    key: 'R46',
    requester: 'NV-DEV6',
    plan: 'notion-plus',
    termMonths: null,
    target: 'EXECUTING',
    grant: 'POOL',
    reason: 'Ghi chú kỹ thuật, kế hoạch phát triển và tài liệu của nhóm.',
    summary: 'Đã duyệt chi, IT đã mở tác vụ cấp quyền và chưa nhận: Request đang được thực hiện.',
  }),
  r({
    key: 'R57',
    requester: 'NV-DEV7',
    plan: 'notion-business',
    termMonths: null,
    target: 'PENDING_OR_CANCELLED',
    readAs: 'NV-ENGH',
    reason: 'Ghi chép và quản lý tài liệu của nhóm kỹ thuật.',
    summary: 'Người gửi nghỉ việc ngay sau đó: Request chờ ở trưởng phòng và bị hủy khi lượt chặn truy cập chạy.',
  }),
  r({
    key: 'R45',
    requester: 'NV-ITO1',
    plan: 'zoom-pro',
    termMonths: 1,
    target: 'AWAITING_REQUESTER_REVISION',
    returnAt: 'NEED',
    reason: 'Họp trực tuyến với nhà cung cấp và hỗ trợ từ xa cho nhân viên.',
    summary: 'Trưởng phòng Công nghệ thông tin trả lại ở bước nhu cầu để người gửi bổ sung lý do.',
  }),
  r({
    key: 'R48',
    requester: 'NV-ITO2',
    plan: 'zoom-pro',
    termMonths: 1,
    target: 'FAILED',
    grant: 'POOL',
    reason: 'Hỗ trợ từ xa các nhân viên ở chi nhánh qua chia sẻ màn hình.',
    summary:
      'Đã duyệt chi, tác vụ cấp quyền báo lỗi vĩnh viễn: IT Admin đóng tác vụ là thất bại (SBF-17) và Request thất bại; người gửi không rút được vì đã có quyết định (QĐ-113d).',
  }),
  r({
    key: 'R54',
    requester: 'NV-ITO2',
    plan: 'adobe-photoshop',
    termMonths: 1,
    target: 'AWAITING_SPEND_DECISION',
    reason:
      'Chỉnh sửa ảnh minh họa cho bộ tài liệu hướng dẫn nhân viên. Nhờ anh duyệt gấp, đã báo sếp rồi, chi tiết ở drive.saoviet.vn.',
    summary: 'Đã duyệt nhu cầu và trưởng phòng trình lô; đang chờ Người duyệt chi.',
  }),
  r({
    key: 'R51',
    requester: 'NV-OPS2',
    plan: 'attendance-access',
    termMonths: null,
    target: 'PENDING',
    reason: 'Chấm công và theo dõi ca làm của nhóm vận hành.',
    summary:
      'Đang chờ trưởng phòng Vận hành duyệt nhu cầu (phòng chưa có Cost Center nhưng hệ thống nội bộ không phí).',
  }),
];
