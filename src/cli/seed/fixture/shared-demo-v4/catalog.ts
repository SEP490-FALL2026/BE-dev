import type {
  DemoApplication,
  DemoFixture,
  DemoLot,
  DemoPlan,
  DemoSeat,
  DemoSubscription,
} from '../demo-fixture.types';
import { EXTRA_APPLICATIONS, EXTRA_LOTS, EXTRA_SEATS, EXTRA_SUBSCRIPTIONS, PLAN_TERMS } from './catalog-extra';
import { app, groupOf, k2, k4, monthly } from './catalog-kit';

/*
 * The thirteen applications of the first dataset (twelve more are in `catalog-extra.ts`). Each (application, plan) has exactly one subscription, the stock of the shared pool (`QĐ-103d`): K2 plans have
 * seats Free to grant (Postman, Slack, GitHub, Mailchimp, Canva, Jira, Figma) and one plan is sold out (1Password); K1 plans are bought
 * on each grant; K4 plans are lots of licenses that draw from a key store (JetBrains has keys, DataGrip has none); K5 is internal software.
 *
 * A plan administered at the vendor (every K2, and JetBrains All Products, the K4 plan with an admin console) has a workspace profile of two
 * IT Admins (`QĐ-110k`, R-53): DataGrip, a K4 plan without one, is the control case that needs none. Mailchimp is owned by NV-ITA4, who
 * leaves, with NV-ITA3 as the other admin; Canva names no company account at the vendor, so its subscription carries the flag
 * `ownerAccountEmailMissing` (`QĐ-110u`).
 */
const APPLICATIONS: DemoApplication[] = [
  app('jira', 'Jira Software', 'Atlassian', [k2('jira-standard', 'Jira Standard')]),
  app('figma', 'Figma', 'Figma', [
    k2('figma-professional', 'Figma Professional', {
      dataLossOnRemoval: true,
      revocationNote: 'Chuyển quyền sở hữu các tệp thiết kế cá nhân sang thư mục của phòng trước khi gỡ.',
    }),
  ]),
  app('slack', 'Slack', 'Slack Technologies', [k2('slack-pro', 'Slack Pro')]),
  app('github', 'GitHub', 'GitHub', [k2('github-team', 'GitHub Team')], 'SAAS', 'HIGH'),
  app('onepassword', '1Password', 'AgileBits', [k2('onepassword-business', '1Password Business')], 'SAAS', 'HIGH'),
  app('postman', 'Postman', 'Postman', [k2('postman-professional', 'Postman Professional')]),
  app(
    'mailchimp',
    'Mailchimp',
    'Intuit Mailchimp',
    [k2('mailchimp-standard', 'Mailchimp Standard', { vendorAdmin: 'NV-ITA3' })],
    'SAAS',
    'LOW',
  ),
  app('canva', 'Canva', 'Canva', [k2('canva-teams', 'Canva Teams', { withoutOwnerAccountEmail: true })], 'SAAS', 'LOW'),
  app(
    'chatgpt',
    'ChatGPT',
    'OpenAI',
    [
      {
        key: 'chatgpt-plus',
        name: 'ChatGPT Plus',
        provisioningType: 'K1',
        controlLevel: 'PARTIAL',
        dataLossOnRemoval: false,
        sharingPolicy: 'NOT_ALLOWED',
        referencePrice: '500000',
        referenceCommitmentMonths: 1,
      },
    ],
    'SAAS',
    'HIGH',
  ),
  app(
    'cursor',
    'Cursor',
    'Anysphere',
    [
      {
        key: 'cursor-pro',
        name: 'Cursor Pro',
        provisioningType: 'K1',
        controlLevel: 'PARTIAL',
        dataLossOnRemoval: false,
        sharingPolicy: 'NOT_ALLOWED',
        referencePrice: '508000',
        referenceCommitmentMonths: 1,
      },
    ],
    'SAAS',
    'HIGH',
  ),
  app(
    'grammarly',
    'Grammarly',
    'Grammarly',
    [
      {
        key: 'grammarly-pro',
        name: 'Grammarly Pro',
        provisioningType: 'K1',
        controlLevel: 'PARTIAL',
        dataLossOnRemoval: false,
        sharingPolicy: 'NOT_ALLOWED',
        referencePrice: '300000',
        referenceCommitmentMonths: 1,
      },
      // A K1 plan with no subscription at all, only a reference price: a request for it is priced from the plan (`QĐ-113a`, R59).
      {
        key: 'grammarly-business',
        name: 'Grammarly Business',
        provisioningType: 'K1',
        controlLevel: 'PARTIAL',
        dataLossOnRemoval: false,
        sharingPolicy: 'NOT_ALLOWED',
        referencePrice: '360000',
      },
    ],
    'SAAS',
    'MEDIUM',
  ),
  app('jetbrains', 'JetBrains', 'JetBrains', [
    k4('jetbrains-all', 'JetBrains All Products', { hasAdminConsole: true, vendorAdmin: 'NV-ITA3' }),
    k4('jetbrains-datagrip', 'JetBrains DataGrip'),
  ]),
  {
    key: 'hr-portal',
    name: 'Cổng Nhân sự Nội bộ',
    kind: 'INTERNAL',
    dataSensitivity: 'HIGH',
    functionalGroup: groupOf('hr-portal'),
    plans: [
      { key: 'hr-portal-access', name: 'Truy cập Cổng Nhân sự', provisioningType: 'K5', dataLossOnRemoval: false },
    ],
  },
];

