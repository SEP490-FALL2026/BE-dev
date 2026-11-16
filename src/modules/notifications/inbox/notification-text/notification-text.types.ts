import type { NameKind } from '../../public/notifications.extension-points';

export type NotificationLocale = 'vi' | 'en';

/**
 * One sentence. A plain string, or a variant chosen by the value of one param (`audience`, `stage`, `kind`…):
 * the variant is the whole sentence (the base sentence plus its tail), never a suffix appended to another.
 */
export type TextTemplate = string | { by: string; cases: Readonly<Record<string, string>>; otherwise: string };

export interface LocaleTexts {
  title: TextTemplate;
  message: TextTemplate;
}

export interface NotificationTexts {
  vi: LocaleTexts;
  en: LocaleTexts;
}

/** The kind of entity a `{key:name}` variable names. Only these params are ids of something that has a display name. */
export const NAME_KIND_BY_KEY: Readonly<Record<string, NameKind>> = {
  requestId: 'REQUEST',
  employeeId: 'EMPLOYEE',
  holderEmployeeId: 'EMPLOYEE',
  beneficiaryEmployeeId: 'EMPLOYEE',
  fromEmployeeId: 'EMPLOYEE',
  changedByEmployeeId: 'EMPLOYEE',
  departmentId: 'DEPARTMENT',
  fromDepartmentId: 'DEPARTMENT',
  toDepartmentId: 'DEPARTMENT',
  owningDepartmentId: 'DEPARTMENT',
  costCenterId: 'COST_CENTER',
  applicationId: 'APPLICATION',
  planId: 'PLAN',
  suggestedPlanId: 'PLAN',
  alternativePlanId: 'PLAN',
  subscriptionId: 'SUBSCRIPTION',
};

/** What a name becomes when its id is unknown, deleted or unreadable. Same words as the catalogue's generic phrases. */
export const NAME_FALLBACK: Readonly<Record<NameKind, Readonly<Record<NotificationLocale, string>>>> = {
  REQUEST: { vi: 'một yêu cầu', en: 'a request' },
  EMPLOYEE: { vi: 'một nhân viên', en: 'an employee' },
  DEPARTMENT: { vi: 'một phòng', en: 'a department' },
  COST_CENTER: { vi: 'một Cost Center', en: 'a Cost Center' },
  APPLICATION: { vi: 'một ứng dụng', en: 'an application' },
  PLAN: { vi: 'một gói', en: 'a plan' },
  SUBSCRIPTION: { vi: 'một thuê bao', en: 'a subscription' },
};
