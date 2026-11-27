import type {
  DemoApplication,
  DemoLot,
  DemoPlan,
  DemoPlanTerms,
  DemoSeat,
  DemoSubscription,
} from '../demo-fixture.types';
import { app, groupOf, k2, k4, monthly } from './catalog-kit';

export const RETIRED_APPLICATIONS = ['skype'];

/** A per-seat plan bought one by one (K1): the control the company has over the seat is the one the vendor allows. */
const k1 = (
  key: string,
  name: string,
  controlLevel: NonNullable<DemoPlan['controlLevel']>,
  extra: Pick<DemoPlan, 'referencePrice' | 'referenceCommitmentMonths'> = {},
): DemoPlan => ({
  key,
  name,
  provisioningType: 'K1',
  controlLevel,
  dataLossOnRemoval: false,
  sharingPolicy: 'NOT_ALLOWED',
  ...extra,
});

/*
 * Twelve more applications and nineteen plans of real SaaS (Q3): the names are the vendors' own, the prices (in `SUBSCRIPTIONS`) are simulated
 * and near the list price. They bring what the first thirteen lacked: monthly and annual plans, a third level of control (GitHub Copilot, which
 * the company cannot control), a K4 plan with an admin console that may be shared (Visio) and one without (Sublime), a plan that loses data when
 * a user is removed (Adobe), a workspace with no company account (Notion Business), a plan with no subscription at all (Skype, retired in S21)
 * and the internal attendance system for the K5 requests of IT and Operations. Zoom and Skype stand in the group the usage rules never collect.
 * Nothing here is Miro, Whimsical or Canva Enterprise: the budget scenarios of R08, R25 and R29 name them as software outside the catalog.
 */
export const EXTRA_APPLICATIONS: DemoApplication[] = [
  app('m365', 'Microsoft 365', 'Microsoft', [
    k2('m365-basic', 'Microsoft 365 Business Basic', { vendorAdmin: 'NV-ITA3' }),
    k2('m365-standard', 'Microsoft 365 Business Standard', { vendorAdmin: 'NV-ITA3' }),
  ]),
  app(
    'zoom',
    'Zoom Workplace',
    'Zoom',
    [k2('zoom-pro', 'Zoom Workplace Pro'), k2('zoom-business', 'Zoom Workplace Business')],
    'SAAS',
    'LOW',
  ),
  app('notion', 'Notion', 'Notion Labs', [
    k2('notion-business', 'Notion Business', { withoutOwnerAccountEmail: true }),
    k2('notion-plus', 'Notion Plus'),
  ]),
  app('confluence', 'Confluence', 'Atlassian', [
    k2('confluence-standard', 'Confluence Standard'),
    k2('confluence-premium', 'Confluence Premium'),
  ]),
  app('adobe', 'Adobe Creative Cloud', 'Adobe', [
    k2('adobe-cc-teams', 'Adobe Creative Cloud Teams All Apps', {
      dataLossOnRemoval: true,
      revocationNote:
        'Tải về các tệp thiết kế lưu trên Creative Cloud của người dùng rồi mới gỡ: gỡ xong, kho lưu của họ bị xóa.',
    }),
    k2('adobe-photoshop', 'Adobe Photoshop'),
  ]),
  app(
    'claude',
    'Claude',
    'Anthropic',
    [
      k1('claude-pro', 'Claude Pro', 'PARTIAL', { referencePrice: '508000', referenceCommitmentMonths: 12 }),
      // QĐ-113b: Claude Team holds two seat tiers (Standard & Premium) inside one workspace and one multi-line subscription.
      k2('claude-team-standard', 'Claude Team Standard'),
      k2('claude-team-premium', 'Claude Team Premium'),
    ],
    'SAAS',
    'HIGH',
  ),
  app(
    'copilot',
    'GitHub Copilot',
    'GitHub',
    [
      k1('copilot-pro', 'GitHub Copilot Pro', 'UNCONTROLLABLE', {
        referencePrice: '254000',
        referenceCommitmentMonths: 1,
      }),
    ],
    'SAAS',
    'HIGH',
  ),
  app('visio', 'Microsoft Visio', 'Microsoft', [
    k4('visio-pro', 'Visio Professional', { hasAdminConsole: true, sharingPolicy: 'ALLOWED', vendorAdmin: 'NV-ITA3' }),
  ]),
  app('sublime', 'Sublime Text', 'Sublime HQ', [k4('sublime-license', 'Sublime Text License')]),
  // W2-17, W2-25: a plan bundled with the machine (no purchase, no key) and a plan bought per machine, a key that runs on many (a cap of activations).
  app('windows', 'Windows 11', 'Microsoft', [
    k4('windows-11-pro-oem', 'Windows 11 Pro OEM', { keyBinding: 'DEVICE_BUNDLED' }),
  ]),
  app('office', 'Microsoft Office', 'Microsoft', [
    k4('office-home-business-2024', 'Office Home & Business 2024', { keyBinding: 'DEVICE_KEY' }),
  ]),
  app('hubspot', 'HubSpot Sales Hub', 'HubSpot', [k2('hubspot-starter', 'HubSpot Sales Hub Starter')], 'SAAS', 'HIGH'),
  {
    key: 'attendance',
    name: 'Hệ thống Chấm công',
    kind: 'INTERNAL',
    dataSensitivity: 'MEDIUM',
    functionalGroup: groupOf('attendance'),
    plans: [{ key: 'attendance-access', name: 'Truy cập Chấm công', provisioningType: 'K5', dataLossOnRemoval: false }],
  },
  app('skype', 'Skype for Business', 'Microsoft', [k2('skype-online', 'Skype Online Plan 2')], 'SAAS', 'LOW'),
];

