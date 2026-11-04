import type { DemoBudget, DemoDepartment, DemoPerson, DemoSubscription } from './demo-fixture.types';

/**
 * Two more departments of `shared-demo-v2`, each ready for the whole of F1 on its own (Owner 03/11/2026): a head who holds
 * MANAGER, two staff with accounts, a Cost Center, an IT Admin in charge, subscriptions of its own and an approved budget of
 * the year. They take part in no scenario request (R1–R9 keep their departments): they are there for live demos. Spread
 * into `SHARED_DEMO_V2`, which stays the one source of the dataset.
 */
export const SALES_MARKETING: {
  departments: DemoDepartment[];
  people: DemoPerson[];
  subscriptions: DemoSubscription[];
  budgets: DemoBudget[];
} = {
  departments: [
    {
      code: 'DS1-MKT',
      name: 'Phòng Marketing (demo)',
      function: 'Truyền thông và quảng bá sản phẩm.',
      head: 'DS1-MKTH',
      itAdmin: 'DS1-ITA2',
      costCenter: { code: 'DS1-CC-MKT', name: 'Phòng Marketing (demo)' },
    },
    {
      code: 'DS1-SAL',
      name: 'Phòng Kinh doanh (demo)',
      function: 'Bán hàng và chăm sóc khách hàng.',
      head: 'DS1-SALH',
      itAdmin: 'DS1-ITA1',
      costCenter: { code: 'DS1-CC-SAL', name: 'Phòng Kinh doanh (demo)' },
    },
  ],
  people: [
    staff('DS1-MKTH', 'Đinh Thị Uyên', 'uyen.dinh', 'DS1-MKT'),
    staff('DS1-MKT1', 'Lâm Văn Vinh', 'vinh.lam', 'DS1-MKT'),
    staff('DS1-MKT2', 'Châu Thị Xuân', 'xuan.chau', 'DS1-MKT'),
    staff('DS1-SALH', 'Trương Văn Yên', 'yen.truong', 'DS1-SAL'),
    staff('DS1-SAL1', 'Kiều Thị Ánh', 'anh.kieu', 'DS1-SAL'),
    staff('DS1-SAL2', 'Quách Văn Bảo', 'bao.quach', 'DS1-SAL'),
  ],
  subscriptions: [
    monthly('chatgpt-mkt', 'chatgpt-plus', 'DS1-MKT', { quantity: 5, unitPrice: '500000', noticePeriodDays: 0 }),
    monthly('figma-mkt', 'figma-professional', 'DS1-MKT', { quantity: 3, unitPrice: '375000', noticePeriodDays: 30 }),
    monthly('jira-sal', 'jira-standard', 'DS1-SAL', { quantity: 10, unitPrice: '200000', noticePeriodDays: 30 }),
    monthly('chatgpt-sal', 'chatgpt-plus', 'DS1-SAL', { quantity: 5, unitPrice: '500000', noticePeriodDays: 0 }),
  ],
  budgets: [
    {
      department: 'DS1-MKT',
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
      reserve: '5000000',
      highValuePercent: 50,
    },
    {
      department: 'DS1-SAL',
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
      reserve: '5000000',
      highValuePercent: 50,
    },
  ],
};

/** A member of staff with an EMPLOYEE account; the head of the two departments is made one by the steps (MANAGER, then head). */
function staff(code: string, fullName: string, email: string, department: string): DemoPerson {
  return {
    code,
    fullName,
    email,
    department,
    employmentType: 'STAFF',
    account: code === 'DS1-MKTH' || code === 'DS1-SALH' ? 'MANAGER' : 'EMPLOYEE',
  };
}

function monthly(
  key: string,
  plan: string,
  ownerDepartment: string,
  terms: { quantity: number; unitPrice: string; noticePeriodDays: number },
): DemoSubscription {
  return { key, plan, ownerDepartment, billingCycle: 'MONTHLY', ...terms };
}
