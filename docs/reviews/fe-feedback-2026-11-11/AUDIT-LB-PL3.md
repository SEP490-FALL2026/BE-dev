# AUDIT-LB-PL3 — gói PL-3 (file mẫu import) lane B · review chỉ đọc · 15/11/2026

> Skill đã đọc/dùng: `agent-skills:code-review-and-quality` (process + review năm trục, phân mức Critical/Required/Optional/Nit),
> `superpowers:verification-before-completion` (mọi kết luận có bằng chứng đọc code; không chạy pnpm/jest/docker theo lệnh giao việc,
> nên trạng thái test lấy từ HANDOFF-CODE-LANE-B và **chưa tự chạy lại**). Process skill riêng không có; mapping: phần "Review Process" của
> `code-review-and-quality`.
>
> Phạm vi: `c73f0003..d083bf32` — `5d50698a` (PL-3.1), `bc7d0abe` (PL-3.2), `df3a8933` (sinh lại), `d083bf32` (docs, D-B6). Đọc qua
> `git show d083bf32:<path>`; số dòng dưới đây là số dòng ở `d083bf32`.
>
> Căn cứ: `QĐ-111as` (mẫu do BE phục vụ, **chuẩn thực tế doanh nghiệp, không làm qua loa**, không mẫu sao kê), `QĐ-111y`, `QĐ-111ab`
> (`BM-10` = ≥ 1 file theo mẫu + số tiền + ghi chú), `QĐ-97d`/`QĐ-112e` (giá chưa thuế), BRD `FR-9.3`, QT main flow §4.4, SPEC PL-3
> (S16: "khớp parser — test đọc lại chính file mẫu ra 0 lỗi"), PLAN PL-3.1/3.2, DECISIONS Q10, OVERNIGHT-DECISIONS-LANE-B D-B6.

## Tóm tắt

| Mức      | Số | Mã                                                |
| -------- | -- | ------------------------------------------------- |
| Critical | 0  | —                                                 |
| Required | 6  | LB3-01 · LB3-02 · LB3-03 · LB3-04 · LB3-05 · LB3-06 |
| Optional | 6  | LB3-07 → LB3-12                                   |
| Nit      | 4  | LB3-13 → LB3-16                                   |

Kết luận: kiến trúc đúng (điểm mở ở `policies` T3, module đọc file ở T4–T6 góp định nghĩa qua `*.listener.ts`), cột mẫu khớp tên cột parser,
không có mẫu sao kê. Nhưng **định dạng mặc định `xlsx` không đọc được** ở 3/5 loại, mẫu khóa bản quyền có **dòng tiêu đề lọt qua bộ kiểm
khóa**, test usage **không chạy parser thật**, bảng hướng dẫn **nói sai luật** ở file nhân sự, ô text chỉ đặt cho dòng ví dụ, và `BM-10`
chưa đạt chuẩn "thực tế doanh nghiệp". Chưa nên coi PL-3 là xong.

---

## Required

### LB3-01 — Mẫu `xlsx` (mặc định) của `seat-baseline`, `usage-csv`, `license-keys` không nạp được vào luồng import thật

- **Mức:** Required (cao — hỏng luồng người dùng ở định dạng mặc định).
- **File:dòng:** `policies/import-template/import-template.dto.ts:9-10` (`format` mặc định `xlsx` cho **mọi** kind);
  `policies/import-template/import-template.service.ts:53-55` (dựng xlsx cho mọi kind);
  `data-import/seat-baseline-import/seat-baseline-file.policy.ts:26` (`bytes.includes(0)` ⟹ `FILE_NOT_TEXT`, chỉ đọc CSV) và
  `seat-baseline-import.service.ts:80` (không có nhánh xlsx); `usage/vendor-import/vendor-import.service.ts:47-57,163-164` (chỉ UTF-8 text,
  CSV hoặc JSON); `licensing/license-key/license-key.dto.ts:12` (BE nhận `keys: string[]` JSON — không parser file nào).
- **Kịch bản:** IT Admin bấm "Tải file mẫu" (FE không truyền `format` ⟹ `xlsx`), điền 50 dòng seat trong Excel, tải lên
  `POST /seat-baseline-imports` ⟹ 422 `FILE_NOT_TEXT` cho cả file. Tương tự `POST /usage-imports` ⟹ `FILE_NOT_TEXT`. Với
  `license-keys`, FE phải tự đọc xlsx (thêm thư viện) chỉ để lấy một cột.
