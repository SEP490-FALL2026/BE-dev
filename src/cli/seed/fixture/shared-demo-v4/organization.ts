import type { DemoDepartment, DemoEmployeeImport, DemoFixture, DemoPerson } from '../demo-fixture.types';

const unit = (code: string, name: string) => ({ code: `CC-${code}`, name });

/*
 * Nine flat departments, no hierarchy (`QĐ-52`). Every head holds the MANAGER role and every department has an IT Admin in charge. On
 * purpose Legal has no head (its requests go in one step to the spending approver, `BR-MF1-02`) and Operations has no Cost Center (a
 * paid request there can only be saved as a draft). There is exactly one Finance and exactly one spending approver. An IT Admin answers
 * for at most four departments (`QĐ-110l`): the first two take four each and the third takes Operations; the fourth, who leaves, takes none.
 */
const DEPARTMENTS: DemoDepartment[] = [
  {
    code: 'BOD',
    name: 'Ban Giám đốc',
    function: 'Điều hành công ty; giữ vai Người duyệt chi.',
    head: 'NV-DEP',
    itAdmin: 'NV-ITA2',
    costCenter: unit('BOD', 'Ban Giám đốc'),
  },
  {
    code: 'ENG',
    name: 'Phòng Kỹ thuật',
    function: 'Phát triển sản phẩm phần mềm.',
    head: 'NV-ENGH',
    itAdmin: 'NV-ITA1',
    costCenter: unit('ENG', 'Phòng Kỹ thuật'),
  },
  {
    code: 'DES',
    name: 'Phòng Thiết kế',
    function: 'Thiết kế giao diện và thương hiệu.',
    head: 'NV-DESH',
    itAdmin: 'NV-ITA2',
    costCenter: unit('DES', 'Phòng Thiết kế'),
  },
  {
    code: 'FIN',
    name: 'Phòng Tài chính - Kế toán',
    function: 'Kiểm soát ngân sách, đối soát chi phí.',
    head: 'NV-FINH',
    itAdmin: 'NV-ITA2',
    costCenter: unit('FIN', 'Phòng Tài chính - Kế toán'),
  },
  {
    code: 'ITO',
    name: 'Phòng Công nghệ thông tin',
    function: 'Quản trị danh mục phần mềm, cấp và thu hồi quyền.',
    head: 'NV-ITOH',
    itAdmin: 'NV-ITA1',
    costCenter: unit('ITO', 'Phòng Công nghệ thông tin'),
  },
  {
    code: 'MKT',
    name: 'Phòng Marketing',
    function: 'Truyền thông và quảng bá sản phẩm.',
    head: 'NV-MKTH',
    itAdmin: 'NV-ITA2',
    costCenter: unit('MKT', 'Phòng Marketing'),
  },
  {
    code: 'SAL',
    name: 'Phòng Kinh doanh',
    function: 'Bán hàng và chăm sóc khách hàng.',
    head: 'NV-SALH',
    itAdmin: 'NV-ITA1',
    costCenter: unit('SAL', 'Phòng Kinh doanh'),
  },
  {
    code: 'LGL',
    name: 'Phòng Pháp chế',
    function: 'Hợp đồng và tuân thủ; chưa có trưởng phòng.',
    head: null,
    itAdmin: 'NV-ITA1',
    costCenter: unit('LGL', 'Phòng Pháp chế'),
  },
  {
    code: 'OPS',
    name: 'Phòng Vận hành',
    function: 'Phòng mới thành lập, đang hoàn thiện cấu hình.',
    head: 'NV-OPSH',
    itAdmin: 'NV-ITA3',
    costCenter: null,
  },
];

const person = (
  code: string,
  fullName: string,
  email: string,
  department: string | null,
  account: DemoPerson['account'],
  employmentType: DemoPerson['employmentType'] = 'STAFF',
): DemoPerson => ({ code, fullName, email, department, employmentType, account });

