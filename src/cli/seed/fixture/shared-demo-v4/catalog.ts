import type { DemoApplication, DemoFixture, DemoPlan, DemoSeat, DemoSubscription } from '../demo-fixture.types';

const k2 = (key: string, name: string, extra: Partial<DemoPlan> = {}): DemoPlan => ({
  key,
  name,
  provisioningType: 'K2',
  pricingModel: 'PER_SEAT',
  controlLevel: 'FULL',
  dataLossOnRemoval: false,
  sharingPolicy: 'NOT_ALLOWED',
  ...extra,
});

const k4 = (key: string, name: string): DemoPlan => ({
  key,
  name,
  provisioningType: 'K4',
  pricingModel: 'PER_SEAT',
  controlLevel: 'FULL',
  dataLossOnRemoval: false,
  sharingPolicy: 'NOT_ALLOWED',
});

const app = (
  key: string,
  name: string,
  vendorName: string,
  plans: DemoPlan[],
  kind: DemoApplication['kind'] = 'SAAS',
  dataSensitivity: DemoApplication['dataSensitivity'] = 'MEDIUM',
): DemoApplication => ({ key, name, kind, vendorName, dataSensitivity, plans });

/*
 * Twelve applications. Each (application, plan) has exactly one subscription, the stock of the shared pool (`QĐ-103d`): K2 plans have
 * seats Free to grant (Postman, Slack, GitHub, Mailchimp, Canva, Jira, Figma) and one plan is sold out (1Password); K1 plans are bought
 * on each grant; K4 plans draw from a key store (JetBrains has keys, DataGrip has none); K5 is internal software.
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
  app('mailchimp', 'Mailchimp', 'Intuit Mailchimp', [k2('mailchimp-standard', 'Mailchimp Standard')], 'SAAS', 'LOW'),
  app('canva', 'Canva', 'Canva', [k2('canva-teams', 'Canva Teams')], 'SAAS', 'LOW'),
  app(
    'chatgpt',
    'ChatGPT',
    'OpenAI',
    [
      {
        key: 'chatgpt-plus',
        name: 'ChatGPT Plus',
        provisioningType: 'K1',
        pricingModel: 'PER_SEAT',
        controlLevel: 'PARTIAL',
        dataLossOnRemoval: false,
        sharingPolicy: 'NOT_ALLOWED',
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
        pricingModel: 'PER_SEAT',
        controlLevel: 'PARTIAL',
        dataLossOnRemoval: false,
        sharingPolicy: 'NOT_ALLOWED',
      },
    ],
    'SAAS',
    'HIGH',
  ),
  app(
    'jetbrains',
    'JetBrains',
    'JetBrains',
    [k4('jetbrains-all', 'JetBrains All Products'), k4('jetbrains-datagrip', 'JetBrains DataGrip')],
    'LICENSED',
  ),
  {
    key: 'hr-portal',
    name: 'Cổng Nhân sự Nội bộ',
    kind: 'INTERNAL',
    dataSensitivity: 'HIGH',
    plans: [
      { key: 'hr-portal-access', name: 'Truy cập Cổng Nhân sự', provisioningType: 'K5', dataLossOnRemoval: false },
    ],
  },
];

const monthly = (
  key: string,
  plan: string,
  amount: string,
  responsible: string,
  freeAfterBaseline: number,
  currency = 'VND',
): DemoSubscription => ({
  key,
  plan,
  kind: 'TERM',
  unitPrice: { amount, currency },
  billingCycle: 'MONTHLY',
  termMonths: 1,
  noticePeriodDays: 30,
  responsible,
  freeAfterBaseline,
});

const SUBSCRIPTIONS: DemoSubscription[] = [
  monthly('jira', 'jira-standard', '200000', 'NV-ITA1', 4),
  // The annual one: 12 months of commitment, renewing in 50 days; a seat costs 4.500.000 a year, 375.000 a month.
  {
    key: 'figma',
    plan: 'figma-professional',
    kind: 'TERM',
    unitPrice: { amount: '4500000', currency: 'VND' },
    billingCycle: 'ANNUAL',
    termMonths: 12,
    renewalInDays: 50,
    noticePeriodDays: 30,
    responsible: 'NV-ITA2',
    freeAfterBaseline: 4,
  },
  monthly('slack', 'slack-pro', '180000', 'NV-ITA1', 6),
  monthly('github', 'github-team', '100000', 'NV-ITA1', 5),
  monthly('onepassword', 'onepassword-business', '200000', 'NV-ITA1', 0),
  monthly('postman', 'postman-professional', '300000', 'NV-ITA1', 5),
  monthly('mailchimp', 'mailchimp-standard', '400000', 'NV-ITA2', 4),
  monthly('canva', 'canva-teams', '250000', 'NV-ITA2', 4),
  // K1: bought one by one when a seat is granted, so it starts with none.
  { ...monthly('chatgpt', 'chatgpt-plus', '500000', 'NV-ITA1', 0), quantity: 0, ownerDepartment: 'ENG' },
  // The one plan priced in a foreign currency: Finance records the rate of the day.
  { ...monthly('cursor', 'cursor-pro', '20', 'NV-ITA1', 0, 'USD'), quantity: 0, ownerDepartment: 'ENG' },
  // K4: a key is bought once; the keys sit in the key store. JetBrains has three, DataGrip none.
  {
    key: 'jetbrains',
    plan: 'jetbrains-all',
    kind: 'PERPETUAL',
    unitPrice: { amount: '6000000', currency: 'VND' },
    billingCycle: 'MONTHLY',
    termMonths: 1,
    responsible: 'NV-ITA1',
    freeAfterBaseline: 0,
    quantity: 3,
  },
  {
    key: 'datagrip',
    plan: 'jetbrains-datagrip',
    kind: 'PERPETUAL',
    unitPrice: { amount: '3000000', currency: 'VND' },
    billingCycle: 'MONTHLY',
    termMonths: 1,
    responsible: 'NV-ITA1',
    freeAfterBaseline: 0,
    quantity: 0,
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
  // The traps of the optimization rules: a new seat, one outside the coverage, rights that end, a service account.
  ...seat('figma', ['NV-DES6'], { grantedDaysAgo: 5 }),
  ...seat('figma', ['NV-DES9'], { grantedDaysAgo: 30 }),
  ...seat('figma', ['NV-DES10'], { endInDays: 20 }),
  ...seat('figma', ['NV-DES12'], { endInDays: 35 }),
  {
    subscription: 'figma',
    holder: {
      serviceAccount: 'design-bot@saoviet.example',
      responsible: 'NV-DESH',
      reason: 'Tài khoản dịch vụ xuất ảnh tự động của phòng Thiết kế',
    },
  },
  ...seat('slack', ['NV-ENGH', 'NV-FINH']),
  // Legal has no head, so its budget is built from the baseline: the seats its people hold are what that baseline is made of.
  ...seat('github', ['NV-ENGH', 'NV-DEV1', 'NV-OFF1', 'NV-LGL1']),
  ...seat('onepassword', ['NV-ENGH', 'NV-DEV1', 'NV-DEV4']),
  ...seat('postman', ['NV-ENGH', 'NV-LGL1']),
  ...seat('mailchimp', ['NV-DEV4']),
  ...seat('canva', ['NV-DESH', 'NV-DES5']),
];

export const CATALOG: Pick<DemoFixture, 'applications' | 'subscriptions' | 'seats' | 'exchangeRates'> = {
  applications: APPLICATIONS,
  subscriptions: SUBSCRIPTIONS,
  seats: SEATS,
  exchangeRates: [{ currency: 'USD', rate: '25400' }],
};
