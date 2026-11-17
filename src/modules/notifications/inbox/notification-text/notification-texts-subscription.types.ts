import type { InAppNotificationCode } from '../../public/notifications.types';
import type { NotificationTexts } from './notification-text.types';

/**
 * The sentences of SBF-20 (a subscription and the adjustment of its seats at the end of a period). The codes that `SBF-20` v3.1 added or
 * changed (`SUBSCRIPTION_RENEWAL_ALERT`, `_RED_ALERT`, `_KEPT`, `_OUTCOME_RECORDED`, `SUBSCRIPTION_AUTO_RENEWAL_INCIDENT`,
 * `SUBSCRIPTION_EXPIRY_MARKED`, the `problem` of `_DATA_QUALITY`) are copied from section 13 of `SPEC-5A-SBF20.md`; the others are the
 * sentences of `catalog/notifications.md`. `_PROPOSED`, `_DECIDED` and `_LATE` are no longer sent, and keep their words for the notices
 * already stored. One entry per code, `vi` and `en`.
 */
export const SUBSCRIPTION_TEXTS = {
  // A row written before `SBF-20` v3.1 has no `commitment`: it is the old milestone, whose `milestoneDays` may be absent.
  SUBSCRIPTION_RENEWAL_ALERT: {
    vi: {
      title: 'Thuê bao tới điểm điều chỉnh',
      message: {
        by: 'commitment',
        cases: {
          MONTHLY:
            'Thuê bao {subscriptionId:name} đã tới điểm điều chỉnh của kỳ {commitment:enum}: kỳ sau cần {seatsNeeded} seat, bắt đầu {renewalOn:date}. Vui lòng làm với nhà cung cấp và ghi kết quả trước {baseDate:date}.',
          ANNUAL:
            'Thuê bao {subscriptionId:name} đã tới điểm điều chỉnh của kỳ {commitment:enum}: kỳ sau cần {seatsNeeded} seat, bắt đầu {renewalOn:date}. Vui lòng làm với nhà cung cấp và ghi kết quả trước {baseDate:date}.',
        },
        otherwise: 'Thuê bao {subscriptionId:name} sắp đến hạn {baseDate:date}.[ Còn {milestoneDays} ngày.]',
      },
    },
    en: {
      title: 'Subscription at its adjustment point',
      message: {
        by: 'commitment',
        cases: {
          MONTHLY:
            'Subscription {subscriptionId:name} reached the adjustment point of its {commitment:enum} period: the next period needs {seatsNeeded} seats from {renewalOn:date}. Please settle it with the vendor and record the outcome before {baseDate:date}.',
          ANNUAL:
            'Subscription {subscriptionId:name} reached the adjustment point of its {commitment:enum} period: the next period needs {seatsNeeded} seats from {renewalOn:date}. Please settle it with the vendor and record the outcome before {baseDate:date}.',
        },
        otherwise: 'Subscription {subscriptionId:name} is due on {baseDate:date}.[ {milestoneDays} days left.]',
      },
    },
  },
  SUBSCRIPTION_RENEWAL_RED_ALERT: {
    vi: {
      title: 'Cảnh báo đỏ: thuê bao chưa ghi kết quả điều chỉnh',
      message:
        'Còn ít ngày tới hạn {baseDate:date} mà thuê bao {subscriptionId:name} chưa có kết quả điều chỉnh. Kỳ sau cần {seatsNeeded} seat, bắt đầu {renewalOn:date}.',
    },
    en: {
      title: 'Red alert: subscription adjustment not recorded',
      message:
        'Subscription {subscriptionId:name} has no adjustment outcome and its deadline {baseDate:date} is close. The next period needs {seatsNeeded} seats from {renewalOn:date}.',
    },
  },
  SUBSCRIPTION_RENEWAL_KEPT: {
    vi: {
      title: 'Thuê bao gói tháng giữ nguyên số seat',
      message:
        'Thuê bao {subscriptionId:name} không được ghi điều chỉnh trước ngày thanh toán {renewalOn:date}, nên giữ nguyên {purchasedQuantity} seat trong khi chỉ cần {seatsNeeded}.',
    },
    en: {
      title: 'Monthly subscription kept its seats',
      message:
        'No adjustment was recorded for subscription {subscriptionId:name} before its payment day {renewalOn:date}, so it keeps {purchasedQuantity} seats while {seatsNeeded} are needed.',
    },
  },
  SUBSCRIPTION_RENEWAL_OUTCOME_RECORDED: {
    vi: {
      title: 'Đã ghi kết quả điều chỉnh thuê bao',
      message: {
        by: 'substitute',
        cases: {
          true: 'Kết quả điều chỉnh thuê bao {subscriptionId:name}: {choice:enum}[ {quantity} seat], nhà cung cấp {outcome:enum}. Một IT Admin khác đã ghi thay.',
        },
        otherwise:
          'Kết quả điều chỉnh thuê bao {subscriptionId:name}: {choice:enum}[ {quantity} seat], nhà cung cấp {outcome:enum}.',
      },
    },
    en: {
      title: 'Subscription adjustment recorded',
      message: {
        by: 'substitute',
        cases: {
          true: 'Adjustment of subscription {subscriptionId:name}: {choice:enum}[ {quantity} seats], vendor {outcome:enum}. Another IT Admin recorded it on your behalf.',
        },
        otherwise:
          'Adjustment of subscription {subscriptionId:name}: {choice:enum}[ {quantity} seats], vendor {outcome:enum}.',
      },
    },
  },
  // `problem` is `NO_ALERT_ANCHOR` (no date at all) or `NO_NOTICE_DEADLINE` (a plan by the year with no deadline to cancel: the renewal date stands in).
  SUBSCRIPTION_RENEWAL_DATA_QUALITY: {
    vi: {
      title: 'Thuê bao thiếu thông tin hợp đồng',
      message: {
        by: 'problem',
        cases: {
          NO_NOTICE_DEADLINE:
            'Thuê bao {subscriptionId:name} {problem:enum} nên hệ thống nhắc theo ngày gia hạn. Vui lòng bổ sung hạn chót báo hủy trong thông tin hợp đồng.',
        },
        otherwise:
          'Thuê bao {subscriptionId:name} chưa có hạn báo hủy hoặc ngày hết hạn nên hệ thống chưa thể nhắc gia hạn. Vui lòng bổ sung thông tin hợp đồng.',
      },
    },
    en: {
      title: 'Subscription is missing contract data',
      message: {
        by: 'problem',
        cases: {
          NO_NOTICE_DEADLINE:
            'Subscription {subscriptionId:name} has {problem:enum}, so reminders follow its renewal date. Please add the cancellation deadline to the contract details.',
        },
        otherwise:
          'Subscription {subscriptionId:name} has no cancellation deadline or end date, so renewal reminders cannot be sent. Please complete the contract details.',
      },
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
  // Sent past the `end` of a period that renews by itself with nothing recorded, and when an outcome was recorded as a smaller or no renewal
  // and the vendor renewed all the same. `renewalId` is null for the first.
  SUBSCRIPTION_AUTO_RENEWAL_INCIDENT: {
    vi: {
      title: 'Sự cố gia hạn ngoài ý muốn',
      message:
        'Thuê bao {subscriptionId:name} có thể đã được nhà cung cấp tự gia hạn vào {baseDate:date} ngoài ý muốn. Vui lòng kiểm tra với nhà cung cấp.',
    },
    en: {
      title: 'Unintended renewal',
      message:
        'Subscription {subscriptionId:name} may have been renewed by the vendor on {baseDate:date} unintentionally. Please check with the vendor.',
    },
  },
  // Sent past the `end` of a period that does not renew by itself (a year, or a month with an end date) with nothing recorded.
  SUBSCRIPTION_EXPIRY_MARKED: {
    vi: {
      title: 'Thuê bao hết hạn chưa gia hạn',
      message:
        'Đã qua ngày gia hạn {baseDate:date} mà thuê bao {subscriptionId:name} chưa ghi kết quả và vẫn còn quyền đang gán. Quyền có thể bị nhà cung cấp tạm ngưng.',
    },
    en: {
      title: 'Subscription expired without renewal',
      message:
        'The renewal day {baseDate:date} of subscription {subscriptionId:name} has passed with no outcome recorded while seats are still assigned. The vendor may suspend them.',
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
} satisfies Partial<Record<InAppNotificationCode, NotificationTexts>>;