const PEOPLE: DemoPerson[] = [
  // Board: the spending approver is a plain account until the role step makes it the one approver.
  person('NV-CEO', 'Nguyễn Văn An', 'an.nguyen', 'BOD', 'EMPLOYEE'),
  person('NV-DEP', 'Trần Thị Bích', 'bich.tran', 'BOD', 'MANAGER'),
  person('NV-BOD1', 'Trần Quốc Khải', 'khai.tran', 'BOD', 'EMPLOYEE'),
  person('NV-BOD2', 'Nguyễn Thị Lụa', 'lua.nguyen', 'BOD', 'EMPLOYEE'),
  // Board people for the usage, locked-account and invitation scenarios: one account is locked, one has none and an invitation waits.
  person('NV-BOD3', 'Hoàng Văn Minh', 'minh.hoang', 'BOD', 'EMPLOYEE'),
  person('NV-BOD4', 'Phùng Thị Nga', 'nga.phung', 'BOD', 'EMPLOYEE'),
  person('NV-BOD5', 'Lương Văn Ơn', 'on.luong', 'BOD', null),
  person('NV-BOD6', 'Tống Thị Quyên', 'quyen.tong', 'BOD', null),
  person('NV-NEW3', 'Thái Bảo Châu', 'chau.thai', 'BOD', null),
  // Engineering: the biggest department, enough people for a group request.
  person('NV-ENGH', 'Lê Minh Cường', 'cuong.le', 'ENG', 'MANAGER'),
  person('NV-DEV1', 'Phạm Thu Dung', 'dung.pham', 'ENG', 'EMPLOYEE'),
  person('NV-DEV2', 'Hoàng Văn Em', 'em.hoang', 'ENG', 'EMPLOYEE'),
  person('NV-DEV3', 'Vũ Thị Giang', 'giang.vu', 'ENG', 'EMPLOYEE'),
  person('NV-DEV4', 'Lương Hoàng Phi', 'phi.luong', 'ENG', 'EMPLOYEE'),
  person('NV-OFF1', 'Hà Văn Nam', 'nam.ha', 'ENG', 'EMPLOYEE'),
  person('NV-DEV5', 'Phạm Anh Tuấn', 'tuan.pham', 'ENG', 'EMPLOYEE'),
  person('NV-DEV6', 'Bùi Thị Diệp', 'diep.bui', 'ENG', 'EMPLOYEE'),
  person('NV-DEV7', 'Đặng Văn Hiếu', 'hieu.dang', 'ENG', 'EMPLOYEE'),
  // The contract ends in 20 days: his request names months and his right is cut there, inside the 30-day window of the request to go on.
  { ...person('NV-CTR1', 'Vũ Quốc Phong', 'phong.vu', 'ENG', 'EMPLOYEE', 'CONTRACTOR'), contractEndInDays: 20 },
  person('NV-INT1', 'Đặng Quốc Huy', 'huy.dang', 'ENG', null, 'INTERN'),
  // An intern whose contract ends in about two and a half months: a K1 request of 9 months is cut there (DEMO-3).
  { ...person('NV-INT2', 'Lê Thị Hạnh', 'hanh.le', 'ENG', 'EMPLOYEE', 'INTERN'), contractEndInDays: 76 },
  // Design: the department of the usage scenarios (MF-5); most of its people only hold seats.
  person('NV-DESH', 'Bùi Ngọc Khánh', 'khanh.bui', 'DES', 'MANAGER'),
  person('NV-DES1', 'Đỗ Thị Lan', 'lan.do', 'DES', 'EMPLOYEE'),
  person('NV-DES2', 'Ngô Văn Mạnh', 'manh.ngo', 'DES', 'EMPLOYEE'),
  person('NV-DES3', 'Trương Thị Hoa', 'hoa.truong', 'DES', 'EMPLOYEE'),
  person('NV-DES4', 'Nguyễn Anh Khôi', 'khoi.nguyen', 'DES', null),
  person('NV-DES5', 'Phan Thị Linh', 'linh.phan', 'DES', null),
  person('NV-DES6', 'Lê Thanh Mai', 'mai.le', 'DES', null),
  person('NV-DES7', 'Trần Quang Nhật', 'nhat.tran', 'DES', null),
  person('NV-DES8', 'Võ Thị Hà', 'ha.vo', 'DES', null),
  person('NV-DES9', 'Đinh Văn Oanh', 'oanh.dinh', 'DES', null),
  person('NV-DES10', 'Mai Thị Phượng', 'phuong.mai', 'DES', null),
  person('NV-DES11', 'Hồ Văn Quý', 'quy.ho', 'DES', null),
  person('NV-DES12', 'Cao Thị Sương', 'suong.cao', 'DES', null),
  // Finance and IT.
  person('NV-FINH', 'Phan Thị Ngọc', 'ngoc.phan', 'FIN', 'MANAGER'),
  person('NV-FIN1', 'Trịnh Văn Phúc', 'phuc.trinh', 'FIN', 'FINANCE'),
  person('NV-FIN2', 'Dương Thị Thảo', 'thao.duong', 'FIN', 'EMPLOYEE'),
  person('NV-ITOH', 'Trần Minh Thanh', 'thanh.tran', 'ITO', 'MANAGER'),
  person('NV-ITA1', 'Lý Minh Quân', 'quan.ly', 'ITO', 'IT_ADMIN'),
  person('NV-ITA2', 'Mai Thị Rạng', 'rang.mai', 'ITO', 'IT_ADMIN'),
  person('NV-ITA3', 'Đoàn Văn Sáng', 'sang.doan', 'ITO', 'IT_ADMIN'),
  // An IT Admin in charge of no department who leaves in a few working days: he answers for Mailchimp and owns its workspace (MF-2, P5).
  person('NV-ITA4', 'Kim Văn Tú', 'tu.kim', 'ITO', 'IT_ADMIN'),
  person('NV-ITO1', 'Ngô Thanh Hải', 'hai.ngo', 'ITO', 'EMPLOYEE'),
  person('NV-ITO2', 'Vương Thị Yến', 'yen.vuong', 'ITO', 'EMPLOYEE'),
  // Marketing and Sales: tight budgets, the reserve and the block of the budget check.
  person('NV-MKTH', 'Đinh Thị Uyên', 'uyen.dinh', 'MKT', 'MANAGER'),
  person('NV-MKT1', 'Lâm Văn Vinh', 'vinh.lam', 'MKT', 'EMPLOYEE'),
  person('NV-MKT2', 'Châu Thị Xuân', 'xuan.chau', 'MKT', 'EMPLOYEE'),
  person('NV-SALH', 'Trương Văn Yên', 'yen.truong', 'SAL', 'MANAGER'),
  person('NV-SAL1', 'Kiều Thị Ánh', 'anh.kieu', 'SAL', 'EMPLOYEE'),
  person('NV-SAL2', 'Quách Văn Bảo', 'bao.quach', 'SAL', 'EMPLOYEE'),
  person('NV-SAL3', 'Mạc Văn Tài', 'tai.mac', 'SAL', null),
  person('NV-SAL4', 'Lưu Thị Uyển', 'uyen.luu', 'SAL', null),
  // Legal has no head; Operations has a head but no Cost Center.
  person('NV-LGL1', 'Lý Thu Thủy', 'thu.ly', 'LGL', 'EMPLOYEE'),
  person('NV-OPSH', 'Quan Thị Trang', 'trang.quan', 'OPS', 'MANAGER'),
  person('NV-OPS1', 'Tạ Văn Sơn', 'son.ta', 'OPS', 'EMPLOYEE'),
  person('NV-OPS2', 'Cù Văn Việt', 'viet.cu', 'OPS', 'EMPLOYEE'),
  person('NV-NEW1', 'Hồ Thị Tâm', 'tam.ho', 'OPS', null, 'CONTRACTOR'),
  // Placed in no department on purpose: the Super Admin places them from the list of unplaced employees (`QĐ-93g`).
  person('NV-NEW2', 'Âu Thị Xuyến', 'xuyen.au', null, 'EMPLOYEE'),
];

