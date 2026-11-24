import type { InAppNotificationCode } from '../../public/notifications.types';
import type { NotificationTexts } from './notification-text.types';

/**
 * The sentences of the notices of the operations round that no older group owns: the batch of spend requests a head sends to the
 * spending approver, the reports of errors in SaaS rights, a case outside the process closed as a report only, the differences with a
 * vendor and the request to stop the collection of a machine. Copied from the hand-over table of `SPEC-5A-FIXES.md` (§1.B) and the
 * "Thông báo mới cho 5b" part of its report; one entry per code, `vi` and `en`. A code of the round that has no entry here is not a code
 * of this branch yet.
 */
export const OPS_TEXTS = {
  SPEND_BATCH_SUBMITTED: {
    vi: {
      title: 'Có lô trình duyệt chi mới',
      message: 'Trưởng phòng {departmentId:name} vừa trình một lô có {sentCount} yêu cầu chờ bạn duyệt chi.',
    },
    en: {
      title: 'New spend batch',
      message: 'The head of {departmentId:name} sent a batch with {sentCount} requests awaiting your spend decision.',
    },
  },
  SAAS_ISSUE_SUBMITTED: {
    vi: {
      title: 'Có phiếu báo lỗi mới',
      message:
        'Phiếu {issueCode} về ứng dụng {applicationId:name} ({category:enum}, ảnh hưởng {impact:enum}) vừa được gửi và giao cho bạn.',
    },
    en: {
      title: 'New issue report',
      message:
        'Issue report {issueCode} for {applicationId:name} ({category:enum}, impact {impact:enum}) was sent and assigned to you.',
    },
  },
  SAAS_ISSUE_AWAITING_ASSIGNEE: {
    vi: {
      title: 'Phiếu báo lỗi chờ người tiếp nhận',
      message:
        'Phiếu {issueCode} về ứng dụng {applicationId:name} ({category:enum}, ảnh hưởng {impact:enum})[ thuộc phòng {departmentId:name}] chưa có IT Admin nào phụ trách hoặc làm thay để tiếp nhận.',
    },
    en: {
      title: 'Issue report awaiting assignee',
      message:
        'Issue report {issueCode} for {applicationId:name} ({category:enum}, impact {impact:enum})[ in {departmentId:name}] has no IT Admin in charge or substitute to take it.',
    },
  },
  SAAS_ISSUE_RESPONSE_OVERDUE: {
    vi: {
      title: 'Phiếu báo lỗi quá hạn phản hồi',
      message: 'Phiếu {issueCode} chưa có phản hồi đầu tiên và đã quá hạn {responseDueOn:date}.',
    },
    en: {
      title: 'Issue report awaiting first response',
      message: 'Issue report {issueCode} has no first response and passed its due date {responseDueOn:date}.',
    },
  },
  // A variant is the whole sentence: the first part is written in each case, and `otherwise` (an IT Admin moved it) is the sentence alone.
  SAAS_ISSUE_STATE_CHANGED: {
    vi: {
      title: 'Phiếu báo lỗi đổi trạng thái',
      message: {
        by: 'trigger',
        cases: {
          REPORTER_REPLY: 'Phiếu {issueCode} chuyển từ {fromState:enum} sang {toState:enum}. Người báo vừa trả lời.',
          REPORTER_REOPEN:
            'Phiếu {issueCode} chuyển từ {fromState:enum} sang {toState:enum}. Người báo đã mở lại phiếu.',
          REOPEN_WINDOW_LAPSED:
            'Phiếu {issueCode} chuyển từ {fromState:enum} sang {toState:enum}. Phiếu tự đóng vì hết thời gian mở lại.',
        },
        otherwise: 'Phiếu {issueCode} chuyển từ {fromState:enum} sang {toState:enum}.',
      },
    },
    en: {
      title: 'Issue report status changed',
      message: {
        by: 'trigger',
        cases: {
          REPORTER_REPLY:
            'Issue report {issueCode} moved from {fromState:enum} to {toState:enum}. The reporter replied.',
          REPORTER_REOPEN:
            'Issue report {issueCode} moved from {fromState:enum} to {toState:enum}. The reporter reopened it.',
          REOPEN_WINDOW_LAPSED:
            'Issue report {issueCode} moved from {fromState:enum} to {toState:enum}. It closed because the reopen window ended.',
        },
        otherwise: 'Issue report {issueCode} moved from {fromState:enum} to {toState:enum}.',
      },
    },
  },
  // `applicationId` is null when the case has no application; the sentence then says "software" alone.
  OUT_OF_PROCESS_CASE_REPORTED: {
    vi: {
      title: 'Phát hiện dùng phần mềm ngoài quy trình',
      message:
        'Đã ghi nhận {employeeId:name} dùng phần mềm[ {applicationId:name}] ngoài quy trình. Công ty không có tài khoản để thu hồi nên hồ sơ chỉ được ghi nhận và báo cáo.',
    },
    en: {
      title: 'Software use outside the process recorded',
      message:
        '{employeeId:name} was recorded using software[ {applicationId:name}] outside the process. The company holds no account to revoke, so the case is recorded and reported only.',
    },
  },
  // `source` is the kind of batch that opened the differences (D-17), not the filter of the list. No vendor name: the notice carries no
  // `applicationId` for two of the three sources.
  VENDOR_ACCOUNT_DISCREPANCY_OPENED: {
    vi: {
      title: 'Có sai lệch tài khoản nhà cung cấp mới',
      message: 'Có {newCount} sai lệch tài khoản nhà cung cấp mới cần xử lý (nguồn: {source:enum}).',
    },
    en: {
      title: 'New vendor account discrepancies',
      message: '{newCount} new vendor account discrepancies need handling (source: {source:enum}).',
    },
  },
  DEVICE_STOP_REQUESTED: {
    vi: {
      title: 'Yêu cầu dừng thu thập cần xử lý',
      message: '{holderEmployeeId:name} yêu cầu dừng thu thập dữ liệu trên một máy. Vui lòng xử lý trước {dueOn:date}.',
    },
    en: {
      title: 'Collection stop requested',
      message: '{holderEmployeeId:name} asked to stop data collection on a device. Please handle it by {dueOn:date}.',
    },
  },
  DEVICE_STOP_REQUEST_OVERDUE: {
    vi: {
      title: 'Yêu cầu dừng thu thập quá hạn',
      message: 'Yêu cầu dừng thu thập của {holderEmployeeId:name} đã quá hạn {dueOn:date} mà chưa được xử lý.',
    },
    en: {
      title: 'Collection stop request overdue',
      message:
        'The collection stop request of {holderEmployeeId:name} passed its due date {dueOn:date} without being handled.',
    },
  },
  DEPARTMENT_IT_SUBSTITUTE_APPOINTED: {
    vi: {
      title: 'Phân công IT Admin làm thay cho phòng',
      message:
        '{substituteEmployeeId:name} được chỉ định làm IT Admin thay thế cho phòng {departmentId:name}[ (thay thế cho {replacedEmployeeId:name})].',
    },
    en: {
      title: 'Department IT Admin substitute appointed',
      message:
        '{substituteEmployeeId:name} was appointed as temporary IT Admin substitute for {departmentId:name}[ (replacing {replacedEmployeeId:name})].',
    },
  },
  DEPARTMENT_IT_SUBSTITUTE_ENDED: {
    vi: {
      title: 'Kết thúc phân công IT Admin làm thay',
      message:
        'Nhiệm vụ IT Admin làm thay của {substituteEmployeeId:name} tại phòng {departmentId:name} đã kết thúc ({endCause:enum}).',
    },
    en: {
      title: 'Department IT Admin substitute ended',
      message:
        'The temporary IT Admin substitute assignment of {substituteEmployeeId:name} for {departmentId:name} has ended ({endCause:enum}).',
    },
  },
  DEPARTMENT_IT_COVERAGE_MISSING: {
    vi: {
      title: 'Phòng chưa có IT Admin xử lý công việc',
      message:
        'Phòng {departmentId:name} hiện chưa có IT Admin phụ trách hoặc làm thay có thể xử lý công việc ({reason:enum}[ — {inChargeEmployeeId:name}]). Vui lòng chỉ định IT Admin phụ trách hoặc làm thay.',
    },
    en: {
      title: 'Department has no acting IT Admin',
      message:
        'Department {departmentId:name} has no acting IT Admin in charge or substitute right now ({reason:enum}[ — {inChargeEmployeeId:name}]). Please assign an IT Admin in charge or appoint a substitute.',
    },
  },
  DEVICE_RETURN_OVERDUE: {
    vi: {
      title: 'Thu hồi máy quá hạn',
      message: 'Việc thu hồi máy {assetCode} từ {employeeId:name} đã quá hạn {dueOn:date}.',
    },
    en: {
      title: 'Device return overdue',
      message: 'Device return for {assetCode} from {employeeId:name} passed its due date {dueOn:date}.',
    },
  },
  DEVICE_RETURN_WAITING: {
    vi: {
      title: 'Việc thu hồi máy đang chờ phân công IT',
      message:
        'Việc thu hồi máy {assetCode} từ {employeeId:name}[ tại phòng {departmentId:name}] (hạn {dueOn:date}) chưa có IT Admin xử lý.',
    },
    en: {
      title: 'Device return awaiting IT Admin',
      message:
        'Device return for {assetCode} from {employeeId:name}[ in {departmentId:name}] (due {dueOn:date}) has no acting IT Admin.',
    },
  },
} satisfies Partial<Record<InAppNotificationCode, NotificationTexts>>;