- **Căn cứ:** SPEC S16/PL-3 "khớp parser — test đọc lại chính file mẫu ⟹ 0 lỗi"; `QĐ-111as`. Spec seat chỉ đọc lại bản CSV
  (`seat-baseline-template.policy.spec.ts:32`), usage và license-keys cũng chỉ CSV ⟹ bản xlsx của ba loại này **chưa bao giờ** được đọc
  lại; chỉ `employees` có `it.each(['xlsx','csv'])`.
- **Cách sửa:** thêm `formats: readonly ImportTemplateFormat[]` vào `ImportTemplateDefinition` (do module đọc file khai, phần tử đầu là mặc
  định). `employees: ['xlsx','csv']`; `seat-baseline: ['csv']` (hoặc tốt hơn: cho `readSeatFile` nhận xlsx bằng chính bộ đọc xlsx + zip guard
  đã có trong `data-import/employee-import/preview/employee-import-xlsx.service.ts` — tránh lỗi Excel đổi ngày/mất số 0 khi mở CSV);
  `usage-csv: ['csv']`; `license-keys: ['csv']`; `budget-proposal: ['xlsx']`. Query `format` bỏ `.default('xlsx')`, service lấy
  `definition.formats[0]` khi không truyền; format không có trong danh sách ⟹ 422 `IMPORT_TEMPLATE.FORMAT_NOT_SUPPORTED` (thêm ví dụ
  OpenAPI). `definitionProblems` báo `formats` rỗng.
- **Test/mutation:** spec mỗi kind lặp `it.each(definition.formats)` và đọc lại bằng parser thật; HTTP spec thêm
  `GET /import-templates/seat-baseline?format=xlsx` ⟹ 422 và mặc định ⟹ `text/csv`. Mutation: thêm `'xlsx'` vào `formats` của
  seat-baseline ⟹ spec đọc lại phải đỏ (`FILE_NOT_TEXT`).

### LB3-02 — Dòng tiêu đề `license_key` của mẫu khóa bản quyền là một khóa hợp lệ với `judgeBatch`

- **Mức:** Required (rủi ro ghi rác vào kho khóa).
- **File:dòng:** `licensing/license-key/license-key-template.policy.ts:12` (header `license_key`); `license-key.policy.ts:6`
  (`SHAPE = /^[A-Za-z0-9\-_.=+/]{8,128}$/` — `license_key` dài 11 ký tự, chỉ chữ và `_` ⟹ **khớp**);
  `license-key-template.policy.spec.ts:14-15` (spec tự bỏ dòng đầu trước khi gọi `judgeBatch`, nên che đúng lỗi này).
- **Kịch bản:** `POST /license-keys/imports` nhận `{ keys: string[] }`; không tài liệu nào (OpenAPI của route, ghi chú mẫu) nói FE phải bỏ dòng
  đầu. FE đọc file mẫu theo dòng và gửi cả 4 dòng ⟹ `license_key` được niêm phong vào kho như một khóa thật (danh sách hiện `••••_key`), làm
  sai `capacityOf`/cảnh báo `KEY_COUNT_DIFFERS` và có thể được cấp cho seat.
- **Căn cứ:** `US-04-12` AC-1/AC-9 (mỗi dòng một khóa); SPEC "mẫu khớp parser"; quy tắc an toàn dữ liệu kho K4.
- **Cách sửa (chọn một, khuyến nghị a+b):** (a) mẫu CSV **không có dòng tiêu đề** (một khóa mỗi dòng — đúng cách BE đọc) và để tên cột/ý nghĩa
  chỉ ở sheet _Hướng dẫn_; hoặc đổi header thành chuỗi chắc chắn bị `SHAPE` từ chối (vd. `Khóa bản quyền`) để lỗi hiện ra ở dòng 1 thay vì
  ghi im lặng; (b) mô tả OpenAPI của `POST /license-keys/imports` ghi rõ "mỗi phần tử là một khóa; FE bỏ dòng tiêu đề của file mẫu".
- **Test/mutation:** spec gửi **toàn bộ** dòng file (kể cả dòng đầu) vào `judgeBatch` và kỳ vọng đúng 3 khóa + 0 khóa tên `license_key`.
  Hôm nay mutation này đỏ (4 rows).

