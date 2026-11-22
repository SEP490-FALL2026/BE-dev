import type { InAppNotificationCode } from '../../public/notifications.types';
import type { NotificationTexts } from './notification-text.types';

/**
 * The sentences of MF-4 (the budget of the year of a department) and SBF-11 (the close of costs, the review and the adjustment
 * during the year). Copied from `catalog/notifications.md` of the FE docs: one entry per code, `vi` and `en`.
 */
export const BUDGET_TEXTS = {
  BUDGET_VERSION_AWAITING_DECISION: {
    vi: {
      title: 'Có ngân sách chờ bạn quyết định',
      message: 'Finance đã gửi phiên bản ngân sách năm {year} của {costCenterId:name} để bạn xem xét và quyết định.',
    },
    en: {
      title: 'A budget is waiting for your decision',
      message: 'Finance sent the {year} budget version of {costCenterId:name} for your review and decision.',
    },
  },
  BUDGET_PROPOSAL_SUBMITTED: {
    vi: {
      title: 'Có đề xuất ngân sách mới',
      message: '{costCenterId:name} vừa gửi đề xuất ngân sách năm {year}. Vui lòng xem xét.',
    },
    en: {
      title: 'New budget proposal',
      message: '{costCenterId:name} submitted a budget proposal for {year}. Please review it.',
    },
  },
  BUDGET_PROPOSAL_RETURNED: {
    vi: {
      title: 'Đề xuất ngân sách bị trả về',
      message:
        'Finance đã trả lại đề xuất ngân sách năm {year} của {costCenterId:name}.[ Lý do: {reason}.] Vui lòng chỉnh sửa và gửi lại trước hạn nộp.',
    },
    en: {
      title: 'Budget proposal returned',
      message:
        'Finance returned the {year} budget proposal of {costCenterId:name}.[ Reason: {reason}.] Please revise and resubmit before the deadline.',
    },
  },
  BUDGET_VERSION_DECIDED: {
    vi: {
      title: 'Ngân sách đã có quyết định',
      message: 'Phiên bản ngân sách năm {year} của {costCenterId:name} đã được {decision:enum}.[ Lý do: {reason}.]',
    },
    en: {
      title: 'Budget decision made',
      message: 'The {year} budget version of {costCenterId:name} was {decision:enum}.[ Reason: {reason}.]',
    },
  },
  BUDGET_VERSION_CLOSED_UNAPPROVED: {
    vi: {
      title: 'Phiên bản ngân sách đã bị đóng',
      message:
        'Năm {year} đã kết thúc nhưng phiên bản ngân sách của {costCenterId:name} chưa được phê duyệt, nên đã được đóng lại.',
    },
    en: {
      title: 'Budget version closed',
      message:
        'The {year} fiscal year has ended and the budget version of {costCenterId:name} was never approved, so it has been closed.',
    },
  },
  BUDGET_PROPOSAL_CLOSED_YEAR_END: {
    vi: {
      title: 'Đề xuất ngân sách đã bị đóng',
      message:
        'Năm {year} đã kết thúc, đề xuất ngân sách của {costCenterId:name} chưa được sử dụng nên đã được đóng lại.',
    },
    en: {
      title: 'Budget proposal closed',
      message:
        'The {year} fiscal year has ended and the budget proposal of {costCenterId:name} was never used, so it has been closed.',
    },
  },
  BUDGET_PROPOSAL_TASK_ASSIGNED: {
    vi: {
      title: 'Bạn có đề xuất ngân sách cần xử lý',
      message:
        'Đề xuất ngân sách năm {year} của {costCenterId:name} ({departmentId:name}) đã bị Finance trả về. Bạn là trưởng phòng hiện tại, vui lòng chỉnh sửa và gửi lại hoặc rút đề xuất.',
    },
    en: {
      title: 'A budget proposal needs your action',
      message:
        'The {year} budget proposal of {costCenterId:name} ({departmentId:name}) was returned by Finance. You are now the department head; please revise and resubmit it, or withdraw it.',
    },
  },
  BUDGET_PROPOSAL_TASK_WAITING: {
    vi: {
      title: 'Đề xuất ngân sách đang chờ trưởng phòng',
      message:
        'Đề xuất ngân sách năm {year} của {costCenterId:name} đã được trả về nhưng phòng chưa có trưởng phòng. Việc gửi lại sẽ chuyển cho trưởng phòng đầu tiên được bổ nhiệm.',
    },
    en: {
      title: 'Budget proposal waiting for a department head',
      message:
        'The {year} budget proposal of {costCenterId:name} was returned but the department has no head. The task will go to the first head appointed.',
    },
  },
  BUDGET_CYCLE_OPENED: {
    vi: {
      title: 'Kỳ ngân sách {year} đã mở',
      message:
        'Vui lòng lập và gửi đề xuất ngân sách năm {year} của phòng bạn trước ngày {submissionDeadline:date}. Bạn có thể tải biểu mẫu đề xuất ngân sách.',
    },
    en: {
      title: 'Budget cycle {year} is open',
      message:
        "Please prepare and submit your department's {year} budget proposal by {submissionDeadline:date}. The proposal form is available to download.",
    },
  },
  BUDGET_CYCLE_DEADLINE_MOVED: {
    vi: {
      title: 'Hạn nộp đề xuất ngân sách đã thay đổi',
      message:
        'Hạn nộp đề xuất ngân sách năm {year} đã đổi từ {previousSubmissionDeadline:date} sang {submissionDeadline:date}.',
    },
    en: {
      title: 'Budget submission deadline changed',
      message:
        'The {year} budget proposal deadline moved from {previousSubmissionDeadline:date} to {submissionDeadline:date}.',
    },
  },
  BUDGET_DEPARTMENT_CEILING_PUBLISHED: {
    vi: {
      title: 'Đã công bố trần ngân sách phòng',
      message: 'Trần ngân sách năm {year} của {departmentId:name} đã được công bố.',
    },
    en: {
      title: 'Department ceiling published',
      message: 'The {year} budget ceiling of {departmentId:name} was published.',
    },
  },
  BUDGET_PROPOSAL_DEADLINE_REMINDER: {
    vi: {
      title: 'Quá hạn nộp đề xuất ngân sách',
      message:
        '{costCenterId:name} chưa gửi đề xuất ngân sách năm {year}; hạn nộp là {submissionDeadline:date}. Vui lòng liên hệ Finance để được hướng dẫn.',
    },
    en: {
      title: 'Budget proposal overdue',
      message:
        '{costCenterId:name} has not submitted its {year} budget proposal; the deadline was {submissionDeadline:date}. Please contact Finance for guidance.',
    },
  },
  BUDGET_NO_HEAD_AT_DEADLINE: {
    vi: {
      title: 'Phòng chưa có trưởng phòng khi hết hạn nộp ngân sách',
      message:
        '{departmentId:name} chưa gửi đề xuất ngân sách năm {year} (hạn {submissionDeadline:date}) và hiện chưa có trưởng phòng. Finance sẽ lập ngân sách từ dữ liệu nền; Super Admin vui lòng bổ nhiệm trưởng phòng.',
    },
    en: {
      title: 'Department without a head at the budget deadline',
      message:
        '{departmentId:name} has not submitted its {year} budget proposal (deadline {submissionDeadline:date}) and has no head. Finance will build its budget from the baseline; the Super Admin should appoint a head.',
    },
  },
  BUDGET_SUBMISSION_DEADLINE_PASSED: {
    vi: {
      title: 'Đã hết hạn nộp đề xuất ngân sách',
      message:
        'Hạn nộp đề xuất ngân sách năm {year} ({submissionDeadline:date}) đã qua; còn {departmentCount} phòng chưa gửi đề xuất.',
    },
    en: {
      title: 'Budget submission deadline has passed',
      message:
        'The {year} budget submission deadline ({submissionDeadline:date}) has passed; {departmentCount} department(s) have not submitted.',
    },
  },
  BUDGET_DECISION_DEADLINE_REMINDER: {
    vi: {
      title: 'Quá hạn quyết định ngân sách',
      message:
        'Hạn quyết định ngân sách năm {year} ({decisionDeadline:date}) đã qua; còn {versionCount} phiên bản đang chờ quyết định.',
    },
    en: {
      title: 'Budget decision deadline passed',
      message:
        'The {year} budget decision deadline ({decisionDeadline:date}) has passed; {versionCount} version(s) are still waiting for a decision.',
    },
  },
  BUDGET_COST_CENTER_SETUP_DUE: {
    vi: {
      title: 'Phòng chưa có Cost Center',
      message:
        '{departmentId:name} chưa có Cost Center đang dùng cho kỳ ngân sách {year}. Vui lòng thiết lập trước hạn nộp.',
    },
    en: {
      title: 'Department has no Cost Center',
      message:
        '{departmentId:name} has no Cost Center in use for the {year} budget cycle. Please set one up before the submission deadline.',
    },
  },
  BUDGET_BASELINE_VERSION_HEAD_ASSIGNED: {
    vi: {
      title: 'Đã có phiên bản ngân sách cho phòng bạn',
      message:
        'Finance đã dựng sẵn phiên bản ngân sách năm {year} của {costCenterId:name} từ dữ liệu nền trước khi bạn nhận chức. Vui lòng xem lại.',
    },
    en: {
      title: 'A budget version exists for your department',
      message:
        'Finance built the {year} budget version of {costCenterId:name} from the baseline before you took the role. Please review it.',
    },
  },
  BUDGET_NEXT_YEAR_MISSING: {
    vi: {
      title: 'Chưa có ngân sách năm {year}',
      message:
        'Chưa có ngân sách năm {year} được phê duyệt[ của {costCenterId:name}][ cho {costCenterCount} Cost Center]. Các yêu cầu chi sẽ phải chờ đến khi có ngân sách.',
    },
    en: {
      title: 'No approved budget for {year}',
      message:
        'No approved budget for {year}[ for {costCenterId:name}][ across {costCenterCount} Cost Center(s)]. Spending requests will wait until a budget is approved.',
    },
  },
  BUDGET_REVIEW_DUE: {
    vi: {
      title: 'Đến hạn chốt chi phí tháng {month}/{year}',
      message: 'Vui lòng chốt chi phí tháng {month}/{year} để có số liệu rà soát ngân sách.',
    },
    en: {
      title: 'Month {month}/{year} close is due',
      message: 'Please close the costs of {month}/{year} so the budget review can proceed.',
    },
  },
  BUDGET_REVIEW_SUMMARY: {
    vi: {
      title: 'Tổng kết rà soát ngân sách {month}/{year}',
      message:
        'Finance đã ký rà soát {kind:enum} {month}/{year}: {greenCount} Cost Center xanh, {yellowCount} vàng, {redCount} đỏ, {underCount} dùng thấp hơn kế hoạch.',
    },
    en: {
      title: 'Budget review summary {month}/{year}',
      message:
        'Finance signed the {kind:enum} review for {month}/{year}: {greenCount} green, {yellowCount} yellow, {redCount} red, {underCount} under-used Cost Centers.',
    },
  },
  BUDGET_SHARED_POOL_OVER_RESERVE: {
    vi: {
      title: 'Quỹ chung vượt mức dự phòng',
      message:
        'Đến hết tháng {month}/{year}, phần chưa phân bổ của quỹ chung đã vượt mức dự phòng của kỳ ngân sách. Vui lòng xem xét.',
    },
    en: {
      title: 'Shared pool above its reserve',
      message:
        'As of the end of {month}/{year}, the unallocated shared pool exceeds the reserve of the budget cycle. Please review it.',
    },
  },
  BUDGET_THRESHOLD_REACHED: {
    vi: {
      title: 'Ngân sách đạt {threshold}%',
      message: 'Mức sử dụng ngân sách năm {year} của {costCenterId:name} đã đạt {threshold}% ngân sách cơ sở.',
    },
    en: {
      title: 'Budget reached {threshold}%',
      message: 'The {year} budget use of {costCenterId:name} has reached {threshold}% of its base budget.',
    },
  },
  BUDGET_REVIEW_EXPLANATION_DUE: {
    vi: {
      title: 'Nhắc giải trình ngân sách',
      message:
        'Vui lòng giải trình mức sử dụng ngân sách của {costCenterId:name} cho quý kết thúc tháng {month}/{year}. Hạn giải trình: {dueOn:date}.',
    },
    en: {
      title: 'Budget explanation reminder',
      message:
        'Please explain the budget use of {costCenterId:name} for the quarter ending {month}/{year}. Due: {dueOn:date}.',
    },
  },
  BUDGET_REVIEW_EXPLANATION_REQUESTED: {
    vi: {
      title: 'Yêu cầu giải trình ngân sách',
      message:
        'Cost Center {costCenterId:name} có đèn {light:enum} trong rà soát quý kết thúc tháng {month}/{year}. Vui lòng giải trình trước ngày {dueOn:date}.',
    },
    en: {
      title: 'Budget explanation requested',
      message:
        '{costCenterId:name} is marked {light:enum} in the quarterly review ending {month}/{year}. Please provide an explanation by {dueOn:date}.',
    },
  },
  BUDGET_ADJUSTMENT_REQUESTED: {
    vi: {
      title: 'Có điều chỉnh ngân sách chờ bạn duyệt',
      message: 'Finance đề nghị {kind:enum} ngân sách năm {year}. Vui lòng xem xét và quyết định.',
    },
    en: {
      title: 'A budget adjustment awaits your decision',
      message: 'Finance requested a budget adjustment ({kind:enum}) for {year}. Please review and decide.',
    },
  },
  BUDGET_ADJUSTMENT_DECIDED: {
    vi: {
      title: 'Điều chỉnh ngân sách đã có quyết định',
      message: 'Điều chỉnh {kind:enum} năm {year}[ — {costCenterId:name}] đã được {decision:enum}.',
    },
    en: {
      title: 'Budget adjustment decided',
      message: 'The {kind:enum} adjustment for {year}[ — {costCenterId:name}] was {decision:enum}.',
    },
  },
} satisfies Partial<Record<InAppNotificationCode, NotificationTexts>>;