const SUBSCRIPTIONS: DemoSubscription[] = [
  // QĐ-119e & L-2: Jira monthly, 255.000/user/month, 10 users (6 baseline + 4 free), MEMBERS + invoicedLater.
  {
    ...monthly('jira', 'jira-standard', '255000', 'NV-ITA1', 4),
    renewalInDays: 20,
    seatCounting: 'MEMBERS',
    invoicedLater: true,
  },
  // L-2: Figma monthly, 375.000/member/month, MEMBERS + invoicedLater (vendor bills actual members after the month).
  {
    ...monthly('figma', 'figma-professional', '375000', 'NV-ITA2', 4),
    renewalInDays: 20,
    seatCounting: 'MEMBERS',
    invoicedLater: true,
  },
  { ...monthly('slack', 'slack-pro', '180000', 'NV-ITA1', 6), renewalInDays: 20 },
  { ...monthly('github', 'github-team', '100000', 'NV-ITA1', 5), renewalInDays: 20 },
  { ...monthly('onepassword', 'onepassword-business', '200000', 'NV-ITA1', 0), renewalInDays: 20 },
  { ...monthly('postman', 'postman-professional', '300000', 'NV-ITA1', 5), renewalInDays: 20 },
  // The IT Admin who leaves answers for it: his departure hands it over (P5).
  { ...monthly('mailchimp', 'mailchimp-standard', '400000', 'NV-ITA4', 4), renewalInDays: 20 },
  { ...monthly('canva', 'canva-teams', '250000', 'NV-ITA2', 2), renewalInDays: 20 },
];

/**
 * K4: a key is bought once, as a lot of licenses; the keys sit in the key store. JetBrains All Products was bought twice at two prices (the first lot holds the
 * three keys of the store, the second none yet); DataGrip has one license and no key.
 */
const LOTS: DemoLot[] = [
  {
    key: 'jetbrains',
    plan: 'jetbrains-all',
    licenseCount: 3,
    unitPrice: { amount: '6000000', currency: 'VND' },
    purpose: 'STOCK',
    purchasedDaysAgo: 200,
    responsible: 'NV-ITA1',
  },
  {
    key: 'jetbrains-second',
    plan: 'jetbrains-all',
    licenseCount: 2,
    unitPrice: { amount: '6500000', currency: 'VND' },
    purpose: 'STOCK',
    purchasedDaysAgo: 90,
    responsible: 'NV-ITA1',
  },
  {
    key: 'datagrip',
    plan: 'jetbrains-datagrip',
    licenseCount: 1,
    unitPrice: { amount: '3000000', currency: 'VND' },
    purpose: 'STOCK',
    purchasedDaysAgo: 200,
    responsible: 'NV-ITA1',
  },
];

const seat = (subscription: string, holders: string[], extra: Partial<DemoSeat> = {}): DemoSeat[] =>
  holders.map((holder) => ({ subscription, holder, ...extra }));