### LB3-03 — Test mẫu usage không chạy parser thật; file mẫu bị từ chối cả file nếu không khai khoảng thời gian

- **Mức:** Required.
- **File:dòng:** `usage/vendor-import/vendor-import-template.policy.spec.ts:21-23` (chỉ gọi `readCsvReport` — bộ tách cột, **không** có bước
  chấm lỗi dòng); lỗi dòng nằm ở `parse/vendor-import-parse.policy.ts` `parseReport` (chấm định danh, ngày, cửa sổ);
  `parse/coverage-window.policy.ts:27` (`derivedWindow`: báo cáo chỉ có `last_active_date` không có ngày `ACTIVE_DATE` ⟹ ném
  `WINDOW_REQUIRED`); `vendor-import-template.policy.ts:33,41-46` (ràng buộc/ghi chú không nói phải khai _từ ngày – đến ngày_ khi tải lên).
- **Kịch bản:** IT Admin tải mẫu, đổi email thật, tải lên không nhập `coverageFrom/coverageTo` ⟹ cả file bị từ chối `WINDOW_REQUIRED`;
  bảng hướng dẫn không báo trước. HANDOFF ghi "usage-csv (`readCsvReport`: 1 xanh)" như bằng chứng "0 lỗi" — chưa đúng: `readCsvReport`
  không sinh lỗi dòng nào.
- **Căn cứ:** SPEC S16/PL-3 Test ("đọc lại bằng chính parser ⟹ 0 lỗi"); `FR-4.3`/`INV-10` (cửa sổ phải khai khi báo cáo chỉ có lần hoạt động
  cuối — chú thích `resolveWindow`).
- **Cách sửa:** spec gọi `parseReport({ format: 'CSV', text, source, declared: { from: '2026-09-01', to: '2026-11-14' }, today: '2026-11-15',
  organizationTimeZone: 'Asia/Ho_Chi_Minh' })` và kỳ vọng mọi `row.errors` rỗng, `warnings` rỗng; thêm ca không khai cửa sổ ⟹
  `WINDOW_REQUIRED` để khóa đúng ghi chú. Thêm ghi chú mẫu: "Báo cáo chỉ có ngày hoạt động gần nhất ⟹ khi tải lên phải nhập khoảng thời gian
  báo cáo (từ ngày – đến ngày, tối đa 366 ngày, không sau ngày mai)"; sửa ràng buộc dòng 33 thành "Không sau ngày cuối của khoảng báo cáo; ngày
  trước khoảng vẫn hợp lệ (là lần thấy cuối)" — khớp `judgeDayInWindow`.
- **Test/mutation:** bỏ `declared` ⟹ spec mới phải đỏ `WINDOW_REQUIRED`; đổi một ngày mẫu sang sau `to` ⟹ đỏ `DATE_AFTER_WINDOW`.

### LB3-04 — Sheet _Hướng dẫn_ của file nhân sự (và seat) nói luật mà parser không áp, bỏ luật parser có áp

- **Mức:** Required (mẫu phải khớp parser; hướng dẫn sai làm người dùng tin dữ liệu bị chặn trong khi không bị chặn).
- **File:dòng:**
  - `data-import/employee-import/employee-import-template.policy.ts:33` "tên miền phải là tên miền công ty" — classifier không kiểm tên miền:
    `EmployeeImportLookup` không có danh sách tên miền (`row-validation/employee-import-row-validation.policy.ts:87-94`), `judgeEmail`
    (`:261-283`) chỉ kiểm dạng, trùng trong file, trùng chủ. Kiểm tên miền chỉ có ở seat (`seat-baseline-rows.policy.ts:162`, `US-02-05`
    AC-13).
  - `:49` "không sau ngày nhập" — `typeAndDateIssues` (`:166-174`) chỉ `isBusinessDate`; không có mã lỗi ngày vào làm ở tương lai.
  - `:15` "Chữ và số, không dấu cách" — parser: 3–20 ký tự, nhóm `A-Z0-9` nối bằng **một** dấu `-` (`organization/public/organization-code.policy.ts`
    `ORGANIZATION_CODE_PATTERN`, `isEmployeeCodeValid`); `_`, `.`, `/` bị từ chối, độ dài không được nói.
  - `:65` `job_title` "Có thể để trống" — thiếu trần độ dài (`isJobTitleTooLong`).
  - Seat `seat-baseline-template.policy.ts:42` thiếu "không sau ngày ghi nhận" (`GRANTED_ON_IN_FUTURE`, `seat-baseline-rows.policy.ts:169`);
    `:50` "Sau ngày bắt đầu" nhưng parser chấp nhận **bằng** ngày bắt đầu (`:191` chỉ từ chối `endText < effectiveFrom`).