/** An annual subscription: 12 months of commitment, a seat paid once a year, renewing `renewalInDays` from today. */
const annual = (
  key: string,
  amount: string,
  responsible: string,
  freeAfterBaseline: number,
  extra: Partial<DemoSubscription> = {},
): DemoSubscription => ({
  key,
  plan: key,
  kind: 'TERM',
  unitPrice: { amount, currency: 'VND' },
  billingCycle: 'ANNUAL',
  termMonths: 12,
  noticePeriodDays: 30,
  responsible,
  freeAfterBaseline,
  ...extra,
});

/** One subscription of a monthly plan, named by the key of its plan, with its payment day counted from the day of the seed. */
const byMonth = (
  key: string,
  amount: string,
  responsible: string,
  free: number,
  renewalInDays: number,
): DemoSubscription => ({
  ...monthly(key, key, amount, responsible, free),
  renewalInDays,
});

/** Licenses bought once, on a day in the past, by the IT Admin who answers for them: a lot named by the key of its plan; its keys come from the key store. */
const lot = (key: string, amount: string, licenseCount: number, purpose: DemoLot['purpose'] = 'STOCK'): DemoLot => ({
  key,
  plan: key,
  licenseCount,
  unitPrice: { amount, currency: 'VND' },
  purpose,
  purchasedDaysAgo: 200,
  responsible: 'NV-ITA1',
});

/*
 * K2 subscriptions for the second set of apps (plus K4 lots below). K1 plans carry no subscription (only referencePrice & referenceCommitmentMonths on the plan).
 * Zoom Business carries tier minimum 50 seats (150.000/month, annual). Claude Team is one subscription with two lines (Standard 10, Premium 2, minimumSeatsTotal 2, withoutDates).
 */