/*
 * Two people files (`SBF-01a`). The first is confirmed: three people with no account. The second is only previewed and never confirmed, so the
 * screen shows a file with one good line and two the API refuses: a department code that does not exist and the work email of NV-DEV5.
 */
const EMPLOYEE_IMPORTS: DemoEmployeeImport[] = [
  {
    key: 'confirmed',
    fileName: 'SV-employees-confirmed.csv',
    confirm: true,
    idempotencyKey: 'SV-EMPLOYEE-IMPORT-1',
    expectedErrors: [],
    rows: [
      { code: 'NV-IMP1', fullName: 'Nguyễn Hữu Đạt', email: 'dat.nguyen', employmentType: 'STAFF', department: 'ENG' },
      { code: 'NV-IMP2', fullName: 'Trần Mỹ Linh', email: 'linh.tran', employmentType: 'STAFF', department: 'OPS' },
      { code: 'NV-IMP3', fullName: 'Lê Hoài Nam', email: 'nam.le', employmentType: 'STAFF', department: 'FIN' },
    ],
  },
  {
    key: 'preview',
    fileName: 'SV-employees-preview.csv',
    confirm: false,
    idempotencyKey: 'SV-EMPLOYEE-IMPORT-2',
    expectedErrors: ['DEPARTMENT_CODE_INVALID', 'WORK_EMAIL_TAKEN'],
    rows: [
      { code: 'NV-IMP4', fullName: 'Phạm Gia Hân', email: 'han.pham', employmentType: 'STAFF', department: 'MKT' },
      { code: 'NV-IMP5', fullName: 'Võ Thanh Tùng', email: 'tung.vo', employmentType: 'STAFF', department: 'XYZ' },
      {
        code: 'NV-IMP6',
        fullName: 'Đỗ Khánh Vy',
        email: { sameAsPerson: 'NV-DEV5' },
        employmentType: 'STAFF',
        department: 'ENG',
      },
    ],
  },
];

export const ORGANIZATION: Pick<DemoFixture, 'departments' | 'people' | 'employeeImports' | 'approvalRoles'> = {
  departments: DEPARTMENTS,
  people: PEOPLE,
  employeeImports: EMPLOYEE_IMPORTS,
  approvalRoles: { SPENDING_APPROVER: 'NV-CEO' },
};