- **Kịch bản:** Super Admin đọc hướng dẫn, nhập email `@gmail.com` cho nhân viên ⟹ xem trước báo VALID, trái lời hướng dẫn; mã `NV_0101` bị
  từ chối mà hướng dẫn không nói vì sao.
- **Căn cứ:** `QĐ-111as`; SPEC PL-3 "sheet hướng dẫn: cột, bắt buộc, định dạng, ví dụ, ràng buộc"; chú thích chính `ImportTemplateColumn.constraint`
  (`policies.types.ts`: "What the parser refuses").
- **Cách sửa:** viết lại đúng luật: mã nhân viên "3–20 ký tự, chữ in hoa và số, có thể nối bằng một dấu `-` (vd. `NV-0101`); chữ thường được đổi
  thành chữ hoa"; email "Mỗi email chỉ một người trong file và trong hệ thống" (bỏ vế tên miền — nếu Owner muốn chặn tên miền ở file nhân sự
  thì đó là QĐ mới, không phải câu hướng dẫn); hire_date "Ngày có thật, `YYYY-MM-DD`"; job_title thêm trần ký tự từ hằng số của
  `employee-placement.policy`. Seat: granted_on "không sau ngày ghi nhận", expected_end_date "không trước ngày bắt đầu". Tốt hơn: thêm
  trường `refusedWith: readonly string[]` (mã lỗi parser) cho mỗi cột và spec đối chiếu với danh sách mã lỗi thật (`SEAT_ROW_ERROR_CODES`,
  mã của `employee-import`) để câu hướng dẫn không trôi.
- **Test/mutation:** spec "mỗi mã lỗi parser có ở ít nhất một cột của mẫu" (xóa `GRANTED_ON_IN_FUTURE` khỏi mẫu ⟹ đỏ).

### LB3-05 — Ô kiểu text chỉ đặt cho các ô đã có; dòng người dùng tự nhập vẫn là _General_

- **Mức:** Required (mất dữ liệu im lặng ở file nhân sự xlsx).
- **File:dòng:** `policies/import-template/import-template.service.ts:64-69` — chú thích nói "a code that starts with zeros, a date or a long
  account number must reach the parser as it was written", nhưng `data.eachRow(row => row.eachCell(cell => cell.numFmt = '@'))` chỉ chạm các ô
  của 4 dòng đang có; `data.columns` (`:65-68`) không đặt `style`. Dòng 5 trở đi người dùng gõ vào là định dạng _General_.
- **Kịch bản:** HR gõ mã `000123` ở dòng 5 ⟹ Excel lưu số `123` ⟹ `cellText` (`employee-import-xlsx.service.ts:148`) trả `"123"` ⟹
  `isEmployeeCodeValid("123")` hợp lệ ⟹ tạo nhân viên **mã sai** mà không có lỗi nào. Số tài khoản/định danh dài ⟹ dạng `1.23E+15`.
- **Căn cứ:** chính chú thích của code; `QĐ-111as`; SPEC "khớp parser".
- **Cách sửa:** đặt kiểu ở cấp cột: `data.columns = definition.columns.map(c => ({ key: c.key, width: …, style: { numFmt: '@' } }))` (ExcelJS
  ghi `<col style>` nên Excel áp cho ô mới); bỏ vòng `eachRow`. Thêm `dataValidations` dạng danh sách cho cột enum (`employment_type`, `kind`)
  và `views: [{ state: 'frozen', ySplit: 1 }]`. Riêng `BM-10` cần cột số — xem LB3-06 (kiểu ô phải theo cột, không áp `@` cho tất cả).
- **Test/mutation:** spec đọc lại xlsx bằng ExcelJS, kiểm `sheet.getColumn(1).numFmt === '@'`; ghi thêm số `123` vào ô `A6` rồi kiểm style ô
  là text. Mutation: xóa dòng 69 hôm nay **không** làm test nào đỏ — đó là lỗ hổng phủ.

