import type { InAppNotificationCode } from '../../public/notifications.types';
import type { NotificationLocale } from './notification-text.types';

/** The words of one value of an enum, in each language. */
export type LabelText = Readonly<Record<NotificationLocale, string>>;
type LabelTable = Readonly<Record<string, LabelText>>;
type LabelsByKey = Readonly<Record<string, LabelTable>>;

/**
 * The labels of a value (`{key:enum}`, `{key:list}`) that mean the same in every code that carries the key. A code with its own
 * meaning for the key has an entry in `CODE_LABELS`, which wins. Copied from the "Ghi chú" column of `catalog/notifications.md`; the
 * English of a label the catalogue gives in Vietnamese only is written to fit its English sentence.
 */
export const SHARED_LABELS = {
  stepKind: {
    NEED: { vi: 'duyệt nhu cầu', en: 'need approval' },
    IT_ASSESSMENT: { vi: 'đánh giá của IT Admin', en: 'IT assessment' },
    SPEND_APPROVAL: { vi: 'duyệt chi', en: 'spend approval' },
    FINANCE_REVIEW: { vi: 'rà soát của Finance', en: 'Finance review' },
  },
  reasons: {
    PRICE_EXPIRED: {
      vi: 'giá của gói đã hết hiệu lực, IT Admin cần cập nhật giá',
      en: 'the plan price has expired and the IT Admin must update it',
    },
    NO_APPROVED_BUDGET: {
      vi: 'phòng chưa có ngân sách được duyệt cho năm này',
      en: 'the department has no approved budget for this year',
    },
    OVER_RESERVE: { vi: 'vượt cả quỹ dự phòng', en: 'it exceeds even the reserve' },
    PRICE_MISSING: { vi: 'chưa có giá để kiểm', en: 'there is no price to check against' },
  },
  eventKind: {
    DEPARTMENT_TRANSFER_OUT: {
      vi: 'chuyển nhân viên sang phòng khác',
      en: 'transfer out to another department',
    },
    DEPARTMENT_TRANSFER_IN: { vi: 'nhận nhân viên từ phòng khác', en: 'transfer in from another department' },
    DEPARTURE: { vi: 'nghỉ việc', en: 'departure' },
    ABRUPT_DEPARTURE: { vi: 'nghỉ việc đột xuất', en: 'abrupt departure' },
    LONG_LEAVE: { vi: 'nghỉ dài hạn', en: 'long leave' },
  },
  linkKind: {
    REQUEST: { vi: 'theo yêu cầu cấp quyền', en: 'for an access request' },
    SUBSCRIPTION: { vi: 'theo thuê bao', en: 'for a subscription' },
  },
  choice: {
    RENEW: { vi: 'gia hạn', en: 'renew' },
    REDUCE: { vi: 'giảm số chỗ', en: 'reduce seats' },
    INCREASE: { vi: 'tăng số chỗ', en: 'increase seats' },
    CANCEL: { vi: 'hủy', en: 'cancel' },
  },
} satisfies LabelsByKey;

/** The states of a report of an error in a SaaS right (`SAAS_ISSUE_STATE_CHANGED`), the same for where it comes from and where it goes. */
const SAAS_ISSUE_STATE: LabelTable = {
  NEW: { vi: 'mới gửi', en: 'new' },
  IN_PROGRESS: { vi: 'đang xử lý', en: 'in progress' },
  WAITING_REPORTER: { vi: 'chờ người báo trả lời', en: 'waiting for the reporter' },
  WAITING_PROVIDER: { vi: 'chờ nhà cung cấp', en: 'waiting for the vendor' },
  RESOLVED: { vi: 'đã giải quyết', en: 'resolved' },
  CLOSED: { vi: 'đã đóng', en: 'closed' },
  DUPLICATE: { vi: 'trùng phiếu khác', en: 'duplicate' },
};

/** `BUDGET_ADJUSTMENT_REQUESTED` and `BUDGET_ADJUSTMENT_DECIDED` name the kind of adjustment the same way. */
const ADJUSTMENT_KIND: LabelTable = {
  SUPPLEMENT: { vi: 'bổ sung ngân sách cho Cost Center', en: 'supplement' },
  TRANSFER: { vi: 'chuyển ngân sách giữa hai Cost Center', en: 'transfer' },
  RETURN: { vi: 'hoàn trả ngân sách', en: 'return' },
  CEILING_REDUCTION: { vi: 'giảm trần ngân sách năm', en: 'ceiling reduction' },
};

/** `REVOCATION_UPCOMING` and `REVOCATION_CANCELLED` name the source of a revocation the same way. */
const REVOCATION_SOURCE: LabelTable = {
  GHOST_SEAT: { vi: 'chỗ ít được sử dụng', en: 'rarely used seat' },
};

