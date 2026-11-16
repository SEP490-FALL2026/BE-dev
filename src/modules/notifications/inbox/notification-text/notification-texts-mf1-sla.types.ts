import type { InAppNotificationCode } from '../../public/notifications.types';
import type { NotificationTexts } from './notification-text.types';

/**
 * The sentences of MF-1 about the deadlines of a step, the queue of the head and the controlled wait. Copied from
 * `catalog/notifications.md` of the FE docs: one entry per code, `vi` and `en`.
 */
export const MF1_SLA_TEXTS = {
  REQUEST_WAITING_CONTROLLED: {
    vi: {
      title: 'Yêu cầu đang chờ người xử lý',
      message:
        'Bước[ {stepKind:enum}] của yêu cầu {requestId:name} hiện chưa có người xử lý nên đang chờ. Quản trị viên đã được báo; bạn không cần làm thêm gì.',
    },
    en: {
      title: 'Request is waiting for an assignee',
      message:
        'The[ {stepKind:enum}] step of your request {requestId:name} has nobody to handle it right now and is waiting. An administrator has been told; nothing more is needed from you.',
    },
  },
  REQUEST_WAITING_ENDED: {
    vi: {
      title: 'Yêu cầu đã có người xử lý',
      message: 'Bước[ {stepKind:enum}] của yêu cầu {requestId:name} đã có người phụ trách và được xử lý tiếp.',
    },
    en: {
      title: 'Request has an assignee again',
      message:
        'The[ {stepKind:enum}] step of your request {requestId:name} now has someone in charge and is moving on.',
    },
  },
  STEP_SLA_REMINDER: {
    vi: {
      title: 'Bước xử lý đã quá hạn',
      message: {
        by: 'recipientRole',
        cases: {
          REQUESTER:
            'Bước {stepKind:enum} của yêu cầu {requestId:name} của bạn đã quá hạn[ {overdueWorkingDays} ngày làm việc] (nhắc lần {reminderNumber}). Người xử lý đã được nhắc; bạn không cần làm thêm gì.',
        },
        otherwise:
          'Bước {stepKind:enum} của yêu cầu {requestId:name} đã quá hạn[ {overdueWorkingDays} ngày làm việc] (nhắc lần {reminderNumber}). Vui lòng xử lý sớm.',
      },
    },
    en: {
      title: 'A step is overdue',
      message: {
        by: 'recipientRole',
        cases: {
          REQUESTER:
            'The {stepKind:enum} step of your request {requestId:name} is overdue[ by {overdueWorkingDays} working days] (reminder {reminderNumber}). The person handling it has been reminded; nothing more is needed from you.',
        },
        otherwise:
          'The {stepKind:enum} step of request {requestId:name} is overdue[ by {overdueWorkingDays} working days] (reminder {reminderNumber}). Please handle it soon.',
      },
    },
  },
  STEP_SLA_ESCALATION: {
    vi: {
      title: 'Cấp dưới chưa xử lý một bước',
      message:
        'Bước {stepKind:enum} của yêu cầu {requestId:name}[ do {holderEmployeeId:name} phụ trách] đã quá hạn[ {overdueWorkingDays} ngày làm việc] (nhắc lần {reminderNumber}). Bạn nhận thông báo này vì là cấp trên.',
    },
    en: {
      title: 'A step handled by your report is late',
      message:
        'The {stepKind:enum} step of request {requestId:name}[, handled by {holderEmployeeId:name},] is overdue[ by {overdueWorkingDays} working days] (reminder {reminderNumber}). You are told because you are their superior.',
    },
  },
  STEP_SLA_NO_SUPERIOR: {
    vi: {
      title: 'Bước quá hạn cần Super Admin xử lý',
      message:
        'Bước {stepKind:enum} của yêu cầu {requestId:name} đã quá hạn[ {overdueWorkingDays} ngày làm việc] (nhắc lần {reminderNumber}): {cause:enum}.',
    },
    en: {
      title: 'Overdue step needs the Super Admin',
      message:
        'The {stepKind:enum} step of request {requestId:name} is overdue[ by {overdueWorkingDays} working days] (reminder {reminderNumber}): {cause:enum}.',
    },
  },
  SPEND_QUEUE_REMINDER: {
    vi: {
      title: 'Yêu cầu chờ trình duyệt chi quá lâu',
      message: {
        by: 'cause',
        cases: {
          NO_HOLDER:
            'Yêu cầu {requestId:name} chờ trình duyệt chi quá hạn[ {overdueWorkingDays} ngày làm việc] nhưng phòng chưa có trưởng phòng đang làm việc. Vui lòng bổ nhiệm trưởng phòng.',
        },
        // `cause` null or absent is the head of the department (the queue's own recipient), and so is a row without it.
        otherwise:
          'Yêu cầu {requestId:name} đã chờ trong hàng đợi của bạn quá hạn[ {overdueWorkingDays} ngày làm việc] (nhắc lần {reminderNumber}). Vui lòng trình duyệt chi.',
      },
    },
    en: {
      title: 'A request has waited too long to be sent for spend approval',
      message: {
        by: 'cause',
        cases: {
          NO_HOLDER:
            'Request {requestId:name} has waited to be sent for spend approval past its limit[ by {overdueWorkingDays} working days], but the department has no head at work. Please appoint one.',
        },
        otherwise:
          'Request {requestId:name} has waited in your queue past its limit[ by {overdueWorkingDays} working days] (reminder {reminderNumber}). Please send it for spend approval.',
      },
    },
  },
  FINANCE_QUESTION_REMINDER: {
    vi: {
      title: 'Câu hỏi gửi Finance chưa được trả lời',
      message:
        'Câu hỏi về yêu cầu {requestId:name} gửi Finance đã quá hạn[ {overdueWorkingDays} ngày làm việc] (nhắc lần {reminderNumber}).',
    },
    en: {
      title: 'A question to Finance is unanswered',
      message:
        'The question to Finance about request {requestId:name} is overdue[ by {overdueWorkingDays} working days] (reminder {reminderNumber}).',
    },
  },
  STEP_BACKLOG_ALERT: {
    vi: {
      title: 'Có người đang tồn nhiều bước',
      message:
        '{holderEmployeeId:name} đang có {openCount} bước chờ xử lý (ngưỡng {threshold}); bước cũ nhất đã chờ {oldestAgeWorkingDays} ngày làm việc.',
    },
    en: {
      title: 'Someone has a backlog of steps',
      message:
        '{holderEmployeeId:name} has {openCount} steps waiting (threshold {threshold}); the oldest has waited {oldestAgeWorkingDays} working days.',
    },
  },
  CONTROLLED_WAIT_ALERT: {
    vi: {
      title: 'Có việc đang chờ vì thiếu người phụ trách',
      message:
        '[Bước {stepKind:enum} của yêu cầu {requestId:name} đang chờ vì {waitingReason:enum}. Cần: {configurationHint:enum}.][Phiên bản ngân sách {year} của {costCenterId:name} đang chờ vì {waitingReason:enum}. Cần: {configurationHint:enum}.][Hồ sơ gia hạn thuê bao {subscriptionId:name} đang chờ vì {waitingReason:enum}. Cần: {configurationHint:enum}.]',
    },
    en: {
      title: 'Work is waiting for someone to be in charge',
      message:
        '[The {stepKind:enum} step of request {requestId:name} is waiting because {waitingReason:enum}. Needed: {configurationHint:enum}.][The {year} budget version of {costCenterId:name} is waiting because {waitingReason:enum}. Needed: {configurationHint:enum}.][The renewal case for subscription {subscriptionId:name} is waiting because {waitingReason:enum}. Needed: {configurationHint:enum}.]',
    },
  },
} satisfies Partial<Record<InAppNotificationCode, NotificationTexts>>;
