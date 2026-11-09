import type { DemoFixture, DemoSubscription } from '../demo-fixture.types';

export const CATALOG: Pick<DemoFixture, 'applications' | 'subscriptions'> = {
  applications: [
    {
      key: 'jira',
      name: 'Jira Software',
      kind: 'SAAS',
      vendorName: 'Atlassian',
      businessOwner: 'NV-ENGH',
      dataSensitivity: 'MEDIUM',
      plans: [
        {
          key: 'jira-standard',
          name: 'Jira Standard',
          provisioningType: 'K2',
          pricingModel: 'PER_SEAT',
          controlLevel: 'FULL',
          dataLossOnRemoval: false,
          sharingPolicy: 'NOT_ALLOWED',
        },
      ],
    },
    {
      key: 'figma',
      name: 'Figma',
      kind: 'SAAS',
      vendorName: 'Figma',
      businessOwner: 'NV-DESH',
      dataSensitivity: 'MEDIUM',
      plans: [
        {
          key: 'figma-professional',
          name: 'Figma Professional',
          provisioningType: 'K2',
          pricingModel: 'PER_SEAT',
          controlLevel: 'FULL',
          dataLossOnRemoval: true,
          revocationNote: 'Chuyển quyền sở hữu các tệp thiết kế cá nhân sang thư mục của phòng trước khi gỡ.',
          sharingPolicy: 'NOT_ALLOWED',
        },
      ],
    },
    {
      key: 'chatgpt',
      name: 'ChatGPT',
      kind: 'SAAS',
      vendorName: 'OpenAI',
      businessOwner: 'NV-ENGH',
      dataSensitivity: 'HIGH',
      plans: [
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
    },
    {
      key: 'hr-portal',
      name: 'Cổng Nhân sự Nội bộ',
      kind: 'INTERNAL',
      businessOwner: 'NV-FINH',
      dataSensitivity: 'HIGH',
      plans: [
        { key: 'hr-portal-access', name: 'Truy cập Cổng Nhân sự', provisioningType: 'K5', dataLossOnRemoval: false },
      ],
    },
  ],
  subscriptions: [
    {
      key: 'jira-eng',
      plan: 'jira-standard',
      ownerDepartment: 'ENG',
      quantity: 20,
      unitPrice: '200000',
      billingCycle: 'MONTHLY',
      noticePeriodDays: 30,
    },
    {
      key: 'figma-eng',
      plan: 'figma-professional',
      ownerDepartment: 'ENG',
      quantity: 5,
      unitPrice: '375000',
      billingCycle: 'MONTHLY',
      noticePeriodDays: 30,
    },
    {
      key: 'figma-des',
      plan: 'figma-professional',
      ownerDepartment: 'DES',
      quantity: 10,
      unitPrice: '375000',
      billingCycle: 'MONTHLY',
      noticePeriodDays: 30,
    },
    {
      key: 'chatgpt-eng',
      plan: 'chatgpt-plus',
      ownerDepartment: 'ENG',
      quantity: 5,
      unitPrice: '500000',
      billingCycle: 'MONTHLY',
      noticePeriodDays: 0,
    },
    monthly('chatgpt-mkt', 'chatgpt-plus', 'MKT', { quantity: 5, unitPrice: '500000', noticePeriodDays: 0 }),
    monthly('figma-mkt', 'figma-professional', 'MKT', { quantity: 3, unitPrice: '375000', noticePeriodDays: 30 }),
    monthly('jira-sal', 'jira-standard', 'SAL', { quantity: 10, unitPrice: '200000', noticePeriodDays: 30 }),
    monthly('chatgpt-sal', 'chatgpt-plus', 'SAL', { quantity: 5, unitPrice: '500000', noticePeriodDays: 0 }),
  ],
};

function monthly(
  key: string,
  plan: string,
  ownerDepartment: string,
  terms: { quantity: number; unitPrice: string; noticePeriodDays: number },
): DemoSubscription {
  return { key, plan, ownerDepartment, billingCycle: 'MONTHLY', ...terms };
}
