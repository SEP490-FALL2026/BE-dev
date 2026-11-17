import type { DemoApplication, DemoPlan } from '../demo-fixture.types';

export const k2 = (key: string, name: string, extra: Partial<DemoPlan> = {}): DemoPlan => ({
  key,
  name,
  provisioningType: 'K2',
  controlLevel: 'FULL',
  dataLossOnRemoval: false,
  sharingPolicy: 'NOT_ALLOWED',
  ...extra,
});

export const k4 = (key: string, name: string, extra: Partial<DemoPlan> = {}): DemoPlan => ({
  key,
  name,
  provisioningType: 'K4',
  controlLevel: 'FULL',
  dataLossOnRemoval: false,
  sharingPolicy: 'NOT_ALLOWED',
  ...extra,
});

export const app = (
  key: string,
  name: string,
  vendorName: string,
  plans: DemoPlan[],
  kind: DemoApplication['kind'] = 'SAAS',
  dataSensitivity: DemoApplication['dataSensitivity'] = 'MEDIUM',
): DemoApplication => ({ key, name, kind, vendorName, dataSensitivity, functionalGroup: groupOf(key), plans });

/**
 * The seven functional groups the installation writes (`functional-group-standard.policy.ts`), each holding at least one application of the
 * dataset (C-O5): the catalog screen and the dashboards show every group.
 */
export const FUNCTIONAL_GROUPS: readonly (readonly [application: string, group: string])[] = [
  ['chatgpt', 'Trợ lý AI'],
  ['cursor', 'Trợ lý AI'],
  ['figma', 'Thiết kế & sáng tạo'],
  ['canva', 'Thiết kế & sáng tạo'],
  ['jira', 'Lập trình & kỹ thuật'],
  ['github', 'Lập trình & kỹ thuật'],
  ['postman', 'Lập trình & kỹ thuật'],
  ['jetbrains', 'Lập trình & kỹ thuật'],
  ['onepassword', 'Văn phòng & cộng tác'],
  ['grammarly', 'Văn phòng & cộng tác'],
  ['mailchimp', 'Chuyên ngành'],
  ['hr-portal', 'Khác'],
  ['slack', 'Liên lạc (email, chat, họp)'],
  // The twelve applications of `catalog-extra.ts` (SPEC S04).
  ['m365', 'Văn phòng & cộng tác'],
  ['visio', 'Văn phòng & cộng tác'],
  ['notion', 'Văn phòng & cộng tác'],
  ['zoom', 'Liên lạc (email, chat, họp)'],
  ['skype', 'Liên lạc (email, chat, họp)'],
  ['confluence', 'Lập trình & kỹ thuật'],
  ['sublime', 'Lập trình & kỹ thuật'],
  ['adobe', 'Thiết kế & sáng tạo'],
  ['claude', 'Trợ lý AI'],
  ['copilot', 'Trợ lý AI'],
  ['hubspot', 'Chuyên ngành'],
  ['attendance', 'Khác'],
];

export function groupOf(key: string): string {
  const group = FUNCTIONAL_GROUPS.find(([application]) => application === key)?.[1];
  if (!group) throw new Error(`The application ${key} names no functional group`);

  return group;
}