export const EXTRA_SUBSCRIPTIONS: DemoSubscription[] = [
  byMonth('m365-basic', '150000', 'NV-ITA1', 5, 20),
  annual('m365-standard', '3800000', 'NV-ITA1', 2, { renewalInDays: 120 }),
  byMonth('zoom-pro', '360000', 'NV-ITA1', 3, 3),
  annual('zoom-business', '1800000', 'NV-ITA1', 49, { renewalInDays: -3, minimumSeats: 50 }),
  byMonth('notion-business', '500000', 'NV-ITA2', 4, 10),
  annual('notion-plus', '2900000', 'NV-ITA2', 2, { renewalInDays: 45 }),
  byMonth('confluence-standard', '160000', 'NV-ITA1', 4, 5),
  annual('confluence-premium', '3700000', 'NV-ITA1', 2, { renewalInDays: 70, noticeDeadlineInDays: 25 }),
  annual('adobe-cc-teams', '22000000', 'NV-ITA2', 3, { renewalInDays: 35 }),
  byMonth('adobe-photoshop', '560000', 'NV-ITA2', 2, 25),
  {
    key: 'claude-team',
    kind: 'TERM',
    billingCycle: 'ANNUAL',
    termMonths: 12,
    withoutDates: true,
    autoRenew: false,
    minimumSeatsTotal: 2,
    responsible: 'NV-ITA1',
    freeAfterBaseline: 0,
    lines: [
      {
        plan: 'claude-team-standard',
        monthlyUnitPrice: { amount: '500000', currency: 'VND' },
        freeAfterBaseline: 8,
      },
      {
        plan: 'claude-team-premium',
        monthlyUnitPrice: { amount: '2500000', currency: 'VND' },
        quantity: 2,
      },
    ],
  },
  byMonth('hubspot-starter', '450000', 'NV-ITA1', 2, 1),
];

/**
 * The lots of licenses of the K4 plans of this file, made through `POST /license-lots`. Windows 11 Pro OEM has none: its key comes with the
 * machine (`DEVICE_BUNDLED`).
 */
export const EXTRA_LOTS: DemoLot[] = [
  lot('visio-pro', '13000000', 3),
  lot('sublime-license', '2500000', 2),
  // 25 licenses bought once and kept in stock, run on machines through one key of 30 activations (W2-25).
  lot('office-home-business-2024', '3500000', 25, 'STOCK'),
];

/*
 * The terms IT recorded for four plans (the text is simulated; the links are the vendors' home pages). Notion Plus was reviewed 400 days ago, long
 * before the window of review of its subscription opened, and Confluence Premium has no terms at all: those two are the warnings of
 * `GET /plan-warnings`. Microsoft 365 Standard was reviewed 10 days ago, before its window opens, so it raises none.
 */
export const PLAN_TERMS: DemoPlanTerms[] = [
  {
    plan: 'notion-plus',
    termsUrl: 'https://www.notion.com',
    lastReviewedDaysAgo: 400,
    aiTraining: 'Dữ liệu khách hàng không dùng để huấn luyện mô hình (văn bản mô phỏng).',
  },
  {
    plan: 'm365-standard',
    termsUrl: 'https://www.microsoft.com',
    lastReviewedDaysAgo: 10,
    aiTraining: 'Không dùng dữ liệu tenant để huấn luyện mô hình nền tảng (văn bản mô phỏng).',
    dataLocation: 'Dữ liệu lưu tại trung tâm dữ liệu khu vực châu Á - Thái Bình Dương (văn bản mô phỏng).',
  },
  {
    plan: 'visio-pro',
    termsUrl: 'https://www.microsoft.com',
    lastReviewedDaysAgo: 30,
    installLimit: {
      maxDevicesPerKey: 2,
      note: 'Mỗi khóa cài tối đa trên hai máy của cùng một người dùng (văn bản mô phỏng).',
    },
  },
  ...['claude-team-standard', 'claude-team-premium'].map((plan) => ({
    plan,
    termsUrl: 'https://www.anthropic.com',
    lastReviewedDaysAgo: 20,
    aiTraining: 'Không dùng dữ liệu khách hàng để huấn luyện (văn bản mô phỏng).',
  })),
];

const seatsOf = (subscription: string, holders: string[], extra: Partial<DemoSeat> = {}): DemoSeat[] =>
  holders.map((holder) => ({ subscription, holder, ...extra }));

