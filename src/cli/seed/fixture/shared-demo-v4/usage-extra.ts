import type { DemoUsageSource } from '../demo-fixture.types';
import { ORGANIZATION } from './organization';

function identifier(code: string): string {
  const person = ORGANIZATION.people.find((person) => person.code === code);
  if (!person) throw new Error(`Unknown usage holder ${code}`);
  return `${person.email}@saoviet.example`;
}

function source(
  key: string,
  application: string,
  name: string,
  importer: string,
  rows: readonly (readonly [string, number])[],
): DemoUsageSource {
  return {
    key,
    application,
    name,
    importer,
    activityDefinition: 'Ngày hoạt động cuối cùng do nhà cung cấp xuất từ báo cáo thành viên.',
    windowFromDaysAgo: 120,
    windowToDaysAgo: 1,
    notice: 'CONFIRMED_DELIVERED',
    rows: rows.map(([code, lastActivityDaysAgo]) => ({ identifier: identifier(code), lastActivityDaysAgo })),
  };
}

export const EXTRA_USAGE_SOURCES: DemoUsageSource[] = [
  source('adobe', 'adobe', '[SV] Adobe — Admin Console', 'NV-ITA2', [
    ['NV-DEP', 5],
    ['NV-BOD4', 2],
    ['NV-BOD5', 76],
    ['NV-BOD2', 8],
  ]),
  source('hubspot', 'hubspot', '[SV] HubSpot — Users export', 'NV-ITA1', [
    ['NV-SALH', 1],
    ['NV-SAL3', 3],
  ]),
  source('notion', 'notion', '[SV] Notion — Members CSV', 'NV-ITA2', [
    ['NV-DEV5', 1],
    ['NV-BOD1', 4],
    ['NV-ITOH', 3],
    ['NV-ITO1', 6],
    ['NV-BOD3', 96],
  ]),
];