### LB3-06 — `BM-10` chưa đạt "chuẩn thực tế doanh nghiệp": không tiêu đề, tiêu đề cột tiếng Anh máy, tiền là text, không dòng tổng

- **Mức:** Required (tiêu chí nghiệm thu trực tiếp của Owner — `QĐ-111as`, DECISIONS Q10 "không làm qua loa").
- **File:dòng:** `budgets/proposal/budget-proposal-template.policy.ts:11` (`title` khai nhưng **không nơi nào dùng**: `workbookOf`
  `import-template.service.ts:59-78` và `guideRowsOf` `import-template.policy.ts:28-41` không đọc `definition.title` — điều này đúng cho mọi kind);
  `:14,22,30,38,46,54,62` (header `software`, `monthly_price_vnd`, `amount_vnd` … cho một biểu mẫu **người đọc**, không parser nào đọc);
  `import-template.service.ts:69` ép `numFmt '@'` cho cả `seats`, `monthly_price_vnd`, `amount_vnd` ⟹ không SUM/không công thức được.
- **Kịch bản:** trưởng phòng mở file: sheet đầu không có tên biểu mẫu `BM-10`, không có ô phòng ban/Cost Center/năm ngân sách/người lập/ngày lập,
  tiêu đề cột snake_case, cột tiền là chuỗi nên Excel cảnh báo "Number stored as text" và không có dòng _Tổng cộng_ để đối chiếu với "số tiền
  đề nghị" phải nhập ở màn nộp (QT §4.4). Finance tải về lưu làm căn cứ chốt số: file không tự nói nó là của phòng nào, năm nào.
- **Căn cứ:** `QĐ-111as`; `QĐ-111ab` + QT §4.4 ("phần giải thích nằm trong file"); BRD dòng 376 (file mẫu gửi kèm số liệu nền: quyền/thuê bao
  đang chạy × giá tháng, seat, cam kết chạy sang năm sau); `QĐ-97d`/`QĐ-112e` (giá chưa thuế — mẫu đã đúng).
- **Cách sửa (giữ trong khuôn `QĐ-111ab`, **không** thêm Renew/Change/New/Cancel hay xếp hạng):**
  1. `ImportTemplateColumn` thêm `label` (tiêu đề hiển thị) và `kind: 'text' | 'integer' | 'vnd' | 'date'`; kind có parser giữ `key` làm
     tiêu đề (đọc lại được), `budget-proposal` dùng `label` tiếng Việt: _Phần mềm · Gói · Số seat · Đơn giá/seat/tháng (VND, chưa thuế) ·
     Số tháng · Thành tiền (VND) · Lý do cần_.
  2. Cột `integer`/`vnd` là số với `numFmt '#,##0'`; `Thành tiền` là công thức `=C{r}*D{r}*E{r}` (ExcelJS `{ formula, result }`), thêm dòng
     _Tổng cộng_ `=SUM(...)` và ghi chú "Tổng cộng = số tiền đề nghị nhập ở màn nộp".
  3. Ghi `definition.title` vào dòng 1 sheet _Hướng dẫn_ và `workbook.title`; với `BM-10` thêm khối thông tin trên sheet dữ liệu hoặc một sheet
     _Thông tin_: Phòng ban, Mã Cost Center, Năm ngân sách, Người lập, Ngày lập (ô trống để điền).
  4. Một cột tùy chọn "Seat/giá đang dùng (theo số liệu nền)" giúp Finance so với số liệu nền — chỉ là thông tin trong file, hệ thống không đọc.
  5. Tên file `BM-10-de-nghi-ngan-sach.xlsx` (xem LB3-16); `formats: ['xlsx']` (LB3-01).
- **Test/mutation:** spec mở xlsx bằng ExcelJS: ô tiêu đề chứa `BM-10`; ô `F2` có `formula`; dòng tổng có `SUM`; kiểu ô `seats` là số. Mutation:
  bỏ công thức ⟹ đỏ.

---

## Optional

### LB3-07 — D-B6: `COST_STATEMENT` vẫn nằm trong hợp đồng API nhận mới (đã bị chặn lúc chạy)

- **File:dòng:** `catalog/contract/contract.dto.ts:95` (enum `documentPurpose` của `POST /documents`), `catalog/contract/contract.policy.ts:20,35`
  (`DocumentPurpose`, `PURPOSE_ROLES.COST_STATEMENT: ['FINANCE']`), `contract.policy.spec.ts:38,47,75`; OpenAPI còn 4 chỗ `COST_STATEMENT`.
