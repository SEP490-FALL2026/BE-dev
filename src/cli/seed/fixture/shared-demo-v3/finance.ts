import type { DemoFixture } from '../demo-fixture.types';

export const FINANCE: Pick<DemoFixture, 'taxProfile' | 'budgets'> = {
  taxProfile: {
    application: 'figma',
    group: 'T2',
    lines: [{ taxType: 'VAT', ratePercent: '10', deductible: true }],
  },
  budgets: [
    {
      department: 'ENG',
      lines: [
        { description: 'Jira Standard cho cả phòng', plan: 'jira-standard', seats: 20, amount: '48000000' },
        { description: 'Figma Professional cho nhóm UI', plan: 'figma-professional', seats: 5, amount: '22500000' },
        { description: 'ChatGPT Plus cho nhóm R&D', plan: 'chatgpt-plus', seats: 5, amount: '30000000' },
      ],
      base: '120000000',
    },
    {
      department: 'MKT',
      lines: [
        { description: 'ChatGPT Plus cho nhóm nội dung', plan: 'chatgpt-plus', seats: 5, amount: '30000000' },
        {
          description: 'Figma Professional cho nhóm quảng cáo',
          plan: 'figma-professional',
          seats: 3,
          amount: '13500000',
        },
      ],
      base: '60000000',
    },
    {
      department: 'SAL',
      lines: [
        { description: 'Jira Standard cho nhóm bán hàng', plan: 'jira-standard', seats: 10, amount: '24000000' },
        {
          description: 'ChatGPT Plus cho nhóm chăm sóc khách hàng',
          plan: 'chatgpt-plus',
          seats: 5,
          amount: '30000000',
        },
      ],
      base: '70000000',
    },
  ],
};
