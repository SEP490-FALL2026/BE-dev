// Fixture authoring helpers. Fixtures are SYNTHETIC: invented people, companies and
// codes; the example.* domains cannot belong to anyone.

// Default meaning-critical checks per category, per TARGET language.
// mustContain entries are any-of groups; matching is case-insensitive substring.
const DEFAULTS = {
  en: {
    negation: { contain: [['not', "n't", 'no ', 'never', 'cannot', 'unable', 'without', 'nobody', 'none', 'neither']] },
    approve: {
      contain: [['approv']],
      notContain: ['reject', 'declin', 'denied', 'refus', 'turned down'],
    },
    reject: {
      contain: [
        [
          'reject',
          'declin',
          'denied',
          'deny',
          'refus',
          'turned down',
          'not approv',
          'disapprov',
          'not accept',
          'dismiss',
          'cannot approve',
          'unable to approve',
          'not be approved',
          'unable to accept',
        ],
      ],
      notContain: ['has been approved', 'is approved', 'was approved'],
    },
    revoke: { contain: [['revok', 'revocation']] },
  },
  vi: {
    negation: { contain: [['không', 'chưa', 'chẳng', 'đừng', 'chớ']] },
    approve: {
      contain: [['duyệt', 'chấp thuận', 'đồng ý', 'chấp nhận']],
      notContain: ['từ chối', 'bác bỏ'],
    },
    reject: {
      contain: [
        [
          'từ chối',
          'bác bỏ',
          'không được duyệt',
          'không duyệt',
          'không thể duyệt',
          'không thể phê duyệt',
          'không chấp',
          'không thể chấp',
          'chưa được duyệt',
          'không được phê duyệt',
        ],
      ],
      notContain: ['đã được duyệt', 'đã duyệt', 'đã phê duyệt', 'được phê duyệt'],
    },
    revoke: { contain: [['thu hồi']] },
  },
};

// Glossary-term checks (target language).
export const G = {
  en: {
    seat: [['seat']],
    department: [['department']],
    head: [['department head', 'head of department', 'head of the department']],
    approver: [['spending approver']],
    costCenter: [['cost center']],
    renew: [['renew']],
    revoke: [['revok', 'revocation']],
    handover: [['hand over', 'handed over', 'handover', 'hands over', 'handing over', 'hand-over']],
    deadline: [['cancellation deadline']],
  },
  vi: {
    seat: [['seat']],
    department: [['phòng']],
    head: [['trưởng phòng']],
    approver: [['người duyệt chi']],
    costCenter: [['cost center']],
    renew: [['gia hạn']],
    revoke: [['thu hồi']],
    handover: [['bàn giao']],
    deadline: [['hạn báo hủy', 'hạn báo huỷ']],
  },
};

const POLARITY = ['negation', 'approve', 'reject', 'revoke'];

// item(id, source, reference, categories, { p: protected[], c: extra mustContain groups, n: extra mustNotContain, lang })
export function makeItem(lang) {
  return (id, source, reference, categories, opts = {}) => {
    const { p = [], c = [], n = [], custom = false } = opts; // custom: skip the default per-category checks (held-out set)
    const mustContain = [];
    const mustNotContain = [];
    for (const cat of POLARITY) {
      if (custom || !categories.includes(cat)) continue;
      const d = DEFAULTS[lang][cat];
      mustContain.push(...d.contain);
      if (d.notContain) mustNotContain.push(...d.notContain);
    }
    mustContain.push(...c);
    mustNotContain.push(...n);
    return {
      id,
      source,
      reference,
      categories,
      protected: p,
      mustContain,
      mustNotContain: [...new Set(mustNotContain)],
    };
  };
}

