import type { DemoFixture, DemoUsageSource } from '../demo-fixture.types';
import { ORGANIZATION } from './organization';

const DOMAIN = 'saoviet.example';
const mail = (code: string): string => {
  const found = ORGANIZATION.people.find((person) => person.code === code);
  if (!found) throw new Error(`The usage fixture names a person it does not declare: ${code}`);

  return `${found.email}@${DOMAIN}`;
};
const row = (code: string, lastActivityDaysAgo: number | null) => ({ identifier: mail(code), lastActivityDaysAgo });

/*
 * The usage the vendors report, as the IT Admin in charge imports it from a file of the template (`SBF-04a`): the window of a file is
 * 120 days ending yesterday. A person's days of inactivity are counted from the end of the window; the thresholds are 30, 60 and 90
 * days (tiers Monitor, Review, Action). What each row must make the rules conclude:
 *
 * - NV-DES1 79 days → G4 Review; NV-DES2 109 days (an alias of the account) → G4 Action; NV-DESH 70 → G4 Review on the head's own seat;
 *   NV-DES11 74 and NV-DES12 65 → G4 Review; NV-DES4 40 → G4 Monitor (IT only);
 * - NV-DES3 has no Jira row at all → G3 (never used);
 * - the traps that must give nothing: NV-DES6 (a new seat), NV-DES7 (long leave), the design bot (a service account), NV-DES8 (an
 *   identity nobody could tie), NV-DES9 (granted 30 days ago: outside the coverage), NV-DES10 (the right ends within a month);
 * - NV-OFF1 has left today and still holds three seats → G2.
 */
const FIGMA: DemoUsageSource = {
  key: 'figma',
  application: 'figma',
  name: '[SV] Figma — xuất từ trang quản trị',
  importer: 'NV-ITA2',
  activityDefinition: 'Mở hoặc chỉnh sửa tệp thiết kế',
  windowFromDaysAgo: 120,
  windowToDaysAgo: 1,
  notice: 'CONFIRMED_DELIVERED',
  rows: [
    row('NV-DES1', 80),
    { identifier: `manh.ngo+figma@${DOMAIN}`, lastActivityDaysAgo: 110 },
    row('NV-DES3', 3),
    row('NV-DESH', 71),
    row('NV-DES4', 41),
    row('NV-DES5', 2),
    row('NV-DES6', null),
    row('NV-DES7', 81),
    row('NV-DES9', null),
    row('NV-DES10', 100),
    row('NV-DES11', 75),
    row('NV-DES12', 66),
    row('NV-OFF1', 2),
    // Somebody the company no longer knows: it stays in the queue of identities nobody could tie.
    { identifier: 'vo.thi.old@saoviet-old.example', lastActivityDaysAgo: 119 },
  ],
};

const JIRA: DemoUsageSource = {
  key: 'jira',
  application: 'jira',
  name: '[SV] Jira — xuất từ Atlassian admin',
  importer: 'NV-ITA1',
  activityDefinition: 'Xem hoặc cập nhật issue',
  windowFromDaysAgo: 120,
  windowToDaysAgo: 1,
  notice: 'CONFIRMED_DELIVERED',
  rows: [row('NV-ENGH', 3), row('NV-DEV1', 1), row('NV-DEV4', 5), row('NV-OFF1', 2)],
};

/** A report 10 days old: older than a week, so the source is stale and Canva is left out of the rules. */
const CANVA: DemoUsageSource = {
  key: 'canva',
  application: 'canva',
  name: '[SV] Canva — xuất tay',
  importer: 'NV-ITA2',
  activityDefinition: 'Mở hoặc chỉnh sửa thiết kế',
  windowFromDaysAgo: 100,
  windowToDaysAgo: 10,
  notice: 'SYSTEM_SENT',
  rows: [row('NV-DESH', 12), row('NV-DES5', 15)],
};

export const USAGE: Pick<DemoFixture, 'usageSources' | 'ghostDecisions' | 'personnel'> = {
  usageSources: [FIGMA, JIRA, CANVA],
  /*
   * After the seed runs the rules, the head of Design decides some of what they raised and leaves the rest to be decided in the demo:
   * NV-DES2 is kept, NV-DES11 is reclaimed (the revocation waits 7 days of grace), NV-DES12 is exempted for 90 days, and the head keeps
   * their own seat (a self-decision the Super Admin can read). NV-DES1 and NV-DES3 stay waiting.
   */
  ghostDecisions: [
    { holder: 'NV-DES2', application: 'figma', choice: 'KEEP', reason: 'Vẫn dùng bản sao thiết kế qua tài khoản phụ.' },
    {
      holder: 'NV-DES11',
      application: 'figma',
      choice: 'RECLAIM',
      reason: 'Đã chuyển sang công cụ khác từ quý trước.',
    },
    {
      holder: 'NV-DES12',
      application: 'figma',
      choice: 'EXEMPT',
      reason: 'Đang chờ dự án mới bắt đầu, sẽ dùng lại.',
      exemptDays: 90,
    },
    { holder: 'NV-DESH', application: 'figma', choice: 'KEEP', reason: 'Dùng để duyệt thiết kế của phòng.' },
  ],
  // Recorded after the baseline: a long leave and a departure that blocks access today (a transfer cannot take effect on the day a person is placed).
  personnel: [
    { kind: 'LONG_LEAVE', employee: 'NV-DES7', returnInDays: 60 },
    { kind: 'OFFBOARDING', employee: 'NV-OFF1' },
  ],
};
