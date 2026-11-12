# SPEC v2.1 — gói feedback FE + `QĐ-111` (sau bug-fix và MF-2/MF-3)

> **Trạng thái:** `draft v2.1 — chờ Owner duyệt` (13/11/2026). Chưa code. Bản v1 (11/11) bị thay toàn bộ ở v2.
>
> **Pin:** BE `feat/mf2-mf3` = `b71ed330` (đã gồm `origin/dev` `4f1c510d`); chạy **sau** [SPEC bug-fix v1.2](../be-bugfix-2026-11-12/SPEC.md) và
> [SPEC MF-2/MF-3 v2.3](../mf2-mf3-2026-11-10/SPEC.md) (Owner giữ thứ tự, P-11). Docs: `Docs main @ 373bb6b (QĐ-110 + QĐ-111 synced 13/11/2026)`.
>
> **Nguồn luật** (thứ tự ưu tiên): [OWNER-REVIEW.md](OWNER-REVIEW.md) (R-24…R-53, B-1…B-7, C-1…C-4, S-1…S-5 — có thẩm quyền) ⟹ Docs
> `373bb6b` (BRD 4.12, QT _Quy trình và chính sách theo main flow_ 1.9, US 0.16, `Decisions/project-decisions.md`) ⟹
> [QD-111-DRAFT.md](QD-111-DRAFT.md) (`QĐ-111a…bi`, R-1…R-23) ⟹ [SYNC-BRIEF §7.1](SYNC-BRIEF.md) ⟹ [QD-110-DRAFT](../mf2-mf3-2026-11-10/QD-110-DRAFT.md).
>
> **v2.1 so với v2** (13/11, theo [REVIEW-SPEC-ARCH](REVIEW-SPEC-ARCH.md) + [REVIEW-SPEC-BIZ](REVIEW-SPEC-BIZ.md)): `OWNER-REVIEW` là nguồn
> luật, §9 chỉ còn câu thật sự mở. **Tiền:** giữ snapshot VND đồng nhất (`SAME_CURRENCY`, tỷ giá 1) + sửa đổi ADR-0007, không nới CHECK (S-1);
> phạm vi FX sửa theo grep thật; dự kiến cuối năm theo R-37; sàn điều chỉnh = dự kiến cuối năm, 4 loại điều chỉnh, tạo bản ghi ngân sách từ
> điều chỉnh (R-40, R-48, C-1); tự cắt thời hạn theo hợp đồng + đếm tháng đã bắt đầu (R-38, R-39); _Dùng lâu dài_ lưu số năm sau (R-46); khoản
> 01/01 theo dòng còn hiệu lực; hóa đơn có số lượng + đơn giá gốc (R-44); `SBF-07a` ghi phần đã chi khi có chứng từ (R-45); hóa đơn `K1` sau
> điều chuyển vào phòng mới (R-51); nhãn _Kỳ k_ (R-50); _tăng giá đã biết_ chỉ phần tăng (R-52). **`SM-1` vào đợt, trước RV-1** (B-2), có đủ
> API/dữ liệu/test. Xóa route dòng/quý/Trần phòng (B-6). `nextYearBudget` chỉ Người duyệt chi + Finance (S-3). Nhịp nhắc B-4, B-7. Module
> `policies` T3 đồng ý (B-3, S-2). Kiến trúc: comm `SET DEFAULT`, mọi đường tạo ứng dụng đặt nhóm (MAJ-7); khóa `budget_cycles` trước khóa năm
> (MAJ-10); phân trang (MAJ-11); xóa ảnh sau commit (MAJ-12); enum `_values` (MAJ-4); gate cuối gói (S-5). Seed ngày tương đối + 15 kịch bản
> hội đồng (M-16). Bộ test số §8.
>
> **Tài liệu nền** (chỉ để hiểu hiện trạng/lý do): [DECISIONS](DECISIONS.md) · audit [F1](F1-USAGE.md)–[F4](F4-BUDGET-REQUESTS-MISC.md) ·
> research [R8](R8-SOFTWARE-INTAKE-TAXONOMY.md)–[R15](R15-CROSS-YEAR-COMMITMENTS.md) · nội dung seed chính sách
> [POLICY-SEED-DRAFT](POLICY-SEED-DRAFT.md). Khi báo cáo khác luật, **luật thắng**.

## 1. Mục tiêu và điều kiện xong

