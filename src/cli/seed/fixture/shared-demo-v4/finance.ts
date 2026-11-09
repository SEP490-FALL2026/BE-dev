import type { DemoBudgetLine, DemoFixture } from '../demo-fixture.types';

/** The explanation a new purchase gives (`QĐ-94l`): four short answers. */
const zbb = (purpose: string): NonNullable<DemoBudgetLine['zbb']> => ({
  purpose,
  alternatives: 'Dùng công cụ miễn phí, chất lượng và quyền riêng tư chưa đáp ứng.',
  consequenceIfNot: 'Nhóm tiếp tục làm tay, chậm hơn khoảng một phần ba thời gian.',
  usageIndicator: 'Số lượt dùng mỗi tuần của từng thành viên trong ba tháng đầu.',
});

const line = (
  description: string,
  plan: string,
  seats: number,
  amount: string,
  lineType: DemoBudgetLine['lineType'],
  extra: Partial<DemoBudgetLine> = {},
): DemoBudgetLine => ({ description, plan, seats, amount, lineType, ...extra });

export const FINANCE: Pick<DemoFixture, 'taxProfile' | 'cycle' | 'nextCycle' | 'budgets' | 'nextYear'> = {
  taxProfile: {
    application: 'figma',
    group: 'T2',
    lines: [{ taxType: 'VAT', ratePercent: '10', deductible: true }],
  },
  // The cycle of the year: a ceiling far above the budgets of the dataset, the rest divided evenly among the departments (QT 4.3).
  cycle: {
    annualCeiling: '20000000000',
    sharedPoolReserve: '1000000000',
    submissionDaysBefore: 60,
    decisionDaysBefore: 30,
  },
  // The cycle of the next year is open and published with a ceiling of its own for each department: the demo walks MF-4 from here.
  nextCycle: {
    annualCeiling: '500000000',
    sharedPoolReserve: '50000000',
    submissionDaysBefore: 60,
    decisionDaysBefore: 30,
    ceilings: {
      ENG: '100000000',
      MKT: '60000000',
      SAL: '60000000',
      ITO: '50000000',
      DES: '40000000',
      FIN: '30000000',
      BOD: '30000000',
      LGL: '10000000',
    },
  },
  /*
   * The approved budget of the year of every department with a Cost Center. Three are tight on purpose, so the budget check of a
   * request shows its three outcomes: Marketing (240.000) makes a 250.000 request use the reserve (24.000) and the head confirm it,
   * Design (280.000) makes a 300.000 request use the reserve and wait for the head's confirmation, Sales (290.000) makes a 400.000
   * request go over the reserve (29.000) and be blocked. Legal has no head: Finance builds its version from the baseline.
   */
  budgets: [
    {
      department: 'ENG',
      origin: 'PROPOSAL',
      base: '600000000',
      lines: [
        line('Jira Standard cho cả phòng', 'jira-standard', 20, '48000000', 'RENEW'),
        line('GitHub Team cho cả phòng', 'github-team', 20, '24000000', 'RENEW'),
        line('ChatGPT Plus cho nhóm R&D', 'chatgpt-plus', 5, '30000000', 'NEW', {
          zbb: zbb('Soạn tài liệu và nghiên cứu.'),
        }),
      ],
    },
    {
      department: 'MKT',
      origin: 'PROPOSAL',
      base: '240000',
      lines: [line('Canva Teams cho nhóm nội dung', 'canva-teams', 1, '240000', 'RENEW')],
    },
    {
      department: 'SAL',
      origin: 'PROPOSAL',
      base: '290000',
      lines: [line('Mailchimp Standard cho chiến dịch', 'mailchimp-standard', 1, '290000', 'RENEW')],
    },
    {
      department: 'DES',
      origin: 'PROPOSAL',
      base: '280000',
      lines: [line('Postman Professional cho nhóm kiểm thử giao diện', 'postman-professional', 1, '280000', 'RENEW')],
    },
    {
      department: 'BOD',
      origin: 'PROPOSAL',
      base: '50000000',
      lines: [line('Slack Pro cho ban giám đốc', 'slack-pro', 5, '10800000', 'RENEW')],
    },
    {
      department: 'FIN',
      origin: 'PROPOSAL',
      base: '50000000',
      lines: [line('Slack Pro cho phòng tài chính', 'slack-pro', 5, '10800000', 'RENEW')],
    },
    {
      department: 'ITO',
      origin: 'PROPOSAL',
      base: '50000000',
      lines: [line('1Password Business cho phòng IT', 'onepassword-business', 5, '12000000', 'RENEW')],
    },
    { department: 'LGL', origin: 'BASELINE', base: '0', lines: [] },
  ],
  /*
   * Where the next year is left: Engineering's proposal waits for Finance with all four kinds of line and two of them over the
   * ceiling of the department (a flag, not a block); Marketing's version waits for the spending approver; Sales' version was sent back
   * for changes; Information Technology's proposal waits for Finance.
   */
  nextYear: [
    {
      department: 'ENG',
      stage: 'PROPOSAL_SUBMITTED',
      base: '112000000',
      lines: [
        line('Gia hạn Jira Standard', 'jira-standard', 20, '48000000', 'RENEW'),
        line('Đổi gói GitHub Team', 'github-team', 20, '24000000', 'CHANGE'),
        line('Cursor Pro cho nhóm R&D', 'cursor-pro', 5, '30000000', 'NEW', {
          zbb: zbb('Viết mã nhanh hơn với trợ lý lập trình.'),
          note: 'Vượt trần phòng vì cần mua mới trong quý đầu năm.',
        }),
        line('Postman cho nhóm kiểm thử', 'postman-professional', 3, '10000000', 'NEW', {
          zbb: zbb('Kiểm thử API tự động.'),
          note: 'Vượt trần phòng, xin cân đối từ phần dự phòng kho.',
        }),
        line('Hủy Mailchimp (không còn chiến dịch)', 'mailchimp-standard', 1, '5000000', 'CANCEL'),
      ],
    },
    {
      department: 'MKT',
      stage: 'VERSION_SENT',
      base: '50000000',
      lines: [line('Gia hạn Canva Teams', 'canva-teams', 5, '15000000', 'RENEW')],
    },
    {
      department: 'SAL',
      stage: 'CHANGES_REQUESTED',
      base: '50000000',
      reason: 'Cơ sở đề xuất chưa khớp số seat đang dùng; nộp lại sau khi rà soát.',
      lines: [line('Gia hạn Mailchimp Standard', 'mailchimp-standard', 5, '24000000', 'RENEW')],
    },
    {
      department: 'ITO',
      stage: 'PROPOSAL_SUBMITTED',
      base: '20000000',
      lines: [line('Gia hạn Jira Standard cho phòng IT', 'jira-standard', 5, '12000000', 'RENEW')],
    },
  ],
};