- **Hậu quả thật:** **không** có tệp sao kê mới nào được lưu: `document.service.ts:85` gọi `assertPurposeAvailable` (`contract.policy.ts:57-59`) ⟹
  `COST_STATEMENT` không thuộc `ATTACHES_TO_CONTRACT`/`ATTACHES_TO_SIGNER` ⟹ 409 `DOCUMENT.PURPOSE_NOT_AVAILABLE`. Vậy về hiệu lực **không trái
  `QĐ-111y`**; D-B6 nói "không mất gì" là đúng (thậm chí mạnh hơn D-B6 ghi). Còn lại hai lệch: OpenAPI vẫn quảng cáo giá trị cho FE, và
  thông điệp "cannot be stored **yet**" ngụ ý sẽ có — trái `US-04-04` AC-11 (bỏ) và PLAN PL-3.1.
- **Cách sửa:** giữ phương án B của D-B6 nhưng chuyển thành mục bắt buộc của chat điều phối sau PI-1 (lane A): bỏ khỏi `documentPurpose`,
  `DocumentPurpose`, `PURPOSE_ROLES`, sửa spec; giữ giá trị enum Prisma (`catalog.prisma:510`) để đọc bản cũ. **Test:** HTTP `POST /documents`
  `purpose: COST_STATEMENT` ⟹ 422 `VALIDATION_ERROR`.

### LB3-08 — Quyền tải mẫu khai tập trung ở `policies`, không do module sở hữu import khai

- **File:dòng:** `policies/public/policies.types.ts:17-23` (`IMPORT_TEMPLATE_ROLES`) song song với `@RequireRoles` của route upload ở từng
  module. Hôm nay khớp (SUPER_ADMIN ↔ `/employee-imports`; IT_ADMIN ↔ seat/usage/license-keys; MANAGER+FINANCE ↔ `BM-10` theo SPEC), nhưng hai
  nguồn sự thật sẽ trôi khi vai của một import đổi.
- **Cách sửa:** `ImportTemplateDefinition.roles` do module đọc file khai; `policies` giữ `IMPORT_TEMPLATE_KINDS` (cần cho enum OpenAPI).
  **Test:** spec mỗi module so `definition.roles` với metadata `RequireRoles` của controller upload.

### LB3-09 — Hai nguồn cùng khai một `kind` không bị phát hiện

- **File:dòng:** `import-template.service.ts:43-46` (`.find` lấy cái đầu). **Cách sửa:** đếm theo `kind`, trùng ⟹ `ImportTemplateDefinitionError`
  (500 — lỗi wiring). **Test:** unit hai nguồn cùng `employees` ⟹ ném.

### LB3-10 — Dòng ví dụ nằm trong sheet dữ liệu có thể bị nhập thật

- **File:dòng:** `employee-import-template.policy.ts:68-72` (NV0101–NV0103, phòng `P-ENG`), `license-key-template.policy.ts:21`
  (`MAU-0001…` hợp lệ với `SHAPE`), seat `:49-52`. Nếu công ty có phòng `P-ENG`/mã `NV0101`, xem trước báo VALID và xác nhận sẽ tạo người giả;
  khóa `MAU-…` vào kho. Ghi chú "xóa trước khi nhập" chỉ ở sheet _Hướng dẫn_.
- **Cách sửa:** tô nền + chú thích ô (ExcelJS `note`) cho dòng ví dụ ở sheet _Dữ liệu_; dùng tiền tố không thể trùng thật như `VD-0001` cho mã và
  ghi chú đầu tiên của _Hướng dẫn_ là "Xóa các dòng ví dụ (nền vàng)". Với khóa: kết hợp LB3-02.

### LB3-11 — Hướng dẫn chưa nói cách mở/lưu CSV cho máy Việt Nam

- Máy `vi-VN` có dấu thập phân `,` nên dấu phân cách danh sách thường là `;` ⟹ nhấp đúp CSV dấu `,` có thể dồn một cột (cần kiểm trên máy
  vi-VN); "Save as CSV" thường (ANSI) làm hỏng dấu tiếng Việt, và `readEmployeeFile`/`readSeatFile` giải mã `utf8` **không** fatal
  (`employee-import-file.policy.ts:30`, `seat-baseline-file.policy.ts:30`) ⟹ họ tên thành `�` mà không báo lỗi (usage thì từ chối nhờ
  `TextDecoder fatal`).
