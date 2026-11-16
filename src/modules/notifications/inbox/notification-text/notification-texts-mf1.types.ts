import type { InAppNotificationCode } from '../../public/notifications.types';
import type { NotificationTexts } from './notification-text.types';

/**
 * The sentences of MF-1 from sending a request to granting it (the deadlines of a step are in `MF1_SLA_TEXTS`).
 * Copied from `catalog/notifications.md` of the FE docs: one entry per code, `vi` and `en`, the syntax of `catalog/README.md`.
 */
export const MF1_TEXTS = {
  REQUEST_SUBMITTED: {
    vi: {
      title: 'Đã gửi yêu cầu',
      message: {
        by: 'stage',
        cases: {
          WAITING_NEED_DECISION: 'Yêu cầu {requestId:name} đã được gửi và đang chờ người duyệt nhu cầu.',
          WAITING_CONTROLLED:
            'Yêu cầu {requestId:name} đã được gửi nhưng hiện chưa có người duyệt nhu cầu. Quản trị viên đã được báo để thiết lập; bạn không cần làm thêm gì.',
          CONFIRMED: 'Yêu cầu {requestId:name} đã được gửi và nhu cầu được xác nhận ngay khi gửi.',
        },
        otherwise: 'Yêu cầu {requestId:name} đã được gửi.',
      },
    },
    en: {
      title: 'Request sent',
      message: {
        by: 'stage',
        cases: {
          WAITING_NEED_DECISION: 'Your request {requestId:name} was sent and is waiting for the need approver.',
          WAITING_CONTROLLED:
            'Your request {requestId:name} was sent but nobody can approve the need yet. An administrator has been told; nothing more is needed from you.',
          CONFIRMED: 'Your request {requestId:name} was sent and its need was confirmed on sending.',
        },
        otherwise: 'Your request {requestId:name} was sent.',
      },
    },
  },
  REQUEST_NEED_APPROVED: {
    vi: {
      title: 'Nhu cầu đã được duyệt',
      message: 'Nhu cầu cho yêu cầu {requestId:name} đã được duyệt. Bước tiếp theo: {next:enum}.',
    },
    en: {
      title: 'Need approved',
      message: 'The need for your request {requestId:name} was approved. Next step: {next:enum}.',
    },
  },
  REQUEST_REJECTED: {
    vi: {
      title: 'Yêu cầu bị từ chối',
      message:
        'Yêu cầu {requestId:name} bị từ chối ở bước {by:enum}.[ Lý do: {reason}.][ Gói tương đương trong danh mục: {suggestedPlanId:name}.]',
    },
    en: {
      title: 'Request rejected',
      message:
        'Your request {requestId:name} was rejected at the {by:enum} step.[ Reason: {reason}.][ A similar plan in the catalogue: {suggestedPlanId:name}.]',
    },
  },
  REQUEST_RETURNED: {
    vi: {
      title: 'Yêu cầu được trả lại để bổ sung',
      message:
        'Yêu cầu {requestId:name} được trả lại ở bước {by:enum}.[ Lý do: {reason}.] Vui lòng bổ sung rồi gửi lại.',
    },
    en: {
      title: 'Request returned for changes',
      message:
        'Your request {requestId:name} was returned at the {by:enum} step.[ Reason: {reason}.] Please add what is missing and send it again.',
    },
  },
  REQUEST_IT_REJECTED: {
    vi: {
      title: 'IT Admin từ chối yêu cầu',
      message: {
        by: 'noAlternative',
        cases: {
          true: 'IT Admin từ chối yêu cầu {requestId:name}: {kind:enum}.[ Lý do: {reason}.][ Gói thay thế: {alternativePlanId:name}.][ Gợi ý: {alternativeNote}.] Không có phương án thay thế.',
        },
        otherwise:
          'IT Admin từ chối yêu cầu {requestId:name}: {kind:enum}.[ Lý do: {reason}.][ Gói thay thế: {alternativePlanId:name}.][ Gợi ý: {alternativeNote}.]',
      },
    },
    en: {
      title: 'Request rejected by IT',
      message: {
        by: 'noAlternative',
        cases: {
          true: 'The IT Admin rejected your request {requestId:name}: {kind:enum}.[ Reason: {reason}.][ Alternative plan: {alternativePlanId:name}.][ Suggestion: {alternativeNote}.] No alternative was offered.',
        },
        otherwise:
          'The IT Admin rejected your request {requestId:name}: {kind:enum}.[ Reason: {reason}.][ Alternative plan: {alternativePlanId:name}.][ Suggestion: {alternativeNote}.]',
      },
    },
  },
  REQUEST_SPEND_APPROVED: {
    vi: {
      title: 'Khoản chi đã được duyệt',
      message: 'Khoản chi cho yêu cầu {requestId:name} đã được duyệt. IT Admin sẽ tiến hành cấp quyền.',
    },
    en: {
      title: 'Spend approved',
      message: 'The spend for your request {requestId:name} was approved. The IT Admin will now grant access.',
    },
  },
  REQUEST_GRANTED: {
    vi: {
      title: 'Đã cấp quyền',
      message: 'Quyền dùng {requestId:name} đã được cấp. {accessGuide:enum}.[ Trang chủ: {homepageUrl}.]',
    },
    en: {
      title: 'Access granted',
      message: 'Access to {requestId:name} has been granted. {accessGuide:enum}.[ Homepage: {homepageUrl}.]',
    },
  },
  REQUEST_FAILED: {
    vi: {
      title: 'Không cấp được quyền',
      message: 'Yêu cầu {requestId:name} chưa cấp được quyền. Vui lòng liên hệ {contact:enum} để được hỗ trợ.',
    },
    en: {
      title: 'Access could not be granted',
      message: 'Access for your request {requestId:name} could not be granted. Please contact {contact:enum} for help.',
    },
  },
  REQUEST_WITHDRAWN: {
    vi: {
      title: 'Yêu cầu đã được rút',
      message: {
        by: 'byRequester',
        cases: {
          true: 'Yêu cầu {requestId:name} đã được người yêu cầu rút lại.',
          false: 'Yêu cầu {requestId:name} đã được trưởng phòng rút lại.[ Lý do: {reason}.]',
        },
        otherwise: 'Yêu cầu {requestId:name} đã được rút lại.[ Lý do: {reason}.]',
      },
    },
    en: {
      title: 'Request withdrawn',
      message: {
        by: 'byRequester',
        cases: {
          true: 'Request {requestId:name} was withdrawn by the requester.',
          false: 'Request {requestId:name} was withdrawn by the head of department.[ Reason: {reason}.]',
        },
        otherwise: 'Request {requestId:name} was withdrawn.[ Reason: {reason}.]',
      },
    },
  },
  REQUEST_WITHDRAWAL_PENDING: {
    vi: {
      title: 'Yêu cầu chưa kết thúc',
      message:
        'Trưởng phòng đã rút yêu cầu {requestId:name}, nhưng yêu cầu chưa kết thúc: đang chờ IT Admin đóng tác vụ cấp quyền.',
    },
    en: {
      title: 'Request not closed yet',
      message:
        'The head of department withdrew your request {requestId:name}, but it is not closed yet: it is waiting for the IT Admin to close the grant task.',
    },
  },
  REQUEST_CANCELLED: {
    vi: {
      title: 'Yêu cầu đã được đóng',
      message: {
        by: 'reasonKind',
        cases: {
          BENEFICIARY_LEFT: 'Yêu cầu {requestId:name} đã được đóng vì {reasonKind:enum}.',
          BENEFICIARY_TRANSFERRED: 'Yêu cầu {requestId:name} đã được đóng vì {reasonKind:enum}.',
        },
        otherwise: 'Yêu cầu {requestId:name} đã được đóng vì yêu cầu không còn cần thiết.',
      },
    },
    en: {
      title: 'Request closed',
      message: {
        by: 'reasonKind',
        cases: {
          BENEFICIARY_LEFT: 'Request {requestId:name} was closed because {reasonKind:enum}.',
          BENEFICIARY_TRANSFERRED: 'Request {requestId:name} was closed because {reasonKind:enum}.',
        },
        otherwise: 'Request {requestId:name} was closed because the request is no longer needed.',
      },
    },
  },
  STEP_ASSIGNED: {
    vi: {
      title: 'Bạn có việc cần xử lý',
      message: 'Bạn được giao bước {stepKind:enum} của yêu cầu {requestId:name} ({cause:enum}).',
    },
    en: {
      title: 'You have a task to handle',
      message: 'You have been assigned the {stepKind:enum} step of request {requestId:name} ({cause:enum}).',
    },
  },
  STEP_CLOSED_BY_WITHDRAWAL: {
    vi: {
      title: 'Bước bạn phụ trách đã đóng',
      message:
        'Yêu cầu {requestId:name} đã được rút nên bước {stepKind:enum} bạn đang giữ được đóng. Bạn không cần xử lý nữa.',
    },
    en: {
      title: 'A step you held was closed',
      message:
        'Request {requestId:name} was withdrawn, so the {stepKind:enum} step you held is closed. You do not need to act on it any more.',
    },
  },
  WITHDRAWAL_AWAITING_IT_CLOSE: {
    vi: {
      title: 'Cần đóng tác vụ cấp quyền',
      message:
        'Yêu cầu {requestId:name} đã bị rút nhưng việc cấp quyền từng thất bại. Vui lòng kiểm tra và đóng tác vụ để kết thúc yêu cầu.',
    },
    en: {
      title: 'A grant task needs to be closed',
      message:
        'Request {requestId:name} was withdrawn but its grant had failed. Please check and close the task to finish the request.',
    },
  },
  COMMITMENT_RELEASED_BY_WITHDRAWAL: {
    vi: {
      title: 'Ngân sách giữ chỗ đã được hoàn trả',
      message:
        'Yêu cầu {requestId:name} đã bị rút nên khoản ngân sách giữ chỗ cho yêu cầu này đã được trả về ngân sách.',
    },
    en: {
      title: 'Reserved budget released',
      message: 'Request {requestId:name} was withdrawn, so the budget held for it has been released.',
    },
  },
  GRANT_TASK_CANCELLED: {
    vi: {
      title: 'Tác vụ cấp quyền đã bị hủy',
      message: 'Tác vụ cấp quyền của yêu cầu {requestId:name} đã bị hủy; bạn không cần xử lý tác vụ này nữa.',
    },
    en: {
      title: 'Grant task cancelled',
      message: 'The grant task for request {requestId:name} was cancelled; you do not need to work on it any more.',
    },
  },
  SERVICE_ACCOUNT_BOUNDARY_ACCEPTED: {
    vi: {
      title: 'Tài khoản dịch vụ được chấp nhận',
      message:
        'IT Admin đã chấp nhận yêu cầu {requestId:name} về tài khoản dịch vụ; yêu cầu chuyển sang bước cấp quyền.',
    },
    en: {
      title: 'Service account accepted',
      message:
        'The IT Admin accepted your service-account request {requestId:name}; it now moves on to the grant step.',
    },
  },
  RETURN_REQUESTED: {
    vi: {
      title: 'Quyền của bạn sắp được thu hồi',
      message: {
        by: 'source',
        cases: {
          HEAD_CONFIRMATION:
            'Trưởng phòng đã xác nhận bạn không còn cần dùng {planId:name}. IT Admin sẽ thu hồi quyền này.',
          EMPLOYEE_RETURN: 'Yêu cầu trả quyền {planId:name} của bạn đã được gửi; IT Admin sẽ thu hồi quyền này.',
        },
        otherwise: 'IT Admin sẽ thu hồi quyền {planId:name} của bạn.',
      },
    },
    en: {
      title: 'Your access is about to be revoked',
      message: {
        by: 'source',
        cases: {
          HEAD_CONFIRMATION:
            'Your head of department confirmed you no longer need {planId:name}. The IT Admin will revoke it.',
          EMPLOYEE_RETURN: 'Your request to return {planId:name} was sent; the IT Admin will revoke it.',
        },
        otherwise: 'The IT Admin will revoke your access to {planId:name}.',
      },
    },
  },
  RETURN_COMPLETED: {
    vi: {
      title: 'Quyền đã được thu hồi',
      message: 'IT Admin đã thu hồi xong quyền theo yêu cầu trả quyền. Quyền này không còn hiệu lực.',
    },
    en: {
      title: 'Access revoked',
      message: 'The IT Admin has finished revoking the access you returned. It is no longer valid.',
    },
  },
  RETURN_FAILED: {
    vi: {
      title: 'Chưa thu hồi được quyền',
      message:
        'IT Admin chưa thu hồi được quyền theo yêu cầu trả quyền; quyền vẫn đang còn hiệu lực. Vui lòng liên hệ IT Admin.',
    },
    en: {
      title: 'Access could not be revoked',
      message:
        'The IT Admin could not revoke the access you asked to return; it is still valid. Please contact the IT Admin.',
    },
  },
  REQUEST_RENEWAL_APPLIED: {
    vi: {
      title: 'Quyền đã được gia hạn',
      message: 'Quyền dùng {requestId:name} đã được gia hạn[ đến {newExpectedEndDate:date}].',
    },
    en: {
      title: 'Access renewed',
      message: 'Your access to {requestId:name} has been renewed[ until {newExpectedEndDate:date}].',
    },
  },
  REQUEST_RENEWAL_NOT_APPLIED: {
    vi: {
      title: 'Chưa gia hạn được quyền',
      message:
        'Yêu cầu gia hạn {requestId:name} đã được duyệt nhưng chưa áp dụng được: {problem:enum}. Quyền giữ nguyên ngày hết hạn cũ.',
    },
    en: {
      title: 'Renewal could not be applied',
      message:
        'Renewal request {requestId:name} was approved but could not be applied: {problem:enum}. The access keeps its old end date.',
    },
  },
  REQUEST_FINANCE_REVIEW_OPENED: {
    vi: {
      title: 'Yêu cầu chuyển sang Finance rà soát',
      message: 'Yêu cầu {requestId:name} đã được chuyển cho Finance rà soát ngân sách.',
    },
    en: {
      title: 'Request sent to Finance for review',
      message: 'Request {requestId:name} was sent to Finance for a budget review.',
    },
  },
  REQUEST_RETURNED_BY_FINANCE: {
    vi: {
      title: 'Finance trả lại yêu cầu',
      message: 'Finance đã trả lại yêu cầu {requestId:name} cho bạn.[ Lý do: {reason}.]',
    },
    en: {
      title: 'Request returned by Finance',
      message: 'Finance returned request {requestId:name} to you.[ Reason: {reason}.]',
    },
  },
  REQUEST_AWAITING_BUDGET: {
    vi: {
      title: 'Yêu cầu chờ ngân sách',
      message:
        'Yêu cầu {requestId:name} đang chờ ngân sách năm {year} của {costCenterId:name} được lập hoặc điều chỉnh.',
    },
    en: {
      title: 'Request is waiting for budget',
      message:
        'Request {requestId:name} is waiting for the {year} budget of {costCenterId:name} to be made or revised.',
    },
  },
  REQUEST_BUDGET_VERSION_ENDED: {
    vi: {
      title: 'Phiên bản ngân sách mà yêu cầu chờ đã kết thúc',
      message:
        'Phiên bản ngân sách năm {year} của {costCenterId:name} mà yêu cầu {requestId:name} đang chờ đã kết thúc ({decision}).',
    },
    en: {
      title: 'The budget version a request waited for has ended',
      message:
        'The {year} budget version of {costCenterId:name} that request {requestId:name} was waiting for has ended ({decision}).',
    },
  },
  REQUEST_RESERVE_CONFIRMATION_NEEDED: {
    vi: {
      title: 'Cần xác nhận dùng quỹ dự phòng',
      message:
        'Yêu cầu {requestId:name} vượt ngân sách gốc của phòng và sẽ dùng quỹ dự phòng. Vui lòng xác nhận trước khi trình duyệt chi.',
    },
    en: {
      title: 'Reserve use needs your confirmation',
      message:
        "Request {requestId:name} goes beyond the department's base budget and would use the reserve. Please confirm before sending it for spend approval.",
    },
  },
  REQUEST_BUDGET_BLOCKED: {
    vi: {
      title: 'Yêu cầu bị chặn ở bước kiểm ngân sách',
      message: 'Yêu cầu {requestId:name} chưa đi tiếp được vì: {reasons:list}.',
    },
    en: {
      title: 'Request blocked by the budget check',
      message: 'Request {requestId:name} cannot go on because: {reasons:list}.',
    },
  },
  REQUEST_RETURNED_AT_DECISION: {
    vi: {
      title: 'Yêu cầu được trả lại khi duyệt chi',
      message: 'Yêu cầu {requestId:name} được trả lại trước khi duyệt chi vì: {reasons:list}.',
    },
    en: {
      title: 'Request sent back at spend approval',
      message: 'Request {requestId:name} was sent back before the spend decision because: {reasons:list}.',
    },
  },
  REQUEST_CANCELLED_BENEFICIARY_GONE: {
    vi: {
      title: 'Yêu cầu đã được hệ thống đóng',
      message: {
        by: 'reasonKind',
        cases: {
          DEPARTURE:
            'Yêu cầu {requestId:name} cho {beneficiaryEmployeeId:name} đã được hệ thống đóng vì người này đã nghỉ việc. Khoản ngân sách đã giữ (nếu có) được trả về.',
          TRANSFER:
            'Yêu cầu {requestId:name} cho {beneficiaryEmployeeId:name} đã được hệ thống đóng vì người này chuyển sang phòng khác. Nếu vẫn cần, vui lòng gửi yêu cầu mới ở phòng mới.',
        },
        otherwise: 'Yêu cầu {requestId:name} cho {beneficiaryEmployeeId:name} đã được hệ thống đóng.',
      },
    },
    en: {
      title: 'Request closed by the system',
      message: {
        by: 'reasonKind',
        cases: {
          DEPARTURE:
            'Request {requestId:name} for {beneficiaryEmployeeId:name} was closed by the system because the person has left the company. Any budget held was released.',
          TRANSFER:
            'Request {requestId:name} for {beneficiaryEmployeeId:name} was closed by the system because the person moved to another department. If it is still needed, please send a new request in the new department.',
        },
        otherwise: 'Request {requestId:name} for {beneficiaryEmployeeId:name} was closed by the system.',
      },
    },
  },
  REQUEST_BENEFICIARY_GONE_IT_CHECK: {
    vi: {
      title: 'Cần kiểm tra yêu cầu đang cấp quyền',
      message: {
        by: 'reasonKind',
        cases: {
          DEPARTURE:
            '{beneficiaryEmployeeId:name} đã nghỉ việc nhưng yêu cầu {requestId:name} đang được cấp quyền nên hệ thống chưa tự đóng. Vui lòng kiểm tra với nhà cung cấp, thu hồi lời mời nếu có rồi đóng yêu cầu.',
          TRANSFER:
            '{beneficiaryEmployeeId:name} đã chuyển phòng nhưng yêu cầu {requestId:name} đang được cấp quyền nên hệ thống chưa tự đóng. Vui lòng kiểm tra với nhà cung cấp, thu hồi lời mời nếu có rồi đóng yêu cầu.',
        },
        otherwise:
          '{beneficiaryEmployeeId:name} đã nghỉ việc hoặc chuyển phòng nhưng yêu cầu {requestId:name} đang được cấp quyền nên hệ thống chưa tự đóng. Vui lòng kiểm tra với nhà cung cấp, thu hồi lời mời nếu có rồi đóng yêu cầu.',
      },
    },
    en: {
      title: 'A request being granted needs a check',
      message: {
        by: 'reasonKind',
        cases: {
          DEPARTURE:
            '{beneficiaryEmployeeId:name} has left but request {requestId:name} is being granted, so the system did not close it. Please check with the vendor, take back any invitation and close the request.',
          TRANSFER:
            '{beneficiaryEmployeeId:name} has moved departments but request {requestId:name} is being granted, so the system did not close it. Please check with the vendor, take back any invitation and close the request.',
        },
        otherwise:
          '{beneficiaryEmployeeId:name} has left or moved departments but request {requestId:name} is being granted, so the system did not close it. Please check with the vendor, take back any invitation and close the request.',
      },
    },
  },
  IT_ADMIN_SELF_EXECUTED: {
    vi: {
      title: 'IT Admin tự xử lý quyền của chính mình',
      message:
        'IT Admin {employeeId:name} đã tự xử lý tác vụ cấp hoặc thu hồi quyền của chính họ vì không còn IT Admin nào khác có thể làm thay. Vui lòng kiểm tra lại.',
    },
    en: {
      title: 'IT Admin handled their own access',
      message:
        'IT Admin {employeeId:name} handled a grant or revocation task for their own access because no other IT Admin was available. Please review it.',
    },
  },
} satisfies Partial<Record<InAppNotificationCode, NotificationTexts>>;
