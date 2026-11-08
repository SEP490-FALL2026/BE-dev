import type { DemoFixture } from '../demo-fixture.types';

export const FINANCE: Pick<DemoFixture, 'taxProfile' | 'cycle' | 'budgets' | 'proposals' | 'invoices'> = {
  taxProfile: {
    application: 'figma',
    group: 'T2',
    lines: [{ taxType: 'VAT', ratePercent: '10', deductible: true }],
  },
  // A ceiling far above the budgets of the dataset, divided evenly so that the check of the whole division passes (QT 4.3).
  cycle: {
    annualCeiling: '20000000000',
    sharedPoolReserve: '1000000000',
    departmentCeiling: '1000000000',
    submissionDaysBefore: 60,
    decisionDaysBefore: 30,
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
  // Information Technology has no budget of next year yet: its head has sent the proposal and Finance has not answered.
  proposals: [
    {
      department: 'ITO',
      yearOffset: 1,
      lines: [
        {
          description: 'Jira Standard cho phòng Công nghệ thông tin',
          plan: 'jira-standard',
          seats: 5,
          amount: '12000000',
        },
        { description: 'ChatGPT Plus cho nhóm hạ tầng', plan: 'chatgpt-plus', seats: 3, amount: '18000000' },
      ],
    },
  ],
  // One invoice on each of three commitments, each ending in another match: part of the price (matches), part of the price with
  // both kinds of tax (only the tax differs), and more than the commitment allowed (flagged).
  invoices: [
    {
      key: 'HD1',
      request: 'R1',
      netPercent: 50,
      deductibleTaxPercent: 0,
      nonDeductibleTaxPercent: 0,
      issuedDaysAgo: 3,
      note: 'Hóa đơn tháng đầu, thanh toán một nửa.',
    },
    {
      key: 'HD2',
      request: 'R10',
      netPercent: 40,
      deductibleTaxPercent: 10,
      nonDeductibleTaxPercent: 5,
      issuedDaysAgo: 2,
      note: 'Hóa đơn có thuế GTGT được khấu trừ và thuế nhà thầu không khấu trừ.',
    },
    {
      key: 'HD3',
      request: 'R11',
      netPercent: 110,
      deductibleTaxPercent: 0,
      nonDeductibleTaxPercent: 0,
      issuedDaysAgo: 1,
      note: 'Hóa đơn cao hơn cam kết do phát sinh thêm người dùng.',
    },
  ],
};