/** The labels of a value that belong to one code, which win over `SHARED_LABELS`. */
export const CODE_LABELS = {
  REQUEST_NEED_APPROVED: {
    next: {
      IT_ASSESSMENT: { vi: 'IT Admin đánh giá phần mềm', en: 'the IT Admin assesses the software' },
      SPEND_SUBMISSION: {
        vi: 'chờ trưởng phòng trình duyệt chi',
        en: 'waiting for the head of department to send it for spend approval',
      },
      EXECUTION: { vi: 'chờ IT Admin cấp quyền', en: 'waiting for the IT Admin to grant access' },
      RENEWAL_APPLIED: { vi: 'hệ thống áp dụng gia hạn', en: 'the system applies the renewal' },
    },
  },
  REQUEST_REJECTED: {
    by: {
      NEED: { vi: 'duyệt nhu cầu', en: 'need approval' },
      SPEND: { vi: 'duyệt chi', en: 'spend approval' },
    },
  },
  REQUEST_RETURNED: {
    by: {
      NEED: { vi: 'duyệt nhu cầu', en: 'need approval' },
      SPEND: { vi: 'duyệt chi', en: 'spend approval' },
      IT_ASSESSMENT: { vi: 'đánh giá của IT Admin', en: 'IT assessment' },
    },
  },
  REQUEST_IT_REJECTED: {
    kind: {
      UNCONTROLLABLE: { vi: 'phần mềm không kiểm soát được', en: 'the software cannot be controlled' },
      NOT_ELIGIBLE: {
        vi: 'phần mềm không đủ điều kiện đưa vào danh mục',
        en: 'the software is not eligible for the catalogue',
      },
      SERVICE_ACCOUNT_BOUNDARY: {
        vi: 'ranh giới tài khoản dịch vụ không được chấp nhận',
        en: 'the service-account boundary was not accepted',
      },
    },
  },
  REQUEST_GRANTED: {
    accessGuide: {
      LOGIN_WITH_WORK_ACCOUNT: {
        vi: 'Đăng nhập bằng tài khoản công việc của bạn',
        en: 'Sign in with your work account',
      },
    },
  },
  REQUEST_FAILED: {
    contact: { IT_ADMIN: { vi: 'IT Admin', en: 'the IT Admin' } },
  },
  REQUEST_CANCELLED: {
    reasonKind: {
      BENEFICIARY_LEFT: {
        vi: 'người được cấp quyền đã nghỉ việc',
        en: 'the person it was for has left the company',
      },
      BENEFICIARY_TRANSFERRED: {
        vi: 'người được cấp quyền đã chuyển phòng',
        en: 'the person it was for moved to another department',
      },
    },
  },
  STEP_ASSIGNED: {
    cause: {
      SUBMITTED: { vi: 'yêu cầu mới gửi', en: 'newly sent' },
      ASSESSMENT: { vi: 'nhu cầu đã duyệt, cần đánh giá', en: 'need approved, assessment needed' },
      WAIT_ENDED: {
        vi: 'bước vừa có người phụ trách sau thời gian chờ',
        en: 'step was waiting for an assignee',
      },
      REASSIGNED: {
        vi: 'chuyển cho bạn do thay đổi tổ chức hoặc vai trò',
        en: 'moved to you after an organisation or role change',
      },
      RESUBMITTED: { vi: 'người gửi đã gửi lại sau khi bổ sung', en: 'sent again after revision' },
      SPEND_SENT: {
        vi: 'dự phòng đã được xác nhận, chờ bạn duyệt chi',
        en: 'reserve confirmed, awaiting your spend decision',
      },
    },
  },
  REQUEST_RENEWAL_NOT_APPLIED: {
    problem: {
      NOT_OPEN: {
        vi: 'quyền đã kết thúc, thất bại hoặc bị hủy',
        en: 'the access has ended, failed or been cancelled',
      },
      SERVICE_ACCOUNT: {
        vi: 'quyền của tài khoản dịch vụ không gia hạn kiểu này',
        en: 'a service-account right cannot be renewed this way',
      },
      END_CHANGED: {
        vi: 'ngày hết hạn của quyền đã thay đổi so với lúc xin gia hạn',
        en: 'the access end date changed since the request',
      },
      REVOCATION_PENDING: { vi: 'quyền đang được thu hồi', en: 'the access is being revoked' },
      NOT_FOUND: { vi: 'không tìm thấy quyền', en: 'the access was not found' },
      EXTENSION_CLOSED_FAILED: {
        vi: 'IT Admin không gia hạn được ở phía nhà cung cấp',
        en: 'the IT Admin could not extend it at the vendor',
      },
    },
  },
  REQUEST_RETURNED_AT_DECISION: {
    reasons: {
      RESERVE_UNCONFIRMED: {
        vi: 'dùng quỹ dự phòng nhưng trưởng phòng chưa xác nhận',
        en: 'it uses the reserve but the head has not confirmed',
      },
    },
  },
  STEP_SLA_NO_SUPERIOR: {
    cause: {
      NO_SUPERIOR: {
        vi: 'người giữ bước không có cấp trên để báo',
        en: 'the holder has no superior to tell',
      },
      NO_HOLDER: { vi: 'bước đang chờ, chưa có người giữ', en: 'nobody holds the step' },
      HOLDER_NOT_USABLE: {
        vi: 'người giữ bước đã nghỉ việc, bước chưa được giao lại',
        en: 'the holder has left and the step was not reassigned',
      },
    },
  },
  CONTROLLED_WAIT_ALERT: {
    waitingReason: {
      NO_SPENDING_APPROVER: { vi: 'chưa có người duyệt chi', en: 'there is no spending approver' },
      NO_DEPARTMENT_HEAD: { vi: 'phòng chưa có trưởng phòng', en: 'the department has no head' },
      SPENDING_APPROVER_IS_PARTY: {
        vi: 'người duyệt chi cũng là một bên của yêu cầu',
        en: 'the spending approver is a party to the request',
      },
      NO_IT_ADMIN_IN_CHARGE: {
        vi: 'chưa có IT Admin phụ trách phòng',
        en: 'no IT Admin is in charge of the department',
      },
      NO_HEAD: {
        vi: 'phòng sở hữu thuê bao chưa có trưởng phòng',
        en: 'the department that owns the subscription has no head',
      },
    },
    configurationHint: {
      CONFIGURE_SPENDING_APPROVER: {
        vi: 'cấp vai trò người duyệt chi',
        en: 'grant the spending-approver role',
      },
      ASSIGN_DEPARTMENT_HEAD: { vi: 'bổ nhiệm trưởng phòng', en: 'appoint the head of department' },
      NAME_IT_ADMIN_IN_CHARGE: {
        vi: 'chỉ định IT Admin phụ trách phòng',
        en: 'name the IT Admin in charge',
      },
    },
  },
  ROLE_HOLDER_LEAVING: {
    roleFlag: {
      SUPER_ADMIN_HOLDER: { vi: 'Super Admin', en: 'Super Admin' },
      FINANCE: { vi: 'Finance', en: 'Finance' },
      SPENDING_APPROVER: { vi: 'người duyệt chi', en: 'spending approver' },
      IT_ADMIN_IN_CHARGE: { vi: 'IT Admin phụ trách phòng', en: 'IT Admin in charge of a department' },
      DEPARTMENT_HEAD: { vi: 'trưởng phòng', en: 'department head' },
      WORKSPACE_OWNER: { vi: 'chủ workspace', en: 'workspace owner' },
    },
  },
  IT_ADMIN_HANDOVER_PENDING: {
    sourceKind: {
      OFFBOARDING_CASE: { vi: 'nghỉ việc', en: 'is leaving the company' },
      DEPARTMENT_TRANSFER: { vi: 'chuyển phòng', en: 'is moving to another department' },
    },
  },
  BUDGET_VERSION_DECIDED: {
    decision: {
      APPROVED: { vi: 'phê duyệt', en: 'approved' },
      REJECTED: { vi: 'từ chối', en: 'rejected' },
      CHANGES_REQUESTED: { vi: 'yêu cầu xem lại', en: 'sent back for changes' },
      APPROVE: { vi: 'phê duyệt', en: 'approved' },
      REJECT: { vi: 'từ chối', en: 'rejected' },
    },
  },
  BUDGET_REVIEW_SUMMARY: {
    kind: {
      MONTH: { vi: 'tháng', en: 'monthly' },
      QUARTER: { vi: 'quý', en: 'quarterly' },
    },
  },
  BUDGET_REVIEW_EXPLANATION_REQUESTED: {
    light: {
      GREEN: { vi: 'xanh', en: 'green' },
      YELLOW: { vi: 'vàng', en: 'yellow' },
      RED: { vi: 'đỏ', en: 'red' },
      UNDER: { vi: 'dùng thấp hơn kế hoạch', en: 'under-used' },
    },
  },
  BUDGET_ADJUSTMENT_REQUESTED: { kind: ADJUSTMENT_KIND },
  BUDGET_ADJUSTMENT_DECIDED: {
    kind: ADJUSTMENT_KIND,
    decision: {
      APPROVE: { vi: 'phê duyệt', en: 'approved' },
      REJECT: { vi: 'từ chối', en: 'rejected' },
      APPROVED: { vi: 'phê duyệt', en: 'approved' },
      REJECTED: { vi: 'từ chối', en: 'rejected' },
    },
  },
  REVOCATION_UPCOMING: { source: REVOCATION_SOURCE },
  REVOCATION_CANCELLED: { source: REVOCATION_SOURCE },
  SUBSCRIPTION_RENEWAL_ALERT: {
    commitment: {
      MONTHLY: { vi: 'gói tháng', en: 'monthly' },
      ANNUAL: { vi: 'gói năm', en: 'annual' },
    },
  },
  SUBSCRIPTION_RENEWAL_DATA_QUALITY: {
    problem: {
      NO_ALERT_ANCHOR: { vi: 'không có ngày làm mốc cảnh báo', en: 'no date to anchor the alerts' },
      NO_NOTICE_DEADLINE: { vi: 'thiếu hạn chót báo hủy', en: 'no cancellation deadline' },
    },
  },
  // What the IT Admin chose, and what the vendor did with it.
  SUBSCRIPTION_RENEWAL_OUTCOME_RECORDED: {
    choice: {
      RENEW: { vi: 'gia hạn đúng số', en: 'renew as is' },
      REDUCE: { vi: 'giảm', en: 'reduce' },
      INCREASE: { vi: 'tăng', en: 'increase' },
      CANCEL: { vi: 'hủy', en: 'cancel' },
    },
    outcome: {
      AS_DECIDED: { vi: 'đồng ý', en: 'agreed' },
      VENDOR_REFUSED: { vi: 'từ chối', en: 'refused' },
      DIFFERENT: { vi: 'làm khác', en: 'did otherwise' },
      UNCONFIRMED: { vi: 'chưa xác nhận', en: 'not confirmed' },
    },
  },
  SUBSCRIPTION_RENEWAL_DECIDED: {
    executionPoint: {
      AS_PLANNED: { vi: 'theo kế hoạch của kỳ gia hạn', en: 'as planned for the renewal' },
      MID_TERM: { vi: 'ngay trong kỳ hiện tại', en: 'mid-term' },
      NEXT_RENEWAL: { vi: 'ở kỳ gia hạn kế tiếp', en: 'at the next renewal' },
    },
  },
  // The words of the kind and the effect of a report are the ones the form of `saasIssueSubmit` shows the reporter, shortened to fit a sentence.
  SAAS_ISSUE_SUBMITTED: {
    category: {
      NO_ACCESS: { vi: 'không vào được phần mềm', en: 'no access to the software' },
      INVITATION_OR_ACTIVATION: {
        vi: 'lời mời hoặc kích hoạt tài khoản không dùng được',
        en: 'invitation or account activation failed',
      },
      MISSING_PLAN_FEATURE: { vi: 'thiếu tính năng của gói', en: 'a feature of the plan is missing' },
      PROVIDER_OUTAGE: { vi: 'nhà cung cấp có vẻ đang lỗi', en: 'the vendor seems to be down' },
      OTHER: { vi: 'lỗi khác', en: 'other error' },
    },
    impact: {
      UNUSABLE: { vi: 'không dùng được phần mềm', en: 'the software cannot be used' },
      PARTIAL: { vi: 'dùng được một phần', en: 'the software works in part' },
      QUESTION_OR_OTHER: { vi: 'câu hỏi hoặc ảnh hưởng khác', en: 'a question or another effect' },
    },
  },
  SAAS_ISSUE_STATE_CHANGED: { fromState: SAAS_ISSUE_STATE, toState: SAAS_ISSUE_STATE },
  // The kind of batch that opened the differences, not the `source` filter of `vendorAccountDiscrepancyList` (D-17).
  VENDOR_ACCOUNT_DISCREPANCY_OPENED: {
    source: {
      USAGE_IMPORT: { vi: 'báo cáo sử dụng của nhà cung cấp', en: 'vendor usage report' },
      INVOICE_DIFFERENCE: { vi: 'chênh lệch hóa đơn', en: 'invoice difference' },
      COLLECTOR_UNLISTED: { vi: 'công cụ lạ do collector báo', en: 'unlisted tool reported by the collector' },
    },
  },
  DEPARTMENT_SOFTWARE_PROPOSAL_DECIDED: {
    decision: {
      ACCEPTED: {
        vi: 'được chấp nhận; phần mềm đã vào danh sách',
        en: 'accepted; the software is now in the list',
      },
      REJECTED: { vi: 'bị từ chối', en: 'rejected' },
    },
  },
} satisfies Partial<Record<InAppNotificationCode, LabelsByKey>>;