- **Cách sửa:** ghi chú chung cho mọi mẫu CSV: "Mở bằng Data › From Text/CSV, chọn UTF-8; khi lưu chọn _CSV UTF-8 (Comma delimited)_". (Sửa
  giải mã fatal cho employee/seat là việc ngoài PL-3, ghi lại cho chủ module.)

### LB3-12 — Spec file nhân sự ghim danh sách cột bằng literal thay vì `EMPLOYEE_COLUMNS`

- **File:dòng:** `employee-import-template.policy.spec.ts:47-55,56-61`. Thêm một cột **tùy chọn** vào `EMPLOYEE_COLUMNS` ⟹ mẫu thiếu cột mà spec
  vẫn xanh. **Cách sửa:** `toEqual([...EMPLOYEE_COLUMNS])` như spec seat (`seat-baseline-template.policy.spec.ts`), và export cột bắt buộc từ
  `row-validation` để so.

---

## Nit

- **LB3-13** `import-template.policy.ts:11` — BOM viết bằng ký tự vô hình (`'\xEF\xBB\xBF'` trong nguồn); editor có thể xóa mà không ai thấy.
  Dùng `'﻿'`.
- **LB3-14** `vendor-import-template.policy.ts:28` — `USAGE_TEMPLATE_COLUMNS.lastActivityDate ?? 'last_active_date'`: nhánh `??` chết (hằng ngay trên
  đã đặt); khai `USAGE_TEMPLATE_COLUMNS` với kiểu hẹp để bỏ fallback.
- **LB3-15** Hằng dữ liệu mẫu đặt tên `*-template.policy.ts` (đuôi `.policy` dành cho luật thuần); `policies/initial/` đã dùng `pol-*.types.ts` cho
  dữ liệu. Cân nhắc `*-template.types.ts` cho nhất quán (kiểm bảng đuôi file ở `docs/rules/module-structure.md`).
- **LB3-16** Tên file `mau-<kind>.<ext>` (`import-template.policy.ts` `templateFileName`): người dùng thấy `mau-usage-csv.xlsx` (đuôi `csv` trong tên
  file xlsx) và `mau-budget-proposal.xlsx`. Gợi ý tên do định nghĩa khai: `mau-nhan-su.xlsx`, `BM-10-de-nghi-ngan-sach.xlsx`. Ghi chú: thư mục
  `data-import/seat-baseline-import/` đã đúng **25/25 file** — file kế tiếp phải tách nhóm.

---

## Phần đúng đã kiểm

- **Đủ loại import:** parser file thật ở `d083bf32` = nhân sự (CSV + xlsx), seat (CSV), usage (CSV/JSON), khóa K4 (danh sách JSON), dòng phiên bản
  ngân sách `POST /budget-versions/{id}/imports` (CSV) — loại cuối **bị xóa ở BG-2** (SPEC:446, `line-import.service.ts`), nên không có mẫu là
  đúng; `/ai-usage-batches` là JSON của collector, không phải file người soạn. `budget-proposal` là biểu mẫu `BM-10` (không parse) đúng SPEC.
  Bước 2–3 khởi tạo (danh mục, hợp đồng/thuê bao) chưa có import ⟹ chưa có mẫu, đúng `FR-9.3` "lát sau".
- **Không mẫu sao kê:** `IMPORT_TEMPLATE_KINDS` không có `bank-statement`; HTTP spec ⟹ 422; spec `BM-10` cấm "sao kê"/"usd".
- **Cột khớp parser:** nhân sự 7 cột = `EMPLOYEE_COLUMNS`, bắt buộc 4 = `REQUIRED_COLUMNS` (`employee_code, full_name, employment_type,
  hire_date`); seat = `SEAT_COLUMNS`, bắt buộc = `REQUIRED_SEAT_COLUMNS`; enum `STAFF|CONTRACTOR|FREELANCER|INTERN` và `PERSONAL` đúng; trần
  1.000 dòng = `MAX_DATA_ROWS`/`MAX_KEYS_PER_BATCH`; dạng khóa "8–128 ký tự chữ, số, `- _ . = + /`" = `SHAPE`; ngày `YYYY-MM-DD` = `isBusinessDate`;
  usage mô tả `DD/MM/YYYY`/`MM/DD/YYYY` khớp `dayOf`; alias tiêu đề tiếng Việt (`ma_nhan_vien`, `ho_ten`, `email`) có thật trong `COLUMN_ALIASES`.
