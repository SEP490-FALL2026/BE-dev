import type { InAppNotificationCode } from '../../public/notifications.types';
import type { NotificationTexts } from './notification-text.types';

/**
 * The sentences of MF-2 (a departure), MF-3 (a transfer), the organization and personnel notices, the handover of an IT Admin and
 * the policy library. Copied from `catalog/notifications.md` of the FE docs: one entry per code, `vi` and `en`.
 */
export const ORG_TEXTS = {
  ABRUPT_DEPARTURE_RECORDED: {
    vi: {
      title: 'Nhân viên nghỉ việc đột xuất',
      message:
        '{employeeId:name} nghỉ việc đột xuất, có hiệu lực từ {effectiveOn:date}. Truy cập của người này đã bị chặn; cần khóa tài khoản công ty và thu hồi quyền phần mềm.',
    },
    en: {
      title: 'Abrupt departure',
      message:
        '{employeeId:name} is leaving abruptly, effective {effectiveOn:date}. Their access has been blocked; the company account must be locked and software access revoked.',
    },
  },
  LEAVER_K1_ACCESS_RUNS_ON: {
    vi: {
      title: 'Người đã nghỉ việc vẫn còn truy cập đến hết kỳ thanh toán',
      message:
        'Việc hủy gia hạn {planId:name} của {employeeId:name} đã được ghi nhận, nhưng người này vẫn dùng được phần mềm đến hết {accessUntil:date} (hết kỳ đã thanh toán).',
    },
    en: {
      title: 'Former employee keeps access until the paid period ends',
      message:
        'The renewal of {planId:name} for {employeeId:name} has been cancelled, but the person can still use the software until {accessUntil:date} (end of the paid period).',
    },
  },
  REVOCATION_OVERDUE: {
    vi: {
      title: 'Quá hạn thu hồi quyền của người nghỉ việc',
      message:
        '{employeeId:name} đã nghỉ việc nhưng còn {rightCount} quyền phần mềm chưa được thu hồi, đã quá hạn {dueOn:date}. Vui lòng xử lý ngay.',
    },
    en: {
      title: 'Revocation overdue for a former employee',
      message:
        '{employeeId:name} has left but {rightCount} software rights are still not revoked, past the deadline of {dueOn:date}. Please act now.',
    },
  },
  DEPARTURE_ACCESS_BLOCKED: {
    vi: {
      title: 'Truy cập của người nghỉ việc đã bị chặn',
      message: {
        by: 'audience',
        cases: {
          SUPER_ADMIN:
            '{employeeId:name} bị từ chối truy cập từ {blockedOn:date}. Vui lòng đánh dấu người này đã nghỉ việc.',
          IT_ADMIN:
            '{employeeId:name} bị từ chối truy cập từ {blockedOn:date}. Vui lòng chặn tài khoản email công ty (đặt lại mật khẩu hộp thư, đăng xuất mọi phiên) và mở thu hồi quyền phần mềm trước {revocationDueOn:date}.',
        },
        otherwise: '{employeeId:name} bị từ chối truy cập từ {blockedOn:date}.',
      },
    },
    en: {
      title: 'Access of a departing employee has been blocked',
      message: {
        by: 'audience',
        cases: {
          SUPER_ADMIN: '{employeeId:name} is refused access from {blockedOn:date}. Please mark this person as left.',
          IT_ADMIN:
            '{employeeId:name} is refused access from {blockedOn:date}. Please block the company email account (reset the mailbox password and sign out every session) and open the software revocation by {revocationDueOn:date}.',
        },
        otherwise: '{employeeId:name} is refused access from {blockedOn:date}.',
      },
    },
  },
  ACCOUNT_LOCK_OVERDUE: {
    vi: {
      title: 'Chưa khóa tài khoản của người nghỉ việc',
      message:
        '{employeeId:name} bị chặn truy cập từ {blockedOn:date} nhưng việc khóa tài khoản công ty (đặt lại mật khẩu hộp thư, đăng xuất mọi phiên) vẫn chưa được ghi nhận. Vui lòng thực hiện và ghi nhận ngay.',
    },
    en: {
      title: 'Account of a former employee is not locked yet',
      message:
        '{employeeId:name} has been blocked since {blockedOn:date}, but locking the company account (reset the mailbox password, sign out every session) is still not recorded. Please do it and record it now.',
    },
  },
  DEPARTURE_REVOCATION_IT_CLOSE: {
    vi: {
      title: 'Cần đóng thủ công các thu hồi đang xử lý',
      message:
        'Việc nghỉ việc của {employeeId:name} đã bị hủy nhưng còn {taskCount} tác vụ thu hồi quyền đang xử lý. Vui lòng kiểm tra tại nhà cung cấp và đóng các tác vụ theo kết quả thực tế.',
    },
    en: {
      title: 'In-progress revocations need closing by hand',
      message:
        'The departure of {employeeId:name} was cancelled but {taskCount} revocation tasks are still in progress. Please check with the vendor and close the tasks according to what actually happened.',
    },
  },
  TRANSFER_REVIEW_DUE: {
    vi: {
      title: 'Hạn rà soát công cụ của nhân viên chuyển đến',
      message:
        '{employeeId:name} đã chuyển đến phòng {departmentId:name}. Hạn rà soát công cụ là {dueOn:date}. (Thông báo cũ, tính năng này đã ngừng.)',
    },
    en: {
      title: "Review due for a transferred employee's tools",
      message:
        '{employeeId:name} moved to {departmentId:name}. The tool review was due on {dueOn:date}. (Old notice; this feature has been retired.)',
    },
  },
  TRANSFER_GRACE_STARTED: {
    vi: {
      title: 'Điều chuyển phòng: thời gian giữ quyền cũ',
      message: {
        by: 'audience',
        cases: {
          MOVER:
            'Bạn đã chuyển từ {fromDepartmentId:name} sang {toDepartmentId:name}. Bạn tạm giữ quyền phần mềm của phòng cũ đến hết {graceEndsOn:date}, sau đó các quyền này sẽ được thu hồi.',
          HEAD: '{employeeId:name} đã chuyển từ {fromDepartmentId:name} sang {toDepartmentId:name}. Quyền phần mềm của phòng cũ được giữ đến hết {graceEndsOn:date}, sau đó sẽ được thu hồi.',
          IT_ADMIN:
            '{employeeId:name} đã chuyển từ {fromDepartmentId:name} sang {toDepartmentId:name}. Quyền phần mềm của phòng cũ được giữ đến hết {graceEndsOn:date}, sau đó sẽ được thu hồi.',
        },
        otherwise:
          '{employeeId:name} đã chuyển từ {fromDepartmentId:name} sang {toDepartmentId:name}. Quyền phần mềm của phòng cũ được giữ đến hết {graceEndsOn:date}, sau đó sẽ được thu hồi.',
      },
    },
    en: {
      title: 'Department transfer: grace period for old access',
      message: {
        by: 'audience',
        cases: {
          MOVER:
            'You moved from {fromDepartmentId:name} to {toDepartmentId:name}. You keep the software access of your old department until {graceEndsOn:date}; after that it will be revoked.',
          HEAD: '{employeeId:name} moved from {fromDepartmentId:name} to {toDepartmentId:name}. Software access from the old department is kept until {graceEndsOn:date}, then it will be revoked.',
          IT_ADMIN:
            '{employeeId:name} moved from {fromDepartmentId:name} to {toDepartmentId:name}. Software access from the old department is kept until {graceEndsOn:date}, then it will be revoked.',
        },
        otherwise:
          '{employeeId:name} moved from {fromDepartmentId:name} to {toDepartmentId:name}. Software access from the old department is kept until {graceEndsOn:date}, then it will be revoked.',
      },
    },
  },
  TRANSFER_GRACE_ENDING: {
    vi: {
      title: 'Sắp hết thời gian giữ quyền của phòng cũ',
      message:
        'Quyền phần mềm của phòng cũ sẽ được thu hồi sau {graceEndsOn:date}. Nếu cần tiếp tục dùng phần mềm nào, hãy gửi yêu cầu cấp quyền cho phòng mới trước ngày đó.',
    },
    en: {
      title: 'Access from your old department ends soon',
      message:
        'The software access from your old department will be revoked after {graceEndsOn:date}. If you still need any of it, send an access request for your new department before then.',
    },
  },
  TRANSFER_RIGHTS_REVOKING: {
    vi: {
      title: 'Đang thu hồi quyền của phòng cũ',
      message: {
        by: 'recipientIsSubject',
        cases: { true: '{rightCount} quyền phần mềm của phòng cũ của bạn đang được thu hồi.' },
        otherwise:
          'Thời gian giữ quyền đã hết; {rightCount} quyền phần mềm của {employeeId:name} thuộc phòng cũ đang được thu hồi.',
      },
    },
    en: {
      title: 'Revoking access from the old department',
      message: {
        by: 'recipientIsSubject',
        cases: { true: '{rightCount} software rights from your old department are being revoked.' },
        otherwise:
          'The grace period is over; {rightCount} software rights of {employeeId:name} from the old department are being revoked.',
      },
    },
  },
  DEPARTMENT_WITHOUT_HEAD: {
    vi: {
      title: 'Phòng chưa có trưởng phòng',
      message:
        'Phòng {departmentId:name} hiện chưa có trưởng phòng[; có {waitingCount} yêu cầu đang chờ]. Vui lòng bổ nhiệm trưởng phòng.',
    },
    en: {
      title: 'Department has no head',
      message:
        'Department {departmentId:name} has no head of department right now[; {waitingCount} requests are waiting]. Please appoint one.',
    },
  },
  EMPLOYEE_PROFILE_CREATED: {
    vi: {
      title: 'Có nhân viên mới trong phòng',
      message:
        '{employeeId:name} vừa được thêm vào phòng {departmentId:name}. Vui lòng chuẩn bị các quyền phần mềm cần thiết cho nhân viên này.',
    },
    en: {
      title: 'New employee in the department',
      message:
        '{employeeId:name} has been added to {departmentId:name}. Please prepare the software access this employee needs.',
    },
  },
  EMPLOYEE_PROFILE_UPDATED: {
    vi: {
      title: 'Hồ sơ nhân viên đã được cập nhật',
      message: {
        by: 'recipientIsSubject',
        cases: { true: 'Hồ sơ của bạn vừa được cập nhật thông tin chính thức.' },
        otherwise:
          'Hồ sơ của {employeeId:name} vừa được cập nhật thông tin chính thức. Hãy mở hồ sơ để xem nội dung mới.',
      },
    },
    en: {
      title: 'Employee profile updated',
      message: {
        by: 'recipientIsSubject',
        cases: { true: "Your profile's official details were just updated." },
        otherwise:
          "The official details in {employeeId:name}'s profile were updated. Open the profile to see the new details.",
      },
    },
  },
  PERSONNEL_EVENT_RECORDED: {
    vi: {
      title: 'Có thay đổi nhân sự',
      message: {
        by: 'eventKind',
        cases: {
          TRANSFER_RECORDED: '{employeeId:name}: được điều chuyển, có hiệu lực từ {effectiveOn:date}.',
          TRANSFER_RESCHEDULED: '{employeeId:name}: lịch điều chuyển đổi sang ngày {effectiveOn:date}.',
          TRANSFER_CANCELLED: '{employeeId:name}: điều chuyển dự kiến ngày {effectiveOn:date} đã bị hủy.',
          LONG_LEAVE_STARTED: '{employeeId:name}: bắt đầu nghỉ dài hạn từ {effectiveOn:date}.',
          LONG_LEAVE_RETURN_DATE_CHANGED: '{employeeId:name}: ngày dự kiến quay lại đổi sang {effectiveOn:date}.',
          LONG_LEAVE_RETURNED: '{employeeId:name}: đã quay lại làm việc ngày {effectiveOn:date}.',
          DEPARTURE_RECORDED: '{employeeId:name}: đã ghi nhận nghỉ việc, có hiệu lực từ {effectiveOn:date}.',
          DEPARTURE_LAST_DAY_CHANGED: '{employeeId:name}: ngày nghỉ việc đổi sang {effectiveOn:date}.',
          DEPARTURE_CANCELLED: '{employeeId:name}: việc nghỉ việc dự kiến ngày {effectiveOn:date} đã bị hủy.',
          DEPARTURE_MARKED_LEFT: '{employeeId:name}: đã được đánh dấu nghỉ việc.',
        },
        otherwise: '{employeeId:name}: {eventKind}.',
      },
    },
    en: {
      title: 'Personnel change',
      message: {
        by: 'eventKind',
        cases: {
          TRANSFER_RECORDED: '{employeeId:name}: was transferred, effective {effectiveOn:date}.',
          TRANSFER_RESCHEDULED: '{employeeId:name}: transfer rescheduled to {effectiveOn:date}.',
          TRANSFER_CANCELLED: '{employeeId:name}: the transfer planned for {effectiveOn:date} was cancelled.',
          LONG_LEAVE_STARTED: '{employeeId:name}: started long leave on {effectiveOn:date}.',
          LONG_LEAVE_RETURN_DATE_CHANGED: '{employeeId:name}: expected return date changed to {effectiveOn:date}.',
          LONG_LEAVE_RETURNED: '{employeeId:name}: returned to work on {effectiveOn:date}.',
          DEPARTURE_RECORDED: '{employeeId:name}: departure recorded, effective {effectiveOn:date}.',
          DEPARTURE_LAST_DAY_CHANGED: '{employeeId:name}: departure date changed to {effectiveOn:date}.',
          DEPARTURE_CANCELLED: '{employeeId:name}: the departure planned for {effectiveOn:date} was cancelled.',
          DEPARTURE_MARKED_LEFT: '{employeeId:name}: was marked as left.',
        },
        otherwise: '{employeeId:name}: {eventKind}.',
      },
    },
  },
  PERSONNEL_NOTICE_RECEIVED: {
    vi: {
      title: 'Có phiếu báo nhân sự mới',
      message:
        'Trưởng phòng {departmentId:name} đã gửi phiếu báo: {eventKind:enum} đối với {employeeId:name}. Vui lòng kiểm tra và xử lý.',
    },
    en: {
      title: 'New personnel notice',
      message:
        'The head of {departmentId:name} sent a notice: {eventKind:enum} for {employeeId:name}. Please review and handle it.',
    },
  },
  PERSONNEL_NOTICE_OVERDUE: {
    vi: {
      title: 'Phiếu báo nhân sự quá hạn xử lý',
      message:
        'Phiếu báo "{eventKind:enum}" đối với {employeeId:name} (do trưởng phòng {departmentId:name} gửi) đã quá hạn mà chưa được xử lý.',
    },
    en: {
      title: 'Personnel notice overdue',
      message:
        'The "{eventKind:enum}" notice for {employeeId:name} (sent by the head of {departmentId:name}) is past its due date and has not been handled.',
    },
  },
  ROLE_HOLDER_LEAVING: {
    vi: {
      title: 'Người giữ vai trò quan trọng sắp nghỉ việc',
      message:
        '{employeeId:name} đang giữ vai trò {roleFlag:enum} và sẽ nghỉ việc từ {effectiveOn:date}. Cần có người nhận bàn giao vai trò này.',
    },
    en: {
      title: 'Key role holder is leaving',
      message:
        '{employeeId:name} holds the role {roleFlag:enum} and leaves on {effectiveOn:date}. Someone needs to take over this role.',
    },
  },
  VENDOR_ADMINS_BELOW_MINIMUM: {
    vi: {
      title: 'Gói phần mềm sắp không còn quản trị viên',
      message:
        'Người quản trị cuối cùng của gói {planId:name} ({applicationId:name}) tại nhà cung cấp đang nghỉ việc và không còn ai khác quản trị gói này. Vui lòng sắp xếp người quản trị mới.',
    },
    en: {
      title: 'Plan is about to have no vendor admin',
      message:
        'The last vendor-side admin of plan {planId:name} ({applicationId:name}) is leaving and nobody else administers it. Please arrange a new admin.',
    },
  },
  IT_ADMIN_HANDOVER_PENDING: {
    vi: {
      title: 'IT Admin sắp rời vị trí, cần nhận bàn giao',
      message:
        'IT Admin {employeeId:name} {sourceKind:enum} từ {dueOn:date} nhưng vẫn còn phụ trách thuê bao hoặc ứng dụng. Cần có IT Admin nhận bàn giao.',
    },
    en: {
      title: 'An IT Admin is leaving; handover needed',
      message:
        'IT Admin {employeeId:name} {sourceKind:enum} from {dueOn:date} but still answers for subscriptions or applications. An IT Admin needs to take over.',
    },
  },
  IT_ADMIN_HANDOVER_RECEIVED: {
    vi: {
      title: 'Bạn đã nhận bàn giao từ IT Admin khác',
      message: '{fromEmployeeId:name} đã bàn giao cho bạn {subscriptions} thuê bao và {applications} ứng dụng.',
    },
    en: {
      title: 'You received an IT Admin handover',
      message:
        '{fromEmployeeId:name} handed over {subscriptions} subscriptions and {applications} applications to you.',
    },
  },
  POLICY_PUBLISHED: {
    vi: {
      title: 'Chính sách mới có hiệu lực',
      message: {
        by: 'requiresReacknowledgement',
        cases: {
          true: 'Chính sách {policyCode} đã có phiên bản {versionNumber}. Bạn cần đọc và xác nhận lại.',
          false: 'Chính sách {policyCode} đã có phiên bản {versionNumber}. Bạn không cần xác nhận lại.',
        },
        otherwise: 'Chính sách {policyCode} đã có phiên bản {versionNumber}.',
      },
    },
    en: {
      title: 'New policy version in force',
      message: {
        by: 'requiresReacknowledgement',
        cases: {
          true: 'Policy {policyCode} now has version {versionNumber}. You need to read and acknowledge it again.',
          false: 'Policy {policyCode} now has version {versionNumber}. You do not need to acknowledge it again.',
        },
        otherwise: 'Policy {policyCode} now has version {versionNumber}.',
      },
    },
  },
} satisfies Partial<Record<InAppNotificationCode, NotificationTexts>>;
