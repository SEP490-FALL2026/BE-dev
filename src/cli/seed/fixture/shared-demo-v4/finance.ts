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
  'taxProfiles' | 'cycle' | 'nextCycle' | 'afterNextCycle' | 'budgets' | 'nextYear' | 'budgetLines'
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
  // The cycle of the next year is opened like the one of the year, so the heads send `BM-10` that day; its versions are sent to a cycle the seed then locks
  // for good (the deadline moves to the day before the seed), so the next year stands as a cycle with versions does: locked, versions sent, one approved, one
  // returned (DEMO-15).
  nextCycle: {
    annualCeiling: '500000000',
    sharedPoolReserve: '50000000',
    submissionOffsetDays: 0,
    decisionOffsetDays: 45,
    open: true,
  },
  // The cycle of the year after is open for a year more: a `BM-10` waits there for Finance, and the demo walks MF-4 from it (DEMO-15).
  afterNextCycle: {
    annualCeiling: '600000000',
    sharedPoolReserve: '60000000',
    submissionOffsetDays: 365,
    decisionOffsetDays: 380,
    open: true,
  },
  /*
   * The approved budget of the year of every department with a Cost Center and a head (`BM-10` → Finance's version → the spending
   * approver). Three are tight on purpose, so the budget check of a request shows its three outcomes: Marketing (240.000) makes a 250.000
   * request use the reserve (24.000) and the head confirm it, Design (280.000) makes a 300.000 request use the reserve and wait for the
   * head's confirmation, Sales (290.000) makes a 400.000 request go over the reserve (29.000) and be blocked. Legal has no head and so no
   * `BM-10`: its version from the baseline can only be made after the deadline (D-Z2-2), so it has no budget of the year.
   */
  budgets: [
    {
      department: 'ENG',
      // What the lines of its BM-10 add up to over a year, and a little more: well over what the department spends, so it stays under.
      base: '185000000',
      light: 'UNDER',
      note: 'Jira, GitHub, Slack cho cả phòng; ChatGPT Plus, Claude Team (Standard và Premium) cho nhóm R&D.',
    },
    { department: 'MKT', base: '240000', note: 'Canva Teams cho nhóm nội dung.' },
    { department: 'SAL', base: '290000', note: 'Mailchimp Standard cho chiến dịch.' },
    { department: 'DES', base: '280000', note: 'Postman Professional cho nhóm kiểm thử giao diện.' },
    { department: 'BOD', base: '50000000', light: 'GREEN' },
    {
      department: 'FIN',
      base: '50000000',
      light: 'YELLOW',
      reserve: {
        percent: 60,
        reason: 'Phòng có các khoản phát sinh theo kỳ đối soát, cần dự phòng cao hơn mức mặc định.',
      },
    },
    {
      department: 'ITO',
      base: '36000000',
      light: 'UNDER',
      note: 'Jira, 1Password, Confluence, Microsoft 365, Zoom của phòng IT.',
    },
  ],
  /*
   * Where the next year is left (DEMO-15): Engineering's budget is approved (a Request that runs into the next year shows the spending
   * approver the soft warning of S4); Marketing's version waits for the spending approver; Sales' version was returned to Finance with a reason. The cycle
   * of that year is locked, as a cycle with versions is. Information Technology's `BM-10` waits for Finance in the cycle of the year after, which is open.
   * Design, Finance, the Board and Legal sent nothing (`noProposalSubmitted`).
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
      afterNext: true,
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
   * What each head writes in the file of `BM-10` (the system keeps the file and reads none of it): the software the department uses, at the
   * prices of the catalog, for a year. A line never adds up to more than the amount the head asks (`fitLines` cuts months, then seats); the rest
   * is one balancing line. The three tight departments ask less than a seat-month of this year (their requests test the budget check), so their
   * file of this year is the balancing line alone; their lines show in the file of next year.
   */
  budgetLines: {
    ENG: [
      line('Jira', 'Standard', 20, 255000, 12, 'Theo dõi công việc nhóm kỹ thuật'),
      line('GitHub', 'Team', 9, 100000, 12, 'Quản lý mã nguồn cho cả phòng'),
      line('Slack', 'Pro', 8, 180000, 12, 'Trao đổi hằng ngày của nhóm'),
      line('ChatGPT', 'Plus', 4, 500000, 12, 'Nhóm R&D thử nghiệm trợ lý AI'),
      line(
        'Claude',
        'Team Standard',
        1,
        500000,
        12,
        'Trợ lý AI cho nhóm R&D (gói năm quy ra tháng, workspace Standard)',
      ),
      line(
        'Claude',
        'Team Premium',
        1,
        2500000,
        12,
        'Trợ lý AI cho trưởng nhóm R&D (gói năm quy ra tháng, workspace Premium)',
      ),
      line('Notion', 'Business', 3, 500000, 12, 'Tài liệu kỹ thuật của nhóm'),
      line('Confluence', 'Standard', 3, 160000, 12, 'Trang tài liệu dự án'),
      line('Microsoft 365', 'Business Basic', 3, 150000, 12, 'Thư và lịch của nhân viên mới'),
    ],
    ITO: [
      line('Jira', 'Standard', 6, 255000, 12, 'Theo dõi yêu cầu cấp quyền'),
      line('1Password', 'Business', 1, 200000, 12, 'Kho mật khẩu dùng chung của phòng'),
      line('Confluence', 'Standard', 2, 160000, 12, 'Quy trình vận hành của phòng'),
      line('Microsoft 365', 'Business Basic', 3, 150000, 12, 'Thư và lịch của phòng'),
      line('Zoom Workplace', 'Pro', 1, 360000, 12, 'Họp với nhà cung cấp'),
    ],
    MKT: [
      line('Canva', 'Teams', 4, 250000, 12, 'Thiết kế nội dung của nhóm'),
      line('Notion', 'Business', 4, 500000, 12, 'Lịch nội dung và tài liệu chiến dịch'),
      line('Adobe Photoshop', 'Photoshop', 2, 560000, 12, 'Chỉnh ảnh cho chiến dịch'),
    ],
    SAL: [
      line('Mailchimp', 'Standard', 3, 400000, 12, 'Gửi thư chiến dịch'),
      line('HubSpot Sales Hub', 'Starter', 3, 450000, 12, 'Quản lý khách hàng tiềm năng'),
      line('Zoom Workplace', 'Pro', 3, 360000, 12, 'Họp với khách hàng'),
    ],
    DES: [line('Postman', 'Professional', 2, 300000, 12, 'Nhóm kiểm thử giao diện')],
    BOD: [line('Slack', 'Pro', 5, 180000, 12, 'Trao đổi của Ban Giám đốc')],
    FIN: [line('Jira', 'Standard', 4, 255000, 12, 'Theo dõi công việc đối soát')],
  },
};