// Clause pool for the long single-sentence items: [vi, en, protected-in-both].
// Amounts use USD / % only so the protected strings are identical in both languages.
export const CLAUSES = [
  [
    'nhóm thiết kế cần thêm giấy phép Figma để hoàn thiện giao diện mới',
    'the design team needs additional Figma licenses to complete the new interface',
    ['Figma'],
  ],
  [
    'Trần Thị Bích sẽ nghỉ phép từ 10/11/2026 đến 24/11/2026',
    'Trần Thị Bích will be on leave from 10/11/2026 to 24/11/2026',
    ['Trần Thị Bích', '10/11/2026', '24/11/2026'],
  ],
  [
    'ngân sách dự kiến cho các giấy phép là 4200 USD mỗi năm',
    'the planned budget for the licenses is 4200 USD per year',
    ['4200 USD'],
  ],
  [
    'hạn báo hủy của hợp đồng hiện tại là 15/11/2026',
    'the cancellation deadline of the current contract is 15/11/2026',
    ['15/11/2026'],
  ],
  [
    'Lê Hoàng Nam sẽ bàn giao các tài khoản Jira cho Ngô Phương Thảo',
    'Lê Hoàng Nam will hand over the Jira accounts to Ngô Phương Thảo',
    ['Lê Hoàng Nam', 'Jira', 'Ngô Phương Thảo'],
  ],
  [
    'trưởng phòng đã xác nhận rằng công cụ này không trùng với phần mềm đang có',
    'the department head has confirmed that this tool does not overlap with existing software',
    [],
  ],
  [
    'mỗi seat Slack hiện được dùng trung bình 6 giờ mỗi ngày',
    'each Slack seat is currently used for an average of 6 hours per day',
    ['Slack'],
  ],
  ['các seat không dùng trong 90 ngày sẽ bị thu hồi', 'seats unused for 90 days will be revoked', []],
  [
    'GitHub Copilot giúp giảm 20% thời gian viết mã kiểm thử',
    'GitHub Copilot reduces test-writing time by 20%',
    ['GitHub Copilot', '20%'],
  ],
  [
    'Người duyệt chi cần xác nhận Cost Center CC-0042 trước khi mua',
    'the Spending Approver must confirm Cost Center CC-0042 before purchase',
    ['CC-0042'],
  ],
  [
    'khoản chi này đã nằm trong kế hoạch ngân sách năm 2026',
    'this expense is already included in the 2026 budget plan',
    [],
  ],
  [
    'đội kiểm thử cần Postman để chạy bộ kiểm thử API tự động',
    'the testing team needs Postman to run the automated API test suite',
    ['Postman'],
  ],
  [
    'nhà cung cấp đề nghị ký hợp đồng HD-2026-15 trước cuối tháng',
    'the vendor asks us to sign contract HD-2026-15 before the end of the month',
    ['HD-2026-15'],
  ],
  [
    'quản trị viên sẽ cấp quyền sau khi yêu cầu được duyệt',
    'the administrator will grant access once the request is approved',
    [],
  ],
  [
    'Notion được dùng để quản lý tài liệu của dự án Atlas',
    'Notion is used to manage the documents of project Atlas',
    ['Notion', 'Atlas'],
  ],
  [
    'nếu không gia hạn đúng hạn, nhóm sẽ mất quyền truy cập dữ liệu',
    'if we do not renew on time, the team will lose access to its data',
    [],
  ],
  [
    'Đặng Minh Khoa đề nghị dùng chung một tài khoản cho cả nhóm nhưng chính sách không cho phép',
    'Đặng Minh Khoa suggested sharing one account for the whole team, but the policy does not allow it',
    ['Đặng Minh Khoa'],
  ],
  [
    'Docker Desktop cần được cài trên 8 máy của nhóm hạ tầng',
    'Docker Desktop must be installed on 8 machines of the infrastructure team',
    ['Docker Desktop'],
  ],
  [
    'báo cáo quý trước cho thấy phòng Kinh doanh còn 4 seat chưa dùng',
    "last quarter's report shows that the Sales department still has 4 unused seats",
    [],
  ],
  [
    'chúng tôi đã so sánh Figma với Adobe XD và thấy Figma phù hợp hơn',
    'we compared Figma with Adobe XD and found Figma more suitable',
    ['Figma', 'Adobe XD'],
  ],
  ['thời hạn xử lý yêu cầu này là 25/11/2026', 'the processing deadline of this request is 25/11/2026', ['25/11/2026']],
  [
    'Phạm Quỳnh Anh sẽ phụ trách quản lý giấy phép sau khi bàn giao',
    'Phạm Quỳnh Anh will be in charge of license management after the handover',
    ['Phạm Quỳnh Anh'],
  ],
  ['Tableau được dùng cho báo cáo tài chính hàng tháng', 'Tableau is used for monthly financial reports', ['Tableau']],
  [
    'Hoàng Ngọc Lan đã gửi báo giá qua email ngoc.hoang@acme-demo.example',
    'Hoàng Ngọc Lan sent the quotation by email to ngoc.hoang@acme-demo.example',
    ['Hoàng Ngọc Lan', 'ngoc.hoang@acme-demo.example'],
  ],
  [
    'chi phí đào tạo người dùng mới ước tính 300 USD',
    'the cost of training new users is estimated at 300 USD',
    ['300 USD'],
  ],
  [
    'nhóm bảo mật yêu cầu bật xác thực hai lớp cho mọi tài khoản',
    'the security team requires two-factor authentication for every account',
    [],
  ],
  [
    'Visual Studio Code là công cụ chuẩn nên không cần phê duyệt riêng',
    'Visual Studio Code is a standard tool, so no separate approval is needed',
    ['Visual Studio Code'],
  ],
  [
    'lần gia hạn trước đã tăng giá 8% so với hợp đồng gốc',
    'the previous renewal raised the price by 8% compared with the original contract',
    ['8%'],
  ],
  [
    'Võ Thanh Hà đã xác nhận danh sách người dùng cuối cùng',
    'Võ Thanh Hà confirmed the final list of users',
    ['Võ Thanh Hà'],
  ],
  [
    'Microsoft Teams đã đáp ứng nhu cầu họp nhóm nên không cần thêm Zoom',
    'Microsoft Teams already meets the team meeting needs, so Zoom is not required',
    ['Microsoft Teams', 'Zoom'],
  ],
  [
    'JetBrains IntelliJ IDEA cần cho 5 lập trình viên của nhóm backend',
    'JetBrains IntelliJ IDEA is needed for 5 developers of the backend team',
    ['JetBrains IntelliJ IDEA'],
  ],
  [
    'Bùi Gia Huy sẽ kiểm tra việc sử dụng seat vào ngày 01/12/2026',
    'Bùi Gia Huy will review seat usage on 01/12/2026',
    ['Bùi Gia Huy', '01/12/2026'],
  ],
  [
    'MATLAB chỉ được dùng trong học kỳ này cho môn mô phỏng',
    'MATLAB will only be used this semester for the simulation course',
    ['MATLAB'],
  ],
  [
    'Confluence lưu toàn bộ tài liệu quy trình của phòng Vận hành',
    'Confluence stores all process documents of the Operations department',
    ['Confluence'],
  ],
  [
    'Adobe Photoshop chỉ cần cho hai thiết kế viên trong ba tháng',
    'Adobe Photoshop is needed only for two designers for three months',
    ['Adobe Photoshop'],
  ],
  [
    'AutoCAD được dùng cho bản vẽ kỹ thuật của dự án mới',
    'AutoCAD is used for the technical drawings of the new project',
    ['AutoCAD'],
  ],
  [
    'Docker Desktop và Postman đều đã có trong danh mục chuẩn',
    'Docker Desktop and Postman are both already in the standard catalogue',
    ['Docker Desktop', 'Postman'],
  ],
];

// One-sentence justification built from the first `count` clauses (no sentence-final punctuation inside).
export function longItem(lang, id, count, extraCats = []) {
  const picked = CLAUSES.slice(0, count);
  const vi = `Tôi viết đề nghị này để giải trình việc cần cấp thêm giấy phép cho nhóm dự án của chúng tôi, và xin nêu thêm rằng ${picked
    .map((c) => c[0])
    .join(', ')}, vì vậy rất mong được xem xét sớm.`;
  const en = `I am writing this request to justify the additional licenses for our project team, and I would like to add that ${picked
    .map((c) => c[1])
    .join(', ')}, so we hope for an early review.`;
  const prot = [...new Set(picked.flatMap((c) => c[2]))];
  const source = lang === 'vi' ? vi : en;
  const reference = lang === 'vi' ? en : vi;
  return {
    id,
    source,
    reference,
    categories: ['long', ...extraCats],
    protected: prot,
    mustContain: [],
    mustNotContain: [],
  };
}