**Mục tiêu:** BE đủ API cho FE nối 11 màn IT Admin, luồng xin phần mềm, Request _Thời gian dùng_, mua và chứng từ, ngân sách năm `MF-4` viết
lại, seat-tháng `K2`, rà soát/điều chỉnh trong năm, thư viện chính sách + checklist + xác nhận đã đọc, hồ sơ cá nhân, usage — đúng nguồn luật ở
đầu file. **Mỗi gói giao = API BE + tài liệu API FE** (`D:\FPT\FALL2026\Docs\Figma UI-UX\API-Integration\`) + `pnpm openapi:export`; không code FE.

| #   | Điều kiện xong (kiểm được bằng test/HTTP)                                                                                                                                                                                                                                                                                                                                                          | Gói                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| S1  | Không còn bảng tỷ giá trong luồng: giá gói, Request, kiểm ngân sách, khoản 01/01 đều VND; snapshot ghi đồng nhất (tỷ giá 1, `SAME_CURRENCY`) nên CHECK/trigger hiện có vẫn đúng; ADR-0007 có bản sửa đổi; route tỷ giá đã xóa; dữ liệu ngoại tệ cũ quy một lần (làm tròn nửa ra xa 0), giá gốc lưu có cấu trúc                                                                                     | FX-1, FX-2             |
| S2  | Request: `K1` 1–9 tháng, `K2`/`K5` 1–12 hoặc _Dùng lâu dài_, `K4` không hỏi; nhân sự có thời hạn **tự cắt** tại ngày hết hợp đồng, không được _Dùng lâu dài_, đếm **mỗi tháng đã bắt đầu**; cam kết = giá tháng × tháng, chưa thuế, tách năm nay/năm sau; số năm sau **lưu lúc duyệt chi cho cả _Dùng lâu dài_** (theo dòng với Request nhóm); GH-2 = 10 Request cấp mới đã gửi/tuần lịch, GH-3 bỏ | RQ-1, RQ-2             |
| S3  | Hết _Thời gian dùng_: nhắc T−7 rồi hệ thống mở thu hồi đầu ngày sau ngày kết thúc; Request tiếp tục theo tháng được duyệt trước hạn ⟹ giữ seat, dời hạn + lịch nhắc                                                                                                                                                                                                                                | RQ-3                   |
| S4  | 01/01: khoản cam kết = tổng số năm sau đã lưu của **dòng còn hiệu lực sau 31/12** (có thời hạn) hoặc 12 × giá tháng VND hiện hành (lâu dài); duyệt chi khi năm sau đã có ngân sách ⟹ cảnh báo mềm (chỉ Người duyệt chi + Finance thấy số); nhắc 01/12 rồi mỗi Thứ Hai khi năm sau chưa có ngân sách được duyệt                                                                                     | XY-1                   |
| S5  | Danh mục: một lệnh tạo ứng dụng + gói; ô _Loại_ = nhóm chức năng (vắng ⟹ _Khác_); _Liên lạc_ ⟹ luật chặn usage; nhạy cảm để trống được; mô hình giá suy theo B-5; trùng ⟹ 409 kèm mục đã có                                                                                                                                                                                                        | CT-1                   |
| S6  | Xin phần mềm: case B trùng danh mục ⟹ 409 `ACCESS_REQUEST.SOFTWARE_IN_CATALOG` kèm mục; case B rút gọn khi ứng dụng có, gói chưa; gắn danh mục có tick "thêm vào danh sách phòng"; IT tạo trùng ⟹ gắn vào mục đã có                                                                                                                                                                                | IN-1                   |
| S7  | Màn IT Admin: hàng cấp theo người + tự nhận việc; "Cấp" chỉ Request đã duyệt của gói; kho đếm theo kiểu cấp; gần/đã hết hạn theo điểm điều chỉnh, `K4` vĩnh viễn không vào; người giữ + tác vụ thu hồi; phiếu SaaS có phòng/tiêu đề; checklist cấp `K1`                                                                                                                                            | IA-1, IA-2, K1-GR      |
| S8  | Hợp đồng chỉ liên kết thuê bao `K2`/`K4`, không ô loại, danh sách tìm/lọc/phân trang                                                                                                                                                                                                                                                                                                               | CO-1                   |
| S9  | Usage: tổng hợp ngày hoạt động + ngày có dữ liệu, theo người chỉ mã NV, token chỉ ở chi tiết; phạm vi phòng phụ trách (lọc list ngoài phạm vi ⟹ rỗng, id ngoài phạm vi ⟹ 404); lịch sử import + cảnh báo file trùng; IT đẩy sớm `G3`/`G4` _Theo dõi_ ⟹ _Cần xem xét_                                                                                                                               | US-1, US-2             |
| S10 | Mua và chứng từ: IT nộp hóa đơn + yêu cầu tiền (nguồn tiền, VND thực bị trừ, **số lượng, đơn giá gốc**, tệp); nhãn tự suy _Mua mới_/_Kỳ k/N_/_Kỳ k_ (lâu dài)/_Gia hạn_ + tháng kỳ; Finance ký xuất tiền hoặc trả lại có lý do; thực chi theo tháng kỳ dịch vụ, `K1` vào phòng của người giữ tại tháng kỳ; Finance không còn ghi thẳng hóa đơn (B6); cờ _kỳ chưa có hóa đơn_                       | PI-1, PI-2             |
| S11 | Sai lệch: `SBF-11a` chỉ khi lệch số lượng hoặc đơn giá theo tiền gốc (chênh VND do tỷ giá/phí thẻ vào thẳng thực chi); `SBF-08` quyết định trên phát hiện tài khoản nhà cung cấp; `SBF-07a` _báo nhầm_ / _ghi phần đã chi_ (có chứng từ) / _đóng ở mức báo cáo_; không có sao kê                                                                                                                   | RC-1, RC-2             |
| S12 | `MF-4`: kỳ _Nháp_ → _Mở_ → khóa ở hạn nộp; không Trần phòng; `BM-10` = file + số tiền + ghi chú; phiên bản = cơ sở (điền sẵn số chạy sang) + dự phòng + ≥ 1 file, không quý, cờ đỏ; phòng không nộp ⟹ phiên bản từ số liệu nền + cờ; Người duyệt chi chỉ _Duyệt_/_Trả về_; route dòng `BM-10`/quý/Trần phòng **đã xóa**                                                                            | BG-1, BG-2             |
| S13 | Seat-tháng `K2`: phòng chịu seat-tháng theo phòng của người giữ **tại từng ngày** (chia theo ngày khi đổi phòng); cam kết `K2` giảm dần theo seat-tháng; dòng _Chưa phân bổ — kho_ = hóa đơn kho − seat-tháng đã phân bổ                                                                                                                                                                           | SM-1                   |
| S14 | Trong năm: Finance chốt số tháng (ảnh chụp bất biến, đèn, dự kiến cuối năm theo R-37), rà soát quý có giải trình, Finance ký; cảnh báo 80/100 % một lần mỗi lần vượt; điều chỉnh 4 loại do Finance lập, Người duyệt chi quyết, sàn = dự kiến cuối năm; kiểm ngân sách đọc ngân sách hiệu lực                                                                                                       | RV-1, RV-2, RV-3, AD-1 |
| S15 | Thư viện chính sách: soạn/xuất bản (hiệu lực ngay, căn cứ bắt buộc), sao chép thành nháp, vai áp dụng, xác nhận lại tùy chọn; không tạo chính sách mới (R-42); `GET /me` trả chính sách chưa xác nhận; checklist Có/Không bắt buộc ở 7 loại bước, có _Không_ ⟹ không Duyệt được; lưu câu trả lời + số phiên bản                                                                                    | PL-1, PL-2             |
| S16 | `GET /import-templates/{kind}` trả file mẫu (xlsx + csv) khớp parser — test đọc lại chính file mẫu ra 0 lỗi; không có mẫu sao kê                                                                                                                                                                                                                                                                   | PL-3                   |
| S17 | Hồ sơ cá nhân: ảnh (png/jpg/webp ≤ 1 MB, kiểm chữ ký tệp, xóa được, link có hạn) + số điện thoại công việc; không hiện ở usage/phát hiện; Super Admin gỡ ảnh có lý do; _đã nghỉ việc_ ⟹ xóa cả hai (object xóa sau commit)                                                                                                                                                                         | PF-1                   |
| S18 | Quick check xanh mỗi task; `pnpm test:gates` + `pnpm rules:check` xanh cuối mỗi gói (S-5); full test ở pha cuối chung; `test:flows` thêm `MF-4` mới + mua/chứng từ; tài liệu API FE + seed demo ngày tương đối + 15 kịch bản hội đồng                                                                                                                                                              | mọi gói + Z2           |

## 2. Hiện trạng đã kiểm trong code (12–13/11, BE `b71ed330`)

- **Tiền/tỷ giá:** bảng `exchange_rates` nhập tay (`prisma/models/finance.prisma`), route `GET/POST /exchange-rates` (`finance/exchange-rate/`),
  `PUT /reporting-currency` (`operating-parameters/reporting-currency.controller.ts`). Thuê bao giữ ảnh chụp tỷ giá; CHECK
  `subscriptions_snapshot_whole` (snapshot đủ hoặc vắng) và `subscriptions_active_complete` (thuê bao `ACTIVE` ⟹ `price_rate IS NOT NULL`)
  (`20261020150000_catalog_subscriptions/migration.sql:51-57,74-80`), trigger `subscriptions_price_in_reporting_currency`
  (`20261022100000_reporting_currency_integrity/migration.sql:70-87`); ADR-0007 (Accepted) đòi mọi tiền mang số gốc + tỷ giá + số quy đổi,
  làm tròn nửa ra xa 0; enum nguồn tỷ giá có `SAME_CURRENCY` (`prisma/models/catalog.prisma:312`). `FinanceApi.snapshotMoney`: **5 lời gọi ở
  3 file** — `catalog/subscription/subscription-pricing.service.ts:40,50`, `requests/spend/budget-check.service.ts:287`,
  `requests/year-start-commitments/year-start-commitments-batch.service.ts:149,154`; nơi khác chỉ gọi `findCurrency`/`parseMoney` (giữ).
  `RATE_MISSING` ở **13 file** `requests` (`access-request/*` 4, `request-view/access-request-query.service.ts`, `spend/*` 5,
  `spend-approval/spend-decision.service.ts`, `spend-effects/spend-effects.service.ts`, `status/rules/status-rules-budget-check.policy.ts`) và được
  **lưu** ở `access_requests.one_step_blocked_reason` ⟹ dòng cũ phải đọc được. Job 01/01 bỏ qua `NO_RATE`/`CURRENCY_MISMATCH`;
  `src/core/money/convert.ts` là ngoại lệ R7 duy nhất.
- **Request:** `access_requests.term_months` (NULL = không thời hạn), `next_year_amount_minor`, `expected_end_date` có sẵn; dòng nhóm có
  `access_request_line_amounts` (khóa `request_id, employee_id, budget_year`); body gửi còn `expectedEndDate` (`access-request.dto.ts:9-24`); trần
  12 tháng ở `src/core/term-limit.ts` (`TERM_LIMIT_MONTHS` dòng 11, `effectiveEndOf` dòng 59); ngày kết thúc thật tính ở
  `licensing/provisioning/tasks/provisioning-grant-writer.service.ts:211`; giá tách năm ở `requests/access-request/pricing.policy.ts:120-191`;
  GH-2/GH-3 ở `requests/request-limits/` (GH-3 còn ở `requests/renewal-request/renewal-request.dto.ts:29` `manyPaidSoftwareReason`); quyết định
  nhu cầu/duyệt chi chỉ `APPROVE|REJECT`; gửi lại chỉ cho Request một bước (`request-intake/request-resubmission.service.ts:23`). Preview của nhân
  viên **không bao giờ** có số ngân sách (`request-submission/request-preview.dto.ts:15,88`).
- **Hết hạn/tiếp tục:** nhắc T−7 (`licensing/expiry/expiry.policy.ts:4`), IT tự mở thu hồi từ hàng đợi; Request tiếp tục nhận `newEndDate` hoặc
  `extensionMonths` (`renewal-request.dto.ts:19-33`).
- **Hóa đơn (B6):** Finance ghi thẳng `POST /budget-commitments/{id}/invoices`; `Invoice` bắt buộc `commitmentId`, bất biến (INV-05); thực chi
  `invoice.repo.ts:160` `spentOf` **inner join** `budget_commitments` theo năm cam kết.
- **Ngân sách:** khóa hiện có theo **một** Cost Center + năm (`budgets/budget/budget-year-lock.repo.ts:1-20`, thứ tự: dòng đề xuất → dòng phiên
  bản → khóa năm); kỳ mở ngay khi tạo; B2 (`department-ceilings`, `publish`); route dòng `BM-10`/phiên bản (`GET /budget-proposals/{id}/lines`,
  `GET/POST /budget-versions/{id}/lines`, `PUT …/lines/{position}`, `POST /budget-versions/{id}/imports`, `GET /budgets/mine/lines`), trường
  `quarters` (`budgets/budget/budget.dto.ts:120-157,298`), `BudgetQuartersMismatchError` (5 file), `quartersMatch*` (`budget.policy.ts`,
  `version-figures.service.ts`); phiên bản từ số liệu nền chỉ khi không có trưởng phòng (`budgets/cycle/baseline.policy.ts:169`);
  `PendingSpendContributions` (`budgets/public/budgets.extension-points.ts:25`); cam kết có `applied_minor`, `released_minor`, `seat_monthly_minor`.
- **Danh mục:** `Application` có `comm_*` (3 cột) + `is_communication_service` **NOT NULL không default** + CHECK `applications_communication_flag`
  (`20261020120000_catalog_applications/migration.sql:48-64`), `data_sensitivity` NOT NULL; `CatalogApi.registerInternalSoftware`
  (`catalog/public/catalog.api.ts:206`, gọi từ `requests/assessment/internal-registration.service.ts:62`) không nhận nhóm; `Plan.pricing_model`
  nullable, enum không có "mua một lần" (`PER_SEAT|FLAT_RATE|CONCURRENT|CONSUMPTION|PER_HOST`).
- **Hồ sơ:** `app_users` không có ảnh/SĐT; chỉ API mount object storage (`docs/rules/security-jobs.md:53`), `personnel` chạy cả trong graph CLI
  BM-09 ⟹ không gọi storage trong transaction `LEFT` (`docs/rules/database-business.md:92-93`).
- **Trần 25 file/thư mục:** `budgets/budget/` 25, `requests/spend/` 25, `licensing/provisioning/` 25, `catalog/subscription/` 24 + 3 thư mục,
  `catalog/catalog-entry/` 23 (giảm sau bug-fix), `budgets/version/` 23 ⟹ file mới vào capability mới. `CatalogApi`, `LicensingApi` đã 8 phụ thuộc.

## 3. Luật và bao phủ

| Mã                                                                 | Nơi làm                                                      |
| ------------------------------------------------------------------ | ------------------------------------------------------------ |
| `a`, `b`, R-25                                                     | IN-1 (+ CT-1 cho 409 khi IT tạo trùng)                       |
| `c`                                                                | DS (SPEC MF-2/MF-3) + IN-1 (tick ở `catalog-link`)           |
| `d`, `e`, `f`, `bf`, B-5                                           | CT-1                                                         |
| `g`                                                                | SPEC bug-fix `BUG-B` (vế nghỉ/chuyển: SPEC MF-2/MF-3 `X-IT`) |
| `h`                                                                | RQ-1                                                         |
| `i`, `j`, `k`, R-38, R-39, R-46                                    | RQ-2                                                         |
| `l`, R-13, R-27                                                    | RQ-3                                                         |
| `m`, `o`, `s`                                                      | IA-1                                                         |
| `n`, `p`                                                           | IA-2 (vế khóa `K4` của `p`: SPEC bug-fix B4)                 |
| `q`                                                                | không cần BE (xác nhận: không có ô mật khẩu) — kiểm ở IA-2   |
| `r`, R-53, S-4                                                     | SPEC MF-2/MF-3 `X-IT`                                        |
| `t`                                                                | CO-1                                                         |
| `u`, `v`, `w`, B6, R-44 (hóa đơn), R-50, R-51                      | PI-1                                                         |
| `x`, R-30, C-2                                                     | PI-2                                                         |
| `y`, R-7, R-18, R-29, R-44 (hồ sơ), R-45, C-4                      | RC-1, RC-2 (R-7: không cần BE)                               |
| `z`, `aa`, `ba`, R-11, R-14 (khóa dự phòng kho), R-16              | BG-1                                                         |
| `ab`, `ac`, `ad`, `bb`, B-6                                        | BG-2                                                         |
| `bg` (seat-tháng, phí ân hạn phòng mới), `QĐ-103k`, `QĐ-104c`, B-2 | SM-1                                                         |
| `ae`, `ai`, R-2, R-37, R-5, R-31, R-47, R-52                       | RV-1                                                         |
| `af` (ngưỡng), R-28                                                | RV-2                                                         |
| `af` (đèn)                                                         | RV-1                                                         |
| `ag`, `bh`, R-14 (sàn), R-33, R-36, R-40, R-48, C-1                | AD-1                                                         |
| `ah`, `aj`, R-10, R-17, B-7                                        | RV-3                                                         |
| `ak`, `al`, `am`, R-15, R-46, B-4, S-3                             | XY-1                                                         |
| `an`, R-4, R-23, S-1                                               | FX-1, FX-2                                                   |
| `ao`, `ar`, `bi`, R-34, R-42, B-3, S-2                             | PL-1                                                         |
| `ap`, `aq`, `be`, R-6, R-24                                        | PL-2                                                         |
| `as`                                                               | PL-3                                                         |
| `at`, `au`, `av`, R-22, R-41                                       | PF-1                                                         |
| `aw`, `ax`, R-20                                                   | US-1                                                         |
| `ay`                                                               | US-2 (+ checklist ở PL-2)                                    |
| `az`, R-19, R-35                                                   | K1-GR (cấp); vế thu hồi: SPEC MF-2/MF-3 `K1-CL`              |
| `bc`, `bd`, R-1, R-8, R-9, R-21, R-26, R-32, R-43, R-49, B-1       | SPEC MF-2/MF-3 v2.3                                          |
| R-12, C-3                                                          | không đổi code                                               |
| R-23                                                               | tài liệu API FE: ví dụ tiền VND (`600.000 đ`) ở mọi gói      |
| S-5                                                                | mọi gói (gate cuối gói)                                      |

## 4. Quyết định thiết kế dùng chung

- **D1 — Route bỏ xóa luôn**, không 410, changelog ở `API-Integration/changes/` (Owner 12/11; B-6).
- **D2 — Tiền chỉ VND, snapshot đồng nhất (S-1, BLK-1).** Mọi số tiền mới ghi VND (tiền báo cáo của tổ chức, R-4). Cột snapshot **vẫn ghi**:
  `price_rate = 1`, `price_rate_source = 'SAME_CURRENCY'`, `price_rate_date = price_recorded_on`, `price_reporting_minor = unit_price_minor`,
  `price_reporting_currency = 'VND'` — thỏa `subscriptions_snapshot_whole`, `subscriptions_active_complete` và trigger tiền báo cáo; **không nới
  CHECK**. Response bỏ trường tỷ giá. Làm tròn theo ADR-0007 (nửa ra xa 0). Ghi **bản sửa đổi ADR-0007** "đơn tiền tệ VND theo `QĐ-111an`: snapshot
  luôn đồng nhất, bảng tỷ giá thôi dùng" (task FX-2.5). Bảng `exchange_rates` giữ (không drop), thôi đọc/ghi.
- **D3 — Hóa đơn mua ở `requests`.** Đề nghị IT nộp (có trạng thái) là bảng `purchase_invoices` của capability mới `requests/purchase-invoice/`.
  Khi Finance ký, `requests` gọi `BudgetsApi.recordPurchaseInvoice` ghi **một** dòng `invoices` bất biến (INV-05).
- **D4 — Module mới `policies` ở tầng T3** (B-3, S-2 — đồng ý): thư viện chính sách, xác nhận, checklist quyết định, file mẫu import.
  `requests`/`budgets` (T5), `optimization` (T7) gọi `public/`; `identity-access` (T2) lấy cờ chưa xác nhận cho `GET /me` qua `Contributions` do
  chính nó mở, `policies` bind; module sở hữu parser góp định nghĩa cột qua `Contributions` do `policies` mở. Task đầu PL-1 sửa
  `scripts/arch/tiers.cjs`, bảng tầng (`docs/rules/module-structure.md`, `ARCHITECTURE.md`), `PRISMA_MODEL_OWNER`, `app.module.ts`, ghi bổ sung ADR-0019.
- **D5 — Phần trong năm ở `budgets`:** capability mới `budgets/review/`, `budgets/adjustment/`, `budgets/seat-month/`; `budgets/budget/` đã 25
  file nên chỉ sửa file có sẵn. Số "chạy sang năm sau" lấy qua `Contributions` mới do `requests` bind.
- **D6 — _Thời gian dùng_ dùng cột có sẵn** `access_requests.term_months` (NULL = _Dùng lâu dài_); số năm sau theo dòng ở
  `access_request_line_amounts` (`budget_year = năm sau`); trần theo kiểu cấp ở `src/core/term-limit.ts`.
- **D7 — Checklist lưu ở một bảng** `decision_checklists` của `policies`, cùng transaction với quyết định.
- **D8 — Không tin `departmentId` từ FE**; phạm vi IT Admin = `OrganizationReadApi.getItAdminScope` (R-20). **Lọc list ngoài phạm vi ⟹ rỗng;
  id trên path ngoài phạm vi ⟹ 404** (MIN-9).
- **D9 — Collection (MAJ-11):** mọi `GET` trả nhiều dòng mới theo `API-LIST-DETAIL.1` (`docs/rules/api-contract.md:72`): `page`/`pageSize` (≤ 100)
  hoặc mức tối đa nghiệp vụ có nguồn; schema dòng ≠ schema chi tiết; mảng lồng có `maxItems` (`items[]` hóa đơn ≤ 50, `answers[]` ≤ 30,
  `employeeIds` ≤ 100); test đếm câu lệnh (`test/support/query-count.ts`).
- **D10 — Enum (MAJ-4):** mỗi giá trị enum mới ở migration `…_values` riêng, đứng trước migration/backfill dùng nó; không hoàn tác ⟹ HANDOFF (DB-05).
- **D11 — Thứ tự khóa ngân sách (MAJ-10):** ràng buộc toàn kỳ (tổng ≤ Trần − dự phòng kho, phần chưa phân bổ, _Chuyển_ hai Cost Center) ⟹ khóa
  dòng `budget_cycles` (`SELECT … FOR UPDATE`) **trước** mọi khóa năm của `BudgetYearLockRepo`; _Chuyển_ khóa hai Cost Center theo id tăng dần
  (`lock` đã sắp theo năm). Ghi thứ tự mới vào comment `budget-year-lock.repo.ts`.
- **D12 — Thông báo/sweeper:** task thêm mã thông báo chạm `notifications/public/notifications.types.ts` + `notifications/inbox/inbox.policy.ts`
  (MIN-10); sweeper mới vào danh sách `docs/rules/security-jobs.md` (ADR-0018), nhiều instance an toàn, khóa chống trùng (`eventKey` theo ngày
  hoặc unique) (MIN-11).
- **D13 — Gate (S-5):** cuối mỗi gói `pnpm test:gates` + `pnpm rules:check` (+ `pnpm prisma:validate`); bảng mới thêm `PRISMA_MODEL_OWNER`
  (`test/gates/architecture-boundaries.gate-spec.ts:32`) cùng task.

## 5. Gói

Mỗi gói ghi: luật · API · dữ liệu (expand, không drop) · nơi đặt · test. Task chi tiết ở [PLAN.md](PLAN.md). Bộ test số ở §8.

### FX-1 — Giá gói VND + chuyển đổi một lần (M) · `QĐ-111an`, R-4, R-23, S-1, R-44

| Method · path                                           | Vai      | Thay đổi                                                                                                                                                                                                                |
| ------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST/PATCH /subscriptions`                             | IT_ADMIN | đơn giá nhận **VND** (khác ⟹ 422 `SUBSCRIPTION.PRICE_NOT_VND`); thêm `originalPrice?: { amountMinor, currency }` (giá gốc ngoại tệ có cấu trúc, dùng so khớp hóa đơn R-44); response bỏ `priceRate*`, `priceReporting*` |
| `PUT /access-requests/{id}/assessment` (báo giá case B) | IT_ADMIN | báo giá chỉ VND (+ `originalPrice?`)                                                                                                                                                                                    |

- **Ghi snapshot đồng nhất** (D2) ở `catalog/subscription/subscription-pricing.service.ts` — không gọi bảng tỷ giá.
- **Dữ liệu:** `subscriptions.original_unit_price_minor bigint NULL`, `original_currency char(3) NULL` + CHECK cùng có/cùng vắng. Migration dữ
  liệu **một lần**: điều kiện tiên quyết `RAISE` nếu có tổ chức `reporting_currency <> 'VND'`; giá thuê bao, số tiền Request **chưa duyệt chi**
  (+ dòng nhóm, hồ sơ bổ sung), báo giá đánh giá đang ở ngoại tệ ⟹ VND theo tỷ giá gần nhất đã ghi ≤ ngày migration của tiền tệ đó, làm tròn
  **nửa ra xa 0** (ADR-0007); giá gốc vào hai cột mới; ghi lại snapshot đồng nhất; mỗi dòng giá quy đổi ghi Audit tác nhân _Hệ thống_ (m-16 —
  US-04-05 AC-9: 10 USD × 25.400 = 254.000 đ). Không có tỷ giá ⟹ không đổi, liệt kê HANDOFF. Dòng đã quy đổi trước (cam kết, lần kiểm ngân
  sách, hóa đơn) không đụng. Đếm trước/sau ghi HANDOFF.
- **Nơi đặt:** `catalog/subscription/price/`, `subscription-pricing.service.ts`, `requests/assessment/quote.service.ts`.
- **Test:** unit kiểm tiền tệ + snapshot đồng nhất thỏa CHECK; integration migration trên DB seed (một giá USD có tỷ giá ⟹ VND + Audit, một không có).

### FX-2 — Bỏ quy đổi trong luồng, xóa route tỷ giá (M) · `QĐ-111an`, R-4, S-1

| Method · path                                 | Vai | Thay đổi                                                       |
| --------------------------------------------- | --- | -------------------------------------------------------------- |
| `GET /exchange-rates`, `POST /exchange-rates` | —   | **xóa route** (bảng giữ)                                       |
| `PUT /reporting-currency`                     | —   | **xóa route** (tiền báo cáo cố định VND); `GET` giữ, trả `VND` |
| mọi route trả lỗi `RATE_MISSING`              | —   | bỏ mã khỏi OpenAPI                                             |

- Kiểm ngân sách (`budget-check.service.ts:287`), khoản 01/01 (`year-start-commitments-batch.service.ts:149,154`), xem giá: dùng thẳng số VND.
  `RATE_MISSING`, `NO_RATE`, `CURRENCY_MISMATCH` **thôi ghi**; giá trị đã lưu ở `access_requests.one_step_blocked_reason` vẫn đọc được (mapper hiển
  thị như lý do đã ngừng, không ghi mới). `FinanceApi.snapshotMoney` còn trả snapshot đồng nhất cho cùng tiền tệ; tiền tệ khác ⟹ lỗi lập trình.
  Gỡ `finance/exchange-rate/` khỏi wiring; xóa `src/core/money/convert.ts` khi hết chỗ dùng (+ mục `CORE_PRIMITIVES_OF_ONE_AREA`, gate
  `capability-graph`); **giữ** `src/core/money/rate.ts` (snapshot còn dùng). Không sửa `budgets/version/line-import.service.ts` (bị xóa ở BG-2).
- **ADR:** bản sửa đổi ADR-0007 (D2).
- **Test:** unit `budget-check.policy`/`year-start-commitments.policy` không còn nhánh tỷ giá; mapper đọc lý do cũ `RATE_MISSING`; `pnpm arch:check`.

### RQ-1 — GH-2 theo tuần lịch, bỏ GH-3 (S) · `QĐ-111h`

| Method · path                                                                                                                                                      | Vai           | Thay đổi                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /access-requests`, `POST /access-requests/drafts/{id}/submission`, `POST /group-requests`, `POST /access-requests/preview`, `POST /access-requests/renewals` | mọi tài khoản | GH-2 = tối đa 10 Request **cấp mới đã gửi** trong tuần lịch (Thứ Hai–Chủ nhật, **múi giờ tổ chức** `Asia/Ho_Chi_Minh`) mỗi người thụ hưởng; rút/bị từ chối vẫn tính; ngoại lệ giữ (`QĐ-104b`, `QĐ-108c`, `QĐ-110q`); lỗi `ACCESS_REQUEST.OPEN_LIMIT_REACHED` `details { limit, resetsOn }`; bỏ `manyPaidSoftwareReason` (body, gồm `renewal-request.dto.ts:29`) và `flags.manyPaidSoftware` |

- Tham số `REQUEST_OPEN_NEW_LIMIT` giữ khóa, đổi nghĩa, mặc định 10; `PAID_SOFTWARE_FLAG_THRESHOLD` thôi dùng; cột `many_paid_software*` thôi
  ghi. Giữ miễn trừ `QĐ-110q` của SPEC MF-2/MF-3 MF3-C.3. **Nơi đặt:** `requests/request-limits/`. **Test:** T-RQ1.

### RQ-2 — _Thời gian dùng_, cam kết theo tháng, số năm sau (M) · `QĐ-111i`, `QĐ-111j`, `QĐ-111k`, R-38, R-39, R-46, S-3

| Method · path                                                                                                                        | Vai                                                | Thay đổi                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /access-requests`, `/preview`, drafts, `POST /group-requests`, `POST /access-requests/{id}/supplements`                        | mọi tài khoản                                      | body `termMonths: number \| null` thay `expectedEndDate` (gửi `expectedEndDate` ⟹ 422 schema): `K1` bắt buộc 1–9; `K2`/`K5` 1–12 hoặc `null` = _Dùng lâu dài_; `K4` phải vắng/`null`. Lỗi `ACCESS_REQUEST.TERM_REQUIRED`, `TERM_MONTHS_OUT_OF_RANGE`, `TERM_NOT_ASKED`, **`TERM_LONG_TERM_NOT_ALLOWED`** (nhân sự có thời hạn chọn `null`). Nhân sự có thời hạn: ngày kết thúc suy ra (ngày gửi + N tháng − 1 ngày) sau ngày hết hợp đồng ⟹ **tự cắt** về ngày hết hợp đồng (201, không 422 — `INV-07`, R-38); Request nhóm cắt **từng dòng**. Bỏ mã `TERM_AFTER_CONTRACT_END` |
| `POST /access-requests/preview`, `GET /access-requests/{id}`, `GET /access-requests/{id}/spend-approval`, `GET /spend-approvals`     | người gửi, trưởng phòng / Người duyệt chi, Finance | thêm `cost { currentYear { year, months, amount }, nextYear { from, months, amount, estimate: true } \| null, termCutAt \| null, months }` — chưa thuế; `months` = số **tháng đã bắt đầu** của thời hạn đã cắt (làm tròn lên — R-39); _Dùng lâu dài_ ⟹ `nextYear` = 12 × giá tháng. Người gửi và trưởng phòng chỉ thấy "Từ 01/01: X đ (dự kiến)" — **không** số ngân sách (S-3)                                                                                                                                                                                                |
| `POST /access-requests/{id}/spend-approval`, `POST /spend-batches/{id}/decisions`, `POST /access-requests/{id}/line-spend-decisions` | SPENDING_APPROVER                                  | duyệt chi tính lại theo tháng duyệt (`QĐ-106a`, `QĐ-109e` giữ) và **lưu** số năm sau cho **mọi** Request qua năm: có thời hạn = giá tháng × số tháng thuộc năm sau; _Dùng lâu dài_ = 12 × giá tháng VND lúc duyệt (R-46). Request cá nhân ⟹ `access_requests.next_year_amount_minor`; Request nhóm ⟹ **mỗi dòng** một hàng `access_request_line_amounts` (`budget_year` = năm sau) (M-13)                                                                                                                                                                                      |

- **Luật tính:** tháng k của thời hạn bắt đầu ở (ngày bắt đầu + k − 1 tháng); tháng thuộc năm của ngày bắt đầu của nó; cam kết năm nay = giá tháng ×
  số tháng bắt đầu trong năm nay; năm sau = giá tháng × số tháng bắt đầu trong năm sau; `K4` = giá mua một lần; chưa thuế (`QĐ-97d`). Lúc cấp: ngày
  kết thúc thật = ngày cấp + N tháng − 1 ngày (`provisioning-grant-writer.service.ts:211`), **cắt lại** theo ngày hết hợp đồng; thẻ tác vụ cấp hiện
  `termCutAt`.
- **Dữ liệu:** không cột mới; `expected_end_date` thôi nhận từ body, vẫn ghi từ ngày cấp.
- **Nơi đặt:** `src/core/term-limit.ts`, `requests/access-request/pricing.policy.ts`, `access-request.dto.ts`, `request-facts.service.ts`,
  `group-request/group-request.dto.ts`, `requests/spend-approval/spend-decision-recorder.service.ts`, `group-line-decisions/*`.
- **Test:** T-RQ2, T-R38; HTTP 422 từng mã.

### RQ-3 — Hết _Thời gian dùng_ và Request tiếp tục (M) · `QĐ-111l`, R-13, R-27

| Method · path                                             | Vai             | Thay đổi                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (job) nhắc + hết hạn                                      | hệ thống        | T−7 theo **ngày kết thúc hiện tại** nhắc người giữ, trưởng phòng, IT phụ trách (R-27); **đầu ngày sau ngày kết thúc** không có Request tiếp tục được duyệt ⟹ **hệ thống mở tác vụ thu hồi** nguồn `TIME_LIMITED_EXPIRY`, `created_by_system` (US-03-05 AC-2; m-08); Request tiếp tục đang chờ khi tới hạn ⟹ luật `QĐ-108*` (R-13) |
| `POST /access-requests/renewals`                          | người giữ quyền | body `extensionMonths` (`K1` 1–9, khác 1–12) **hoặc** `longTerm: true` (`K2`/`K5`; nhân sự có thời hạn ⟹ 422 và tự cắt như RQ-2); bỏ `newEndDate`; cửa sổ 30 ngày trước hạn (`QĐ-111l`); không tính GH-2; cam kết tính theo RQ-2 + lưu số năm sau; duyệt trước hạn ⟹ giữ seat, dời ngày kết thúc + lịch nhắc (R-27)               |
| `POST /assignment-expiry-queue/{assignmentId}/revocation` | IT_ADMIN        | giữ (IT mở sớm khi mục đã vào hàng)                                                                                                                                                                                                                                                                                               |

- **Nơi đặt:** `licensing/expiry/` (job, policy), `requests/renewal-request/`, `requests/renewal-apply/`. **Test:** T-RQ3.

### XY-1 — Qua năm (S) · `QĐ-111ak`, `QĐ-111al`, `QĐ-111am`, R-15, R-46, B-4, S-3

| Method · path                                                      | Vai                        | Thay đổi                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------ | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (job 01/01)                                                        | hệ thống                   | khoản `YEAR_START`: Request có thời hạn = tổng số năm sau đã lưu của **các dòng/quyền còn hiệu lực sau 31/12** (người nghỉ, bị thu hồi, rút trước 01/01 ⟹ không cộng — M-13); _Dùng lâu dài_ = 12 × giá tháng VND **hiện hành** (`QĐ-111ak`; số lưu lúc duyệt chỉ dùng cho cảnh báo — R-46); không tra tỷ giá                                            |
| `GET /access-requests/{id}/spend-approval`, `GET /spend-approvals` | SPENDING_APPROVER, FINANCE | thêm `nextYearBudget { year, approved, remaining, remainingAfter, warning }` — `remaining` = ngân sách năm sau đã duyệt (cơ sở + dự phòng) − tổng số năm sau đã lưu của Request đã duyệt chi (gồm _Dùng lâu dài_ — R-46); vượt ⟹ `warning: true`, **vẫn duyệt được**. **Không** trả ở `POST /access-requests/preview` (S-3, `request-preview.dto.ts:88`) |
| (job từ 01/12)                                                     | hệ thống                   | Cost Center chưa có phiên bản năm sau được duyệt ⟹ nhắc Finance + Người duyệt chi **ngày 01/12 rồi mỗi Thứ Hai** tới khi phiên bản được duyệt (B-4); khóa chống trùng `nextYearBudget:<costCenterId>:<ngày>`; 01/01 vẫn `QĐ-30b`                                                                                                                         |

- **Nơi đặt:** `requests/year-start-commitments/`, `requests/spend-approval-view/`, `budgets/year-end/` (job nhắc). **Test:** T-RQ2 (khoản
  01/01), T-XY1, cảnh báo mềm; HTTP preview không có `nextYearBudget`.

### CT-1 — Danh mục: một lệnh, nhóm chức năng (M) · `QĐ-111d`, `QĐ-111e`, `QĐ-111f`, `QĐ-111bf`, `QĐ-111b` (vế IT), B-5

| Method · path                             | Vai      | Thay đổi                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /applications`                      | IT_ADMIN | **một lệnh** tạo ứng dụng + gói: `{ name, vendorName?, homepageUrl?, functionalGroupId?, dataSensitivity?, plan: { name, provisioningType, … } }`; `functionalGroupId` vắng ⟹ nhóm _Khác_ (m-03, US-04-01 AC-7); người gọi = IT phụ trách (bug-fix); `kind` suy (`K5` ⟹ `INTERNAL`, còn lại `SAAS`); mô hình giá suy (B-5); bỏ ô `comm*`; trùng tên chuẩn hóa/tên miền ⟹ 409 `APPLICATION.DUPLICATE` `details.existing { id, name, vendorName, functionalGroup }` |
| `POST /plans`, `PATCH /applications/{id}` | IT_ADMIN | gói trùng trong ứng dụng ⟹ 409 kèm gói đã có; bỏ ô `comm*`; nhạy cảm để trống được                                                                                                                                                                                                                                                                                                                                                                                |
| `GET /plans`                              | IT_ADMIN | lọc `functionalGroupId`, `status`, `search` (phân trang)                                                                                                                                                                                                                                                                                                                                                                                                          |
| `POST/PATCH /functional-groups`           | IT_ADMIN | thêm, đổi tên; nhóm `COMMUNICATION` (_Liên lạc_) và `OTHER` (_Khác_) cố định ⟹ đổi tên/ngừng ⟹ 409 `FUNCTIONAL_GROUP.FIXED`; response `systemKey`                                                                                                                                                                                                                                                                                                                 |

- **Mô hình giá (B-5):** `K1`/`K2` ⟹ `pricingModel = PER_SEAT`; `K4` ⟹ `pricingModel` NULL, thuê bao/kho của gói luôn `kind = PERPETUAL` (mua một
  lần — enum `PricingModel` không có giá trị "một lần", không thêm); `K5` ⟹ `pricingModel` NULL, không giá, không cam kết.
- **Dữ liệu (MAJ-7):** `functional_groups.system_key text NULL` (unique theo tổ chức); seed 7 nhóm cho tổ chức có sẵn + bootstrap cài đặt; ứng dụng
  `is_communication_service = true` ⟹ _Liên lạc_, chưa có nhóm ⟹ _Khác_; **`ALTER … SET DEFAULT false`** cho `comm_person_to_person_messaging`,
  `comm_calls_or_meetings`, `comm_mailbox`, `is_communication_service` (CHECK `applications_communication_flag` vẫn đúng: false = false); thôi ghi
  từ code; `data_sensitivity` nullable. **Mọi đường tạo ứng dụng** đặt nhóm (vắng ⟹ `OTHER`) **trước** `functional_group_id SET NOT NULL`:
  `POST /applications`, `catalog/internal-software-registration`, `CatalogApi.registerInternalSoftware` (case B nội bộ —
  `requests/assessment/internal-registration.service.ts:62`), seed `src/cli/seed/**`, bootstrap `installation`. Kiểm CHECK/trigger nối
  `ApplicationKind` với `ProvisioningType`.
- **Usage:** luật chặn thu usage (`ADR-10`) đọc "ứng dụng thuộc nhóm `COMMUNICATION`" qua `CatalogApi` — hàm mới dùng phụ thuộc **có sẵn**
  `ApplicationFactsService` (`catalog.api.ts:50`), không thêm tham số thứ 9 (MAJ-3).
- **Nơi đặt:** `catalog/catalog-entry/`, `catalog/functional-group/`, `catalog/plan/`, `catalog/internal-software-registration/`;
  `usage/allowlist/`, `usage/vendor-source/`.
- **Test:** unit kiểm trùng (tên chuẩn hóa, tên miền), nhóm cố định, mô hình giá theo kiểu cấp; integration tạo một lệnh rollback khi gói lỗi;
  integration đăng ký phần mềm nội bộ sau `SET NOT NULL` vẫn qua.

### IN-1 — Xin phần mềm case A/B (M) · `QĐ-111a`, `QĐ-111b`, `QĐ-111c` (vế tick), R-25

| Method · path                                         | Vai           | Thay đổi                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /access-requests/proposals` (cửa case B)        | mọi tài khoản | tên chuẩn hóa hoặc tên miền `homepageUrl` khớp ứng dụng đã có ⟹ 409 `ACCESS_REQUEST.SOFTWARE_IN_CATALOG` `details.existing { applicationId, name, plans[] (≤ 20) }`; **case B rút gọn**: `existingApplicationId` + gói muốn xin ⟹ đề xuất chỉ cho gói. Phòng chưa có trưởng phòng ⟹ đứng chờ (SPEC MF-2/MF-3 MF1-X, R-43) |
| `PUT /access-requests/{id}/assessment`, `/completion` | IT_ADMIN      | case B rút gọn: chỉ đánh giá gói (điều khoản, giá, kiểu cấp, `hasAdminConsole` với `K4` — SPEC MF-2/MF-3 P29), không hỏi trường cấp ứng dụng                                                                                                                                                                              |
| `POST /access-requests/{id}/catalog-link`             | IT_ADMIN      | thêm `addToDepartmentList?: boolean` ⟹ `LicensingDepartmentToolsApi.addDepartmentSoftwareFromCatalogLink` (facade `licensing/public/licensing-department-tools.api.ts`, SPEC MF-2/MF-3 DS.4); gắn được vào **ứng dụng/gói đã có** khi IT tạo trùng (R-25)                                                                 |
| `GET /assessment-queue`                               | IT_ADMIN      | lọc `departmentId` (ngoài phạm vi ⟹ rỗng) + đếm theo phòng                                                                                                                                                                                                                                                                |
| `GET /assessment-decisions`                           | IT_ADMIN      | **mới**: đơn đã quyết (người quyết, lúc, kết quả, lý do); phân trang                                                                                                                                                                                                                                                      |

- **Dữ liệu:** `access_request_proposals.existing_application_id uuid NULL`. **Nơi đặt:** `requests/proposal-review/`, `requests/assessment/`,
  `requests/assessment-queue/`. **Test:** unit kiểm trùng; integration case B rút gọn tới `catalog-link` + tick danh sách phòng.

### IA-1 — Hàng cấp, gần hết hạn, phiếu SaaS (M) · `QĐ-111m`, `QĐ-111o`, `QĐ-111s`

| Method · path              | Vai      | Thay đổi                                                                                                                                                                                                                                                         |
| -------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /grant-queue`         | IT_ADMIN | chỉ phòng trong phạm vi; lọc `planId`, `state=WAITING\|EXECUTING\|DONE`; mỗi người `department`, `execution { taskId, status, failureReason, availableActions }`; nút "Cấp" ở kho = `planId` + `WAITING`; phân trang                                             |
| `POST /provisioning-tasks` | IT_ADMIN | tạo tác vụ cấp **tự nhận** cho người bấm (vẫn 403 khi là người thụ hưởng); idempotent theo (Request, người)                                                                                                                                                      |
| `GET /subscriptions`       | IT_ADMIN | `mine=true` (mặc định FE), `expiry=SOON\|EXPIRED` theo điểm điều chỉnh `FR-1.4` (gói tháng 7 ngày trước ngày thanh toán, gói năm 30 ngày trước hạn chót báo hủy; `K4` vĩnh viễn loại), `daysLeft`, seat trên dòng, `responsibleItAdmin`, `createdAt`; phân trang |
| `GET /saas-issues`         | IT_ADMIN | dòng thêm `department`, `title`; lọc `departmentId`; IT Admin khác vẫn chuyển trạng thái (giữ)                                                                                                                                                                   |

- **Nơi đặt:** `requests/grant-queue/`, `licensing/provisioning/tasks/`, `catalog/subscription/` (chỉ sửa file có sẵn), `licensing/saas-issue/`.
  **Test:** unit điểm điều chỉnh (tháng/năm/`K4`); HTTP phạm vi.

### IA-2 — Kho theo kiểu cấp, người giữ + thu hồi (M) · `QĐ-111n`, `QĐ-111p`, `QĐ-111q`

| Method · path              | Vai      | Thay đổi                                                                                                                                                                                                                    |
| -------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /stock-summary`       | IT_ADMIN | **mới**: theo kiểu cấp — `K2` `purchased/assigned/free/revoking` (seat), `K4` `inStore/assigned/withdrawn` (khóa), `K1` `holders` (quyền); lọc `mine`, `planId`; không đếm bản ghi thuê bao; phân trang theo gói            |
| `GET /license-assignments` | IT_ADMIN | lọc `subscriptionId`, `activeOnly`; mỗi dòng thêm `revocation { taskId, status, claimableNow } \| null` — FE bật "Thu hồi" chỉ khi có tác vụ thu hồi từ nguồn hợp lệ; khóa `K4` trả người giữ (không route `holders` riêng) |

- `QĐ-111q`: kiểm lại không DTO nào nhận/trả mật khẩu (grep), ghi HANDOFF. **Nơi đặt:** capability mới `licensing/stock-summary/` (dùng
  `licensing/public/licensing-pool-stock.api.ts` nếu đủ), `licensing/assignment/`. **Test:** HTTP số khớp mọi trang cho cùng gói.

### K1-GR — Checklist cấp `K1` (S) · `QĐ-111az` (vế cấp), R-19

| Method · path                                                                              | Vai      | Thay đổi                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /provisioning-tasks/{id}`, `POST /provisioning-tasks/{id}/complete` (tác vụ cấp `K1`) | IT_ADMIN | thẻ trả `k1Checklist { variant: GRANT, items }` — đăng ký bằng email công ty của chính người dùng; không bật MFA bằng thiết bị cá nhân; body hoàn tất cần đủ tick (`doneAt` đúng thứ tự) + bằng chứng (422 `PROVISIONING.K1_CHECKLIST_INCOMPLETE`) |

- Dùng lại nhóm `licensing/provisioning/k1-checklist/` của SPEC MF-2/MF-3 `K1-CL` (thêm biến thể `GRANT`). **Test:** HTTP 422/200.

### CO-1 — Hợp đồng (M) · `QĐ-111t`

| Method · path                                                                                 | Vai               | Thay đổi                                                                                                                                                               |
| --------------------------------------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /contracts`                                                                              | IT_ADMIN, FINANCE | **mới**: tìm/lọc (nhà cung cấp, trạng thái suy ra, hiệu lực)/phân trang                                                                                                |
| `POST /contracts`, `PATCH /contracts/{id}`                                                    | IT_ADMIN          | trường theo `US-04-13` (nhà cung cấp, số hợp đồng, hiệu lực từ/đến — trống = vĩnh viễn, ghi chú); **không** ô loại hợp đồng                                            |
| `POST /contracts/{id}/subscriptions`, `DELETE /contracts/{id}/subscriptions/{subscriptionId}` | IT_ADMIN          | **mới**: chỉ thuê bao kho `K2`/`K4` (khác ⟹ 422 `CONTRACT.SUBSCRIPTION_KIND_NOT_ALLOWED`)                                                                              |
| `GET /contracts/{id}`                                                                         | IT_ADMIN, FINANCE | thêm `subscriptions[]`, `documents[]`, `applicationIds[]` (mỗi mảng ≤ 100); nguồn usage FE đọc qua `GET /usage-sources?applicationId=` (catalog T4 không đọc usage T6) |

- **Dữ liệu:** cột mới nullable trên `contracts` (`vendor_id`, `number`, `effective_from`, `effective_to`, `note`, `updated_at`), bảng
  `contract_subscriptions`. **Nơi đặt:** `catalog/contract/` (12 file). **Test:** unit trạng thái suy ra; HTTP 422 kiểu thuê bao.

### US-1 — Màn usage (L) · `QĐ-111aw`, `QĐ-111ax`, R-20

| Method · path                                                | Vai      | Thay đổi                                                                                                                                                                                                                         |
| ------------------------------------------------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /usage-overview`                                        | IT_ADMIN | **mới**: chuỗi theo kỳ (ngày/tuần ISO/tháng) × phòng/ứng dụng/nguồn ⟹ `activeDays`, `coveredDays`, `status HAS_DATA\|PARTIAL\|NO_DATA`, `updatedAt`; lọc phòng/NV/ứng dụng/nguồn — **lọc ngoài phạm vi ⟹ rỗng** (D8); phân trang |
| `GET /employees/{id}/usage-software?from&to`                 | IT_ADMIN | **mới**: phần mềm NV có quyền hoặc có usage; trạng thái dữ liệu; chỉ `employeeCode`, không họ tên/ảnh, không xếp hạng; NV ngoài phạm vi ⟹ **404**                                                                                |
| `GET /employees/{id}/usage-software/{applicationId}?from&to` | IT_ADMIN | **mới**: chi tiết hai nguồn tách riêng; token/câu trả lời **chỉ** ở đây; ngoài phạm vi ⟹ 404                                                                                                                                     |
| `GET /usage-imports`; `POST /usage-imports`                  | IT_ADMIN | **mới** lịch sử import (phân trang); tạo import cảnh báo `DUPLICATE_FILE` khi `content_hash` trùng lần đã xác nhận                                                                                                               |
| `GET /usage-unmatched-identities?importId=`                  | IT_ADMIN | lọc theo lần import; route ghép danh tính nhận `importId` để khớp ngay trong kết quả import (US-08-04 AC-8 — kiểm route ghi hiện có và ghi HANDOFF)                                                                              |

- Đơn vị cộng giữa nguồn duy nhất là **ngày** (hợp ngày, không cộng). Đọc chặn theo `getItAdminScope`; thao tác ghi giữ "IT khác xử lý thay".
  **Nơi đặt:** capability mới `usage/usage-overview/`; `usage/vendor-import/`, `usage/identity/`. **Test:** unit hợp ngày; HTTP rỗng/404 ngoài
  phạm vi; không khóa `fullName`/`avatar` trong mọi response usage.

### US-2 — Thiết bị và đẩy sớm (M) · `QĐ-111ay`

| Method · path                                     | Vai      | Thay đổi                                                                                                                                                                                                                                      |
| ------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /devices/{id}/registrations`; `GET /devices` | IT_ADMIN | **mới** lịch sử người giữ (phân trang); list máy thêm `collection { state, lastAcceptedAt }` (một truy vấn, `STATE_SQL` của `devices/registry/registry-query.repo.ts`)                                                                        |
| `POST /ghost-seat-recommendations/escalations`    | IT_ADMIN | **mới** lô `{ recommendationIds[] (≤ 100), note? }` + `Idempotency-Key`: chỉ `G3`/`G4` tầng `MONITOR` ⟹ `REVIEW`; loại seat _tài khoản máy_ (`QĐ-110m`) và người đang ân hạn điều chuyển (`QĐ-110p`); kết quả từng mục; checklist thêm ở PL-2 |

- "Usage thấp" = chỉ `G3`/`G4`; không thêm `G5`. **Nơi đặt:** `devices/registry/`, capability mới `optimization/escalation/`. **Test:** unit lọc
  đủ điều kiện; HTTP idempotent.

### PI-1 — IT nộp hóa đơn, Finance ký xuất tiền (L) · `QĐ-111u`, `QĐ-111v`, `QĐ-111w`, B6, R-44, R-50, R-51

| Method · path                                           | Vai                         | Thay đổi                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /purchase-invoices/preview`                       | IT_ADMIN                    | **mới**: body như nộp (không tệp) ⟹ `{ label: NEW_PURCHASE\|PERIOD\|RENEWAL, servicePeriodMonth, periodIndex, periodCount \| null, chargedCostCenter, commitment { id, remaining } \| null, matchResult, flags[] }`                                                                                                                                                                                                                                                                                                                                                                                                              |
| `POST /purchase-invoices`                               | IT_ADMIN                    | **mới**: `{ link: { requestId, provisioningTaskId? } \| { subscriptionId }, vendorInvoiceNumber, issuedOn, servicePeriodMonth, quantity, unitPriceOriginal { amountMinor, currency }, netAmount, deductibleTax, nonDeductibleTax, paymentSource: COMPANY_CARD\|IT_ADVANCE, documentIds[1..20] }` — số tiền là **VND thực bị trừ**; `quantity` + `unitPriceOriginal` là số **ghi trên hóa đơn** (tiền gốc — R-44, thay ô chữ `foreignAmountNote`); tệp là `/documents` mục đích `PURCHASE_DOCUMENT` đã hoàn tất của chính người nộp; trùng (nhà cung cấp + số) ⟹ 409; cờ _vượt số duyệt_, _kỳ ngoài thời hạn_ chỉ gắn, không chặn |
| `POST /purchase-invoices/{id}/resubmission`             | IT_ADMIN                    | **mới**: nộp lại sau khi bị trả (bản mới trỏ bản cũ)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `GET /purchase-invoices`, `GET /purchase-invoices/{id}` | IT_ADMIN (phạm vi), FINANCE | **mới**: lọc trạng thái, nhãn, nhà cung cấp, thuê bao, Request, tháng kỳ; phân trang                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `POST /purchase-invoices/{id}/confirmation`             | FINANCE                     | **mới**: **ký xác nhận xuất tiền** — lưu người ký + thời điểm; người nộp ≠ người ký (409 `PURCHASE_INVOICE.SAME_PERSON`); ghi `invoices` qua `BudgetsApi.recordPurchaseInvoice` vào **tháng/năm kỳ dịch vụ**; `matchResult = PRICE_QUANTITY_EXCEPTION` ⟹ mở hồ sơ RC-1 cùng transaction; không có bước IT xác nhận nhận tiền (`QĐ-111v`)                                                                                                                                                                                                                                                                                         |
| `POST /purchase-invoices/{id}/return`                   | FINANCE                     | **mới**: `{ reason }` bắt buộc                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `POST /budget-commitments/{id}/invoices`                | —                           | **xóa route** (B6); `GET /budget-commitments/{id}/invoices` giữ, thêm `servicePeriodMonth`, `label`, `paymentSource`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

- **Nhãn tự suy (`QĐ-111w`, R-50):** hóa đơn đầu của một Request = _Mua mới_; kỳ sau của Request N tháng = _Kỳ k/N_; kỳ sau của Request _Dùng lâu
  dài_ = _Kỳ k_ (`periodCount = null`); hóa đơn Request tiếp tục và hóa đơn gắn thuê bao = _Gia hạn_. Ví dụ wire: "ChatGPT (yêu cầu 6 tháng: thanh
  toán tháng 1/6): 600.000 đ".
- **So khớp (R-44):** `matchResult` so `quantity` với số seat/khóa của Request hoặc số mua của thuê bao, và `unitPriceOriginal` với giá gốc của gói
  (`subscriptions.original_unit_price_minor/currency` — FX-1; gói VND ⟹ so đơn giá VND). Lệch một trong hai ⟹ `PRICE_QUANTITY_EXCEPTION`; chênh VND
  do tỷ giá/phí thẻ **không** mở hồ sơ, vào thẳng thực chi.
- **Ghi thực chi (R-51, M-15, MIN-15):** Cost Center chịu = phòng của **người giữ quyền trong tháng kỳ dịch vụ** (`K1`/`K4` theo Request). Trùng Cost
  Center của khoản cam kết năm kỳ ⟹ ghi vào khoản cam kết (như `budgets/budget/invoice.policy.ts`); khác (điều chuyển, khoản đã giải phóng ở MF3-B)
  ⟹ ghi **thực chi không có cam kết** với `invoices.cost_center_id` = phòng mới (`QĐ-55b`). Hóa đơn thuê bao (_Gia hạn_) và hóa đơn seat `K2` ⟹
  dòng của thuê bao (không khoản cam kết — `QĐ-104c`), phân bổ cho phòng ở `SM-1`. Thực chi = tiền hàng + thuế không khấu trừ (`QĐ-60a`); số VND đã
  gồm phí thẻ/chênh tỷ giá (R-4). `spentOf` (`invoice.repo.ts:160`) đổi sang `LEFT JOIN budget_commitments`, Cost Center =
  `COALESCE(invoices.cost_center_id, c.cost_center_id)`, năm = `COALESCE(năm(service_month), c.year)`.
- **Dữ liệu:** bảng `purchase_invoices` (`requests`): `link_kind`, `request_id?`, `provisioning_task_id?`, `subscription_id?`, `vendor_id`, `number`,
  `issued_on`, `service_month` (ngày 1), `label`, `period_index?`, `period_count?`, `quantity`, `unit_price_original_minor`,
  `unit_price_original_currency`, `net_minor`, `deductible_tax_minor`, `non_deductible_tax_minor`, `match_result`, `payment_source`,
  `state SUBMITTED|CONFIRMED|RETURNED`, `submitted_by_employee_id`, `submitted_at`, `decided_by_employee_id?`, `decided_at?`, `return_reason?`,
  `resubmission_of_id?`, `invoice_id?`; unique (tổ chức, nhà cung cấp, số) khi chưa `RETURNED`; CHECK theo `link_kind`; trigger chặn sửa sau
  `CONFIRMED`. Bảng `purchase_invoice_documents`. `invoices` thêm `service_month`, `purchase_invoice_id` (unique), `subscription_id`,
  `cost_center_id`, `out_of_process_case_id` (RC-2); `commitment_id` nullable + CHECK (có khoản cam kết **hoặc** thuê bao **hoặc** Cost Center
  **hoặc** hồ sơ `SBF-07a`). Dòng cũ: năm khoản cam kết.
- **Nơi đặt:** capability mới `requests/purchase-invoice/` (nhóm `labels/`, `confirmation/`); `budgets/invoice/` + `budgets/budget/invoice.repo.ts`,
  `invoice.policy.ts` (sửa). Thông báo: Finance khi có hóa đơn nộp; IT khi bị trả/được ký. Khóa: ký hóa đơn lấy khóa năm theo D11.
- **Test:** T-PI; unit nhãn; integration ký ⟹ thực chi vào tháng kỳ, cam kết giảm; người nộp tự ký ⟹ 409; route cũ không còn.

### PI-2 — Cờ _kỳ này chưa có hóa đơn_ (S) · `QĐ-111x`, R-30, C-2

| Method · path                            | Vai               | Thay đổi                                                                                                                                                                                                                                                              |
| ---------------------------------------- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /purchase-invoices/missing-periods` | IT_ADMIN, FINANCE | **mới**: mỗi quyền `K1` theo Request còn chạy (ngày thanh toán = ngày cấp mỗi tháng) và mỗi thuê bao (ngày gia hạn theo chu kỳ) có kỳ quá **5 ngày làm việc** sau ngày thanh toán (quy tắc cố định — C-2) chưa có hóa đơn (khác `RETURNED`) ⟹ một dòng cờ; phân trang |
| `GET /dashboards/it-admin`               | IT_ADMIN          | thêm đếm `missingInvoicePeriods`                                                                                                                                                                                                                                      |

- Gói tháng **không** có tác vụ gia hạn (giữ); quyền kết thúc sớm ⟹ giải phóng phần cam kết còn lại (`CommitmentReleaseReason.REVOKED` có sẵn —
  thêm test US-12-17 AC-13: thu hồi xong 20/10 ⟹ giải phóng 500.000 đ cam kết kỳ 3/3). **Nơi đặt:** `requests/purchase-invoice/` (service
  `-query`). **Test:** T-PI ca ngày thanh toán.

### RC-1 — `SBF-11a` hồ sơ lệch hóa đơn (M) · `QĐ-111y`, R-29, R-44

| Method · path                                                   | Vai               | Thay đổi                                                                                                                                                                                                         |
| --------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /invoice-discrepancies`, `GET /invoice-discrepancies/{id}` | FINANCE, IT_ADMIN | **mới**: hồ sơ mở tự động khi hóa đơn được ký có `matchResult = PRICE_QUANTITY_EXCEPTION` (lệch **số lượng** hoặc **đơn giá theo tiền gốc** — R-44); phân trang                                                  |
| `POST /invoice-discrepancies/{id}/closure`                      | FINANCE           | **mới** `{ outcome: EXPLAINED\|OUT_OF_PROCESS_SUSPECTED, reason, differenceAmount }`; `OUT_OF_PROCESS_SUSPECTED` ⟹ ghi chênh lệch + chuyển `SBF-08` (RC-2) qua `Listeners` do `requests` mở, `usage` bind (R-29) |

- **Dữ liệu:** `invoice_discrepancy_cases` (`requests`). **Nơi đặt:** capability mới `requests/invoice-discrepancy/`. **Test:** integration ký hóa
  đơn lệch ⟹ một hồ sơ; chỉ lệch VND ⟹ không hồ sơ; đóng `OUT_OF_PROCESS_SUSPECTED` ⟹ một mục `SBF-08`.

### RC-2 — `SBF-08` và `SBF-07a` (M) · `QĐ-111y`, R-18, R-45, C-4

| Method · path                                                                           | Vai               | Thay đổi                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /vendor-account-discrepancies`, `POST /vendor-account-discrepancies/{id}/decision` | IT_ADMIN          | **mới**: hồ sơ giữ **cả hai giá trị** (nội bộ, nhà cung cấp) từ phát hiện sẵn có (`usage-no-assignment-findings`, `usage-unmatched-identities`, danh sách tài khoản xuất từ trang quản trị) + mục chuyển từ RC-1; quyết định `LEGALIZE_VIA_REQUEST\|REVOKE\|FALSE_ALARM\|OUT_OF_PROCESS`; phân trang                                                                                                                                                                                        |
| `GET /out-of-process-cases`, `POST /out-of-process-cases/{id}/closure`                  | FINANCE, IT_ADMIN | **mới** `SBF-07a` (nguồn = phát hiện của `SBF-08` — C-4): đóng `{ outcome: FALSE_ALARM \| RECORD_SPENT \| REPORT_ONLY, note }`. `RECORD_SPENT` bắt buộc `documentIds[≥1]` (chứng từ tiền của công ty), `amount` VND, `costCenterId \| UNALLOCATED` (không xác định được phòng ⟹ _Chưa phân bổ Cost Center_; dùng chung ⟹ Finance chọn một phòng) ⟹ ghi qua `BudgetsApi.recordOutOfProcessSpend` thành **thực chi không có cam kết**; không có chứng từ ⟹ chỉ `REPORT_ONLY` kèm lý do (R-45) |

- Nguồn phát hiện ngoài danh mục chỉ còn `SBF-08` + usage/collector (R-18); không sao kê. **Dữ liệu:** `vendor_account_discrepancies`,
  `out_of_process_cases` (`usage`). **Nơi đặt:** capability mới `usage/vendor-account-review/`. Thêm (m-13): collector tạo bản ghi _cần xem_ cho phần
  mềm ngoài danh mục (US-13-03 AC-13 — kiểm có sẵn trong `usage/` trước); sweeper xóa bằng chứng `SBF-08` sau 24 tháng (US-14-04 AC-2).
  **Test:** HTTP phạm vi + quyết định; `RECORD_SPENT` thiếu chứng từ ⟹ 422; ghi đúng một dòng thực chi.

### BG-1 — Kỳ lập ngân sách (M) · `QĐ-111z`, `QĐ-111aa`, `QĐ-111ba`, R-11, R-14, R-16

| Method · path                                                                         | Vai         | Thay đổi                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /budget-cycles`, `PATCH /budget-cycles/{year}`                                  | FINANCE     | tạo kỳ ở **Nháp** (Trần năm, Dự phòng kho, hạn nộp, hạn quyết); nháp sửa tự do; đang mở chỉ dời hạn nộp (kèm lý do, lưu trước/sau, báo trưởng phòng — US-06-15 AC-21) + sửa Trần năm/Dự phòng kho; **từ hạn nộp là khóa** ⟹ 409 `BUDGET_CYCLE.LOCKED` (không mở lại; Dự phòng kho khóa cùng — R-14) |
| `DELETE /budget-cycles/{year}`                                                        | FINANCE     | **mới**: chỉ kỳ nháp                                                                                                                                                                                                                                                                                |
| `POST /budget-cycles/{year}/opening`                                                  | FINANCE     | **mới**: nháp ⟹ mở; báo trưởng phòng kèm link file mẫu `BM-10` (PL-3) + số liệu nền                                                                                                                                                                                                                 |
| `PUT /budget-cycles/{year}/department-ceilings`, `POST /budget-cycles/{year}/publish` | —           | **xóa route** (bỏ B2) + mã thông báo phát hành Trần phòng                                                                                                                                                                                                                                           |
| `POST/PATCH /departments` (cửa sổ tạo phòng)                                          | SUPER_ADMIN | được tạo phòng khi kỳ năm sau đã mở và **chưa có lần gửi phiên bản đầu tiên** của kỳ (R-16); giữa năm vẫn không (`QĐ-104e`)                                                                                                                                                                         |

- **Dữ liệu:** `budget_cycles.opened_at`, `opened_by_employee_id` nullable (NULL = nháp); thôi ghi `published_*`, `budget_department_ceilings`;
  `budget-view` thôi đọc Trần phòng. **Nơi đặt:** `budgets/cycle/` (`cycle.policy.ts:83` đổi sang `openedAt`, `department-creation-window.listener.ts`,
  `cycle-deadline.*`), `budgets/budget-view/`. **Test:** unit trạng thái kỳ và cửa sổ tạo phòng; T-BG2 (dời hạn sau khóa ⟹ 409).

### BG-2 — `BM-10`, phiên bản, quyết định (L) · `QĐ-111ab`, `QĐ-111ac`, `QĐ-111ad`, `QĐ-111bb`, R-11, B-6

| Method · path                                                                                                                                                                             | Vai                                 | Thay đổi                                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /budget-proposals`, `/{id}/resubmission`, `/{id}/withdrawal`                                                                                                                        | MANAGER                             | `BM-10` = `{ costCenterId, year, requestedAmount, note?, attachmentIds[1..10] }`; không nhận dòng; sau hạn nộp ⟹ 409 `BUDGET_CYCLE.LOCKED`                                                                                                                                                                                                                               |
| `POST /budget-proposals/{id}/return`                                                                                                                                                      | FINANCE                             | chỉ trước hạn nộp                                                                                                                                                                                                                                                                                                                                                        |
| `GET /budget-proposals/{id}/lines`, `GET/POST /budget-versions/{id}/lines`, `PUT /budget-versions/{id}/lines/{position}`, `POST /budget-versions/{id}/imports`, `GET /budgets/mine/lines` | —                                   | **xóa route** (B-6, D1) + `budgets/version/budget-version-lines.controller.ts`, `version-line.service.ts`, `line-import.service.ts`; changelog FE                                                                                                                                                                                                                        |
| `GET /budget-cycles/{year}/baseline`, `GET /budget-versions/{id}`                                                                                                                         | FINANCE, MANAGER, SPENDING_APPROVER | thêm `carriedOverNextYear` theo Cost Center (cùng hàm với job 01/01 của XY-1: tổng số năm sau đã lưu của dòng/quyền có thời hạn còn hiệu lực + quyền _Dùng lâu dài_ đang chạy × 12 × giá tháng VND hiện hành), `belowCarriedOver` (cờ đỏ), `noProposalSubmitted`; bỏ `quarters`                                                                                          |
| `POST /budget-versions`, `PUT /budget-versions/{id}`, `/submission`                                                                                                                       | FINANCE                             | `baseAmount` (điền sẵn = `carriedOverNextYear`), `reservePercent` (mặc định `BUDGET_RESERVE_DEFAULT_PERCENT` = 10) hoặc `reserveAmount`, `reserveReason?`; bỏ `q1…q4`; **lưu nháp không chặn**; gửi cần ≥ 1 tệp giải thích (422) và tổng (cơ sở + dự phòng) mọi Cost Center ≤ Trần năm − Dự phòng kho (409 `BUDGET_VERSION.OVER_CEILING` `details { overBy }`, khóa D11) |
| `POST /budget-versions/{id}/decision`                                                                                                                                                     | SPENDING_APPROVER                   | chỉ `APPROVE` \| `RETURN` (lý do bắt buộc; lưu trạng thái có sẵn `CHANGES_REQUESTED`); `REJECT` ⟹ 422; checklist thêm ở PL-2                                                                                                                                                                                                                                             |

- Phòng có trưởng phòng không nộp tới hạn, hoặc phòng tạo sau hạn nộp (R-11) ⟹ Finance lập phiên bản từ số liệu nền (chi năm nay + chạy sang),
  `origin = BASELINE_NO_PROPOSAL` (enum mới, `_values`), cờ `noProposalSubmitted` (`QĐ-111bb`); bỏ chặn `HAS_HEAD` (`baseline.policy.ts:169`).
- **Xóa (B-6, M-14):** trường `quarters` request/response (`budget.dto.ts:120-157,298`), `BudgetQuartersMismatchError` (`budget.errors.ts`,
  `budget.http-errors.ts`, `version-creation.service.ts`, `version-figures.service.ts`, `version.service.ts`), policy `quartersMatch*`
  (`budget.policy.ts`, `version-figures.service.ts`), luồng import dòng.
- **Dữ liệu:** `budget_proposals.note`; `BudgetVersionOrigin` thêm `BASELINE_NO_PROPOSAL`; thôi ghi `q1..q4_minor`, dòng `BM-10`, ZBB, xếp hạng.
- **Nơi đặt:** `budgets/proposal/`, `budgets/version/`, `budgets/cycle/baseline.*`; `CarriedOverContributions` ở
  `budgets/public/budgets.extension-points.ts`, `requests` bind (tính ở `requests/year-start-commitments/`).
- **Test:** T-BG2; công thức chạy sang = công thức job 01/01 (cùng hàm); HTTP `REJECT` ⟹ 422; route dòng/quý không còn.

### SM-1 — Seat-tháng `K2` và dòng _Chưa phân bổ — kho_ (L) · `QĐ-103k`, `QĐ-104c`, `QĐ-111bg`, B-2 — **trong đợt, trước RV-1**

| Method · path                                                    | Vai                                       | Thay đổi                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (sweeper ngày 1 + lúc chốt số RV-1)                              | hệ thống                                  | tính seat-tháng của **tháng đã kết thúc** cho mọi seat `K2`: phòng chịu = phòng của người giữ **tại từng ngày**; tháng có đổi phòng chia theo số ngày; idempotent (thay toàn bộ dòng của (thuê bao, tháng) trong một transaction); tháng đã có kỳ rà soát `SIGNED` ⟹ không tính lại |
| `GET /seat-month-charges?year&month&costCenterId&subscriptionId` | FINANCE; MANAGER (Cost Center phòng mình) | **mới**: dòng seat-tháng (thuê bao, mã NV, phòng, Cost Center hoặc _Chưa phân bổ Cost Center_, số ngày, số tiền) + dòng _Chưa phân bổ — kho_ của mỗi thuê bao/tháng; phân trang                                                                                                     |

- **Luật tính:** số tiền = round_half_away_from_zero(giá tháng VND của seat × ngày giữ ở phòng ÷ số ngày của tháng) (ADR-0007); phần dư làm tròn
  dồn vào đoạn cuối của tháng để tổng đoạn = giá tháng × ngày giữ ÷ số ngày. Giá tháng = `seat_monthly_minor` của khoản cam kết gắn seat nếu có,
  không thì giá tháng hiện hành của gói. Phòng chưa có Cost Center ⟹ dòng _Chưa phân bổ Cost Center_ (`cost_center_id` NULL). Người chuyển trong ân
  hạn ⟹ phần từ ngày hiệu lực tính phòng mới (`QĐ-111bg`; cam kết phòng cũ đã giải phóng ở SPEC MF-2/MF-3 MF3-B).
- **Cam kết `K2` giảm dần:** seat-tháng của seat có khoản cam kết **cùng Cost Center** ⟹ `applied_minor += min(số tiền, phần còn giữ)` (thành chi phí);
  khác Cost Center hoặc không có cam kết ⟹ thực chi không có cam kết của Cost Center chịu.
- **_Chưa phân bổ — kho_:** mỗi thuê bao `K2`, mỗi tháng = Σ hóa đơn kho của tháng kỳ (PI-1, dòng thuê bao) − Σ seat-tháng đã phân bổ; seat thu hồi
  xong ⟹ phần còn lại của seat tự vào dòng này. Tính lúc đọc/chốt, không lưu.
- **Thực chi theo Cost Center** (RV-1, RV-2, kiểm ngân sách) = hóa đơn (PI-1, `spentOf`) + seat-month charges của Cost Center.
- **Dữ liệu:** `seat_month_charges` (`budgets`): `organization_id`, `subscription_id`, `assignment_id`, `employee_id`, `department_id`,
  `cost_center_id NULL`, `month` (ngày 1), `days`, `days_in_month`, `monthly_price_minor`, `amount_minor`, `commitment_id NULL`, `applied_minor`,
  `computed_at`; unique (`assignment_id`, `month`, `department_id`).
- **Nơi đặt:** capability mới `budgets/seat-month/` (policy thuần + spec, service, repo, sweeper, controller); đọc seat `K2` qua facade mới
  `licensing/public/licensing-seat-month.api.ts` (`licensing/public/` còn chỗ sau X-H/X-SA); đoạn phòng của người giữ qua
  `OrganizationHistoryApi` (thêm hàm đọc theo khoảng, cạnh `getPlacementInForce` — `organization/public/organization-history.api.ts:83`); Cost
  Center của phòng qua `OrganizationReadApi.getUnitCostCenterHistory`; dùng lại `licensing/public/seat-month-cost.policy.ts`.
- **Test:** T-SM1; unit làm tròn + phần dư; integration điều chuyển giữa tháng ⟹ hai dòng, cam kết phòng cũ không bị trừ sau ngày hiệu lực;
  chạy lại ⟹ không trùng.

### RV-1 — Chốt số tháng, đèn, dự kiến cuối năm (M) · `QĐ-111ae`, `QĐ-111af` (đèn), `QĐ-111ai`, R-2, R-37, R-5, R-31, R-47, R-52

| Method · path                                                        | Vai                                                   | Thay đổi                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /budget-review-periods`                                        | FINANCE                                               | **mới** `{ year, month }` sau khi tháng kết thúc: tính seat-tháng tháng đó (SM-1) rồi chụp **bất biến** từng Cost Center (ngân sách hiệu lực, thực chi theo tháng kỳ, cam kết còn giữ, Request chờ duyệt chi, còn lại, dự kiến cuối năm, hệ số chênh, tăng giá đã biết, tốc độ chi, đèn); tháng 3/6/9 ⟹ kỳ `QUARTER`; trùng ⟹ 409 |
| `GET /budget-review-periods?year`, `GET /budget-review-periods/{id}` | FINANCE, SPENDING_APPROVER; MANAGER (dòng phòng mình) | **mới**; phân trang                                                                                                                                                                                                                                                                                                               |
| `POST /budget-review-periods/{id}/signature`                         | FINANCE                                               | **mới**: _đóng kỳ tháng_ / _ký rà soát quý_ (chỉ Finance ký — `QĐ-111ae`); ký kỳ tháng ⟹ báo Người duyệt chi bản tóm tắt có bảng đèn (`QĐ-99h`)                                                                                                                                                                                   |

- **Không khóa dữ liệu** (R-2): hóa đơn tới muộn vẫn ghi, kỳ sau thấy thay đổi. **Công thức** (pure, hằng số — R-5, R-47), **theo từng Cost Center**:
  - hệ số chênh k = (Σ thực chi − Σ giá gốc đã thành chi phí) ÷ Σ giá gốc đã thành chi phí của hóa đơn từ đầu năm; chưa có hóa đơn ⟹ k = 0;
  - **dự kiến cuối năm = thực chi + (cam kết còn giữ + Request chờ duyệt chi) × (1 + k) + tăng giá đã biết** (R-37; công thức riêng, không phải lớp
    L1 — `QĐ-111ai`);
  - tăng giá đã biết = Σ max(0, giá tháng hiện hành − giá tháng trong cam kết) × seat × tháng còn lại (chỉ phần tăng — R-52; US-12-21 AC-7);
  - tốc độ = thực chi ÷ (số cơ sở hiệu lực × M ÷ 12);
  - **đèn** dùng **số cơ sở hiệu lực** (sau AD-1 — m-18): _Đỏ_ dự kiến > cơ sở + dự phòng; _Vàng_ dự kiến > cơ sở hoặc tốc độ > 110 %; _Dưới mức_ từ
    tháng 6 dự kiến < 70 % cơ sở; còn lại _Xanh_. Nhắc Finance ở ngày làm việc thứ 5 nếu tháng trước chưa chốt (quy tắc cố định, R-47).
- Thực chi gồm seat-tháng (SM-1). Request chờ duyệt chi qua `PendingSpendContributions`; giá hiện hành qua `catalog`.
- **Dữ liệu:** `budget_review_periods` (năm, tháng, `kind MONTH|QUARTER`, `state SNAPSHOT|AWAITING_EXPLANATIONS|SIGNED`, người/thời điểm chốt và
  ký, ghi chú), `budget_review_lines` (số chụp + đèn + cột giải trình của RV-3); trigger chặn sửa cột số.
- **Nơi đặt:** capability mới `budgets/review/`. **Test:** T-RV1 (khẳng định **con số**, không chỉ đèn).

### AD-1 — Điều chỉnh ngân sách, ngân sách hiệu lực (M) · `QĐ-111ag`, `QĐ-111bh`, R-14, R-33, R-36, R-40, R-48, C-1

| Method · path                                                                                 | Vai                                              | Thay đổi                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /budget-adjustments`                                                                    | FINANCE                                          | **mới** `{ year, kind: SUPPLEMENT\|TRANSFER\|RETURN\|CEILING_REDUCTION, fromCostCenterId?, toCostCenterId?, amount, reason, transferReason?: COST_CENTER_CHANGE }` — **một bảng, bốn loại** (C-1), lập lúc nào cũng được. `SUPPLEMENT`/`CEILING_REDUCTION` ≤ **phần chưa phân bổ** = (Trần năm − Dự phòng kho) − Σ ngân sách hiệu lực (cơ sở + dự phòng) mọi Cost Center (R-36: không đủ ⟹ phòng _Trả lại_ trước; 422 `BUDGET_ADJUSTMENT.OVER_UNALLOCATED`). `RETURN` và phòng nguồn của `TRANSFER`: ngân sách hiệu lực sau điều chỉnh (cơ sở − số + dự phòng) ≥ **dự kiến cuối năm** của phòng (công thức RV-1, R-40; 422 `BUDGET_ADJUSTMENT.BELOW_FORECAST_FLOOR`); `TRANSFER` có `transferReason = COST_CENTER_CHANGE` ⟹ **miễn sàn**; sau khóa Trần năm không tăng |
| `GET /budget-adjustments?year&costCenterId&state`                                             | FINANCE, SPENDING_APPROVER; MANAGER (phòng mình) | **mới**; phân trang                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `POST /budget-adjustments/{id}/decision`                                                      | SPENDING_APPROVER                                | **mới** `APPROVE` \| `REJECT` (lý do bắt buộc); **kiểm lại** mọi điều kiện lúc duyệt; `TRANSFER`/`SUPPLEMENT` cho Cost Center **chưa có phiên bản** năm đó ⟹ lúc duyệt tạo bản ghi ngân sách đã duyệt (phiên bản `origin = ADJUSTMENT`, cơ sở = số điều chỉnh, dự phòng 0) để khoản cam kết có chỗ gắn (R-48, `INV-18`)                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `GET /budgets`, `/budgets/summary`, `/budgets/mine`, `GET /access-requests/{id}/budget-check` | vai đọc ngân sách                                | trả `effectiveBudget` = phiên bản đã duyệt + điều chỉnh đã duyệt (cộng/trừ vào **số cơ sở**, dự phòng giữ — `QĐ-111bh`); Cost Center chỉ có _Chuyển_/_Bổ sung_ đã duyệt vẫn có ngân sách (R-33, R-48)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

- Kiểm ngân sách Request (`FR-3.20`) đọc ngân sách hiệu lực (`budgets/budget/budget-facts.repo.ts` + `BudgetsApi.yearFacts`). Phòng đổi Cost Center
  giữa năm ⟹ Finance lập _Chuyển_ `COST_CENTER_CHANGE` (không code riêng). Phiên bản gốc giữ làm mốc.
- **Khóa (D11):** lập và duyệt lấy `budget_cycles … FOR UPDATE` trước, rồi khóa năm của Cost Center (hai Cost Center theo id tăng dần).
- **Dữ liệu:** `budget_adjustments` (kind, from/to, amount, reason, `transfer_reason`, `state PENDING|APPROVED|REJECTED`, người/thời điểm lập + quyết,
  lý do quyết; CHECK theo kind); `BudgetVersionOrigin.ADJUSTMENT` (`_values`). **Nơi đặt:** capability mới `budgets/adjustment/`.
- **Test:** T-AD1; integration kiểm ngân sách sau điều chỉnh; integration hai `SUPPLEMENT` song song chỉ một qua khi vừa đủ phần chưa phân bổ.

### RV-2 — Cảnh báo 80/100 % (S) · `QĐ-111af` (ngưỡng), R-5, R-28

- Không route mới. Sau mỗi lần giữ cam kết, ký hóa đơn, seat-tháng, khoản 01/01, duyệt điều chỉnh: với (đã dùng trước, đã dùng sau, số cơ sở hiệu
  lực b), ngưỡng t ∈ {80 %, 100 %} báo khi `trước < t × b ≤ sau` và chưa có dòng (Cost Center, năm, t, b) ⟹ trưởng phòng + Finance **một lần mỗi lần
  vượt**; điều chỉnh đổi b không tự báo; vượt lại theo b mới ⟹ báo lại (R-28). Đã dùng = thực chi + cam kết còn giữ. Hằng số (R-5).
- **Dữ liệu:** `budget_threshold_alerts` (Cost Center, năm, ngưỡng, `base_minor`, thời điểm) **unique (`cost_center_id`, `year`, `threshold`,
  `base_minor`)** (MAJ-10) — chèn `ON CONFLICT DO NOTHING`. **Nơi đặt:** `budgets/review/` (service gọi từ `BudgetsApi`). **Test:** T-RV2.

### RV-3 — Rà soát quý: giải trình, ký (M) · `QĐ-111ah`, `QĐ-111aj`, R-10, R-17, B-7

| Method · path                                                      | Vai                                    | Thay đổi                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `PUT /budget-review-periods/{id}/lines/{costCenterId}/explanation` | MANAGER (trưởng phòng của Cost Center) | **mới**: chỉ dòng _Vàng_/_Đỏ_/_Dưới mức_ của kỳ `QUARTER` đang chờ: `{ cause, persistence: ONE_OFF\|ONGOING, action, knownNeedsToYearEnd { amount?, note } }`; hạn 5 ngày làm việc từ lúc chốt (cố định — R-47); quá hạn chỉ nhắc: **ở ngày hạn, rồi mỗi Thứ Hai** tới khi giải trình hoặc Finance ký kỳ quý (B-7) |
| `POST /budget-review-periods/{id}/signature`                       | FINANCE                                | ký được khi còn phòng chưa giải trình ⟹ dòng ghi `UNEXPLAINED` (R-10); phòng chưa có trưởng phòng ⟹ `NO_HEAD`, không bắt buộc (R-17)                                                                                                                                                                               |
| `GET /budget-commitments?costCenterId&year&longTerm=true`          | FINANCE, MANAGER                       | lọc cam kết dài hạn cho màn rà soát quý (`QĐ-111aj`, US-12-21 AC-8), phân trang; mức dùng FE đọc ở `GET /ghost-seat-recommendations?departmentId=` (bug-fix B3); ít dùng ⟹ `MF-5`; không thao tác thu hồi ở màn này                                                                                                |

- **Nơi đặt:** `budgets/review/`, `budgets/commitment/`. Khóa chống trùng nhắc `review:<periodId>:<costCenterId>:<ngày>`. **Test:** HTTP trưởng phòng
  phòng khác ⟹ 403; ký thiếu giải trình ⟹ `UNEXPLAINED`; nhịp nhắc B-7 (ngày hạn T5 ⟹ nhắc T5, T2 tuần sau).

### PL-1 — Thư viện chính sách và xác nhận đã đọc (M) · `QĐ-111ao`, `QĐ-111ar`, `QĐ-111bi`, R-34, R-42, B-3, S-2

| Method · path                                                                                                                   | Vai                     | Thay đổi                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /policies`, `GET /policies/{code}` (`?version=`), `GET /policies/{code}/versions`, `GET /policies/{code}/steps/{stepCode}` | đăng nhập               | **mới**: danh sách (8 mục, mức tối đa nghiệp vụ — R-42) + bản hiện hành + lịch sử (phân trang) + checklist của một bước; dòng có `myAcknowledgement PENDING\|DONE\|NOT_REQUIRED`                |
| `PUT /policies/{code}/draft`, `DELETE /policies/{code}/draft`                                                                   | SUPER_ADMIN             | **mới**: nháp = sao chép bản hiện hành (body rỗng) hoặc ghi đè; tối đa một nháp                                                                                                                 |
| `POST /policies/{code}/draft/publish`                                                                                           | SUPER_ADMIN             | **mới** `{ changeNote (căn cứ ban hành, bắt buộc), applicableRoles[], requiresReacknowledgement = true }`: **hiệu lực ngay**, không hẹn ngày; bản xuất bản bất biến; báo in-app các vai áp dụng |
| `POST /policies/{code}/acknowledgements`, `GET /policies/{code}/acknowledgements`                                               | đăng nhập / SUPER_ADMIN | **mới**: xác nhận bản cần xác nhận (idempotent; không thuộc vai áp dụng ⟹ 409); báo cáo đã/chưa (phân trang)                                                                                    |
| `GET /me`                                                                                                                       | mọi tài khoản           | thêm `pendingPolicyAcknowledgements[{ code, title, versionNumber }]` cho web **và** mobile; BE không chặn API khác (`QĐ-111ar`)                                                                 |
| (không có) `POST /policies`                                                                                                     | —                       | **không** có route tạo/xóa chính sách (bộ cố định — R-42); test `POST /policies` ⟹ 404                                                                                                          |

- **Luật chờ xác nhận:** V\* = bản mới nhất có `requiresReacknowledgement = true` (bản 1 luôn true); người có vai thuộc `applicableRoles` của bản
  hiện hành mà chưa xác nhận bản nào ≥ V\* ⟹ `PENDING` (R-34).
- **Dữ liệu:** `policies` (mã cố định), `policy_versions` (`version_number` NULL khi nháp, `content` jsonb có codec: `sections` + `steps[{ code, title,
checklist[{ code, text, check: SYSTEM\|PERSON }] }]`, `applicable_roles`, `change_note`, `requires_reacknowledgement`, người/thời điểm xuất bản;
  partial unique một nháp), `policy_acknowledgements` (chỉ thêm — `RUNTIME_TABLE_EXCEPTIONS`).
- **Nơi đặt:** module mới `policies` (D4): `policies/library/`, `policies/acknowledgement/`. **Seed 8 chính sách** từ
  [POLICY-SEED-DRAFT.md](POLICY-SEED-DRAFT.md) (nguồn seed, **chờ Owner duyệt** — §9 O-1); chưa duyệt lúc tới task seed ⟹ nạp đúng bản nháp đó với
  `change_note` ghi "bản nháp demo — chờ Owner duyệt", không đổi code. **Test:** unit luật chờ xác nhận; HTTP vai; `pnpm arch:check`.

### PL-2 — Checklist khi quyết định (L) · `QĐ-111ap`, `QĐ-111aq`, `QĐ-111be`, R-6, R-24

| Bước (route)                                                                                                                                                                                       | Vai               | Khi có _Không_                                                                                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Nhu cầu: `POST /access-requests/{id}/need-decision`, `POST /access-requests/{id}/line-need-decisions` (nhóm: một bộ cho cả nhóm, ghi từng dòng — R-6)                                              | MANAGER           | chỉ `REJECT` hoặc `RETURN` mới (⟹ `AWAITING_REQUESTER_REVISION`, người yêu cầu bổ sung rồi gửi lại — R-24; nhóm trả về cả nhóm — US-05-04 AC-22)                  |
| Dùng dự phòng: `POST /access-requests/{id}/reserve-confirmation`                                                                                                                                   | MANAGER           | không dùng được dự phòng (422)                                                                                                                                    |
| Duyệt chi `MF-1`: `POST /access-requests/{id}/spend-approval`, `POST /access-requests/{id}/line-spend-decisions`, `POST /spend-batches/{id}/decisions` (lô: một bộ, ghi từng Request — `QĐ-111aq`) | SPENDING_APPROVER | chỉ `REJECT` hoặc `RETURN` mới (⟹ hàng trình chi của trưởng phòng; lô có _Không_ ⟹ **mọi** Request của lô `RETURN`, trưởng phòng bỏ Request lỗi rồi trình lô mới) |
| Đánh giá case B: `POST /access-requests/{id}/assessment/completion`, `/rejection`                                                                                                                  | IT_ADMIN          | chỉ từ chối hoặc `RETURN` (⟹ người yêu cầu bổ sung — R-24)                                                                                                        |
| Phiên bản `MF-4`: `POST /budget-versions/{id}/decision`                                                                                                                                            | SPENDING_APPROVER | chỉ `RETURN` (`QĐ-111ad`)                                                                                                                                         |
| Ghost seat: `POST /ghost-seat-decisions`                                                                                                                                                           | MANAGER           | khóa `KEEP` và `EXEMPT`, chỉ `RECLAIM`; không có Trả về (R-24)                                                                                                    |
| Đẩy sớm: `POST /ghost-seat-recommendations/escalations`                                                                                                                                            | IT_ADMIN          | không đẩy được (422), thẻ giữ _Theo dõi_                                                                                                                          |

- **Body chung:** `checklist { policyVersionId, answers[{ itemCode, answer: YES\|NO }] (≤ 30) }` bắt buộc; mục `SYSTEM` tự `YES`; thiếu mục ⟹ 422
  `POLICY.CHECKLIST_INCOMPLETE`; bản chính sách đã đổi ⟹ 409 `POLICY.VERSION_CHANGED`; quyết định duyệt khi có `NO` ⟹ 422 `POLICY.CHECKLIST_HAS_NO`;
  lý do từ chối/trả về trống ⟹ server điền từ các mục `NO`. Mobile dùng cùng contract.
- **Dữ liệu:** `decision_checklists` (`policies`): bản chính sách, mã bước, loại + id chủ thể (+ id dòng), người quyết, quyết định, `answers` jsonb,
  `has_no`; chỉ thêm. Giá trị trả về của `ApprovalDecision` (`prisma/models/requests.prisma:116`) và quyết định duyệt chi: migration `_values` riêng
  (D10). `request-resubmission.service.ts:23` mở cho Request đi qua trưởng phòng bị trả về.
- **Nơi đặt:** `policies/checklist/` (facade `PolicyChecklistApi.evaluate/record`); từng module sửa route của mình.
- **Test:** T-PL; unit `evaluate` (thiếu, `NO`, bản cũ, mục `SYSTEM`); mỗi bước một HTTP; integration lô có `NO` ⟹ mọi Request về hàng trưởng phòng.

### PL-3 — File mẫu import (M) · `QĐ-111as`

| Method · path                                   | Vai                                                                                                                | Thay đổi                                                                                                                                                                                                       |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /import-templates/{kind}?format=xlsx\|csv` | `employees` SUPER_ADMIN; `seat-baseline`, `license-keys`, `usage-csv` IT_ADMIN; `budget-proposal` MANAGER, FINANCE | **mới**: xlsx (sheet dữ liệu + sheet hướng dẫn: cột, bắt buộc, định dạng, ví dụ VND, ràng buộc) + csv UTF-8 BOM; `budget-proposal` là biểu mẫu `BM-10` để nộp kèm (không parse); **không** có `bank-statement` |

- Định nghĩa cột dùng chung với parser: module sở hữu parser góp định nghĩa qua `Contributions` do `policies` mở; `policies/import-template/` dựng
  file bằng `exceljs` (đã có). Mục đích tệp "sao kê" ở `/documents` bỏ khỏi enum mục đích nhận mới (US-01-12 AC-10, US-04-04 AC-11). **Test:**
  mỗi `kind` sinh file rồi đọc lại bằng chính parser ⟹ 0 lỗi.

### PF-1 — Hồ sơ cá nhân (M) · `QĐ-111at`, `QĐ-111au`, `QĐ-111av`, R-22, R-41

| Method · path                                               | Vai           | Thay đổi                                                                                                                                                       |
| ----------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PUT /me/avatar` (multipart, một bước), `DELETE /me/avatar` | mọi tài khoản | **mới**: png/jpg/webp ≤ 1 MB, kiểm chữ ký tệp (magic bytes, không thêm dependency); 413/415/422                                                                |
| `PATCH /me/profile`                                         | mọi tài khoản | **mới** `{ workPhone: string \| null }` — chữ số, cho phép `+84` (R-22)                                                                                        |
| `GET /me`                                                   | mọi tài khoản | thêm `avatar { url, expiresAt } \| null`, `workPhone`                                                                                                          |
| `POST /employee-profiles/lookup`                            | đăng nhập     | **mới** `{ employeeIds[≤ 100] }` ⟹ `{ employeeId, avatar \| null, workPhone \| null }` (link có hạn); route usage/phát hiện **không** trả ảnh/SĐT (`QĐ-111au`) |
| `DELETE /app-users/{id}/avatar`                             | SUPER_ADMIN   | **mới** `{ reason }` bắt buộc, Audit Trail (R-22)                                                                                                              |

- _Đã nghỉ việc_ ⟹ `personnel` (khi chuyển `LEFT`) gọi `IdentityAccessApi.clearSelfServiceProfile` **trong transaction chỉ xóa cột** (số điện thoại,
  khóa ảnh) và chèn hàng đợi `avatar_purges` (khóa object); **sweeper trong API process** xóa object sau commit, idempotent (MAJ-12 —
  `docs/rules/database-business.md:92-93`, `security-jobs.md:53`; `personnel` chạy cả trong graph CLI BM-09). Hủy nghỉ việc khi đã `LEFT` bị chặn
  (409, R-41 — SPEC MF-2/MF-3 P2) nên không có ca khôi phục; người quay lại làm (luồng phụ) tự tải lại ảnh. `DELETE /me/avatar` và Super Admin
  gỡ ảnh dùng cùng hàng đợi.
- **Dữ liệu:** `app_users.avatar_object_key`, `avatar_content_type`, `avatar_updated_at`, `work_phone` (nullable); bảng `avatar_purges` (`object_key`,
  `requested_at`, `purged_at`). **Nơi đặt:** capability mới `identity-access/profile/`; adapter lưu trữ có sẵn ở `src/infrastructure`. **Test:** unit
  chữ ký tệp, định dạng SĐT; integration `LEFT` ⟹ cột xóa + hàng đợi có dòng; sweeper xóa object một lần (gọi lại không lỗi).

### Z2 — Seed, flows, roadmap (M, pha cuối chung) · M-16

- **Ngày tương đối:** mọi ngày trong fixture = `seedDate` ± khoảng (ngày làm việc khi luật tính ngày làm việc); README fixture ghi "seed lại ≤ 1
  ngày trước demo". Dọn khỏi fixture: quý, Trần phòng, dòng `BM-10`, tỷ giá, giá ngoại tệ (giá VND; giá gốc ngoại tệ ở cột có cấu trúc).
- **Dữ liệu chung:** 7 nhóm chức năng; kỳ 2027 nháp + đang mở; 8 chính sách đã xuất bản (POLICY-SEED-DRAFT) + 1 bản chờ xác nhận; ảnh mẫu (không
  ảnh người thật).
- **Kịch bản demo hội đồng (15):**

| Mã      | Kịch bản (trạng thái lúc demo)                                                                                                                         |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| DEMO-1  | MF-1 case B chờ IT đánh giá + một case B rút gọn (ứng dụng có, gói chưa)                                                                               |
| DEMO-2  | Phòng chưa có trưởng phòng: `K5` đã có trong danh mục cấp thẳng (cờ audit) + Request trả phí và case B đang chờ                                        |
| DEMO-3  | Thực tập sinh hết hợp đồng sau 2,5 tháng: `K1` 9 tháng bị cắt (`termCutAt`, 3 tháng)                                                                   |
| DEMO-4  | `K1` 9 tháng qua năm (năm nay 2 tháng, số năm sau đã lưu) + `K2` _Dùng lâu dài_ (số năm sau lưu 12 × giá)                                              |
| DEMO-5  | Quyền ở T−7 có Request tiếp tục đang chờ duyệt                                                                                                         |
| DEMO-6  | MF-2: một nghỉ việc có ngày cuối (sắp tới), một chặn ngay hôm nay chưa (1b), một hồ sơ quá hạn thu hồi có quyền chưa mở tác vụ                         |
| DEMO-7  | MF-3: điều chuyển đang ân hạn (2 quyền, một đã xin lại và cấp lại) + IT Admin nghỉ còn thuê bao chưa chuyển (hàng việc IT chung)                       |
| DEMO-8  | MF-5: `G3`/`G4` _Theo dõi_ có thể đẩy sớm + một seat _tài khoản máy_ (không bị báo)                                                                    |
| DEMO-9  | Hợp đồng gắn thuê bao `K2` và `K4`; một thuê bao cũ gắn cờ thiếu admin nhà cung cấp                                                                    |
| DEMO-10 | Mua/chứng từ: hóa đơn nộp chờ ký, một đã ký, một bị trả; một kỳ có cờ _chưa có hóa đơn_                                                                |
| DEMO-11 | Sai lệch: `SBF-11a` từ hóa đơn lệch số lượng; `SBF-08` có hai giá trị; `SBF-07a` một ca ghi phần đã chi có chứng từ                                    |
| DEMO-12 | Ngân sách 2026 đã chốt tháng 1–10 (seat-tháng có), một phòng _Vàng_, cảnh báo 80 % và 100 % đã gửi                                                     |
| DEMO-13 | Rà soát quý: một phòng đã giải trình, một chưa (quá hạn), Finance chưa ký                                                                              |
| DEMO-14 | Điều chỉnh: một _Bổ sung_ chờ duyệt, một _Chuyển_ đã duyệt                                                                                             |
| DEMO-15 | `MF-4` 2027: một phòng đã nộp `BM-10`, một không nộp (phiên bản từ số liệu nền + cờ); ngân sách 2027 đã duyệt cho một Cost Center để thấy cảnh báo mềm |

- `test:flows`: `MF-4` mới (nháp → mở → nộp → chốt → duyệt/trả về) và mua/chứng từ (nộp → ký → thực chi tháng kỳ); `pnpm test:flows`.
- Roadmap: Story ⟹ `merged-dev` khi PR vào `dev`; dòng "drop cột/bảng đã thôi ghi ở đợt dọn" (§6).

## 6. Dữ liệu và migration (tóm tắt)

Forward-only, expand trước, **không drop** (cột/bảng bỏ chỉ thôi đọc/ghi; drop ở đợt dọn, ghi roadmap). Enum mới ở migration `_values` riêng (D10).
Bảng chỉ thêm (`policy_acknowledgements`, `decision_checklists`) và bảng có trigger bất biến (`budget_review_lines` cột số, `purchase_invoices` sau
ký) vào `RUNTIME_TABLE_EXCEPTIONS` nếu quyền khác DML thường. Mọi bảng mới vào `PRISMA_MODEL_OWNER`.

| Gói  | Mới                                                                                                                                                                                                                       | Thôi ghi / đổi                                                                                                                                  |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| FX-1 | `subscriptions.original_unit_price_minor`, `original_currency`; migration dữ liệu quy VND một lần + Audit                                                                                                                 | snapshot ghi đồng nhất `SAME_CURRENCY` (không nới CHECK)                                                                                        |
| FX-2 | —                                                                                                                                                                                                                         | `exchange_rates` (giữ bảng); `RATE_MISSING`/`NO_RATE`/`CURRENCY_MISMATCH` thôi ghi                                                              |
| RQ-1 | —                                                                                                                                                                                                                         | `many_paid_software*`                                                                                                                           |
| RQ-2 | — (dùng `next_year_amount_minor`, `access_request_line_amounts`)                                                                                                                                                          | `expected_end_date` thôi nhận từ body                                                                                                           |
| CT-1 | `functional_groups.system_key`; seed nhóm                                                                                                                                                                                 | `comm*`, `is_communication_service` `SET DEFAULT false` + thôi ghi; `data_sensitivity` nullable; `functional_group_id` NOT NULL (task sau cùng) |
| IN-1 | `access_request_proposals.existing_application_id`                                                                                                                                                                        | —                                                                                                                                               |
| CO-1 | cột `contracts.*`, `contract_subscriptions`                                                                                                                                                                               | —                                                                                                                                               |
| PI-1 | `purchase_invoices` (+ `quantity`, `unit_price_original_*`, `match_result`), `purchase_invoice_documents`; `invoices.service_month`, `purchase_invoice_id`, `subscription_id`, `cost_center_id`, `out_of_process_case_id` | `invoices.commitment_id` nullable + CHECK                                                                                                       |
| RC-1 | `invoice_discrepancy_cases`                                                                                                                                                                                               | —                                                                                                                                               |
| RC-2 | `vendor_account_discrepancies`, `out_of_process_cases`                                                                                                                                                                    | —                                                                                                                                               |
| BG-1 | —                                                                                                                                                                                                                         | `budget_cycles.opened_at/opened_by` nullable; `published_*`, `budget_department_ceilings`                                                       |
| BG-2 | `budget_proposals.note`; `BudgetVersionOrigin.BASELINE_NO_PROPOSAL`                                                                                                                                                       | `q1..q4_minor`, dòng `BM-10`, `zbb`, `priority_rank`; route dòng/import **xóa**                                                                 |
| SM-1 | `seat_month_charges`                                                                                                                                                                                                      | `budget_commitments.applied_minor` cộng theo seat-tháng                                                                                         |
| RV-1 | `budget_review_periods`, `budget_review_lines`                                                                                                                                                                            | —                                                                                                                                               |
| RV-2 | `budget_threshold_alerts` (unique `cost_center_id, year, threshold, base_minor`)                                                                                                                                          | —                                                                                                                                               |
| AD-1 | `budget_adjustments`; `BudgetVersionOrigin.ADJUSTMENT`                                                                                                                                                                    | —                                                                                                                                               |
| PL-1 | `policies`, `policy_versions`, `policy_acknowledgements`                                                                                                                                                                  | —                                                                                                                                               |
| PL-2 | `decision_checklists`; giá trị enum trả về (`_values`)                                                                                                                                                                    | —                                                                                                                                               |
| PF-1 | `app_users.avatar_*`, `work_phone`; `avatar_purges`                                                                                                                                                                       | —                                                                                                                                               |

Đếm trước trên seed v4 (ghi HANDOFF): tổ chức `reporting_currency <> 'VND'` (phải 0); thuê bao/Request/báo giá ngoại tệ (+ có tỷ giá không); dòng
`one_step_blocked_reason = 'RATE_MISSING'`; ứng dụng cờ liên lạc; ứng dụng chưa có nhóm; kỳ ngân sách đã phát hành; phiên bản có quý; hóa đơn hiện
có (`invoices`); Request còn `expected_end_date` khác ngày suy ra; seat `K2` đang giữ.

## 7. Ngoài phạm vi

Nhập sao kê (`QĐ-111y`), export IdP/tiện ích trình duyệt (R-7); `SBF-20` điểm điều chỉnh đầy đủ, nhắc việc, K4 gắn thiết bị, `US-07-14`, khép kỳ
chi phí, digest (`QĐ-110` mục H); kết nối API vendor thật; lưu mật khẩu; `G5`; mở lại kỳ ngân sách; điều khiển Google/M365; file xuất dữ liệu cá
nhân (US-14-02 AC-6 — BE chưa có tính năng xuất, ghi roadmap); `KPI-2`; Use Case, FDD, ERD, State Machine (đợt Docs sau); xóa bảng/cột cũ; code FE.

## 8. Kiểm thử và ranh giới

- Mỗi task: unit cho policy mới viết trước (tuần lịch, trần tháng, cắt hợp đồng, tách năm, nhãn hóa đơn, so khớp, seat-tháng, đèn/công thức, sàn
  điều chỉnh, ngưỡng, checklist, chờ xác nhận, chữ ký tệp); HTTP cho route mới/đổi (mã lỗi, phạm vi); integration **theo file** cho migration dữ
  liệu, xuyên module, job. Quick check: `pnpm typecheck`, `pnpm lint`, 1–2 file test của task (+ `pnpm arch:check` / `pnpm test:gates` theo PLAN §0).
  **Cuối mỗi gói:** `pnpm test:gates` + `pnpm rules:check` (S-5). Full test ở pha cuối chung.
- **Bất biến có test:** không response usage nào có họ tên/ảnh; quyết định duyệt không tồn tại khi checklist có `NO`; tổng phiên bản ≤ Trần năm − dự
  phòng kho; tổng ngân sách hiệu lực ≤ Trần hiệu lực − dự phòng kho; khoản 01/01 = số đã lưu của dòng còn hiệu lực; một hóa đơn ký ⟹ đúng một dòng
  `invoices`; Σ seat-tháng + _Chưa phân bổ — kho_ = hóa đơn kho của tháng; thuê bao `ACTIVE` mới luôn có snapshot đồng nhất; file mẫu đọc lại ra 0
  lỗi; không còn số tiền ngoại tệ trong luồng mới.
- **Bộ test số** (REVIEW-SPEC-BIZ §4 — phải khẳng định đúng con số/ngày):

| Mã    | Gói              | Ca kiểm và kết quả đúng                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T-RQ1 | RQ-1             | Múi giờ `Asia/Ho_Chi_Minh`, tuần T2 09/11 – CN 15/11/2026, đã gửi 10 Request (2 đã rút, 1 bị từ chối):<br>• Request thứ 11 lúc CN 15/11 23:30 ⟹ 422, `resetsOn = 2026-11-16`;<br>• lúc T2 16/11 00:30 ICT (= CN 17:30 UTC) ⟹ 201 (bắt lỗi tính tuần theo UTC);<br>• Request trong ân hạn hoặc Request tiếp tục ⟹ không đếm                                                                                                                                                                                                          |
| T-RQ2 | RQ-2, XY-1       | • `K1` 600.000 đ, 9 tháng, duyệt 15/11/2026 ⟹ 2026 = 1.200.000; số năm sau lưu = 4.200.000. 01/01 giá lên 650.000 ⟹ khoản 01/01 vẫn = 4.200.000.<br>• `K2` _Dùng lâu dài_ 375.000, duyệt 20/11 ⟹ 2026 = 750.000; lưu 4.500.000 (R-46). 01/01 giá 400.000 ⟹ khoản 01/01 = 4.800.000                                                                                                                                                                                                                                                  |
| T-R38 | RQ-2             | • Thực tập sinh hết hợp đồng 31/01/2027, `K1` 9 tháng, gửi 10/11/2026 ⟹ **201** (không 422); ngày kết thúc cắt về 31/01/2027; 3 tháng đã bắt đầu ⟹ 1.800.000 (2026: 1.200.000, lưu 600.000).<br>• Cùng người chọn `termMonths: null` ⟹ 422 `TERM_LONG_TERM_NOT_ALLOWED`.<br>• Request nhóm có 1 dòng thực tập sinh ⟹ chỉ dòng đó bị cắt                                                                                                                                                                                             |
| T-RQ3 | RQ-3             | `K1` cấp 05/08/2026, 3 tháng ⟹ kết thúc 04/11:<br>• nhắc 28/10;<br>• Request tiếp tục gửi 04/10 ⟹ 422; gửi 05/10 ⟹ 201;<br>• duyệt 01/11 (+3 tháng) ⟹ kết thúc 04/02/2027, nhắc 28/01/2027, không có tác vụ thu hồi;<br>• không duyệt ⟹ đúng 1 tác vụ `created_by_system` mở ngày 05/11                                                                                                                                                                                                                                             |
| T-XY1 | XY-1             | `K1` nhóm 3 người × 600.000 × 7 tháng năm sau ⟹ lưu 12.600.000 (3 dòng × 4.200.000); một người nghỉ 20/12 ⟹ khoản 01/01 = 8.400.000. Preview của người gửi không có `nextYearBudget`                                                                                                                                                                                                                                                                                                                                                |
| T-SM1 | SM-1             | Seat 400.000 đ/tháng, điều chuyển T2 26/10/2026 ⟹ P-A 25/31 = 322.581 đ, P-B 6/31 = 77.419 đ (US-12-01 AC-3); thu hồi xong ⟹ phần còn lại của tháng vào _Chưa phân bổ — kho_                                                                                                                                                                                                                                                                                                                                                        |
| T-RV1 | RV-1             | • Cơ sở 300 tr, dự phòng 30 tr, thực chi 168 tr (160 tr giá gốc + 8 tr thuế), cam kết 135 tr, tháng 6 ⟹ k = 0,05; dự kiến **309,75 tr** (công thức cũ ra 318,15), tốc độ 112 %, _Vàng_.<br>• Ca phân biệt: thực chi 200 tr (180 + 20), cam kết 100 tr ⟹ R-37 = 311,1 tr _Vàng_; công thức cũ = 333,3 tr _Đỏ_.<br>• Tăng giá đã biết: (1.650.000 − 1.500.000) × 4 seat × 4 tháng = 2.400.000 đ (US-12-21 AC-7); giá giảm ⟹ 0 (R-52)                                                                                                  |
| T-AD1 | AD-1             | Phần chưa phân bổ 1.800 − 1.771 = 29 tr:<br>• _Bổ sung_ 20 tr ⟹ OK; 30 tr ⟹ 422; _Giảm Trần năm_ 30 tr ⟹ 422.<br>• _Chuyển_ từ Hành chính (cơ sở 180, dự phòng 18, dự kiến cuối năm 110, đã dùng 80): 20 tr ⟹ OK (178 ≥ 110; công thức cũ 80 + 110 = 190 sẽ chặn sai); 90 tr ⟹ 108 < 110 ⟹ 422.<br>• _Chuyển_ do đổi Cost Center 170 tr ⟹ OK.<br>• R-48: _Bổ sung_ 20 tr cho Cost Center chưa có phiên bản ⟹ duyệt tạo bản ghi ngân sách đã duyệt; Request 15 tr qua kiểm tra ngân sách                                             |
| T-RV2 | RV-2             | Cơ sở 120 tr:<br>• đã dùng 96 ⟹ báo 80 %; 100 ⟹ không báo; 120 ⟹ báo 100 %;<br>• điều chỉnh +8 ⟹ cơ sở 128; đã dùng 128 ⟹ báo 100 % lần nữa, không báo lại 80 %                                                                                                                                                                                                                                                                                                                                                                     |
| T-BG2 | BG-1, BG-2       | • Trần 2.000 tr, Dự phòng kho 200 tr ⟹ tổng 1.850 tr ⟹ 409, vượt 50 tr (US-06-15 AC-12); lưu nháp không chặn.<br>• Chạy sang = 10 × 1.000.000 × 12 + 3.000.000 = 123.000.000 đ (US-06-15 AC-2).<br>• Nộp `BM-10` sau hạn ⟹ 409; Finance dời hạn sau khi khóa ⟹ 409                                                                                                                                                                                                                                                                  |
| T-PI  | PI-1, PI-2, RC-1 | • `K1` 6 tháng cấp 10/03/2027: kỳ 03 ⟹ _Mua mới_ 1/6; kỳ 05 ⟹ _Kỳ_ 3/6; kỳ 09 ⟹ cờ _ngoài thời hạn_; _Dùng lâu dài_ kỳ 2 ⟹ _Kỳ 2_ (R-50).<br>• Hóa đơn ngày 02/01/2027 cho kỳ 12/2026 ⟹ thực chi năm 2026.<br>• Figma 10 seat × 15 USD, cam kết 3.750.000, VND thực bị trừ 3.840.000 ⟹ **không** mở `SBF-11a`; 12 seat ⟹ mở 1 hồ sơ.<br>• Điều chuyển 16/11, hóa đơn `K1` kỳ 11/2026 sau hiệu lực ⟹ thực chi phòng mới, không cam kết (R-51).<br>• Ngày thanh toán T3 10/11/2026, chưa có hóa đơn ⟹ cờ từ 18/11, chưa cờ ngày 17/11 |
| T-PL  | PL-1, PL-2       | • Lô 3 Request, một mục _Không_ ⟹ cả 3 `RETURN`, 3 dòng `decision_checklists` cùng câu trả lời, lý do tự điền.<br>• Xuất bản chính sách v3 giữa lúc tải và lúc gửi ⟹ 409.<br>• V1 (cần xác nhận lại) đã xác nhận, V2 không cần ⟹ không chờ; V3 cần ⟹ chờ.<br>• Vai không áp dụng ⟹ `NOT_REQUIRED`; xác nhận ⟹ 409.<br>• `POST /policies` ⟹ 404 (R-42)                                                                                                                                                                               |

- Ask first: thêm dependency, đổi CI, DB/VPS dùng chung, push/merge `dev`, deploy, reset seed production. Never: sửa migration đã merge, nới test
  để qua, dữ liệu thật trong fixture/file mẫu. (Sửa `scripts/arch/tiers.cjs` cho `policies` đã được đồng ý — B-3/S-2.)

## 9. Câu hỏi còn mở

| #   | Câu                                                                                                                                                                                                                                                                                                                                                                            | Trạng thái                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Duyệt SPEC v2.1                                                                                                                                                                                                                                                                                                                                                                | **Mở** — Owner                                                                                                                              |
| O-1 | Nội dung 8 chính sách khởi tạo (+ "`K1` ưu tiên gói tháng" trong chính sách `MF-1`)                                                                                                                                                                                                                                                                                            | **Mở** — nguồn seed là [POLICY-SEED-DRAFT.md](POLICY-SEED-DRAFT.md), chờ Owner duyệt trước PL-1.5; chưa duyệt thì nạp với ghi chú nháp demo |
| —   | Đã đóng bằng `OWNER-REVIEW`: Q2 module `policies` (B-3, S-2) · Q3 công thức dự kiến (R-37) · Q4 nhịp nhắc 01/12 (B-4) · Q5 `SM-1` (B-2) · Q6 cắt hợp đồng (R-38, R-39) · Q7 mô hình giá (B-5) · Q8 route dòng/quý (B-6) · Q9 nhắc giải trình (B-7) · ai thấy `nextYearBudget` (S-3) · nhãn _Kỳ k_ (R-50) · hóa đơn `K1` sau điều chuyển (R-51) · tăng giá chỉ phần tăng (R-52) | Chốt                                                                                                                                        |
