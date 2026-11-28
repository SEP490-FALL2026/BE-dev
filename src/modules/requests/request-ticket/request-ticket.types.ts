import type { BusinessDate } from '../../../core/business-date';
import type { TermKind, TermRefusal } from '../../../core/term-limit';
import type { AccessRequestState, TicketRef } from '../access-request/access-request.types';
import type { LatestReply, LatestReplyRow } from '../request-reply/request-reply.types';

export type { TicketRef };

export type TicketItemState = Exclude<AccessRequestState, 'DRAFT'>;

export interface RequestTicketItemRawView {
  position: number;
  requestId: string;
  planId: string;
  state: TicketItemState;
  termMonths: number | null;
  routingMode: 'VIA_HEAD' | 'ONE_STEP';
  latestReply: LatestReplyRow | null;
}

export interface RequestTicketRawView {
  id: string;
  requesterEmployeeId: string;
  departmentId: string;
  submittedAt: Date;
  items: RequestTicketItemRawView[];
}

export interface RequestTicketItemView {
  position: number;
  requestId: string;
  plan: { id: string; name: string };
  state: TicketItemState;
  termMonths: number | null;
  routingMode: 'VIA_HEAD' | 'ONE_STEP';
  latestReply: LatestReply | null;
}

export interface RequestTicketView {
  id: string;
  requester: { employeeId: string; employeeCode: string; fullName: string };
  department: { id: string; code: string; name: string };
  submittedAt: Date;
  items: RequestTicketItemView[];
}

export type TicketItemRefusalReason =
  | 'PLAN_NOT_FOUND'
  | 'APPLICATION_RETIRED'
  | 'PLAN_BOUND_TO_DEVICE'
  | 'NOT_PRICEABLE'
  | 'NOT_PAID_IN_CATALOG'
  | 'HAS_ACCESS'
  | TermRefusal
  | 'HAS_OPEN_REQUEST'
  | 'DUPLICATE_IN_TICKET'
  | 'OPEN_LIMIT_REACHED';

export interface TicketItemRefusal {
  position: number;
  planId: string;
  reason: TicketItemRefusalReason;
  duplicateOfPosition?: number;
  openRequestId?: string;
  resetsOn?: BusinessDate;
  contractEndDate?: BusinessDate | null;
  maxMonths?: number;
  provisioningType?: TermKind;
}
