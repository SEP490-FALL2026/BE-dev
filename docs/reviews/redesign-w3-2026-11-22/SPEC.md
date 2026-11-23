# SPEC — Đợt 3 thiết kế lại: kho B1 → B2 → B3 (22/11/2026)

- **Trạng thái:** Proposed, bản 1. Owner chưa duyệt; người code chỉ bắt đầu sau khi Owner duyệt SPEC/PLAN và trả lời
  [mục 9](#9-câu-hỏi-owner).
- **Nền:** BE `origin/dev` `6cf4bc3f`. Docs: sổ QĐ `Docs/Decisions/project-decisions.md` tới `QĐ-117p`; sổ phiên
  `Docs/Research-AI/redesign-2026-11-21/DECISIONS.md` (W1-Q*, W1b, V1-D*, W1c-Q*, W5/V5-Q*, A-Q*, P-_, M_, E*, CUT-*).
- **Nguồn (thứ tự thẩm quyền):** (1) sổ QĐ; (2) `DECISIONS.md`; (3) BRD 4.17, Quy trình 1.13, User Stories (EP-04, EP-05,
  EP-07, EP-11, EP-12), sơ đồ `SBF-20`, `SBF-19`, `SBF-11`, `SBF-11a`, `MF-1`, `MF-5`; (4) `W1c-luat-kho-seat-ban-cuoi.md`
  (`KHO-01` → `KHO-28`), `W1b-nang-giam-seat.md`, `V1-verify-W1-W1b.md`, `V6-hop-dong-lo-khoa.md`, `AUDIT-A-tien-kho-ngan-sach.md`,
  `Q117-A-fable-tien.md`, `V5-solid-tach-api.md`, `O3-transaction-audit.md`, `W2c-luat-khoa-may-ban-cuoi.md` (§1.3–1.4, ranh giới
  lô khóa); `NOTE MD/giai-thich-kho-gia-han-chi-phi-ngan-sach.md` (ví dụ số đã chốt — **ca kiểm** của SPEC này); (5) code
  `origin/dev`; (6) mẫu trình bày `docs/reviews/redesign-w1-2026-11-22/`.
- **Cách kiểm:** tác giả (Opus) đọc code `origin/dev` qua bản xuất `git archive` (chỉ đọc), không chạy test/build/DB. Mọi
  `file:line` tính từ `src/modules/` nếu không ghi khác, mở trên `6cf4bc3f`. Khi hai nguồn lệch: sổ QĐ thắng, rồi
  `DECISIONS.md`, rồi W1c; chỗ tôi tự chốt ghi **Tự chốt** kèm căn cứ.

## Mục lục

| Tệp                              | Nội dung                                                                                                               |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| [SPEC.md](SPEC.md)               | Mục tiêu, phạm vi, từ vựng, mô hình dữ liệu và migration tổng, thứ tự khóa, API, job, tác động FE, câu hỏi, phụ thuộc  |
| [SPEC-B1.md](SPEC-B1.md)         | B1 — từ vựng, giá seat-tháng, dòng kho seat-ngày bốn dòng con, cam kết tự giải phóng, chi phí không cam kết, tiết kiệm |
| [SPEC-B2.md](SPEC-B2.md)         | B2 — Workspace thuộc nhà cung cấp, nhiều thuê bao trên workspace, IT phụ trách, cổng ≥ 2 admin, cách tính seat         |
| [SPEC-B3.md](SPEC-B3.md)         | B3 — dòng thuê bao, sổ số seat, mua thêm seat, nhảy bậc, gia hạn theo dòng, `K1` không thuê bao, lô khóa `K4`          |
| [PLAN.md](PLAN.md)               | Gói P1…P24, làn, file, lệnh kiểm, điều kiện xong                                                                       |
| [CODE-PROMPT.md](CODE-PROMPT.md) | Prompt dán sẵn cho người code (Sonnet/Gemini), chế độ tự quyết                                                         |

## 1. Mục tiêu

Giảng viên chê mô hình kho/gói/thuê bao/workspace. Đợt này thay mô hình đó bằng mô hình của `QĐ-115b` → `QĐ-115au`,
`QĐ-116*` và `QĐ-117*`, làm ba phần **tự đứng được, merge riêng được**:

1. **B1** — không đổi bảng chính: từ vựng một nghĩa, giá luôn là **một seat một tháng**, dòng _Chưa phân bổ — kho dùng
   chung_ tính theo **seat-ngày** và tách **bốn dòng con**, cam kết `K2` **tự giải phóng** phần dư mỗi tháng và dọn cuối năm,
   _còn lại_ trừ **chi phí đang chạy không cam kết**, ngưỡng lệch hóa đơn `K2` mở `SBF-11a`, ba con số tiết kiệm đúng công thức.
2. **B2** — thực thể **Workspace** thuộc nhà cung cấp; thuê bao thuộc workspace; IT Admin phụ trách workspace; cổng ≥ 2 admin
   đặt trên workspace; cách tính seat, mức tối thiểu tổng, cờ _Hãng xuất hóa đơn sau_.
3. **B3** — **dòng thuê bao** (mỗi dòng một gói), **sổ số seat** chỉ ghi thêm với bốn cửa, mua thêm seat có **mã lần mua**,
   nhảy bậc, gia hạn và mục tiêu **theo dòng**, `K1` **không** thuê bao (gồm `K1` năm), **lô khóa `K4`** (hợp đồng 0..1),
   nhãn seat Trống + `KPI-4` theo sổ.

**Thành công** khi: mỗi mục W3-xx có test chứng minh tiêu chí chấp nhận (unit đỏ trước; http/integration chạy CI); mọi ví dụ
số trong tiêu chí ra **đúng tới đồng**; bộ kiểm nhanh xanh từng gói; CI GitHub full xanh trên `int/redesign-w3` (trừ dòng
`FIX-TEST-*.md`); `pnpm exec prisma migrate diff` không drift.

## 2. Phạm vi

### 2.1. Trong phạm vi

Bảng đầy đủ ở [mục 3](#3-bảng-mục-w3-xx). Thứ tự phụ thuộc bắt buộc: **B1 → B2 → B3**; trong B3: `K1` tách khỏi thuê bao
**trước** khi thay `addSeat` (cảnh báo HANDOFF §3 mục 2.3, W1c §3.3).

### 2.2. Ngoài phạm vi (đợt khác)

| Việc                                                                                                                                                | Đợt / lý do                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sổ máy, mã tài sản, `device_activations`, kích hoạt khóa ↔ máy, `keyBinding` `DEVICE_KEY`/`BUNDLED`                                                 | Đợt 2 (W2c; bản nháp `redesign-w2-2026-11-22`). Đợt 3 **tạo** bảng `license_lots` giữ id khoản mua của đợt 2 — [§10](#10-phụ-thuộc-đợt-1-và-đợt-2)   |
| Tách 6 operation (`personal`/`subscription`/`license-lot` của hóa đơn, `seat-*-completion`)                                                         | Đợt 6 (`QĐ-115am`, CUT-6). Đợt 3 chỉ thêm route mới cần cho mô hình mới                                                                              |
| Đánh dấu `deprecated`, 4 operation "nên tách" (gồm tách `subscriptionRenewalPropose`)                                                               | Không làm (CUT-6)                                                                                                                                    |
| Phiếu nhiều mục                                                                                                                                     | Đợt 4                                                                                                                                                |
| `SBF-08` ô _số tài khoản đang hoạt động ở hãng_ trên dòng (`QĐ-116k`, `QĐ-116bd`)                                                                   | Đợt 7 (AUDIT-C mục 5); bảng dòng để chỗ, không thêm cột ở đợt này                                                                                    |
| Chốt lại năm nay/năm sau lúc cấp (`QĐ-116ah`, `QĐ-117h`) cho `K2`                                                                                   | Không cần: cam kết theo tháng (W3-07) + `LATE_GRANT` có sẵn cho cùng số tiền ([SPEC-B1 W3-07](SPEC-B1.md#w3-07)). Phần `K1` có số tháng: làm ở W3-23 |
| Đường **ghi quyền theo vai** (`QĐ-104g`): code chưa có (`AssignmentSource` không có nguồn vai — `prisma/models/licensing.prisma:6-14`; không route) | Đợt khác (luồng phụ). Đợt 3 chỉ làm sẵn căn cứ `ROLE_RIGHT` của sổ (`QĐ-117a`) để đợt đó gọi                                                         |
| Seed lịch sử 12–18 tháng ghi thẳng DB (`QĐ-115as`)                                                                                                  | Bước seed sau đợt; đợt 3 chỉ chuyển seed hiện có (qua API) sang mô hình mới                                                                          |
| Sửa User Stories/BRD/sơ đồ                                                                                                                          | Docs, ngoài repo BE                                                                                                                                  |

### 2.3. Giả định (sửa nếu sai)

1. Một **kỳ** của thuê bao vẫn là **một dòng `subscriptions`** nối nhau bằng `renewed_from_id` như hôm nay
   (`prisma/models/catalog.prisma:344-405`, `catalog/subscription/period/subscription-period.service.ts:194-240`). "Thuê bao" của
   QĐ = chuỗi kỳ; **dòng thuê bao** thuộc một kỳ, kỳ mới mở dòng mới nối `renewed_from_line_id`. **Tự chốt** — giữ cơ chế mang
   quyền sang kỳ sau (`RENEWAL_CARRY`, `licensing/assignment/assignment.service.ts:441-462`) và trigger chuỗi kỳ; W1c §1.4 không
   bắt dòng sống qua nhiều kỳ, chỉ bắt "kỳ mới mở mỗi dòng bằng `RENEWAL`" (`KHO-14`).
2. Tiền VND minor (đồng), `BigInt`; mọi phép chia làm tròn **nửa lên xa 0** tới đồng (`roundHalfAway`,
   `budgets/seat-month/seat-month.policy.ts:12-17`) trừ chỗ ghi khác. Phần dư làm tròn của một chuỗi ngày dồn vào đoạn cuối như
   hôm nay (`seat-month.policy.ts:69-77`).
3. Dữ liệu demo được dựng lại bằng seed sau đợt; migration vẫn phải chạy đúng trên DB demo đang có (không mất dữ liệu tiền).
4. Đợt 1 (`int/redesign-w1`) merge vào `dev` **trước** khi tách nhánh đợt 3 ([§10](#10-phụ-thuộc-đợt-1-và-đợt-2)).

## 3. Bảng mục W3-xx

| Mục   | Phần | Nội dung                                                                              | Nguồn chính                                                              | Cỡ  | Làn      | Gói            |
| ----- | ---- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | --- | -------- | -------------- |
| W3-01 | B1   | Từ vựng một nghĩa ở wire, mô tả OpenAPI, module card                                  | `QĐ-115b`, `KHO-01`                                                      | S   | tech     | P1             |
| W3-02 | B1   | Giá tháng là nguồn sự thật; kỳ cam kết định mua ở gói; một phép quy đổi               | `QĐ-115e`, `QĐ-115o`, `KHO-03`                                           | M   | tech+biz | P1, P2         |
| W3-03 | B1   | Đổi số seat qua ô cũ: báo người liên quan; nối/xóa `increasesObligation`              | `QĐ-115f`, `KHO-27`, W1c §3.3                                            | S   | tech+biz | P1, P10        |
| W3-04 | B1   | Dòng kho seat-ngày, bốn dòng con, so Dự phòng                                         | `QĐ-115l`, `QĐ-116aj`, `QĐ-116bf`, `KHO-22`, `KHO-24`                    | M   | biz      | P5             |
| W3-05 | B1   | Số kỳ vọng hóa đơn `K2`, _Chênh lệch hóa đơn kho_, ngưỡng 5 % mở `SBF-11a`            | `QĐ-116av`, `QĐ-116ak`, `QĐ-117l`, `KHO-23`                              | M   | biz      | P6             |
| W3-06 | B1   | Tỷ lệ chi phí seat/khóa Trống 10 %, nhãn (2)(3) theo thuê bao                         | `QĐ-115k`, `QĐ-116aq`, `KHO-20`, `KHO-26`                                | S   | biz      | P5             |
| W3-07 | B1   | Cam kết `K2` theo tháng: tự giải phóng cuối tháng, dọn năm cũ                         | `QĐ-116ac`                                                               | L   | tech+biz | P3, P4         |
| W3-08 | B1   | _Còn lại_ trừ chi phí đang chạy không cam kết (`K2`)                                  | `QĐ-116af`, `QĐ-117i`                                                    | M   | biz      | P7             |
| W3-09 | B1   | Ba con số tiết kiệm: tiềm năng, tránh được, thực                                      | `QĐ-116as`, `QĐ-117f`, `QĐ-117g`                                         | M   | biz      | P8             |
| W3-10 | B2   | Thực thể Workspace + admin + IT phụ trách; route CRUD; chuyển dữ liệu                 | `QĐ-115c`, `QĐ-116o`, C-7                                                | L   | tech     | P9             |
| W3-11 | B2   | Thuê bao thuộc workspace; `seatCounting`, `minimumSeatsTotal`, `invoicedLater`        | `QĐ-115c`, `QĐ-115g`, `KHO-04`, C2–C5                                    | M   | tech+biz | P9, P10        |
| W3-12 | B2   | Cổng ≥ 2 admin trên workspace, ca khởi tạo, thuê bao thứ hai, cảnh báo admin          | `QĐ-114ae`, `QĐ-117e`, `QĐ-110k`, `QĐ-110u`                              | S   | biz      | P10            |
| W3-13 | B2   | Route cũ `planWorkspaceProfileSet` ghi vào workspace                                  | CUT-6, `QĐ-115c`                                                         | S   | tech     | P9             |
| W3-14 | B2   | Trùng (workspace, gói) chặn mọi lúc (mức thuê bao, trước khi có dòng)                 | `QĐ-116ag`, A-Q5                                                         | S   | biz      | P10            |
| W3-15 | B3   | Dòng thuê bao: bảng, chuyển dữ liệu, route dòng, `lines[]` khi khai                   | `QĐ-115d`, `QĐ-116ag`, `KHO-02`, V5 §5.B                                 | L   | tech     | P11, P15       |
| W3-16 | B3   | Sổ số seat chỉ ghi thêm, bốn cửa, sức chứa theo sổ, mở sổ `INITIAL`                   | `QĐ-115f`, `QĐ-117a`, `KHO-05`, `KHO-28`                                 | L   | tech+biz | P11, P16       |
| W3-17 | B3   | `K1` không thuê bao; `K1` năm; hợp đồng ngắn; Request tiếp tục 12 tháng               | `QĐ-115m`, `QĐ-116d`, `QĐ-116al`, `QĐ-117c`, A-Q10                       | L   | tech+biz | P12, P13       |
| W3-18 | B3   | Mua thêm seat (mã lần mua), lối tắt khi cấp, quyền theo vai, hạn hóa đơn              | `QĐ-115h`, `QĐ-116aw`, `QĐ-116be`, `QĐ-117a`, `QĐ-117m`, P-6             | L   | biz      | P16            |
| W3-19 | B3   | Nhảy bậc; ghi theo nhà cung cấp; giảm giữa kỳ; đổi loại seat; theo thành viên         | `QĐ-116ae`, `QĐ-116ax`, `KHO-08`, `KHO-12`, `KHO-15`, `KHO-17`, `KHO-18` | M   | biz      | P17            |
| W3-20 | B3   | Dòng _Nhà cung cấp thu tới dd/mm_ trên Request                                        | `QĐ-116ay`, `KHO-10`                                                     | S   | biz      | P16            |
| W3-21 | B3   | Điểm điều chỉnh theo dòng, mục tiêu chốt tại ngày gia hạn, tự gia hạn không ghi       | `QĐ-115i`, `QĐ-116aq`, `QĐ-116ap`, A-23, `KHO-14`                        | L   | tech+biz | P11, P18       |
| W3-22 | B3   | Nhãn (1) _Lỡ điểm điều chỉnh_, `KPI-4` cộng dần, dòng kho theo sổ và theo dòng        | `QĐ-115k`, `KHO-20`, `KHO-21`, `KHO-22`                                  | M   | biz      | P19            |
| W3-23 | B3   | Hóa đơn `K1` năm phân bổ theo tháng; chi phí không cam kết của `K1`                   | `QĐ-116ad`, `QĐ-116af`                                                   | M   | tech+biz | P12, P13       |
| W3-24 | B3   | Lô khóa `K4`: bảng, chuyển dữ liệu, route lô, nhập khóa vào lô, hợp đồng 0..1         | `QĐ-115n`, `QĐ-115au`, `QĐ-116o`, `QĐ-116v`, V6                          | L   | tech+biz | P12, P14, P20  |
| W3-25 | B3   | Tiền `K4`: lô mua cho Request, license dư một lần, cấp lần đầu, giá Request           | `QĐ-116am`, `QĐ-117j`, `QĐ-117n`, `QĐ-115t`                              | M   | tech+biz | P12, P20       |
| W3-26 | B3   | Cổng 1 ghost seat cho `K4`; `G1`–`G4` của `K4`; tiềm năng `K4` = 0                    | `QĐ-117o`, `QĐ-117f`                                                     | S   | biz      | P20            |
| W3-27 | B3   | Bỏ ô sửa tay: `purchasedQuantity`, `isPrimaryForPlan`, khai thuê bao `K1`/`PERPETUAL` | `QĐ-115f`, `QĐ-115o`, `KHO-05`, W1c §3.2                                 | S   | tech     | P21            |
| W3-28 | B3   | Seed chuyển sang mô hình mới                                                          | W1c §3.1 (Seed), `QĐ-115as`                                              | L   | tech     | P22 (+ P1, P9) |

Tổng: **28 mục** (B1 9, B2 5, B3 14). Chi tiết từng mục: nguồn → hiện trạng `file:line` → hành vi đúng → tiêu chí chấp nhận có
ví dụ số, ở `SPEC-B1/B2/B3.md`.

## 4. Từ vựng (W3-01, `KHO-01`)

| Từ (UI/tài liệu)        | Tên ở code/wire                                      | Nghĩa duy nhất                                                                              |
| ----------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Gói                     | `Plan`, `plan`                                       | bậc + loại seat (vd. _Claude Team — Standard_)                                              |
| Workspace               | `Workspace`, `workspace`                             | tài khoản tổ chức ở hãng, thuộc **một nhà cung cấp**                                        |
| Thuê bao                | `Subscription` (chuỗi kỳ)                            | cam kết có kỳ của một workspace; mỗi kỳ một bản ghi                                         |
| Dòng (thuê bao)         | `SubscriptionLine`, `subscriptionLine`               | một gói trong một kỳ thuê bao, có giá tháng và sổ số seat                                   |
| Sổ số seat              | `SeatChange`, `seatChanges`                          | bản ghi chỉ ghi thêm; số seat của dòng = tổng `delta` tới một ngày                          |
| Lần mua                 | `SeatPurchase`, `seatPurchase` (`code` `MUA-000001`) | một lần mua n seat; một hóa đơn lần nâng gắn đúng một lần mua                               |
| Kho                     | (không có bảng)                                      | seat/license **Trống** cấp được ngay                                                        |
| Lô khóa                 | `LicenseLot`, `licenseLot`                           | khoản mua đứt `K4`; **không** gọi thuê bao                                                  |
| Gói tháng / gói năm     | `commitmentTermMonths` 1 / 12                        | **kỳ cam kết** của thuê bao (không phải chu kỳ trả)                                         |
| Giá tháng               | `monthlyUnitPrice`                                   | VND chưa thuế, một seat một tháng (`K1`/`K2`); `K4`: _giá một license_ (`unitPrice` của lô) |
| Chi phí seat/khóa Trống | `idleCost`                                           | dòng con 1 của kho                                                                          |
| Chênh lệch hóa đơn kho  | `invoiceVariance`                                    | dòng con 2                                                                                  |
| Mua lô khóa theo máy    | `deviceLotPurchases`                                 | dòng con 3 (số liệu từ đợt 2; đợt 3 trả `0`)                                                |
| Thay khóa do hỏng máy   | `replacementKeys`                                    | dòng con 4                                                                                  |

## 5. Mô hình dữ liệu mới và migration

Chi tiết cột/ràng buộc ở từng phần; bảng dưới là **tổng** và thứ tự. Tên migration theo `DB-15`
(`docs/rules/database-business.md`): lớn hơn migration cuối đã merge (`20261119090000_department_starting`) **và** lớn hơn
migration của đợt 1 (W1-27, chưa đặt tên). Dùng mốc `202612…` để luôn đứng sau; nếu lúc merge có migration mới hơn thì đổi tên
(chỉ được khi chưa merge).

| #   | Migration                                          | Phần | Bảng/cột                                                                                                                                  | Hoàn tác được?                                           | Rủi ro dữ liệu                                                                                      |
| --- | -------------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| M1  | `20261201000000_w3_monthly_price`                  | B1   | `subscriptions.monthly_unit_price_minor`, `plans.reference_commitment_months` + backfill + CHECK                                          | Có (drop cột)                                            | Giá năm không chia hết 12 lệch ≤ 6 đ/năm ⟹ vào _Chênh lệch hóa đơn kho_                             |
| M2  | `20261201000100_w3_commitment_months_pool_figures` | B1   | bảng `budget_commitment_months`; `invoices.pool_*`; `subscription_renewals.realised_*`                                                    | Có                                                       | Cam kết cũ không có dòng tháng ⟹ chỉ được dọn cuối năm                                              |
| M3  | `20261201000200_w3_release_and_outcome_values`     | B1   | `CommitmentReleaseReason` + `MONTH_END`, `YEAR_END_SEAT_MONTHS`; `InvoiceDiscrepancyOutcome` + `EXCHANGE_RATE_LINE_PRICE_UPDATED`         | **Không** (`ALTER TYPE … ADD VALUE` — ghi theo `DB-05`)  | Không                                                                                               |
| M4  | `20261202000000_w3_workspaces`                     | B2   | `workspaces`, `workspace_admins`; `subscriptions.workspace_id`, `seat_counting`, `minimum_seats_total`, `invoiced_later` + backfill       | Có (drop bảng/cột; `plan_workspace_profiles` giữ nguyên) | Ứng dụng `K2` không có nhà cung cấp ⟹ migration **dừng** (`RAISE`)                                  |
| M5  | `20261203000000_w3_subscription_lines_seat_ledger` | B3   | `subscription_lines`, `seat_purchases`, `seat_changes` (append-only), `subscription_renewal_lines`; trigger sức chứa mới; mở sổ `INITIAL` | Có (drop; trigger cũ dựng lại)                           | Hai kỳ sống cùng (workspace, gói) ⟹ **dừng** (`RAISE`), Owner gộp trước (`QĐ-116ag`, tiền lệ W1-Q4) |
| M6  | `20261203000100_w3_license_lots`                   | B3   | `license_lots`; `license_keys.license_lot_id`, `cost_borne`; `license_lot_charges` (budgets); chuyển `PERPETUAL` → lô                     | Có (cột `subscription_id` của khóa giữ nguyên)           | Khóa của thuê bao `PERPETUAL` có số license < số khóa ⟹ lô lấy max(license, khóa)                   |
| M7  | `20261203000200_w3_personal_rights_allocations`    | B3   | `license_assignments.personal_commitment_months`, `billing_anchor_on`; `subscriptions.closed_at`, `closed_reason`; `invoice_allocations`  | Có                                                       | Thuê bao `K1` cũ đóng (không xóa); quyền `K1` cũ giữ `subscription_id` (bảng bất biến)              |

**Nguyên tắc chung:**

- Không xóa cột/bảng có dữ liệu trong đợt này (`purchased_quantity`, `is_primary_for_plan`, `plan_workspace_profiles`,
  `license_keys.subscription_id`, `contract_subscriptions` của `PERPETUAL`): giữ làm dữ liệu cũ, thôi ghi. Xóa ở đợt riêng có
  quyết định Owner.
- Migration **không** nêu tên vai DB (`database-business.md` H7). Bảng chỉ ghi thêm (`seat_changes`, `invoice_allocations`,
  `license_lot_charges`) giữ bất biến bằng **trigger**; thêm vào `RUNTIME_TABLE_EXCEPTIONS` của
  `src/infrastructure/database/database-role-judgement.ts` **chỉ** nếu muốn chặn thêm ở tầng quyền (khuyến nghị: thêm
  `seat_changes`, `invoice_allocations` với `SELECT, INSERT`, cùng gói tạo bảng).
- Sequence mới `seat_purchase_code_seq` (đánh số `MUA-000001`) chỉ dùng `nextval` ⟹ runtime `USAGE` là đủ, **không** vào
  `RUNTIME_SEQUENCE_EXCEPTIONS` (H7-SEQ).
- Mỗi migration có khối **kiểm trước** (`DO $$ … RAISE EXCEPTION … $$`) cho mọi điều kiện backfill không tự sửa được; không tự
  sửa dữ liệu tiền (tiền lệ W1-Q4). Câu `SELECT` kiểm trước ghi trong SPEC phần tương ứng để Owner chạy trên DB demo.
- Đảo lại (rollback): không có down migration (`DB-05`); mỗi migration ghi trong comment đầu file câu SQL đảo (drop cột/bảng
  mới, dựng lại trigger cũ) để roll-forward nếu cần. M3 không đảo được ⟹ đặt riêng, nhỏ nhất có thể.
- Sau mỗi migration: `pnpm prisma:validate`, `pnpm prisma:generate`; CI job `quality` kiểm drift (`DB-16`).

## 6. Kiến trúc

### 6.1. Module, capability, facade

| Dữ liệu                                                                                                                      | Module (tầng)        | Capability mới / sửa                                                              | Lý do                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `workspaces`, `workspace_admins`                                                                                             | catalog (T4)         | **mới** `catalog/workspace/`                                                      | Hồ sơ hãng; `catalog/plan` đã 22 file                                                                                                                                                                                 |
| `subscription_lines`, `seat_changes`, `seat_purchases`                                                                       | catalog              | **mới** `catalog/subscription-line/` (nhóm `ledger/`, `purchase/`, `correction/`) | `catalog/subscription/` đã đủ **25 file** (trần) — không thêm file vào đó, chỉ sửa                                                                                                                                    |
| `subscription_renewal_lines`                                                                                                 | licensing            | `licensing/subscription-renewal/` (nhóm mới `lines/`)                             | Thuộc ca gia hạn                                                                                                                                                                                                      |
| `license_lots`                                                                                                               | catalog              | **mới** `catalog/license-lot/`                                                    | **Tự chốt** khác V5 §7 (`licensing/license-lot`): lô là khoản mua như thuê bao, liên kết hợp đồng (trigger ở catalog), giá, IT phụ trách (`CatalogResponsibilityApi`) đều ở catalog; licensing đã được import catalog |
| `license_keys.license_lot_id`, `cost_borne`                                                                                  | licensing            | `licensing/license-key/`                                                          | Khóa vẫn của licensing                                                                                                                                                                                                |
| `budget_commitment_months`, `license_lot_charges`, `invoice_allocations`                                                     | budgets (T5)         | `budgets/commitment/` (nhóm `month/`), **mới** `budgets/shared-pool-line/`        | Cam kết và thực chi thuộc budgets; `budgets/seat-month/` (17 file) giữ phần seat-tháng                                                                                                                                |
| tham số `K2_INVOICE_VARIANCE_THRESHOLD_PERCENT`, `SEAT_PURCHASE_INVOICE_DUE_WORKING_DAYS`, `SEAT_PURCHASE_LATE_INVOICE_DAYS` | operating-parameters | `parameter-definitions.policy.ts`                                                 | `owner: 'FINANCE'` cho ngưỡng (`QĐ-116ak`), Super Admin cho hạn                                                                                                                                                       |

Facade mới/đổi (chỉ qua `public/`, không query chéo bảng):

| Facade                                                | Phương thức (dạng)                                                                                                                    | Người gọi                               |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `CatalogApi` (sửa)                                    | `addPoolSeat` **bỏ** ở B3 (P16) → thay `SeatLedgerApi.buyOneForGrant`; `findSeatTarget`/`lockSeatTarget` trả `subscriptionLineId`     | licensing                               |
| **mới** `public/seat-ledger.api.ts` → `SeatLedgerApi` | `buyOneForGrant(tx, …)`, `recordMember(tx, …)`, `seatsOnDays(lineIds, from, until)`, `paidSeatDays(lineIds, month)`, `lineFacts(ids)` | licensing, budgets, requests            |
| **mới** `public/workspace.api.ts` → `WorkspaceApi`    | `workspaceOfSubscription`, `adminsOf`, `workingAdminCount`                                                                            | licensing (renewal), requests (màn mua) |
| **mới** `public/license-lot.api.ts` → `LicenseLotApi` | `lockLot`, `lotFacts`, `grantableStockOfPlans`, `referencePriceOfK4`                                                                  | licensing, requests                     |
| `SubscriptionPeriodApi` (sửa)                         | `getPurchaseFacts` trả `monthlyPriceMinor` từ cột mới; `recordNextPeriod` nhận `lines[]` (B3)                                         | budgets, requests, licensing            |
| `BudgetsApi`/`BudgetFacts` (sửa)                      | `holdCommitment` nhận `months[]` (W3-07); `runningUncommittedOf(costCenterId, year, today)` (W3-08)                                   | requests                                |
| `LicensingSeatMonthApi` (sửa)                         | `getSeatsInForceOn(day)` (W3-08)                                                                                                      | budgets                                 |
| `LicensingApi` (sửa)                                  | `recordAvoidedCost(tx, taskId, amount)` (W3-09), `recordRealisedSaving(tx, …)` (W3-09)                                                | requests                                |

Extension point: **không thêm**. Mọi luồng mới đi theo cạnh đã có (requests → licensing → catalog; budgets → licensing,
catalog; optimization → licensing, catalog). Hệ quả cần nhớ:

- Route **mua thêm seat** (`POST /subscription-lines/{id}/purchases`) cần biết _mục chờ cấp_ (tác vụ cấp `QUEUED` của Request đã
  duyệt) — dữ kiện của **licensing**. Catalog không được import licensing (cạnh cùng tầng chỉ `licensing → catalog`), nên
  controller của route này nằm ở **licensing** (`licensing/shared-pool/seat-purchases.controller.ts`), đọc tác vụ của mình rồi
  ghi sổ qua `SeatLedgerApi` (catalog). Tương tự số seat cần theo dòng ở `licensing/subscription-renewal`.
- Catalog ghi sổ nhưng **không** tự biết ai đang giữ seat: kiểm "số seat ≥ số đang chiếm" (C3) do trigger DB đếm
  `license_assignments` (bảng ràng buộc chéo module đã có tiền lệ: `license_assignment_check_capacity` đọc `subscriptions`).
- Nếu khi code thấy cần một cạnh khác (vd. catalog cần đọc Request) ⟹ **dừng hỏi**, không thêm cạnh.

### 6.2. Thứ tự khóa (bổ sung bảng đợt 1, `redesign-w1-2026-11-22/SPEC.md` §4)

Giữ nguyên các tầng của đợt 1 (tác vụ → Request; vòng lặp nhiều seat sắp theo (`subscriptionId`, `assignmentId`)). Thêm:

| #   | Tầng                                                                                                                                      | Sắp theo               | Dùng ở                                                                         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------ |
| 0   | advisory `seat-month:<sub>:<month>` (có), **`commitment-month:<org>:<month>`** (mới), **`seat-purchase:<line>`** không cần (khóa dòng đủ) | khóa                   | W3-07, W3-04                                                                   |
| 5b  | **`workspaces`** FS (FU khi sửa admin/IT phụ trách)                                                                                       | id                     | khai/hoàn tất thuê bao (cổng admin), `PUT /workspaces/{id}/admins`             |
| 6   | `subscriptions` (kỳ) — như đợt 1                                                                                                          | id                     |                                                                                |
| 6a  | **`license_lots`** FU (thay `subscriptions` cho `K4`)                                                                                     | id                     | cấp/thu hồi `K4`, nhập khóa, khai/sửa lô                                       |
| 6b  | **`subscription_lines`** FU                                                                                                               | id                     | cấp `K2`, mua thêm seat, mọi dòng `seat_changes`, kết quả gia hạn              |
| 6c  | `seat_purchases`, `seat_changes` — **chỉ chèn**, không chờ khóa                                                                           | —                      | trong tx đã giữ 6b                                                             |
| 7   | `plans` FS — như đợt 1                                                                                                                    | id                     |                                                                                |
| 7b  | **`license_keys`** FU                                                                                                                     | id                     | sau lô, trước assignment (đúng thứ tự `K4` hiện có: `licensing/README.md:206`) |
| 8   | `license_assignments`                                                                                                                     | id                     |                                                                                |
| 9   | `budget_commitments`                                                                                                                      | năm, id                |                                                                                |
| 9b  | **`budget_commitment_months`** FU                                                                                                         | (commitment id, tháng) | áp seat-tháng, giải phóng theo tháng/sự kiện                                   |
| 10  | advisory CC-year                                                                                                                          | cc id, năm             | (ngoại lệ E1 giữ: tx đã khóa cam kết đang chờ không lấy CC-year đó)            |

- Một tx chạm **nhiều dòng thuê bao** (kết quả gia hạn nhiều dòng, đổi loại seat `REDUCE` + `TOP_UP`) khóa **mọi dòng trong
  một câu `SELECT … WHERE id = ANY($1) ORDER BY id FOR UPDATE`** ngay sau tầng 6.
- Vòng lặp **nhiều cam kết** (giải phóng cuối tháng, dọn năm) mỗi cam kết **một tx**, sắp theo (`year`, `id`); không gom nhiều
  cam kết vào một tx.
- Ghi vào comment đầu service mới đúng thứ tự (`ARCHITECTURE.md` "Thứ tự khóa cố định cho mỗi luồng ghi").

## 7. API tổng hợp

Quy ước: route mới **bắt buộc** `expectedUpdatedAt` khi sửa bản ghi đã có (`QĐ-115ar`); route cũ **giữ nguyên** đường dẫn,
`operationId`, không gắn `deprecated` (CUT-6); thân/response route cũ chỉ **thêm** trường, trừ ba chỗ ghi **Phá vỡ**. Mô tả
OpenAPI không chứa mã nội bộ. Chi tiết body/response/lỗi ở từng phần.

### 7.1. Operation mới (16)

| Phần | Method | Path                                        | `operationId`                    | Vai               |
| ---- | ------ | ------------------------------------------- | -------------------------------- | ----------------- |
| B2   | GET    | `/workspaces`                               | `workspaceList`                  | IT_ADMIN, FINANCE |
| B2   | GET    | `/workspaces/{id}`                          | `workspaceGet`                   | IT_ADMIN, FINANCE |
| B2   | POST   | `/workspaces`                               | `workspaceCreate`                | IT_ADMIN          |
| B2   | PATCH  | `/workspaces/{id}`                          | `workspaceUpdate`                | IT_ADMIN          |
| B2   | PUT    | `/workspaces/{id}/admins`                   | `workspaceAdminsSet`             | IT_ADMIN          |
| B3   | POST   | `/subscriptions/{id}/lines`                 | `subscriptionLineAdd`            | IT_ADMIN          |
| B3   | PATCH  | `/subscription-lines/{id}`                  | `subscriptionLineUpdate`         | IT_ADMIN          |
| B3   | GET    | `/subscription-lines/{id}/seat-changes`     | `subscriptionLineSeatChangeList` | IT_ADMIN, FINANCE |
| B3   | POST   | `/subscription-lines/{id}/purchases`        | `subscriptionLineSeatPurchase`   | IT_ADMIN          |
| B3   | POST   | `/subscription-lines/{id}/seat-corrections` | `subscriptionLineSeatCorrection` | IT_ADMIN          |
| B3   | POST   | `/subscription-lines/{id}/seat-reductions`  | `subscriptionLineSeatReduction`  | IT_ADMIN          |
| B3   | GET    | `/license-lots`                             | `licenseLotList`                 | IT_ADMIN, FINANCE |
| B3   | GET    | `/license-lots/{id}`                        | `licenseLotGet`                  | IT_ADMIN, FINANCE |
| B3   | POST   | `/license-lots`                             | `licenseLotCreate`               | IT_ADMIN          |
| B3   | PATCH  | `/license-lots/{id}`                        | `licenseLotUpdate`               | IT_ADMIN          |
| B3   | POST   | `/license-lots/{id}/keys`                   | `licenseLotKeyImport`            | IT_ADMIN          |

### 7.2. Operation đổi (39)

| Phần | `operationId`                                                                | Thay đổi                                                                                                                                                          | Phá vỡ?                                                                    |
| ---- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| B1   | `planCreate`, `planUpdate`, `planGet`, `planList`                            | thêm `referenceCommitmentMonths` (1 \| 12, `K1`/`K2`); mô tả giá `K4` = _giá một license_                                                                         | Không                                                                      |
| B1   | `subscriptionCreate`, `subscriptionUpdate`                                   | thêm `monthlyUnitPrice` (nguồn sự thật); `unitPrice` cũ vẫn nhận, quy đổi; B2: `workspaceId`, `seatCounting`, `minimumSeatsTotal`, `invoicedLater`; B3: `lines[]` | B3: **có** — `purchasedQuantity` bị từ chối ở `subscriptionUpdate` (W3-27) |
| B1   | `subscriptionGet`, `subscriptionList`                                        | thêm `monthlyUnitPrice`; B2 `workspace`; B3 `lines[]` (`maxItems` 20), `purchasedQuantity` = tổng sổ hôm nay (chỉ đọc)                                            | Không                                                                      |
| B2   | `subscriptionComplete`                                                       | cổng admin đọc workspace                                                                                                                                          | Không                                                                      |
| B2   | `planWorkspaceProfileSet`, `planGet`                                         | ghi/đọc qua workspace của nhà cung cấp                                                                                                                            | Không                                                                      |
| B1   | `seatMonthChargeList`                                                        | `poolLines[]` thêm `idleCost`, `idleCostByLabel`, `invoiceVariance`, `deviceLotPurchases`, `replacementKeys`; `unallocated` = tổng bốn dòng con                   | Không (nghĩa `unallocated` đổi)                                            |
| B1   | `budgetSummary`                                                              | thêm `sharedPoolLines` (bốn dòng con, lũy kế); `sharedPoolOverReserve` so tổng bốn dòng; `runningUncommitted` theo CC                                             | Không                                                                      |
| B1   | `budgetReviewPeriodGet`, `budgetReviewPeriodClose`                           | ảnh chụp thêm bốn dòng con; dòng CC thêm `priorPeriodAdjustment` (dọn năm cũ)                                                                                     | Không                                                                      |
| B1   | `purchaseInvoiceConfirm`, `purchaseInvoiceGet`                               | thêm `poolExpected`, `poolVariance`; mở hồ sơ `EXPECTED_AMOUNT`                                                                                                   | Không                                                                      |
| B1   | `invoiceDiscrepancyClose`, `invoiceDiscrepancyGet`                           | `outcome` thêm `EXCHANGE_RATE_LINE_PRICE_UPDATED`; `mismatches` thêm `EXPECTED_AMOUNT`                                                                            | Không                                                                      |
| B1   | `ghostSeatRecommendationList`, `ghostSeatRecommendationGet`                  | `potentialSaving.realisableOn` có ngày; số theo kỳ cam kết                                                                                                        | Không                                                                      |
| B1   | `operatingParameterList`, `operatingParameterSet`                            | 3 tham số mới                                                                                                                                                     | Không                                                                      |
| B3   | `subscriptionRenewalAdjustmentGet`                                           | `lines[]` (số cần, mục tiêu, nhãn theo dòng), `minimumSeatsTotal`                                                                                                 | Không                                                                      |
| B3   | `subscriptionRenewalPropose`                                                 | thân thêm `lines[{ subscriptionLineId, quantity }]`; thân cũ (`proposedQuantity`) còn nhận khi kỳ có **một** dòng                                                 | Không                                                                      |
| B3   | `subscriptionRenewalRecordOutcome`                                           | `nextPeriod.lines[]` như trên                                                                                                                                     | Không                                                                      |
| B3   | `provisioningTaskGrant`                                                      | `purchase` = lối tắt mua 1 qua sổ; nhận `roleBasis` cho quyền theo vai                                                                                            | Không                                                                      |
| B3   | `provisioningTaskComplete`                                                   | `K4`: khóa từ lô; `K1`: không chạm thuê bao                                                                                                                       | Không                                                                      |
| B3   | `licenseKeyImport`, `licenseKeyList`                                         | `licenseLotId` (mới); `subscriptionId` cũ còn nhận ⟹ quy về lô chuyển đổi                                                                                         | Không                                                                      |
| B3   | `purchaseInvoiceSubmit`, `purchaseInvoicePreview`, `purchaseInvoiceResubmit` | `link` `SUBSCRIPTION` thêm `seatPurchaseId?`, `lines[]?`; `link` mới `LICENSE_LOT`                                                                                | Không                                                                      |
| B3   | `accessRequestSubmit`, `accessRequestGet`, `spendApprovalGet`                | `K1` năm: `termMonths` cố định 12; `vendorChargeUntilRenewal` (dòng thông tin)                                                                                    | Không                                                                      |
| B3   | `stockSummaryList`, `subscriptionSeatUsage`                                  | tồn theo dòng / theo lô                                                                                                                                           | Không                                                                      |
| B3   | `contractSubscriptionLink`                                                   | thuê bao `K4` ⟹ 422 `CONTRACT.SUBSCRIPTION_NOT_K2` (hợp đồng của lô qua `licenseLotUpdate`)                                                                       | Không                                                                      |
| B2   | `itAdminDashboardGet`                                                        | thêm số workspace có cờ thiếu admin                                                                                                                               | Không                                                                      |

### 7.3. Không đổi

`contractSubscriptionUnlink`, `requestablePlanList`, `subscriptionDeadlineEventList`,
`licenseKeyReveal`, `licenseKeyWithdraw`.

### 7.4. Tác động FE (bàn giao API description sau đợt)

| Màn                              | Việc FE                                                                                                                         | Phần   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Khai/sửa gói                     | ô _Kỳ cam kết định mua_; nhãn giá `K4` _giá một license_                                                                        | B1     |
| Khai/sửa thuê bao                | gửi `monthlyUnitPrice` thay `unitPrice`; B2 chọn workspace, cách tính seat, tối thiểu tổng, hãng xuất hóa đơn sau; B3 bảng dòng | B1–B3  |
| Màn kho / Finance                | bốn dòng con, nhãn seat Trống, tỷ lệ                                                                                            | B1, B3 |
| Màn Workspace (mới)              | danh sách, tạo, sửa, admin, IT phụ trách; cờ _thiếu admin_                                                                      | B2     |
| Màn hồ sơ workspace của gói (cũ) | vẫn chạy; hiển thị workspace của nhà cung cấp                                                                                   | B2     |
| Màn dòng thuê bao (mới)          | sổ số seat (trang), mua thêm seat, ghi theo hãng, giảm giữa kỳ                                                                  | B3     |
| Điểm điều chỉnh                  | nhập số theo dòng                                                                                                               | B3     |
| Lô khóa (mới)                    | danh sách, tạo lô, nhập khóa vào lô, hợp đồng                                                                                   | B3     |
| Sửa số seat (ô cũ)               | **bỏ** ô; dùng màn dòng                                                                                                         | B3     |
| Request `K1`                     | gói năm: không cho chọn tháng; thông báo 422 hợp đồng ngắn                                                                      | B3     |
| Duyệt chi                        | dòng _Nhà cung cấp thu tới dd/mm: khoảng … đ_                                                                                   | B3     |
| Hóa đơn                          | chọn lần mua (`seatPurchaseId`) khi nhãn _Mua thêm seat_; nhiều dòng; lô khóa                                                   | B3     |

## 8. Job (việc định kỳ)

| Job                                               | Chạy ở                                            | Làm gì                                                                                                                                                              | Idempotent bởi                                                                            | Phần |
| ------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---- |
| Giải phóng cam kết cuối tháng                     | `SeatMonthSweeper` (sau khi tính tháng), bước mới | mỗi tháng đã tính đủ mọi thuê bao `K2`: mỗi cam kết có dòng tháng chưa chốt ⟹ giải phóng phần dư, chốt dòng                                                         | `budget_commitment_months.settled_at` + advisory `commitment-month:<org>:<month>`         | B1   |
| Dọn `K2` năm cũ (chốt tháng 12)                   | cùng bước, khi tháng = 12                         | phần còn giữ của cam kết `K2` năm đó ⟹ `YEAR_END_SEAT_MONTHS`                                                                                                       | cam kết `state ≠ HELD` sau lần đầu                                                        | B1   |
| Cảnh báo tỷ lệ chi phí seat/khóa Trống 10 %       | `BudgetReviewSweeper` (lượt giờ có sẵn)           | tháng vừa tính: thuê bao/dòng có tỷ lệ > 10 % ⟹ báo IT Admin phụ trách                                                                                              | event key `idleCostRatio:<line\|sub>:<YYYY-MM>`                                           | B1   |
| Cảnh báo vượt Dự phòng kho                        | có (`budget-review-pool-watch.service.ts:48-67`)  | vế phải = lũy kế bốn dòng con                                                                                                                                       | key có `sharedPoolOverReserve:<YYYY-MM>`                                                  | B1   |
| Điểm điều chỉnh theo dòng + cảnh báo đỏ           | `SubscriptionRenewalSweeper` (có)                 | tính số cần/mục tiêu **theo dòng** cho thông báo; cảnh báo đỏ giữ theo thuê bao                                                                                     | event key có                                                                              | B3   |
| Chốt mục tiêu tại ngày gia hạn + tự ghi `RENEWAL` | `SubscriptionRenewalSweeper`, bước mới            | qua ngày gia hạn không ca: lưu mục tiêu từng dòng (`subscription_renewal_lines.locked_*`); thuê bao tự gia hạn ⟹ mở kỳ mới, sổ `RENEWAL` = số đang trả, cờ _tự ghi_ | unique ca mỗi kỳ (`subscription_renewals_one_live_per_period`) + `ON CONFLICT DO NOTHING` | B3   |
| Nhắc hạn hóa đơn lần mua                          | `SubscriptionRenewalSweeper` (lượt giờ)           | lần mua có `invoice_due_on` < hôm nay, chưa có hóa đơn ⟹ nhắc IT Admin đang cấp + IT phụ trách thuê bao                                                             | event key `seatPurchaseInvoiceDue:<purchase>`                                             | B3   |

Mọi job: lỗi một chủ thể không dừng chủ thể khác; log bằng `describeForOperator`; chạy lại không ghi hai lần
(`docs/rules/security-jobs.md`). Cập nhật đoạn mô tả job tương ứng trong `docs/rules/security-jobs.md` cùng gói.

## 9. Câu hỏi Owner

Chỉ một điểm nguồn thật sự không trả lời được; mọi điểm khác tự chốt ở từng mục (ghi **Tự chốt** + căn cứ).

### W3-Q1 — Thuế không khấu trừ khi chia tiền lô `K4` mua cho Request

`QĐ-116am`, `QĐ-117n` viết "phòng chịu **1 license × giá lô**"; `QĐ-60a` viết thực chi = **chi phí thực chịu** (giá + thuế không
khấu trừ). Lô có thuế không khấu trừ thì hai câu cho hai số.

Ví dụ: lô CAD 3 license × 12.000.000 đ, thuế GTGT không khấu trừ 10 % ⟹ hóa đơn thực chịu 39.600.000 đ. Tháng 8 Quân được cấp
license dư lần đầu.

| Lựa chọn                                                       | Phòng Request (tháng hóa đơn) | Dòng kho (tháng hóa đơn) | Quân (tháng 8) | Kho còn sau tháng 8                    |
| -------------------------------------------------------------- | ----------------------------- | ------------------------ | -------------- | -------------------------------------- |
| **A — chia theo chi phí thực chịu / số license** (khuyến nghị) | 13.200.000                    | 26.400.000               | 13.200.000     | 13.200.000 = 1 license còn Trống       |
| B — đúng chữ "giá lô" (chưa thuế)                              | 12.000.000                    | 27.600.000               | 12.000.000     | 15.600.000 (3,6 tr thuế nằm mãi ở kho) |

**Khuyến nghị A**: tổng ba bên luôn = hóa đơn, kho chỉ còn đúng giá trị license chưa ai dùng (lý do của `QĐ-117n`); với lô không
thuế (ví dụ chuẩn của file giải thích 1F) A và B cho cùng 12/24/12 tr. Chưa trả lời ⟹ người code làm **A** và ghi `PROGRESS-biz.md`.

## 10. Phụ thuộc đợt 1 và đợt 2

Lượt review sau đợt 1 kiểm lại từng dòng; dòng nào đổi ⟹ sửa SPEC này trước khi code.

| Đợt 1 (trên `int/redesign-w1`, chưa merge `dev`)                                                 | Trạng thái 22/11 (PROGRESS) | Đợt 3 dựa vào                                                                                                           | Kiểm khi review                                                                                      |
| ------------------------------------------------------------------------------------------------ | --------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| W1-10/04/08/09 thứ tự khóa, `lockPrimaryCandidates` (P2, tech)                                   | chưa                        | §6.2 nối tiếp bảng của đợt 1; W3-27 bỏ `isPrimaryForPlan` khỏi API nhưng **giữ** khóa primary trong code tới khi bỏ cột | đường khóa của `subscription-change.service.ts` sau P2                                               |
| W1-03 + W1-14 `PATCH purchasedQuantity` bắt `expectedUpdatedAt`, chặn giảm, lý do tăng (P9, biz) | chưa                        | W3-03 thêm thông báo cùng chỗ; W3-27 từ chối hẳn ô này ở B3                                                             | mã lỗi `SUBSCRIPTION.VERSION_REQUIRED`, `MID_TERM_REDUCTION_NOT_ALLOWED`, `QUANTITY_REASON_REQUIRED` |
| W1-19 cổng ≥ 2 admin đếm IT Admin còn làm việc (P10, biz)                                        | chưa                        | W3-12 dời cổng sang workspace, **dùng lại** hàm đếm `PlanFactsService.workingAdminsAmong`                               | tên hàm, cờ `vendorAdminsBelowMinimum`                                                               |
| W1-05/06 seat-tháng đọc dưới khóa, tránh CC-year (P4, tech)                                      | chưa                        | W3-04, W3-07 sửa `seat-month-subscription.service.ts` **sau** P4                                                        | đường khóa tháng của seat-tháng                                                                      |
| W1-11 khoản 01/01 giá lúc duyệt (P7, biz)                                                        | **xong** `85bd9d72`         | W3-07: khoản `YEAR_START` `K2` cũng ghi dòng tháng; giá tháng = `approvalPrice` của W1-11                               | `year-start-commitments-batch.service.ts:245`                                                        |
| W1-12 chỉ IT phụ trách ghi kết quả gia hạn (P8, biz)                                             | **xong** `f56ce98d`         | W3-21 giữ luật; chuyển bước tự ghi `RENEWAL` chạy bởi hệ thống (`SystemActor`)                                          | `renewal-record.service.ts:89`                                                                       |
| W1-27 số hóa đơn chuẩn hóa + migration (P16, tech)                                               | chưa                        | W3-05, W3-18 sửa `purchase-invoice-*`; tên migration đợt 3 phải lớn hơn                                                 | tên migration W1-27                                                                                  |
| Bảng khóa §4 đợt 1, tầng 8 "(đợt 2) `device_activations`"                                        | —                           | đợt 3 thêm 6a/6b/7b/9b                                                                                                  | thứ tự tầng 6a ↔ 8 khi đợt 2 thêm kích hoạt                                                          |

Đợt 2 đang có **bản nháp** `docs/reviews/redesign-w2-2026-11-22/SPEC.md` (chưa duyệt, untracked lúc viết; §2.3 _Ranh giới với đợt
3_). Đợt 3 **nhận** các cam kết của bản nháp đó; lượt review sau khi đợt 2 duyệt kiểm lại từng dòng:

| Đợt 2 (bản nháp)                                                                                      | Đợt 3 làm                                                                                                                                                  |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Thêm `plans.key_binding` (`ACCOUNT` \| `DEVICE_KEY` \| `DEVICE_BUNDLED`), chặn `MF-1` cho gói gắn máy | Đọc cột: lô `purpose = REQUEST` chỉ cho `ACCOUNT`; `STOCK` chỉ cho `DEVICE_KEY`; `DEVICE_BUNDLED` không lô (`QĐ-115au`)                                    |
| Lô = khoản mua `PERPETUAL` hiện có; `device_activations` trỏ khóa                                     | M6 tạo `license_lots` **giữ đúng `id`** của thuê bao `PERPETUAL` nó thay (cam kết 1 của bản nháp) ⟹ `lotId` trên wire của đợt 2 không đổi                  |
| Trigger `device_activations_lot_capacity` gọi hàm `device_activation_occupied(purchase uuid)`         | M6 viết lại **hàm** để đếm quyền `ACCOUNT` của lô + kích hoạt đang mở + license mất theo máy (`QĐ-115s`); `license_lots_capacity` gọi cùng hàm (cam kết 3) |
| Facade `LicensingDeviceActivationApi`, `SeatOccupancyReader.occupiedBySubscription`                   | Giữ chữ ký; đổi truy vấn bên trong sang lô (cam kết 2, 4)                                                                                                  |
| `licenseKeyImport` theo `subscriptionId` giữ                                                          | Giữ **tương thích** (quy về lô cùng `id`) thay vì phá contract như W2c §5.3; route mới `licenseLotKeyImport`                                               |
| Nhiều lô mỗi gói, `STOCK`/`REPLACEMENT`, tiền lô theo máy để đợt 3                                    | W3-24 (nhiều lô), W3-25 (`POOL_DEVICE_LOT` khi lô `STOCK` có hóa đơn, `POOL_REPLACEMENT`)                                                                  |

Đợt 2 **chưa** merge khi đợt 3 bắt đầu ⟹ W3-24 coi mọi gói `K4` là `ACCOUNT`, không tạo hàm `device_activation_occupied`
(trigger lô tự đếm quyền `ACCOUNT`), và từ chối `STOCK`.

## 11. Đã chốt (không hỏi lại)

| Điểm                                              | Chốt                                                                                                     | Căn cứ                                                            |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Route cũ                                          | Giữ, không `deprecated`; chỉ thêm trường; ba chỗ phá vỡ ghi ở §7.2                                       | CUT-6                                                             |
| `purchasedQuantity` ở `subscriptionUpdate` sau B3 | Từ chối (409 `SUBSCRIPTION.SEAT_COUNT_VIA_LEDGER`); route vẫn còn                                        | `QĐ-115f` ("B3 bỏ hẳn ô này") thắng CUT-6 (CUT-6 không nói giữ ô) |
| Mở sổ thuê bao đang chạy                          | `INITIAL` tại **ngày chuyển đổi**; tháng trước giữ cách tính B1 / ảnh chụp đã chốt                       | W1c-Q4, `QĐ-115f`                                                 |
| Trùng (workspace, gói)                            | Chặn mọi lúc kể cả khởi tạo; migration gặp trùng thì dừng                                                | `QĐ-116ag`, W1-Q4 (tiền lệ không tự sửa dữ liệu)                  |
| Mua thêm seat                                     | Thao tác riêng n seat + lối tắt n = 1 khi cấp                                                            | W1c-Q3, `QĐ-115h`                                                 |
| Thuê bao theo thành viên giảm seat                | Từ ngày thanh toán kế                                                                                    | W1c-Q2, `QĐ-115g`                                                 |
| Hóa đơn nhiều dòng                                | Nhận cả hai kiểu                                                                                         | W1c-Q5, `QĐ-115d`                                                 |
| Tiềm năng / thực                                  | `QĐ-117f` (B), `QĐ-117g` (C)                                                                             | E1, E2                                                            |
| License dư `K4`                                   | Ghi một lần ở tháng hóa đơn; cấp lần đầu phòng nhận chịu                                                 | `QĐ-117j`, `QĐ-117n`                                              |
| Ngưỡng hóa đơn `K2`                               | 5 % mặc định, áp mọi nguyên nhân                                                                         | `QĐ-116ak`, `QĐ-117l`                                             |
| Hạn hóa đơn lần nâng                              | 5 ngày làm việc từ ngày hiệu lực `TOP_UP` / không nghĩa vụ / 95 ngày                                     | `QĐ-117m`                                                         |
| Cổng admin                                        | Khai mới chặn; khởi tạo, kỳ gia hạn, thuê bao cũ chỉ cờ; thuê bao thứ hai trong workspace < 2 admin chặn | `QĐ-117e`                                                         |
| Lô khóa ở catalog                                 | `catalog/license-lot/`                                                                                   | Tự chốt — §6.1                                                    |
| Kỳ thuê bao = một bản ghi                         | Giữ chuỗi `renewed_from_id`; dòng theo kỳ                                                                | Tự chốt — §2.3                                                    |