/*
 * The seats the baseline files put in the new subscriptions (SPEC S08). Only the people of T1 and the heads of Finance, the Board, IT and Sales
 * hold them (the invariants of 4.2): nobody of Marketing, whose budget R10 depends on, and nobody of Design, whose traps the MF-5 flows count. The
 * seats of the people of T1 were granted 60 to 300 days ago, so the spending of a department grows month by month (Q-C, S24); the heads' seats keep
 * the 130 days of every other seat of the old dataset. The ones the usage files of T17 make ghosts (BOD3 in Notion, BOD5, BOD6 in Adobe, SAL4 in
 * HubSpot) are old enough to be judged. Two seats ended already and are still held: the queue of rights that ended shows them.
 */
export const EXTRA_SEATS: DemoSeat[] = [
  ...seatsOf('m365-basic', ['NV-DEP', 'NV-ITOH']),
  ...seatsOf('m365-basic', ['NV-FINH'], { grantedDaysAgo: 0 }),
  ...seatsOf('m365-basic', ['NV-DEV5', 'NV-ITO1', 'NV-BOD1'], { grantedDaysAgo: 300 }),
  ...seatsOf('m365-basic', ['NV-DEV6', 'NV-ITO2', 'NV-BOD2'], { grantedDaysAgo: 240 }),
  ...seatsOf('m365-basic', ['NV-BOD3'], { grantedDaysAgo: 180 }),
  ...seatsOf('m365-basic', ['NV-FIN2'], { grantedDaysAgo: 0 }),
  ...seatsOf('m365-basic', ['NV-OPS2'], { grantedDaysAgo: 120 }),
  ...seatsOf('m365-basic', ['NV-DEV7'], { grantedDaysAgo: 60 }),
  ...seatsOf('m365-standard', ['NV-DEP']),
  ...seatsOf('m365-standard', ['NV-FINH'], { grantedDaysAgo: 0 }),
  ...seatsOf('zoom-pro', ['NV-SAL3'], { grantedDaysAgo: 180 }),
  ...seatsOf('zoom-pro', ['NV-BOD4'], { grantedDaysAgo: 120 }),
  ...seatsOf('zoom-pro', ['NV-BOD1'], { grantedDaysAgo: 60 }),
  ...seatsOf('zoom-pro', ['NV-SAL4'], { grantedDaysAgo: 180, endInDays: -5 }),
  ...seatsOf('zoom-business', ['NV-DEP']),
  ...seatsOf('notion-business', ['NV-DEV5', 'NV-BOD3'], { grantedDaysAgo: 240 }),
  ...seatsOf('notion-business', ['NV-DEV6'], { grantedDaysAgo: 180 }),
  ...seatsOf('notion-business', ['NV-BOD1'], { grantedDaysAgo: 120 }),
  ...seatsOf('notion-plus', ['NV-ITOH']),
  ...seatsOf('notion-plus', ['NV-ITO1'], { grantedDaysAgo: 120 }),
  ...seatsOf('confluence-standard', ['NV-DEV5'], { grantedDaysAgo: 180 }),
  ...seatsOf('confluence-standard', ['NV-ITO1'], { grantedDaysAgo: 120 }),
  ...seatsOf('confluence-standard', ['NV-ITO2'], { grantedDaysAgo: 240, endInDays: -10 }),
  ...seatsOf('confluence-premium', ['NV-ITOH']),
  ...seatsOf('adobe-cc-teams', ['NV-DEP']),
  ...seatsOf('adobe-cc-teams', ['NV-BOD5'], { grantedDaysAgo: 300 }),
  ...seatsOf('adobe-cc-teams', ['NV-BOD4', 'NV-BOD6'], { grantedDaysAgo: 240 }),
  ...seatsOf('adobe-photoshop', ['NV-BOD2'], { grantedDaysAgo: 120 }),
  // Baseline seats on line 1 (Claude Team Standard) of the merged Claude Team subscription; NV-DEV5 holds Premium via R63.
  ...seatsOf('claude-team', ['NV-DEV6', 'NV-ITO1'], { grantedDaysAgo: 120 }),
  ...seatsOf('hubspot-starter', ['NV-SALH']),
  ...seatsOf('hubspot-starter', ['NV-SAL3', 'NV-SAL4'], { grantedDaysAgo: 120 }),
];
