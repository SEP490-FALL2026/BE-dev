import type { DemoBudgetLine, DemoFixture } from '../demo-fixture.types';

const line = (
  software: string,
  plan: string,
  seats: number,
  monthlyPrice: number,
  months: number,
  reason: string,
): DemoBudgetLine => ({ software, plan, seats, monthlyPrice, months, reason });

export const FINANCE: Pick<
  DemoFixture,
  'taxProfiles' | 'cycle' | 'nextCycle' | 'draftCycle' | 'budgets' | 'nextYear' | 'budgetLines'
> = {
  /*
   * Six vendors with a declared profile, the lines simulated after the one of Figma: the foreign vendors that sell through a platform and whose
   * tax the buyer remits (T2: Figma, Microsoft, Adobe, Notion Labs, Atlassian), and Zoom, sold here through a domestic distributor that collects
   * the VAT on the invoice (T3). A profile is never advice: the screen of the tax estimate shows both ways to pay.
   */
  taxProfiles: [
    { application: 'figma', group: 'T2', lines: [{ taxType: 'VAT', ratePercent: '10', deductible: true }] },
    { application: 'm365', group: 'T2', lines: [{ taxType: 'VAT', ratePercent: '10', deductible: true }] },
    { application: 'adobe', group: 'T2', lines: [{ taxType: 'VAT', ratePercent: '10', deductible: true }] },
    { application: 'notion', group: 'T2', lines: [{ taxType: 'VAT', ratePercent: '10', deductible: true }] },
    { application: 'jira', group: 'T2', lines: [{ taxType: 'VAT', ratePercent: '10', deductible: true }] },
    { application: 'zoom', group: 'T3', lines: [{ taxType: 'VAT', ratePercent: '10', deductible: true }] },
  ],
  /*
   * The cycle of the year: a ceiling far above the budgets of the dataset. Its submission deadline is the day the seed runs, so the heads
   * send `BM-10` that day and the cycle stands locked from the next (the demo day, "seed ≤ 1 day before"): an adjustment is asked only of a
   * locked cycle (FIX-AD1-Q2).
   */
  cycle: {
    annualCeiling: '20000000000',
    sharedPoolReserve: '1000000000',
    submissionOffsetDays: 0,
    decisionOffsetDays: 10,
    open: true,
  },
  // The cycle of the next year is open for a month more: the demo walks MF-4 from here (DEMO-15).
  nextCycle: {
    annualCeiling: '500000000',
    sharedPoolReserve: '50000000',
    submissionOffsetDays: 30,
    decisionOffsetDays: 45,
    open: true,
  },
  // The cycle of the year after is a draft Finance has not opened yet (no head is told, nothing can be sent).
  draftCycle: {
    annualCeiling: '600000000',
    sharedPoolReserve: '60000000',
    submissionOffsetDays: 365,
    decisionOffsetDays: 380,
    open: false,
  },
  /*
   * The approved budget of the year of every department with a Cost Center and a head (`BM-10` → Finance's version → the spending
   * approver). Three are tight on purpose, so the budget check of a request shows its three outcomes: Marketing (240.000) makes a 250.000
   * request use the reserve (24.000) and the head confirm it, Design (280.000) makes a 300.000 request use the reserve and wait for the
   * head's confirmation, Sales (290.000) makes a 400.000 request go over the reserve (29.000) and be blocked. Legal has no head and so no
   * `BM-10`: its version from the baseline can only be made after the deadline (D-Z2-2), so it has no budget of the year.
   */
  budgets: [
    { department: 'ENG', base: '600000000', note: 'Jira, GitHub cho cả phòng; ChatGPT Plus cho nhóm R&D.' },
    { department: 'MKT', base: '240000', note: 'Canva Teams cho nhóm nội dung.' },
    { department: 'SAL', base: '290000', note: 'Mailchimp Standard cho chiến dịch.' },
    { department: 'DES', base: '280000', note: 'Postman Professional cho nhóm kiểm thử giao diện.' },
    { department: 'BOD', base: '50000000' },
    { department: 'FIN', base: '50000000' },
    { department: 'ITO', base: '50000000' },
  ],
  /*
   * Where the next year is left (DEMO-15): Engineering's budget is approved (a Request that runs into the next year shows the spending
   * approver the soft warning of S4); Information Technology's `BM-10` waits for Finance; Marketing's version waits for the spending
   * approver; Sales' version was returned to Finance with a reason. Design, Finance, the Board and Legal sent nothing (`noProposalSubmitted`).
   */
  nextYear: [
    {
      department: 'ENG',
      stage: 'APPROVED',
      requestedAmount: '112000000',
      base: '112000000',
      note: 'Gia hạn Jira, GitHub; thêm Cursor Pro cho nhóm R&D.',
    },
    {
      department: 'ITO',
      stage: 'PROPOSAL_SUBMITTED',
      requestedAmount: '20000000',
      base: '20000000',
      note: 'Gia hạn Jira Standard cho phòng IT.',
    },
    { department: 'MKT', stage: 'VERSION_SENT', requestedAmount: '50000000', base: '50000000' },
    {
      department: 'SAL',
      stage: 'VERSION_RETURNED',
      requestedAmount: '50000000',
      base: '50000000',
      reason: 'Cơ sở đề xuất chưa khớp số seat đang dùng; Finance rà soát lại rồi gửi lại.',
    },
  ],
  /*
   * What each head writes in the file of `BM-10` (the system keeps the file and reads none of it): the software the department already
   * pays for, at the prices of the catalog. A line never adds up to more than the amount the head asks; the rest is one balancing line. The
   * three tight departments ask so little that a month of one seat is all the file lists.
   */
  budgetLines: {
    ENG: [
      line('Jira', 'Standard', 20, 200000, 12, 'Theo dõi công việc nhóm kỹ thuật'),
      line('GitHub', 'Team', 9, 100000, 12, 'Quản lý mã nguồn cho cả phòng'),
      line('Slack', 'Pro', 8, 180000, 12, 'Trao đổi hằng ngày của nhóm'),
      line('ChatGPT', 'Plus', 5, 500000, 12, 'Nhóm R&D thử nghiệm trợ lý AI'),
    ],
    ITO: [
      line('Jira', 'Standard', 6, 200000, 12, 'Theo dõi yêu cầu cấp quyền'),
      line('1Password', 'Business', 1, 200000, 12, 'Kho mật khẩu dùng chung của phòng'),
    ],
    MKT: [line('Canva', 'Teams', 1, 240000, 1, 'Một ghế một tháng cho nhóm nội dung')],
    SAL: [line('Mailchimp', 'Standard', 1, 290000, 1, 'Một ghế một tháng cho chiến dịch')],
    DES: [line('Postman', 'Professional', 1, 280000, 1, 'Một ghế một tháng cho nhóm kiểm thử giao diện')],
    BOD: [line('Slack', 'Pro', 5, 180000, 12, 'Trao đổi của Ban Giám đốc')],
    FIN: [line('Jira', 'Standard', 4, 200000, 12, 'Theo dõi công việc đối soát')],
  },
};