/** The seats the baseline files put in the pool: who already holds what, granted well in the past. */
const SEATS: DemoSeat[] = [
  ...seat('jira', ['NV-ENGH', 'NV-DEV1', 'NV-DEV4', 'NV-OFF1', 'NV-DES3', 'NV-LGL1']),
  ...seat('figma', [
    'NV-DES1',
    'NV-DES2',
    'NV-DES3',
    'NV-DESH',
    'NV-DES4',
    'NV-DES5',
    'NV-DES7',
    'NV-DES8',
    'NV-DES11',
    'NV-OFF1',
  ]),
  // The traps of the optimization rules: a new seat, one outside the coverage, rights that end. The baseline import takes personal
  // seats only (`QĐ-110m`), so the service account of the earlier datasets is gone.
  ...seat('figma', ['NV-DES6'], { grantedDaysAgo: 5 }),
  ...seat('figma', ['NV-DES9'], { grantedDaysAgo: 30 }),
  ...seat('figma', ['NV-DES10'], { endInDays: 20 }),
  ...seat('figma', ['NV-DES12'], { endInDays: 35 }),
  ...seat('slack', ['NV-ENGH', 'NV-FINH']),
  // The seat of the bot that posts the alerts of IT in Slack, held by an IT Admin: marked a machine account, never a ghost seat (DEMO-8).
  ...seat('slack', ['NV-ITA3']),
  // A right that ends in 7 days: its holder asked to carry it on, the request waits for the head (DEMO-5, R33).
  ...seat('postman', ['NV-SAL2'], { endInDays: 7 }),
  // Legal has no head, so its budget is built from the baseline: the seats its people hold are what that baseline is made of.
  ...seat('github', ['NV-ENGH', 'NV-DEV1', 'NV-OFF1', 'NV-LGL1']),
  ...seat('onepassword', ['NV-ENGH', 'NV-DEV1', 'NV-DEV4']),
  ...seat('postman', ['NV-ENGH', 'NV-LGL1']),
  ...seat('mailchimp', ['NV-DEV4']),
  ...seat('canva', ['NV-DESH', 'NV-DES5']),
];

/**
 * The reference price of every paid plan (`QĐ-113a`): the price of one seat for a month of the subscription of the plan (a yearly price over 12, rounded
 * up to the dong), or the price of one license of its first lot (K4). A plan the fixture gave a price by hand (K1 or a plan with no subscription) keeps it; K5 has none.
 */
function withReferencePrices(
  applications: readonly DemoApplication[],
  subscriptions: readonly DemoSubscription[],
  lots: readonly DemoLot[],
): DemoApplication[] {
  const priced = (plan: DemoPlan): DemoPlan => {
    if (plan.provisioningType === 'K5' || plan.referencePrice !== undefined) return plan;
    if (plan.provisioningType === 'K4') {
      const first = lots.find((candidate) => candidate.plan === plan.key);

      return first ? { ...plan, referencePrice: first.unitPrice.amount } : plan;
    }
    for (const subscription of subscriptions) {
      const line = subscription.lines?.find((candidate) => candidate.plan === plan.key);
      if (line) return { ...plan, referencePrice: line.monthlyUnitPrice.amount };
      if (subscription.plan === plan.key && subscription.unitPrice) {
        const amount = BigInt(subscription.unitPrice.amount);

        return {
          ...plan,
          referencePrice: String(subscription.billingCycle === 'ANNUAL' ? (amount + 6n) / 12n : amount),
        };
      }
    }

    return plan;
  };

  return applications.map((application) => ({ ...application, plans: application.plans.map(priced) }));
}

export const CATALOG: Pick<DemoFixture, 'applications' | 'subscriptions' | 'lots' | 'seats' | 'planTerms'> = {
  applications: withReferencePrices(
    [...APPLICATIONS, ...EXTRA_APPLICATIONS],
    [...SUBSCRIPTIONS, ...EXTRA_SUBSCRIPTIONS],
    [...LOTS, ...EXTRA_LOTS],
  ),
  subscriptions: [...SUBSCRIPTIONS, ...EXTRA_SUBSCRIPTIONS],
  lots: [...LOTS, ...EXTRA_LOTS],
  seats: [...SEATS, ...EXTRA_SEATS],
  planTerms: PLAN_TERMS,
};
