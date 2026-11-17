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

/**
 * What a name becomes when its id is unknown, deleted or unreadable. A kind a sentence names after its own noun ("Yêu cầu {requestId:name}",
 * "phòng {departmentId:name}", "gói {planId:name}") gets a neutral phrase that is not that noun: "Yêu cầu một yêu cầu" reads badly. A person
 * has no noun in front of the name, so "một nhân viên" stays.
 */
export const NAME_FALLBACK: Readonly<Record<NameKind, Readonly<Record<NotificationLocale, string>>>> = {
  REQUEST: { vi: '(không rõ tên)', en: '(unnamed)' },
  EMPLOYEE: { vi: 'một nhân viên', en: 'an employee' },
  DEPARTMENT: { vi: '(không rõ tên)', en: '(unnamed)' },
  COST_CENTER: { vi: '(không rõ tên)', en: '(unnamed)' },
  APPLICATION: { vi: '(không rõ tên)', en: '(unnamed)' },
  PLAN: { vi: '(không rõ tên)', en: '(unnamed)' },
  SUBSCRIPTION: { vi: '(không rõ tên)', en: '(unnamed)' },
};
