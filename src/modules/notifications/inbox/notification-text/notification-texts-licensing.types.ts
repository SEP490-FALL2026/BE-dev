import type { InAppNotificationCode } from '../../public/notifications.types';
import type { NotificationTexts } from './notification-text.types';

/**
 * The sentences of MF-5 (ghost seats and usage), SBF-03 (a right that ends), SBF-20 (a subscription and its renewal), SBF-19 (a
 * purchase invoice) and the software list of a department. Copied from `catalog/notifications.md` of the FE docs: one entry per
 * code, `vi` and `en`.
 */
export const LICENSING_TEXTS = {
  GHOST_SEAT_G2_DETECTED: {
    vi: {
      title: 'Phát hiện chỗ phần mềm do người đã nghỉ việc giữ',
      message:
        '{employeeId:name} đã nghỉ việc nhưng vẫn giữ một chỗ {applicationId:name}. Vui lòng xem xét và thu hồi.',
    },
    en: {
      title: 'Seat still held by a former employee',
      message:
        '{employeeId:name} has left but still holds a seat in {applicationId:name}. Please review and reclaim it.',
    },
  },
  GHOST_SEAT_NEW: {
    vi: {
      title: 'Có chỗ phần mềm cần bạn quyết định',
      message:
        'Phòng {departmentId:name} có khuyến nghị thu hồi chỗ phần mềm ít được sử dụng đang chờ bạn quyết định. Hãy mở hàng đợi để xem chi tiết.',
    },
    en: {
      title: 'Software seats need your decision',
      message:
        '{departmentId:name} has recommendations to reclaim rarely used software seats waiting for your decision. Open the queue to see the details.',
    },
  },
  GHOST_SEAT_ACTION_TIER: {
    vi: {
      title: 'Có chỗ phần mềm cần thu hồi ở phòng bạn phụ trách',
      message:
        'Phòng {departmentId:name} có khuyến nghị thu hồi chỗ phần mềm ở mức hành động. Trưởng phòng sẽ quyết định; bạn có thể xem trước chi tiết.',
    },
    en: {
      title: 'Seats to reclaim in your department',
      message:
        '{departmentId:name} has action-level recommendations to reclaim software seats. The department head will decide; you can review the details in advance.',
    },
  },
  GHOST_SEAT_DECISION_OVERDUE: {
    vi: {
      title: 'Quá hạn quyết định chỗ phần mềm',
      message:
        'Khuyến nghị thu hồi chỗ {applicationId:name}[ của {employeeId:name}] đã quá hạn quyết định ({decisionDueOn:date}). Vui lòng xử lý.',
    },
    en: {
      title: 'Seat decision overdue',
      message:
        'The recommendation to reclaim the {applicationId:name} seat[ of {employeeId:name}] is past its decision date ({decisionDueOn:date}). Please handle it.',
    },
  },
  GHOST_SEAT_WAITING_FOR_HEAD: {
    vi: {
      title: 'Phòng chưa có trưởng phòng, việc đang chờ',
      message:
        'Phòng {departmentId:name} chưa có trưởng phòng nên các khuyến nghị thu hồi chỗ phần mềm đang chờ. Vui lòng bổ nhiệm trưởng phòng.',
    },
    en: {
      title: 'Department has no head; work is waiting',
      message:
        '{departmentId:name} has no department head, so seat-reclaim recommendations are waiting. Please appoint a head.',
    },
  },
  GHOST_SEAT_RETURNED: {
    vi: {
      title: 'IT Admin trả lại việc thu hồi chỗ phần mềm',
      message:
        'IT Admin không thể thực hiện việc thu hồi chỗ {applicationId:name}[ của {employeeId:name}] và đã trả lại cho bạn. Vui lòng xem lại và quyết định.',
    },
    en: {
      title: 'Seat reclaim returned by IT Admin',
      message:
        'IT Admin could not carry out the reclaim of the {applicationId:name} seat[ of {employeeId:name}] and sent it back to you. Please review and decide again.',
    },
  },
  GHOST_SEAT_EXEMPTION_ENDING: {
    vi: {
      title: 'Miễn trừ thu hồi sắp hết',
      message:
        'Miễn trừ thu hồi chỗ {applicationId:name}[ của {employeeId:name}] sẽ hết vào {exemptUntil:date}. Sau ngày đó hệ thống sẽ đánh giá lại chỗ này.',
    },
    en: {
      title: 'Reclaim exemption ending soon',
      message:
        'The exemption from reclaiming the {applicationId:name} seat[ of {employeeId:name}] ends on {exemptUntil:date}. After that date the seat will be assessed again.',
    },
  },
  REVOCATION_UPCOMING: {
    vi: {
      title: 'Quyền phần mềm của bạn sắp bị thu hồi',
      message:
        'Quyền dùng {applicationId:name} (gói {planId:name}) của bạn dự kiến sẽ được thu hồi sớm nhất vào ngày {notBefore:date} vì ít được sử dụng.',
    },
    en: {
      title: 'Your software access will be revoked',
      message:
        'Your access to {applicationId:name} (plan {planId:name}) is due to be revoked on {notBefore:date} at the earliest because it is rarely used.',
    },
  },
  REVOCATION_CANCELLED: {
    vi: {
      title: 'Việc thu hồi quyền đã được hủy',
      message:
        'Việc thu hồi quyền dùng {applicationId:name} (gói {planId:name}) của bạn đã được hủy. Bạn tiếp tục dùng như bình thường.',
    },
    en: {
      title: 'Access revocation cancelled',
      message:
        'The revocation of your access to {applicationId:name} (plan {planId:name}) has been cancelled. You can keep using it as before.',
    },
  },
  USAGE_TRACKING_NOTICE: {
    vi: {
      title: 'Việc sử dụng {applicationId:name} sẽ được theo dõi',
      message:
        'Hoạt động được tính là: {activityDefinition}. Dữ liệu ghi nhận: {dataKinds} Mục đích: {purpose} Dữ liệu được lưu {retentionMonths} tháng.',
    },
    en: {
      title: 'Your use of {applicationId:name} will be tracked',
      message:
        'What counts as activity: {activityDefinition}. Data recorded: days with activity per application account; no volume, content or location. Purpose: to compare the access you hold with actual use in order to optimise software costs; it is not used to score individuals. Data is kept for {retentionMonths} months.',
    },
  },
  USAGE_SOURCE_STALE: {
    vi: {
      title: 'Báo cáo sử dụng đã cũ',
      message:
        'Nguồn "{source}" của {applicationId:name} chỉ có dữ liệu đến {coverageTo:date} (cũ {freshnessDays} ngày), nên chưa thể xác định chỗ nào không được dùng. Vui lòng nhập báo cáo mới.',
    },
    en: {
      title: 'Usage report is out of date',
      message:
        'The source "{source}" for {applicationId:name} only covers data up to {coverageTo:date} ({freshnessDays} days old), so unused seats cannot be determined yet. Please import a newer report.',
    },
  },
  LICENSE_EXPIRY_REMINDER: {
    vi: {
      title: 'Quyền phần mềm sắp hết hạn',
      message: {
        by: 'audience',
        cases: {
          EMPLOYEE:
            'Quyền dùng {planId:name} của bạn sẽ hết hạn vào {expectedEndDate:date}. Hãy gửi yêu cầu gia hạn nếu bạn vẫn cần dùng.',
          HEAD: 'Quyền {planId:name} của {holderEmployeeId:name} sẽ hết hạn vào {expectedEndDate:date}.',
          IT_ADMIN:
            'Quyền {planId:name} của {holderEmployeeId:name} sẽ hết hạn vào {expectedEndDate:date}; quyền sẽ được thu hồi nếu không gia hạn.',
        },
        otherwise: 'Quyền {planId:name} của {holderEmployeeId:name} sẽ hết hạn vào {expectedEndDate:date}.',
      },
    },
    en: {
      title: 'Software access ending soon',
      message: {
        by: 'audience',
        cases: {
          EMPLOYEE:
            'Your access to {planId:name} ends on {expectedEndDate:date}. Send a renewal request if you still need it.',
          HEAD: "{holderEmployeeId:name}'s access to {planId:name} ends on {expectedEndDate:date}.",
          IT_ADMIN:
            "{holderEmployeeId:name}'s access to {planId:name} ends on {expectedEndDate:date}; it will be revoked unless renewed.",
        },
        otherwise: "{holderEmployeeId:name}'s access to {planId:name} ends on {expectedEndDate:date}.",
      },
    },
  },
  RENEWAL_WINDOW_OPENED: {
    vi: {
      title: 'Có thể gia hạn quyền phần mềm',
      message: {
        by: 'audience',
        cases: {
          EMPLOYEE:
            'Quyền dùng {planId:name} của bạn sẽ kết thúc vào {expectedEndDate:date}. Bạn có thể gửi yêu cầu gia hạn từ {opensOn:date}.',
          HEAD: 'Quyền {planId:name} của {holderEmployeeId:name} sẽ kết thúc vào {expectedEndDate:date}; cửa sổ gửi yêu cầu gia hạn mở từ {opensOn:date}.',
        },
        otherwise:
          'Quyền {planId:name} của {holderEmployeeId:name} sẽ kết thúc vào {expectedEndDate:date}; cửa sổ gửi yêu cầu gia hạn mở từ {opensOn:date}.',
      },
    },
    en: {
      title: 'Software access can now be renewed',
      message: {
        by: 'audience',
        cases: {
          EMPLOYEE:
            'Your access to {planId:name} ends on {expectedEndDate:date}. You can send a renewal request from {opensOn:date}.',
          HEAD: "{holderEmployeeId:name}'s access to {planId:name} ends on {expectedEndDate:date}; the window to send a renewal request opens on {opensOn:date}.",
        },
        otherwise:
          "{holderEmployeeId:name}'s access to {planId:name} ends on {expectedEndDate:date}; the window to send a renewal request opens on {opensOn:date}.",
      },
    },
  },
  HANDOVER_CONFIRMATION_DUE: {
    vi: {
      title: 'Cần xác nhận bàn giao quyền',
      message:
        'Việc bàn giao quyền phần mềm liên quan đến {employeeId:name} cần được xác nhận trước {dueOn:date}. (Thông báo cũ, tính năng này đã ngừng.)',
    },
    en: {
      title: 'Access handover needs confirmation',
      message:
        'The software access handover for {employeeId:name} needs confirmation by {dueOn:date}. (Old notice; this feature has been retired.)',
    },
  },
  HANDOVER_CONFIRMATION_OVERDUE: {
    vi: {
      title: 'Quá hạn xác nhận bàn giao quyền',
      message:
        'Việc xác nhận bàn giao quyền phần mềm liên quan đến {employeeId:name} đã quá hạn {dueOn:date}. (Thông báo cũ, tính năng này đã ngừng.)',
    },
    en: {
      title: 'Access handover confirmation overdue',
      message:
        'Confirmation of the software access handover for {employeeId:name} was due on {dueOn:date} and is overdue. (Old notice; this feature has been retired.)',
    },
  },
  SERVICE_ACCOUNT_RESPONSIBLE_DUE: {
    vi: {
      title: 'Cần chuyển người phụ trách tài khoản dịch vụ',
      message:
        '{employeeId:name} đang phụ trách {accountCount} tài khoản dịch vụ và có thay đổi nhân sự hiệu lực từ {dueOn:date}. (Thông báo cũ, tính năng này đã ngừng.)',
    },
    en: {
      title: 'Service account owner needs replacing',
      message:
        '{employeeId:name} is responsible for {accountCount} service accounts and has a personnel change effective {dueOn:date}. (Old notice; this feature has been retired.)',
    },
  },
  SERVICE_ACCOUNT_RESPONSIBLE_OVERDUE: {
    vi: {
      title: 'Tài khoản dịch vụ chưa có người phụ trách mới',
      message:
        'Đến ngày {dueOn:date}, tài khoản dịch vụ của {employeeId:name} vẫn chưa có người phụ trách mới. (Thông báo cũ, tính năng này đã ngừng.)',
    },
    en: {
      title: 'Service account still has no new owner',
      message:
        'As of {dueOn:date}, the service account of {employeeId:name} still has no new owner. (Old notice; this feature has been retired.)',
    },
  },
  // Until the renewal of a subscription is redesigned (N3d) the old keys stay in the sentence. The state of the case (a decision, its
  // outcome) and of the usage data is carried by labels of `CODE_LABELS` that complete the sentence, so no case of the variant needs
  // a second `by`: `outcomeRecorded` is `true` or `false`, `usageData` is `AVAILABLE` or `NOT_AVAILABLE`.
  SUBSCRIPTION_RENEWAL_ALERT: {
    vi: {
      title: 'Thuê bao sắp đến hạn gia hạn',
      message: {
        by: 'decisionRecorded',
        cases: {
          false:
            'Còn {milestoneDays} ngày đến {baseDate:date} ({noticeBasis:enum}) của thuê bao {subscriptionId:name}. Chưa có quyết định gia hạn. {usageData:enum}',
          true: 'Còn {milestoneDays} ngày đến {baseDate:date} ({noticeBasis:enum}) của thuê bao {subscriptionId:name}. Đã có quyết định{outcomeRecorded:enum} {usageData:enum}',
        },
        otherwise:
          'Còn {milestoneDays} ngày đến {baseDate:date} ({noticeBasis:enum}) của thuê bao {subscriptionId:name}. {usageData:enum}',
      },
    },
    en: {
      title: 'Subscription renewal approaching',
      message: {
        by: 'decisionRecorded',
        cases: {
          false:
            '{milestoneDays} days left until {baseDate:date} ({noticeBasis:enum}) for subscription {subscriptionId:name}. No renewal decision yet. {usageData:enum}',
          true: '{milestoneDays} days left until {baseDate:date} ({noticeBasis:enum}) for subscription {subscriptionId:name}. A decision {outcomeRecorded:enum} {usageData:enum}',
        },
        otherwise:
          '{milestoneDays} days left until {baseDate:date} ({noticeBasis:enum}) for subscription {subscriptionId:name}. {usageData:enum}',
      },
    },
  },
  SUBSCRIPTION_RENEWAL_DATA_QUALITY: {
    vi: {
      title: 'Thuê bao thiếu thông tin hợp đồng',
      message:
        'Thuê bao {subscriptionId:name} chưa có hạn báo hủy hoặc ngày hết hạn nên hệ thống chưa thể nhắc gia hạn. Vui lòng bổ sung thông tin hợp đồng.',
    },
    en: {
      title: 'Subscription is missing contract data',
      message:
        'Subscription {subscriptionId:name} has no cancellation deadline or end date, so renewal reminders cannot be sent. Please complete the contract details.',
    },
  },
  SUBSCRIPTION_RENEWAL_PROPOSED: {
    vi: {
      title: 'Có đề xuất gia hạn thuê bao chờ bạn xác nhận',
      message: 'IT Admin đề xuất {choice:enum} cho thuê bao {subscriptionId:name}. Vui lòng xem xét và xác nhận.',
    },
    en: {
      title: 'Subscription renewal proposal awaits your confirmation',
      message: 'IT Admin proposed to {choice:enum} subscription {subscriptionId:name}. Please review and confirm.',
    },
  },
  SUBSCRIPTION_RENEWAL_DECIDED: {
    vi: {
      title: 'Đã có quyết định gia hạn thuê bao',
      message:
        'Phương án {choice:enum} cho thuê bao {subscriptionId:name} đã được xác nhận và sẽ thực hiện {executionPoint:enum}.',
    },
    en: {
      title: 'Subscription renewal decided',
      message:
        'The option to {choice:enum} subscription {subscriptionId:name} was confirmed and will be carried out {executionPoint:enum}.',
    },
  },
  SUBSCRIPTION_RENEWAL_LATE: {
    vi: {
      title: 'Gia hạn thuê bao chưa được thực hiện đúng hạn',
      message:
        'Đã đến {baseDate:date} nhưng quyết định gia hạn thuê bao {subscriptionId:name} vẫn chưa ghi nhận kết quả với nhà cung cấp. Vui lòng thực hiện và cập nhật kết quả.',
    },
    en: {
      title: 'Subscription renewal not carried out on time',
      message:
        '{baseDate:date} has arrived but the renewal decision for subscription {subscriptionId:name} still has no outcome recorded with the vendor. Please carry it out and record the result.',
    },
  },
  SUBSCRIPTION_AUTO_RENEWAL_INCIDENT: {
    vi: {
      title: 'Thuê bao có thể đã tự động gia hạn ngoài ý muốn',
      message:
        'Đã qua {baseDate:date} mà thuê bao {subscriptionId:name}, vốn tự động gia hạn, chưa có quyết định nào. Thuê bao có thể đã tự gia hạn. Vui lòng kiểm tra với nhà cung cấp.',
    },
    en: {
      title: 'Subscription may have auto-renewed unintentionally',
      message:
        '{baseDate:date} has passed and subscription {subscriptionId:name}, which renews automatically, has no decision. It may have renewed on its own. Please check with the vendor.',
    },
  },
  SUBSCRIPTION_EXPIRY_MARKED: {
    vi: {
      title: 'Thuê bao được đánh dấu sẽ kết thúc',
      message:
        'Đã qua {baseDate:date} mà thuê bao {subscriptionId:name} chưa có quyết định gia hạn, nên thuê bao được đánh dấu sẽ kết thúc[ vào {endDate:date}].',
    },
    en: {
      title: 'Subscription marked to end',
      message:
        '{baseDate:date} has passed with no renewal decision for subscription {subscriptionId:name}, so it is marked to end[ on {endDate:date}].',
    },
  },
  SUBSCRIPTION_SEATS_INCREASED: {
    vi: {
      title: 'Thuê bao được mua thêm chỗ',
      message:
        '{changedByEmployeeId:name} đã tăng số chỗ của thuê bao {subscriptionId:name} từ {fromQuantity} lên {toQuantity}.',
    },
    en: {
      title: 'Seats added to a subscription',
      message:
        '{changedByEmployeeId:name} increased the seats of subscription {subscriptionId:name} from {fromQuantity} to {toQuantity}.',
    },
  },
  PURCHASE_INVOICE_SUBMITTED: {
    vi: {
      title: 'Có hóa đơn chờ xác nhận chi',
      message: 'Hóa đơn mua hàng {linkKind:enum} kỳ {servicePeriodMonth} đang chờ bạn xác nhận chi tiền.',
    },
    en: {
      title: 'An invoice awaits your confirmation',
      message:
        'A purchase invoice for {linkKind:enum}, service month {servicePeriodMonth}, is waiting for you to confirm the payment.',
    },
  },
  PURCHASE_INVOICE_CONFIRMED: {
    vi: {
      title: 'Hóa đơn đã được xác nhận',
      message: 'Finance đã xác nhận chi tiền cho hóa đơn mua hàng {linkKind:enum} kỳ {servicePeriodMonth}.',
    },
    en: {
      title: 'Invoice confirmed',
      message:
        'Finance confirmed the payment for your purchase invoice for {linkKind:enum}, service month {servicePeriodMonth}.',
    },
  },
  PURCHASE_INVOICE_RETURNED: {
    vi: {
      title: 'Hóa đơn bị trả lại',
      message:
        'Finance đã trả lại hóa đơn mua hàng {linkKind:enum} kỳ {servicePeriodMonth}. Mở hóa đơn để xem lý do, chỉnh sửa rồi nộp lại.',
    },
    en: {
      title: 'Invoice returned',
      message:
        'Finance returned your purchase invoice for {linkKind:enum}, service month {servicePeriodMonth}. Open it to read the reason, fix it and submit it again.',
    },
  },
  DEPARTMENT_SOFTWARE_PROPOSED: {
    vi: {
      title: 'Có đề xuất thêm phần mềm cho phòng',
      message:
        'Phòng {departmentId:name} đề xuất thêm {applicationId:name}[ (gói {planId:name})] vào danh sách phần mềm. Vui lòng xem xét.',
    },
    en: {
      title: 'Software proposed for a department',
      message:
        '{departmentId:name} proposes adding {applicationId:name}[ (plan {planId:name})] to its software list. Please review it.',
    },
  },
  DEPARTMENT_SOFTWARE_PROPOSAL_DECIDED: {
    vi: {
      title: 'Đề xuất phần mềm đã có kết quả',
      message: {
        by: 'decision',
        cases: {
          ACCEPTED:
            'Đề xuất thêm {applicationId:name} vào danh sách phần mềm của phòng {departmentId:name} đã {decision:enum}.',
          REJECTED:
            'Đề xuất thêm {applicationId:name} vào danh sách phần mềm của phòng {departmentId:name} đã {decision:enum}.[ Lý do: {reason}.]',
        },
        otherwise:
          'Đề xuất thêm {applicationId:name} vào danh sách phần mềm của phòng {departmentId:name} đã có kết quả.',
      },
    },
    en: {
      title: 'Software proposal decided',
      message: {
        by: 'decision',
        cases: {
          ACCEPTED:
            'Your proposal to add {applicationId:name} to the software list of {departmentId:name} was {decision:enum}.',
          REJECTED:
            'Your proposal to add {applicationId:name} to the software list of {departmentId:name} was {decision:enum}.[ Reason: {reason}.]',
        },
        otherwise:
          'Your proposal to add {applicationId:name} to the software list of {departmentId:name} has been decided.',
      },
    },
  },
} satisfies Partial<Record<InAppNotificationCode, NotificationTexts>>;