- **Tiền và thuế:** VND chỉ chữ số, chưa thuế — khớp `QĐ-97d`/`QĐ-112e`; ví dụ `6 × 375.000 × 12 = 27.000.000`, `20 × 180.000 × 12 = 43.200.000`
  có spec cộng nhân; "dùng lâu dài tính đủ 12 tháng" khớp khoản cam kết 12 × giá tháng.
- **Dữ liệu ví dụ:** tên người giả, miền `congty.example` (TLD dành riêng RFC 2606), khóa `MAU-…`; không có dữ liệu thật/nhạy cảm; seat dùng lại
  đúng người của mẫu nhân sự (nhất quán).
- **CSV:** BOM UTF-8 + CRLF, trích dẫn RFC 4180 (`quoted` bọc `"`, `,`, CR/LF và nhân đôi `"`); `parseCsvRows` bỏ BOM (`core/csv.ts:146`).
  CSV/formula injection: nội dung là hằng trong code, không ô nào bắt đầu bằng `= + - @` (đã soát mọi `sampleRows`); xlsx ghi chuỗi nên không
  công thức nào chạy.
- **HTTP/bảo mật:** `kind`/`format` qua `z.enum` + `strictObject` ⟹ 422; `Content-Type` đặt rõ (`text/csv; charset=utf-8`, xlsx MIME);
  `Content-Disposition` qua `attachmentDisposition` (RFC 6266/5987); `@RequireRoles` + kiểm theo kind ⟹ 403 `AUTHORIZATION.FORBIDDEN`;
  `MANAGER` lấy từ vai **hiệu lực** của principal (chỉ trưởng phòng đang làm); định nghĩa hỏng ⟹ 500 không lộ thành lỗi người gọi; mô tả OpenAPI
  của route **không** chứa "QĐ-" (đã soát `openapi.json`). Kích thước file vài KB, dựng theo yêu cầu.
- **Kiến trúc:** `ImportTemplateContributions` ở `policies/public/policies.extension-points.ts`; module nhẹ `policies-template-facade.module.ts`
  để T4–T6 bind không nạp cả thư viện; thứ tự tầng `tiers.cjs` (policies T3 < licensing T4 < budgets/data-import T5 < usage T6) đúng chiều;
  mỗi listener có `static readonly binds` và `add` trong `onModuleInit`; không module nào đọc bảng của module khác; cross-module chỉ qua `public/`
  và `*.module.ts` (spec white-box được phép); README bốn module + `policies` cập nhật điểm mở/người đăng ký; thư mục ≤ 25 file
  (`employee-import` 24 file, `seat-baseline-import` 25, `import-template` 7). Thêm `PUBLIC_CONTRACT_EXPORTS` ở gate là bổ sung có lý do, không nới.
- **Test:** không `skip`/`only`, không nới assertion cũ; HTTP spec 21 ca (401, 6 ca 200 xlsx+csv, 7 ca 403 chéo, EMPLOYEE/SPENDING_APPROVER, 422
  kind/format); không phụ thuộc ngày chạy (seat `recordedOn` cố định). Không thấy test nào CI sẽ đỏ từ đọc tĩnh — **chưa chạy lại**; HANDOFF
  ghi `test:gates` 16 suite/335 xanh ở `df3a8933`.

## Mutation đề xuất

1. Spec seat đổi thành `it.each(['xlsx','csv'])` đọc lại bằng `readSeatFile` ⟹ đỏ `FILE_NOT_TEXT` hôm nay (chứng minh LB3-01); sau sửa, HTTP
   `seat-baseline?format=xlsx` ⟹ 422.
2. Spec khóa gửi **mọi** dòng CSV (kể cả header) vào `judgeBatch` ⟹ 4 rows, có `license_key` (LB3-02).
3. Spec usage thay `readCsvReport` bằng `parseReport` không khai cửa sổ ⟹ `WINDOW_REQUIRED`; có cửa sổ ⟹ 0 lỗi (LB3-03).
4. Xóa `import-template.service.ts:69` (`numFmt '@'`) ⟹ hôm nay mọi spec vẫn xanh: thêm spec kiểu ô cấp cột rồi mutation phải đỏ (LB3-05).
