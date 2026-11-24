# SPEC — Đợt 3 thiết kế lại: kho B1 → B2 → B3 (22/11/2026, bản 2.4, 25/11/2026)

> **Bản 2.4 (25/11):** đối chiếu code đợt 2 cuối (`origin/dev` `70543271`) — lệch và sửa ở [DELTA-W2-FINAL.md](DELTA-W2-FINAL.md) (DL-1…DL-9 đã áp; OQ-D1 cần Owner); hai làn chạy song song (PLAN bản 2.4).

- **Trạng thái:** Proposed, **bản 2.2** (24/11/2026) — bản 2 + review lượt 2 (N1 → N12, [§13.5](#135-đã-áp-review-lượt-2)) + Owner chốt T-1/T-2/T-3/T-7 + review lượt 3 chuỗi tiền (F1 → F15, [§13.6](#136-đã-áp-review-lượt-3)) + Owner chốt F8/F12/F13c + rà file giải thích (R-LATE, Q-F làm rõ, tên công ty mẫu — [§13.7](#137-đã-áp-sau-rà-file-giải-thích)). Đã áp [REVIEW-SPEC.md](REVIEW-SPEC.md) (3 reviewer, 63 finding — bảng
  [§13.3](#133-đã-áp-review-spec), [§13.4](#134-không-áp-hoặc-áp-một-phần)) và [OWNER-ANSWERS.md](OWNER-ANSWERS.md) (W3-Q1, Q-A → Q-G —
  [§13.2](#132-quyết-định-owner-owner-answersmd)). Còn chờ Owner duyệt bản 2; Sonnet/Gemini chỉ code sau khi Owner duyệt **và** đợt 2 đã ở `dev`.
- **Nền:** BE `origin/dev` `b7a7cc80` (đợt 1 đã vào bằng squash `4e029dbd`; fix G3). **Đợt 2 (`int/redesign-w2`) merge vào `dev` trước khi tách
  nhánh đợt 3** — SPEC viết trên code đợt 2 thật, đọc ở `int/redesign-w2` `8a4c8b70` (chứa `b7a7cc80`). Không còn nhánh "đợt 2 chưa merge".
  Lệnh kiểm điều kiện: [PLAN — Nền và nhánh](PLAN.md#nền-và-nhánh).
- **Docs:** sổ QĐ `Docs/Decisions/project-decisions.md` tới **`QĐ-119e`** (gồm `QĐ-118d/f/l`: chỉ IT phụ trách phòng hoặc người làm thay làm việc
  của phòng; chỉ Super Admin đổi người phụ trách thuê bao/workspace/lô/mục danh mục; người tạo là người phụ trách ban đầu); **BRD 4.19**; sổ phiên
  `Docs/Research-AI/redesign-2026-11-21/DECISIONS.md`.
- **Nguồn (thứ tự thẩm quyền):** 0. `OWNER-ANSWERS.md` (24/11); (1) sổ QĐ; (2) `DECISIONS.md`; (3) BRD 4.19, Quy trình, User Stories (EP-04,
  EP-05, EP-07, EP-11, EP-12), sơ đồ `SBF-20`, `SBF-19`, `SBF-11`, `SBF-11a`, `MF-1`, `MF-5`; (4) `W1c-luat-kho-seat-ban-cuoi.md` (`KHO-01` →
  `KHO-28`), `W1b-nang-giam-seat.md`, `V1-verify-W1-W1b.md`, `V6-hop-dong-lo-khoa.md`, `AUDIT-A-tien-kho-ngan-sach.md`, `Q117-A-fable-tien.md`,
  `V5-solid-tach-api.md`, `O3-transaction-audit.md`, `W2c-luat-khoa-may-ban-cuoi.md`; `Docs/Requiments/giai-thich-kho-gia-han-chi-phi-ngan-sach.md`
  (ví dụ số — **ca kiểm**); (5) code `int/redesign-w2`; (6) mẫu `docs/reviews/redesign-w2-2026-11-22/` (SPEC bản 2, CODE-PROMPT).
- **Cách kiểm:** tác giả đọc code bằng `git show int/redesign-w2:<file>` (chỉ đọc), không chạy test/build/DB. `file:line` từ `src/modules/` nếu
  không ghi khác. Chỗ review nêu đã đối chiếu lại trên `8a4c8b70`; chỗ khác giữ số bản 1 — người code xác nhận lại trước khi sửa (CODE-PROMPT §3
  bước 1). Hai nguồn lệch: OWNER-ANSWERS → sổ QĐ → `DECISIONS.md` → W1c; chỗ tác giả tự chốt ghi **Tự chốt** + căn cứ ([§13.1](#131-tự-chốt-theo-nguồn)).

## Mục lục

| Tệp                              | Nội dung                                                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| [SPEC.md](SPEC.md)               | Mục tiêu, phạm vi, từ vựng, migration tổng, kiến trúc, thứ tự khóa gộp, API + quyền, job + thông báo, phụ thuộc, test, đã chốt |
| [SPEC-B1.md](SPEC-B1.md)         | B1 — từ vựng, giá seat-tháng, dòng kho seat-ngày bốn dòng con, cam kết tự giải phóng, chi phí không cam kết, tiết kiệm         |
| [SPEC-B2.md](SPEC-B2.md)         | B2 — Workspace thuộc nhà cung cấp, người phụ trách, cổng ≥ 2 admin, cách tính seat, trùng (workspace, gói)                     |
| [SPEC-B3.md](SPEC-B3.md)         | B3 — dòng thuê bao, sổ số seat, mua thêm seat, nhảy bậc, gia hạn theo dòng, `K1` không thuê bao, lô khóa `K4`                  |
| [PLAN.md](PLAN.md)               | Gói, làn, file, lệnh kiểm, điều kiện xong                                                                                      |
| [CODE-PROMPT.md](CODE-PROMPT.md) | Prompt dán sẵn cho người code (Sonnet/Gemini), chế độ tự quyết, LUẬT CỨNG                                                      |

## 1. Mục tiêu

Giảng viên chê mô hình kho/gói/thuê bao/workspace. Đợt này thay mô hình đó bằng mô hình của `QĐ-115b` → `QĐ-115au`, `QĐ-116*`, `QĐ-117*` (cùng
`QĐ-118d/f/l` cho người làm), làm ba phần **tự đứng được, merge riêng được**:

1. **B1** — không đổi bảng chính: từ vựng, giá luôn **một seat một tháng**, tháng là tháng lịch, dòng _Chưa phân bổ — kho dùng chung_ theo
   **seat-ngày** tách **bốn dòng con**, cam kết `K2` **tự giải phóng** phần dư mỗi tháng và dọn năm cũ, _còn lại_ trừ **chi phí đang chạy không cam
   kết**, ngưỡng lệch hóa đơn `K2` (so tiền hàng) mở `SBF-11a`, ba con số tiết kiệm đúng công thức.
2. **B2** — **Workspace** thuộc nhà cung cấp; thuê bao thuộc workspace; người phụ trách workspace (đổi chỉ bởi Super Admin); cổng ≥ 2 admin trên
   workspace + một thông báo khi admin thôi làm việc; cách tính seat, mức tối thiểu tổng, cờ _Hãng xuất hóa đơn sau_.
3. **B3** — **dòng thuê bao**, **sổ số seat** chỉ ghi thêm (bốn cửa), mua thêm seat có **mã lần mua**, nhảy bậc, gia hạn và mục tiêu **theo dòng**
   (dòng cũ đóng tại ngày kết thúc kỳ), `K1` **không** thuê bao, **lô khóa `K4`** (viết lại năm hàm SQL của đợt 2 và hàm sức chứa quyền cũ), tiền `K4`, nhãn seat Trống +
   `KPI-4` theo sổ.

**Thành công** khi: mỗi mục W3-xx có test chứng minh tiêu chí (unit đỏ trước; http/integration chạy CI); mọi ví dụ số ra **đúng tới đồng**; mỗi luật
tiền có ca biên + ca diệt đột biến ([§11](#11-ma-trận-test-và-ca-diệt-đột-biến)); bộ kiểm nhanh xanh từng gói; CI GitHub full xanh trên
`int/redesign-w3` (trừ dòng `FIX-TEST-*.md`); `pnpm exec prisma migrate diff` không drift.

## 2. Phạm vi

### 2.1. Trong phạm vi

Bảng [§3](#3-bảng-mục-w3-xx). Thứ tự bắt buộc **B1 → B2 → B3**; trong B3: `K1` tách khỏi thuê bao **trước** khi thay `addSeat`; dữ liệu lô (M6) và
chuyển code đợt 2 sang lô (P20b) **trước** dòng thuê bao.

### 2.2. Ngoài phạm vi (đợt khác)

| Việc                                                                                                                         | Đợt / lý do                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Sổ máy, kích hoạt khóa ↔ máy, `keyBinding`, `maxActivations`                                                                 | Đợt 2 — **đã có** ở `dev`; đợt 3 chỉ chuyển nơi đếm sang lô (P20b, M6) và giữ chữ ký facade          |
| Đường **ghi quyền theo vai** (`QĐ-104g`, `QĐ-117a`) và căn cứ `ROLE_RIGHT` của sổ, `roleBasis`, `basis.roleHolderEmployeeId` | **Đợt 7** (luồng phụ) — Owner Q-A: nguồn, cột, CHECK, route làm cùng lúc ở đợt đó                    |
| Tách 6 operation (`personal`/`subscription`/`license-lot` của hóa đơn, `seat-*-completion`)                                  | Đợt 6 (`QĐ-115am`, CUT-6)                                                                            |
| Đánh dấu `deprecated`, 4 operation "nên tách"                                                                                | Không làm (CUT-6)                                                                                    |
| Phiếu nhiều mục                                                                                                              | Đợt 4                                                                                                |
| `SBF-08` ô _số tài khoản đang hoạt động ở hãng_ trên dòng (`QĐ-116k`, `QĐ-116bd`)                                            | Đợt 7                                                                                                |
| Chốt lại năm nay/năm sau lúc cấp (`QĐ-116ah`, `QĐ-117h`) cho `K2`                                                            | Không cần (cam kết theo tháng + `LATE_GRANT`); phần `K1` ở W3-23                                     |
| Hóa đơn âm / hoàn tiền của hãng khi giảm giữa kỳ                                                                             | Không có trong mô hình (`budgets/invoice/purchase-invoice-recorder.service.ts:39` từ chối `net ≤ 0`) |
| Seed lịch sử 12–18 tháng ghi thẳng DB (`QĐ-115as`)                                                                           | Bước seed sau đợt                                                                                    |
| Sửa User Stories/BRD/sơ đồ; sửa bảng 4A tháng 6 của file giải thích (Owner Q-F)                                              | Docs, ngoài repo BE                                                                                  |

### 2.3. Giả định

1. Một **kỳ** thuê bao vẫn là **một dòng `subscriptions`** nối nhau bằng `renewed_from_id` (`prisma/models/catalog.prisma:344-405`,
   `catalog/subscription/period/subscription-period.service.ts:194-240`); **dòng thuê bao** thuộc một kỳ, kỳ mới mở dòng mới nối
   `renewed_from_line_id`. **Tự chốt** — giữ `RENEWAL_CARRY` và trigger chuỗi kỳ (W1c §1.4, `KHO-14`).
2. Tiền VND minor (đồng), `BigInt`; mọi phép chia làm tròn **nửa lên xa 0** (`roundHalfAway`, `budgets/seat-month/seat-month.policy.ts:12-17`) trừ
   chỗ ghi khác; phần dư của chuỗi đoạn dồn đoạn cuối (`seat-month.policy.ts:69-77`).
3. Dữ liệu demo dựng lại bằng seed sau đợt; migration vẫn chạy đúng trên DB demo (không mất dữ liệu tiền).
4. Đợt 1 và **đợt 2** đã ở `dev` khi tách nhánh đợt 3 (điều kiện cứng — [§10](#10-phụ-thuộc-đợt-1-và-đợt-2)).

## 3. Bảng mục W3-xx

| Mục   | Phần | Nội dung                                                                                       | Nguồn chính                                                              | Cỡ  | Làn      | Gói                  |
| ----- | ---- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | --- | -------- | -------------------- |
| W3-01 | B1   | Từ vựng một nghĩa ở wire, mô tả OpenAPI, module card                                           | `QĐ-115b`, `KHO-01`                                                      | S   | tech+biz | P1, P5               |
| W3-02 | B1   | Giá tháng nguồn sự thật; kỳ cam kết định mua; một phép quy đổi; tháng lịch                     | `QĐ-115e`, `QĐ-115o`, `QĐ-104k`(1), `KHO-03`                             | M   | tech+biz | P1, P2               |
| W3-03 | B1   | Đổi số seat qua ô cũ: báo người liên quan; xóa `increasesObligation`                           | `QĐ-115f`, `KHO-27`, `QĐ-118f`                                           | S   | tech+biz | P1, P10              |
| W3-04 | B1   | Dòng kho seat-ngày, bốn dòng con, so Dự phòng                                                  | `QĐ-115l`, `QĐ-116aj`, `QĐ-116bf`, `KHO-22`, `KHO-24`                    | M   | biz      | P5                   |
| W3-05 | B1   | Số kỳ vọng hóa đơn `K2`, _Chênh lệch hóa đơn kho_, ngưỡng 5 % (tiền hàng)                      | `QĐ-116av`, `QĐ-116ak`, `QĐ-117l`, `KHO-23`, Q-E                         | M   | biz      | P6                   |
| W3-06 | B1   | Nhãn (2)(3) theo hạn chót, tỷ lệ chi phí seat/khóa Trống 10 %                                  | `QĐ-115k`, `QĐ-116aq`, `KHO-20`, `KHO-26`, Q-F                           | S   | biz      | P5                   |
| W3-07 | B1   | Cam kết `K2` theo tháng lịch: tự giải phóng, dọn năm cũ                                        | `QĐ-116ac`, `QĐ-104k`(1), Q-G                                            | L   | tech+biz | P3, P4               |
| W3-08 | B1   | _Còn lại_ trừ chi phí đang chạy không cam kết (`K2`)                                           | `QĐ-116af`, `QĐ-117i`                                                    | M   | biz      | P7                   |
| W3-09 | B1   | Ba con số tiết kiệm                                                                            | `QĐ-116as`, `QĐ-117f`, `QĐ-117g`, Q-G                                    | M   | biz      | P8                   |
| W3-10 | B2   | Workspace + admin + người phụ trách (Super Admin đổi); route; chuyển dữ liệu; nơi đọc hồ sơ cũ | `QĐ-115c`, `QĐ-116o`, `QĐ-118f`, `QĐ-118l`                               | L   | tech     | P9                   |
| W3-11 | B2   | Thuê bao thuộc workspace; `seatCounting`, `minimumSeatsTotal`, `invoicedLater`                 | `QĐ-115c`, `QĐ-115g`, `KHO-04`                                           | M   | tech+biz | P9, P10              |
| W3-12 | B2   | Cổng ≥ 2 admin trên workspace; một thông báo admin thôi làm việc                               | `QĐ-114ae`, `QĐ-117e`, `QĐ-110k`, `QĐ-110u`, Q-D                         | S   | biz      | P10                  |
| W3-13 | B2   | Route cũ `planWorkspaceProfileSet` ghi vào workspace                                           | CUT-6, `QĐ-115c`                                                         | S   | tech     | P9                   |
| W3-14 | B2   | Trùng (workspace, gói) chặn mọi lúc; khóa workspace FU                                         | `QĐ-116ag`, A-Q5                                                         | S   | tech+biz | P9, P10              |
| W3-15 | B3   | Dòng thuê bao: bảng, chuyển dữ liệu, route dòng, `lines[]`, chọn dòng theo ngày phục vụ        | `QĐ-115d`, `QĐ-116ag`, `KHO-02`, Q-C                                     | L   | tech+biz | P11, P15, P16a       |
| W3-16 | B3   | Sổ số seat chỉ ghi thêm, bốn cửa, mở sổ, mang quyền mua kỳ sau                                 | `QĐ-115f`, `KHO-05`, `KHO-28`, Q-B                                       | L   | tech+biz | P11, P16a            |
| W3-17 | B3   | `K1` không thuê bao; `K1` năm; hợp đồng ngắn; Request tiếp tục; xin lại                        | `QĐ-115m`, `QĐ-116d`, `QĐ-116al`, `QĐ-117c`                              | M   | tech+biz | P12b, P13a           |
| W3-18 | B3   | Mua thêm seat (mã lần mua), lối tắt khi cấp, hạn hóa đơn                                       | `QĐ-115h`, `QĐ-116aw`, `QĐ-116be`, `QĐ-117m`, `QĐ-110v`                  | L   | biz      | P16a, P16b           |
| W3-19 | B3   | Nhảy bậc; ghi theo nhà cung cấp; giảm giữa kỳ; đổi loại seat; theo thành viên                  | `QĐ-116ae`, `QĐ-116ax`, `KHO-08`, `KHO-12`, `KHO-15`, `KHO-17`, `KHO-18` | M   | biz      | P17                  |
| W3-20 | B3   | Dòng _Nhà cung cấp thu tới dd/mm_ trên Request                                                 | `QĐ-116ay`, `KHO-10`                                                     | S   | biz      | P16b                 |
| W3-21 | B3   | Điểm điều chỉnh theo dòng, mục tiêu chốt, tự gia hạn không ghi                                 | `QĐ-115i`, `QĐ-116aq`, `QĐ-116ap`, `KHO-14`, Q-C                         | L   | tech+biz | P11, P18             |
| W3-22 | B3   | Nhãn (1), `KPI-4`, dòng kho theo sổ                                                            | `QĐ-115k`, `KHO-20`, `KHO-21`, `KHO-22`                                  | M   | biz      | P19                  |
| W3-23 | B3   | Hóa đơn `K1` năm phân bổ theo tháng; không cam kết `K1`; chênh do thuế                         | `QĐ-116ad`, `QĐ-116af`, `QĐ-55a`                                         | M   | tech+biz | P12b, P13b           |
| W3-24 | B3   | Lô khóa `K4`: bảng, sáu hàm SQL, route lô, người phụ trách, nhập khóa, hợp đồng                | `QĐ-115n`, `QĐ-115au`, `QĐ-116v`, `QĐ-118f`                              | L   | tech+biz | P12a, P20b, P14, P20 |
| W3-25 | B3   | Tiền `K4`: lô cho Request, license dư, lô kho máy, lô thay thế                                 | `QĐ-116am`, `QĐ-117j`, `QĐ-117n`, `QĐ-115t`, W3-Q1                       | M   | biz      | P20                  |
| W3-26 | B3   | Cổng 1 ghost seat `K4`; `G1`–`G4` chỉ lô `ACCOUNT`                                             | `QĐ-117o`, `QĐ-117f`                                                     | S   | biz      | P20                  |
| W3-27 | B3   | Bỏ ô sửa tay: `purchasedQuantity`, `isPrimaryForPlan`, khai `K1`/`PERPETUAL`                   | `QĐ-115f`, `KHO-05`                                                      | S   | tech     | P21                  |
| W3-28 | B3   | Seed chuyển sang mô hình mới                                                                   | W1c §3.1, `QĐ-115as`, `QĐ-119a`, `QĐ-119e`                               | L   | tech     | P1, P9, P22          |

Tổng: **28 mục** (B1 9, B2 5, B3 14). Chi tiết: nguồn → hiện trạng `file:line` → hành vi đúng → tiêu chí có ví dụ số → test, ở `SPEC-B1/B2/B3.md`.

## 4. Từ vựng (W3-01, `KHO-01`)

| Từ (UI/tài liệu)        | Tên ở code/wire                                      | Nghĩa duy nhất                                                                              |
| ----------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Gói                     | `Plan`, `plan`                                       | bậc + loại seat (vd. _Claude Team — Standard_)                                              |
| Workspace               | `Workspace`, `workspace`                             | tài khoản tổ chức ở hãng, thuộc **một nhà cung cấp**                                        |
| Thuê bao                | `Subscription` (chuỗi kỳ)                            | cam kết có kỳ của một workspace; mỗi kỳ một bản ghi                                         |
| Dòng (thuê bao)         | `SubscriptionLine`, `subscriptionLine`               | một gói trong một kỳ thuê bao, có giá tháng và sổ số seat                                   |
| Sổ số seat              | `SeatChange`, `seatChanges`                          | bản ghi chỉ ghi thêm; số seat của dòng = tổng `delta` tới một ngày                          |
| Lần mua                 | `SeatPurchase`, `seatPurchase` (`code` `MUA-000001`) | một lần mua n seat; một hóa đơn _Mua thêm seat_ gắn đúng một lần mua                        |
| Kho                     | (không có bảng)                                      | seat/license **Trống** cấp được ngay                                                        |
| Lô khóa                 | `LicenseLot`, `licenseLot`                           | khoản mua đứt `K4`; **không** gọi thuê bao                                                  |
| Gói tháng / gói năm     | `commitmentTermMonths` 1 / 12                        | **kỳ cam kết** (không phải chu kỳ trả)                                                      |
| Giá tháng               | `monthlyUnitPrice`                                   | VND chưa thuế, một seat một tháng (`K1`/`K2`); `K4`: _giá một license_ (`unitPrice` của lô) |
| Người phụ trách         | `responsibleItAdmin`                                 | IT Admin trả lời cho thuê bao/workspace/lô; người tạo ban đầu; **chỉ Super Admin đổi**      |
| Chi phí seat/khóa Trống | `idleCost`                                           | dòng con 1 của kho                                                                          |
| Chênh lệch hóa đơn kho  | `invoiceVariance` (+ `invoiceVarianceInReview`)      | dòng con 2                                                                                  |
| Mua lô khóa theo máy    | `deviceLotPurchases`                                 | dòng con 3 — Σ hóa đơn lô `STOCK` của gói `DEVICE_KEY` (B3; B1 = 0)                         |
| Thay khóa do hỏng máy   | `replacementKeys`                                    | dòng con 4 — Σ hóa đơn lô `REPLACEMENT` (B3; B1 = 0)                                        |
| Chênh do thuế           | `taxVariance`                                        | phần thực chịu vượt giá chưa thuế do thuế không khấu trừ; báo riêng (`QĐ-55a`)              |

## 5. Mô hình dữ liệu mới và migration

Migration cuối trên `dev` sau khi đợt 2 vào: **`20261124100400_saas_issue_awaiting_assignee`**. Đợt 3 dùng mốc `202612…` (luôn lớn hơn, `DB-15`);
lúc merge có migration mới hơn ⟹ đổi tên (chỉ khi chưa merge). M6 **viết lại** năm hàm của `20261124100200_device_activations` (đợt 2) và `license_assignment_check_capacity` bằng
`CREATE OR REPLACE` — không sửa file migration đã merge.

| #   | Migration                                          | Phần | Bảng/cột                                                                                                                                                                                                                                                                                                                           | Hoàn tác được?                                           | Rủi ro dữ liệu                                                                   |
| --- | -------------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------- |
| M1  | `20261201000000_w3_monthly_price`                  | B1   | `subscriptions.monthly_unit_price_minor`, `plans.reference_commitment_months` + backfill + CHECK                                                                                                                                                                                                                                   | Có (drop cột)                                            | Kiểm trước dừng: giá ≠ VND, `ACTIVE` `OTHER`, `ACTIVE` `TERM` không giá          |
| M2  | `20261201000100_w3_commitment_months_pool_figures` | B1   | `budget_commitment_months`; `invoices.pool_*` + CHECK; `budget_review_periods.shared_pool_*`; `budget_review_lines.prior_year_released_minor`; `subscription_renewals.realised_*`                                                                                                                                                  | Có                                                       | Cam kết cũ không dòng tháng ⟹ chỉ dọn cuối năm                                   |
| M3  | `20261201000200_w3_release_and_outcome_values`     | B1   | `CommitmentReleaseReason` + `MONTH_END`, `YEAR_END_SEAT_MONTHS`; `InvoiceDiscrepancyOutcome` + `EXCHANGE_RATE_LINE_PRICE_UPDATED`; CHECK `mismatches` + `EXPECTED_AMOUNT`                                                                                                                                                          | **Không** (`ALTER TYPE … ADD VALUE`, `DB-05`)            | Không                                                                            |
| M4  | `20261202000000_w3_workspaces` + `20261202000100_w3_subscription_workspace` (bản 2.4 tách: bảng / cột + backfill) | B2   | `workspaces`, `workspace_admins`; `subscriptions.workspace_id`, `seat_counting`, `minimum_seats_total`, `invoiced_later` + backfill + CHECK                                                                                                                                                                                        | Có                                                       | Kiểm trước dừng: ứng dụng `K2`/`K4` trang quản trị/hồ sơ `K3` không nhà cung cấp |
| M5a | `20261203000000_w3_b3_enum_values`                 | B3   | `PurchaseInvoiceLabel` + `SEAT_PURCHASE`; `PurchaseInvoiceLinkKind` + `LICENSE_LOT`                                                                                                                                                                                                                                                | **Không** (`DB-05`)                                      | Không                                                                            |
| M5  | `20261203000100_w3_subscription_lines_seat_ledger` | B3   | `subscription_lines`, `seat_purchases`, `seat_changes`, `subscription_line_targets`; `subscription_renewals.*`; `purchase_invoices.seat_purchase_id`; trigger sức chứa; mở sổ                                                                                                                                                      | Có (drop; trigger cũ dựng lại)                           | Trùng (workspace, gói) sống ⟹ **dừng**; Owner gộp trước                          |
| M6  | `20261203000200_w3_license_lots`                   | B3   | `license_lots` (+ unique một lô `REQUEST` mỗi Request); unique một hóa đơn còn hiệu lực mỗi lô; `license_keys.license_lot_id`, `cost_borne`; `license_lot_charges`; `purchase_invoices.license_lot_id`; **6 hàm** `CREATE OR REPLACE`; CHECK `link_kind` + `LICENSE_LOT`; trigger bất biến hóa đơn +2 cột; chuyển `PERPETUAL` → lô | Có (cột `subscription_id` giữ; hàm cũ dựng lại từ đợt 2) | Kiểm trước dừng: `PERPETUAL` `ACTIVE` không giá, `DRAFT` có khóa                 |
| M7  | `20261203000300_w3_personal_rights_allocations`    | B3   | `license_assignments.personal_commitment_months`, `billing_anchor_on`; `subscriptions.closed_at`, `closed_reason`; `invoice_allocations` (+ `kind`, `adjusts_allocation_id`, bucket `POOL_LOT_DIFFERENCE`, âm cho dòng bù trừ); `invoice_year_applications`                                                                        | Có                                                       | Thuê bao `K1` cũ đóng (không xóa); quyền `K1` cũ giữ `subscription_id`           |

**Nguyên tắc chung:**

- Không xóa cột/bảng có dữ liệu (`purchased_quantity`, `is_primary_for_plan`, `plan_workspace_profiles`, `license_keys.subscription_id`,
  `contract_subscriptions` của `PERPETUAL`): giữ làm dữ liệu cũ, thôi ghi.
- Migration **không** nêu tên vai DB (`database-business.md` H7). Bảng chỉ ghi thêm (`seat_changes`, `invoice_allocations`, `license_lot_charges`)
  giữ bất biến bằng **trigger**; thêm `seat_changes`, `invoice_allocations` vào `RUNTIME_TABLE_EXCEPTIONS` của
  `src/infrastructure/database/database-role-judgement.ts` với `SELECT, INSERT` (cùng gói tạo bảng).
- Sequence `seat_purchase_code_seq` chỉ `nextval` ⟹ không vào `RUNTIME_SEQUENCE_EXCEPTIONS` (H7-SEQ).
- Mỗi migration có khối **kiểm trước** (`DO $$ … RAISE EXCEPTION … $$`) cho điều kiện backfill không tự sửa được; không tự sửa dữ liệu tiền (tiền
  lệ W1-Q4). Câu `SELECT` kiểm trước ghi ở SPEC phần tương ứng (Owner chạy trên DB demo) và trong commit message.
- Không down migration (`DB-05`); comment đầu file ghi câu SQL đảo. M3, M5a không đảo được ⟹ file riêng, nhỏ nhất.
- Sau mỗi migration: `pnpm prisma:validate`, `pnpm prisma:generate`; CI job `quality` kiểm drift (`DB-16`).

## 6. Kiến trúc

### 6.1. Module, capability, facade

| Dữ liệu                                                                                                                      | Module (tầng)        | Capability mới / sửa                                                                 | Lý do                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `workspaces`, `workspace_admins`                                                                                             | catalog (T4)         | **mới** `catalog/workspace/`                                                         | hồ sơ hãng; `catalog/plan` đã 18 file nguồn                                                     |
| `subscription_lines`, `seat_changes`, `seat_purchases`                                                                       | catalog              | **mới** `catalog/subscription-line/` (nhóm `ledger/`, `purchase/`, `correction/`)    | `catalog/subscription/` đã đủ trần — không thêm file, chỉ sửa                                   |
| `subscription_line_targets`                                                                                                  | licensing            | `licensing/subscription-renewal/lines/`                                              | thuộc ca gia hạn                                                                                |
| `license_lots`                                                                                                               | catalog              | **mới** `catalog/license-lot/`                                                       | **Tự chốt** khác V5 §7: lô là khoản mua như thuê bao (hợp đồng, giá, người phụ trách ở catalog) |
| `license_keys.license_lot_id`, `cost_borne`; `device_activations` (đợt 2)                                                    | licensing            | `licensing/license-key/`, `licensing/device-activation/`                             | khóa và kích hoạt vẫn của licensing                                                             |
| `budget_commitment_months`, `license_lot_charges`, `invoice_allocations`                                                     | budgets (T5)         | `budgets/commitment/month/`, **mới** `budgets/shared-pool-line/`, `budgets/invoice/` | cam kết và thực chi thuộc budgets                                                               |
| tham số `K2_INVOICE_VARIANCE_THRESHOLD_PERCENT`, `SEAT_PURCHASE_INVOICE_DUE_WORKING_DAYS`, `SEAT_PURCHASE_LATE_INVOICE_DAYS` | operating-parameters | `parameter-definitions.policy.ts`                                                    | `owner: 'FINANCE'` cho ngưỡng (`QĐ-116ak`), Super Admin cho hạn                                 |

Facade mới/đổi (chỉ qua `public/`, không query chéo bảng):

| Facade                                                                   | Phương thức (dạng)                                                                                                                               | Người gọi                      | Làn  |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ | ---- |
| `CatalogApi` (sửa)                                                       | `addPoolSeat` **xóa** (P16a); `findSeatTarget`/`lockSeatTarget` trả `subscriptionLineId`, gói `K4` khóa lô (P20); `workspaceDutiesOf` giữ chữ ký | licensing, personnel           | biz  |
| **mới** `catalog/public/seat-ledger.api.ts` → `SeatLedgerApi`            | `openLines`, `buyForItems`, `recordVendor`, `openNextPeriod`, `recordMember`, `seatsOnDays`, `paidSeatDays`, `lineFacts`                         | licensing, budgets, requests   | biz  |
| **mới** `catalog/public/workspace.api.ts` → `WorkspaceApi`               | `workspaceOfSubscription`, `adminsOf`, `workingAdminCount`, `responsibleOf`, `defaultWorkspaceOfVendor`, `workspacesWithIdleAdmins`              | licensing, requests, personnel | tech |
| **mới** `catalog/public/license-lot.api.ts` → `LicenseLotApi`            | `lockLot`, `lotFacts`, `lotOfKey` (P20b); `createLot` (P14)                                                                                      | licensing                      | tech |
| **mới** `catalog/public/license-lot-stock.api.ts` → `LicenseLotStockApi` | `grantableStockOfPlans`, `referencePriceOfK4`, `chooseLotForGrant`                                                                               | licensing, requests            | biz  |
| `SubscriptionPeriodApi` (sửa)                                            | `getPurchaseFacts` + `monthlyPriceMinor`, `startDate`, `endExclusive`; `adjustmentWindowsOf`; `earliestReducibleOn`; `recordNextPeriod(lines[])` | budgets, requests, licensing   | biz  |
| `CatalogResponsibilityApi` (sửa)                                         | `transferResponsibilities` chuyển cả workspace và lô; `vendorAdminRolesOf` một mục mỗi workspace; đếm workspace dưới mức                         | personnel, licensing           | tech |
| `BudgetsApi`/`BudgetFacts` (sửa)                                         | `holdCommitment` nhận `months[]`; `runningUncommittedOf(costCenterId, year, today)`; `recordPurchaseInvoice` thêm trường kho                     | requests                       | biz  |
| `LicensingSeatMonthApi` (sửa)                                            | `getSeatsInForceOn(day)`                                                                                                                         | budgets                        | biz  |
| `LicensingApi` (sửa)                                                     | `recordAvoidedCost(tx, taskId, amount)`, `recordRealisedSaving(tx, …)`                                                                           | requests                       | biz  |
| `LicensingDeviceActivationApi` (đợt 2)                                   | **giữ chữ ký**; bên trong đọc lô (P20b); wire `lotId` = `license_lot_id`                                                                         | devices                        | tech |

Extension point: **không thêm**. Hệ quả:

- Route **mua thêm seat** cần _mục chờ cấp_ (licensing) ⟹ controller ở `licensing/shared-pool/seat-purchases.controller.ts`, ghi sổ qua `SeatLedgerApi`.
  Tương tự `licenseLotCreate` (`purpose = REQUEST` cần tác vụ cấp + người thụ hưởng) ⟹ controller `licensing/license-key/license-lot-create.controller.ts`,
  ghi qua `LicenseLotApi.createLot`.
- Catalog không biết ai giữ seat: "số seat ≥ đang chiếm" do trigger DB đếm `license_assignments` (tiền lệ `license_assignment_check_capacity`).
- Ngày hiệu lực sổ chặn theo **tháng lịch hiện tại** (B2-R15), không đọc `seat_month_runs` (catalog/licensing không import budgets).
- Cần cạnh khác ⟹ **dừng hỏi**, không thêm cạnh.

### 6.2. Thứ tự khóa — bảng gộp đợt 1 + đợt 2 + đợt 3

Bảng chuẩn ở `docs/rules/database-business.md` mục _Thứ tự khóa chuẩn_ (`int/redesign-w2:docs/rules/database-business.md:100-140`). Đợt 2 thêm
0b, 0c, 2b và đặt `license_keys` ở "6b" trên giấy (W2 SPEC §6). **Code thật** của đợt 2 khóa khóa **sau** gói:
`CatalogApi.lockSeatTarget` khóa kỳ FU rồi gói FS (`catalog/subscription/seat-target.service.ts:73-87`), rồi
`licensing/device-activation/device-activation.service.ts:116-117` mới khóa khóa ⟹ bảng gộp đặt khóa ở **7b** (đúng thứ tự thật, không đổi luồng) và
**không còn tên tầng 6b** (K-B5). Gói chốt `biz` P23 sửa đúng bảng ở rule (không viết bảng thứ hai) và comment "tier 6b" ở
`device-activation.service.ts:40` (P20b).

| #   | Tầng                                                                                                                                                 | Sắp theo               | Ghi chú / đợt                                                                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | advisory/unique claim: lượt 01/01, `seat-month:<sub>:<month>`, **`commitment-month:<org>:<month>`** (đ3), unique ca gia hạn mỗi kỳ                   | khóa                   | W3-07, W3-21                                                                                                                                                    |
| 0b  | hàng trạng thái seat baseline (đợt 2)                                                                                                                | khóa                   | khai thuê bao/lô trong pha khởi tạo đọc pha ở đây                                                                                                               |
| 0c  | bộ đếm mã tài sản (đợt 2)                                                                                                                            | khóa                   | —                                                                                                                                                               |
| 1   | `employees`, hồ sơ nghỉ việc/điều chuyển                                                                                                             | id                     | —                                                                                                                                                               |
| 2   | `departments` (đợt 2: FU khi chỉ định làm thay)                                                                                                      | id                     | —                                                                                                                                                               |
| 2b  | **máy**: `managed_devices` → `device_registrations` → `device_return_tasks` (đợt 2)                                                                  | id                     | mở/gỡ/chuyển kích hoạt `DEVICE_KEY` đi 2b → 6a → 7b → 8                                                                                                         |
| 3a  | `provisioning_tasks` cấp                                                                                                                             | id                     | —                                                                                                                                                               |
| 3b  | `provisioning_tasks` thu hồi                                                                                                                         | id                     | —                                                                                                                                                               |
| 4   | `access_requests`, `access_request_lines`                                                                                                            | id                     | —                                                                                                                                                               |
| 5   | `budget_cycles` → proposal → version                                                                                                                 | id                     | —                                                                                                                                                               |
| 5b  | **`workspaces`** FU (đ3) — luồng đã biết kỳ: đọc `workspace_id` không khóa → khóa workspace `ORDER BY id` → khóa kỳ → đọc lại, lệch thì thử lại (N5) | id                     | khai/hoàn tất thuê bao `K2`, `subscriptionUpdate` đổi `workspaceId`, `subscriptionLineAdd`, sửa workspace/admin/người phụ trách, khai lô `K4` có trang quản trị |
| 6   | `subscriptions` (kỳ); `lockPrimaryCandidates` khi đổi primary                                                                                        | id                     | đợt 1                                                                                                                                                           |
| 6a  | **`license_lots`** FU (đ3; thay 6 cho `K4`); `lockLot` khóa tiếp **gói FS (7)** như `lockSeatTarget` (N6)                                            | id                     | cấp/thu hồi `K4`, nhập khóa, sửa lô, kích hoạt `DEVICE_KEY` (trigger `license_lots_capacity` và kích hoạt khóa lô `FOR UPDATE`)                                 |
| 6c  | **`subscription_lines`** FU (đ3); nhiều dòng ⟹ một câu `SELECT … WHERE id = ANY($1) ORDER BY id FOR UPDATE`                                          | id                     | cấp `K2`, mua, mọi dòng sổ, kết quả gia hạn, đổi loại seat                                                                                                      |
| 6d  | `seat_purchases`, `seat_changes` — **chỉ chèn**, không chờ khóa                                                                                      | —                      | trong tx đã giữ 6c                                                                                                                                              |
| 7   | `plans` FS (FU khi đổi primary)                                                                                                                      | id                     | —                                                                                                                                                               |
| 7b  | **`license_keys`** FS/FU (đợt 2 ghi "6b"; nay 7b theo code thật)                                                                                     | id                     | sau lô và gói, trước quyền/kích hoạt                                                                                                                            |
| 8   | `license_assignments` / `device_activations`                                                                                                         | id                     | —                                                                                                                                                               |
| 9   | `budget_commitments`                                                                                                                                 | năm, id                | —                                                                                                                                                               |
| 9b  | **`budget_commitment_months`** FU (đ3)                                                                                                               | (commitment id, tháng) | áp seat-tháng, giải phóng theo tháng/sự kiện                                                                                                                    |
| 10  | advisory CC-year                                                                                                                                     | cc id, năm             | ngoại lệ E1 giữ                                                                                                                                                 |

- Không còn tầng tên "6b". Vòng lặp **nhiều cam kết** (chốt tháng, dọn năm) mỗi cam kết **một tx**, sắp (`year`, `id`). Vòng lặp nhiều seat giữ
  `compareSeatLockOrder` (`src/core/seat-lock-order.ts`).
- Ngoại lệ E4 của đợt 2 (hủy hồ sơ nghỉ việc sau mốc chặn ‖ luồng máy) giữ: lô `DEVICE_KEY` (6a) không bao giờ có seat người (S-4).
- Mỗi luồng tranh chấp mới có integration 2 connection, barrier, lặp 20, không `40P01`: chốt tháng (W3-07 H), khai cùng workspace (W3-14),
  mua ‖ mang quyền (W3-16), mua ‖ mua (W3-18), tự ghi gia hạn (W3-21), cấp ‖ kích hoạt cùng lô (W3-24).
- Comment đầu mỗi service mới ghi thứ tự khóa của nó.

## 7. API

Theo `docs/rules/api-contract.md`: Zod strict, mỗi mã lỗi một status, `examples` từ `*_ERROR_EXAMPLES`, mô tả **không** chứa mã nội bộ (`QĐ-`,
`FR-`, `US-`, `KHO-`, `MAY-`, `W1-`, `W2-`, `W3-`, `D-`, `OQ-`, `MF-`, `SBF-`); collection mới đủ `API-LIST-DETAIL.1` (summary riêng, `pageSize`
có `maximum`, thứ tự có `id`, đếm + trang một snapshot, projection ở repo). Mọi route có đầu vào khai 422 `VALIDATION_ERROR`; 401/503 dùng
`UNAUTHENTICATED_RESPONSE`, `GUARDED_SERVICE_UNAVAILABLE_RESPONSE`; route có luật phạm vi khai 403 với mã riêng. Route mới sửa bản ghi đã có
**bắt buộc** `expectedUpdatedAt` (`QĐ-115ar`); route cũ giữ đường dẫn, `operationId`, không `deprecated` (CUT-6), chỉ thêm trường trừ chỗ ghi
**Phá vỡ** ở §7.2.

### 7.1. Operation mới (18)

| #   | Method · path                                    | `operationId`                        | Vai · phạm vi (QĐ-118)                                  | Lỗi riêng (status)                                                                                                                                                                                                                                             |
| --- | ------------------------------------------------ | ------------------------------------ | ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | GET `/workspaces`                                | `workspaceList`                      | IT_ADMIN, FINANCE, SUPER_ADMIN · cả tổ chức             | —                                                                                                                                                                                                                                                              |
| 2   | GET `/workspaces/{id}`                           | `workspaceGet`                       | IT_ADMIN, FINANCE, SUPER_ADMIN                          | 404 `WORKSPACE.NOT_FOUND`                                                                                                                                                                                                                                      |
| 3   | POST `/workspaces`                               | `workspaceCreate`                    | IT_ADMIN · mọi IT; người tạo = phụ trách                | 404 `VENDOR.NOT_FOUND`; 409 `WORKSPACE.NAME_TAKEN`                                                                                                                                                                                                             |
| 4   | PATCH `/workspaces/{id}`                         | `workspaceUpdate`                    | IT_ADMIN · chỉ IT phụ trách workspace                   | 403 `WORKSPACE.NOT_RESPONSIBLE`; 404; 409 `WORKSPACE.STALE`, `WORKSPACE.NAME_TAKEN`                                                                                                                                                                            |
| 5   | PUT `/workspaces/{id}/admins`                    | `workspaceAdminsSet`                 | IT_ADMIN · chỉ IT phụ trách workspace                   | 403 `WORKSPACE.NOT_RESPONSIBLE`; 404; 409 `WORKSPACE.STALE`; 422 `WORKSPACE.ADMIN_NOT_IT_ADMIN`, `WORKSPACE.PRIMARY_OWNER_NOT_ADMIN`, `WORKSPACE.ADMINS_TOO_FEW`                                                                                               |
| 6   | POST `/workspaces/{id}/responsible-it-admin`     | `workspaceResponsibleItAdminChange`  | SUPER_ADMIN                                             | 403; 404; 422 `WORKSPACE.RESPONSIBLE_NOT_IT_ADMIN`                                                                                                                                                                                                             |
| 7   | POST `/subscriptions/{id}/lines`                 | `subscriptionLineAdd`                | IT_ADMIN · chỉ IT phụ trách thuê bao                    | 403 `SUBSCRIPTION_LINE.NOT_RESPONSIBLE`; 404; 409 `SUBSCRIPTION.STALE`, `SUBSCRIPTION.DUPLICATE_PLAN`; 422 `SUBSCRIPTION_LINE.QUANTITY_VIA_PURCHASE`                                                                                                           |
| 8   | PATCH `/subscription-lines/{id}`                 | `subscriptionLineUpdate`             | IT_ADMIN · chỉ IT phụ trách thuê bao                    | 403; 404 `SUBSCRIPTION_LINE.NOT_FOUND`; 409 `SUBSCRIPTION_LINE.STALE`, `SUBSCRIPTION_LINE.CLOSED`                                                                                                                                                              |
| 9   | GET `/subscription-lines/{id}/seat-changes`      | `subscriptionLineSeatChangeList`     | IT_ADMIN, FINANCE, SUPER_ADMIN                          | 404                                                                                                                                                                                                                                                            |
| 10  | POST `/subscription-lines/{id}/purchases`        | `subscriptionLineSeatPurchase`       | IT_ADMIN · người làm của phòng **từng** người thụ hưởng | 403 `SEAT_PURCHASE.NOT_IN_CHARGE`; 409 `SEAT_PURCHASE.LINE_NOT_PURCHASABLE`, `SEAT_PURCHASE.STOCK_AVAILABLE`, `SEAT_LEDGER.BELOW_OCCUPANCY`; 422 `SEAT_PURCHASE.ITEM_NOT_PENDING`, `SEAT_PURCHASE.TIER_STEP_ONE_ITEM`, `SEAT_LEDGER.EFFECTIVE_IN_CLOSED_MONTH` |
| 11  | POST `/subscription-lines/{id}/seat-corrections` | `subscriptionLineSeatCorrection`     | IT_ADMIN · chỉ IT phụ trách thuê bao                    | 403; 409 `SEAT_LEDGER.BELOW_OCCUPANCY`, `SUBSCRIPTION_LINE.STALE`; 422 `SEAT_LEDGER.EFFECTIVE_IN_CLOSED_MONTH`                                                                                                                                                 |
| 12  | POST `/subscription-lines/{id}/seat-reductions`  | `subscriptionLineSeatReduction`      | IT_ADMIN · chỉ IT phụ trách thuê bao                    | 403; 409 `SEAT_LEDGER.MID_TERM_REDUCTION_NOT_ALLOWED`, `SEAT_LEDGER.REDUCTION_EXCEEDS_PURCHASE`, `SEAT_LEDGER.BELOW_OCCUPANCY`; 422 (ngày)                                                                                                                     |
| 13  | GET `/license-lots`                              | `licenseLotList`                     | IT_ADMIN, FINANCE, SUPER_ADMIN                          | —                                                                                                                                                                                                                                                              |
| 14  | GET `/license-lots/{id}`                         | `licenseLotGet`                      | IT_ADMIN, FINANCE, SUPER_ADMIN                          | 404 `LICENSE_LOT.NOT_FOUND`                                                                                                                                                                                                                                    |
| 15  | POST `/license-lots`                             | `licenseLotCreate`                   | IT_ADMIN · `REQUEST`: người làm của phòng; khác: mọi IT | 403 `LICENSE_LOT.NOT_IN_CHARGE`; 422 `LICENSE_LOT.PLAN_NOT_K4`, `.REQUEST_REQUIRED`, `.CONTRACT_VENDOR_MISMATCH`, `.PURPOSE_NOT_AVAILABLE`, `.WORKSPACE_REQUIRED`, `.VENDOR_ADMINS_REQUIRED`                                                                   |
| 16  | PATCH `/license-lots/{id}`                       | `licenseLotUpdate`                   | IT_ADMIN · chỉ IT phụ trách lô                          | 403 `LICENSE_LOT.NOT_RESPONSIBLE`; 409 `LICENSE_LOT.STALE`, `LICENSE_LOT.PRICE_LOCKED`; 422 `LICENSE_LOT.CONTRACT_REASON_REQUIRED`                                                                                                                             |
| 17  | POST `/license-lots/{id}/keys`                   | `licenseLotKeyImport`                | IT_ADMIN · chỉ IT phụ trách lô                          | 403; 404; 409 `LICENSE_KEY.DUPLICATE`, `LICENSE_KEY.INITIALIZATION_CLOSED`; 422 `LICENSE_LOT.KEYS_EXCEED_LICENSES`, `LICENSE_KEY.INITIAL_ACTIVATIONS_*` (thân như `licenseKeyImport`)                                                                                                                                                                                  |
| 18  | POST `/license-lots/{id}/responsible-it-admin`   | `licenseLotResponsibleItAdminChange` | SUPER_ADMIN                                             | 403; 404; 422 `LICENSE_LOT.RESPONSIBLE_NOT_IT_ADMIN`                                                                                                                                                                                                           |

### 7.2. Operation đổi

| Phần  | `operationId`                                                                                                             | Thay đổi                                                                                                                                                                                                                                                                                                                                                          | Phá vỡ?                                                                                             |
| ----- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| B1    | `planCreate`, `planUpdate`, `planGet`, `planList`                                                                         | thêm `referenceCommitmentMonths` (1 \| 12, `K1`/`K2`); mô tả giá `K4` = _giá một license_                                                                                                                                                                                                                                                                         | Không                                                                                               |
| B1    | `subscriptionCreate`, `subscriptionUpdate`                                                                                | thêm `monthlyUnitPrice`; `unitPrice` cũ vẫn nhận; ghi mới `QUARTERLY`/`OTHER` ⟹ 422                                                                                                                                                                                                                                                                               | **Có** (hẹp): `billingCycle` `QUARTERLY`/`OTHER` ở ghi mới bị từ chối                               |
| B2    | `subscriptionCreate`                                                                                                      | `workspaceId?` (mặc định workspace duy nhất của hãng), `seatCounting`, `minimumSeatsTotal`, `invoicedLater`                                                                                                                                                                                                                                                       | **Có** (hẹp): hãng ≥ 2 workspace mà không gửi `workspaceId` ⟹ 422 `SUBSCRIPTION.WORKSPACE_REQUIRED` |
| B2    | `subscriptionUpdate`                                                                                                      | `workspaceId?`, `minimumSeatsTotal?`, `invoicedLater?`; `seatCounting` không đổi sau `ACTIVE`                                                                                                                                                                                                                                                                     | Không                                                                                               |
| B3    | `subscriptionCreate`                                                                                                      | `lines[]`; gói `K1` ⟹ 422; `kind PERPETUAL` ⟹ 422                                                                                                                                                                                                                                                                                                                 | **Có**: khai `K1`, `PERPETUAL` bị từ chối (W3-27)                                                   |
| B3    | `subscriptionUpdate`                                                                                                      | `purchasedQuantity` có giá trị ⟹ 409 `SUBSCRIPTION.SEAT_COUNT_VIA_LEDGER`; `isPrimaryForPlan: true` ⟹ 422                                                                                                                                                                                                                                                         | **Có** (W3-27)                                                                                      |
| B1–B3 | `subscriptionGet`, `subscriptionList`                                                                                     | `monthlyUnitPrice`; B2 `workspace`, `seatCounting`, …; B3 `lines[]` (`maxItems` 20), `purchasedQuantity` = tổng sổ hôm nay                                                                                                                                                                                                                                        | Không (nghĩa `purchasedQuantity` đổi sang tổng sổ)                                                  |
| B2    | `subscriptionComplete`                                                                                                    | cổng admin đọc workspace; khóa workspace FU                                                                                                                                                                                                                                                                                                                       | Không                                                                                               |
| B3    | `subscriptionResponsibleItAdminChange` (đợt 2)                                                                            | thuê bao `PERPETUAL` đã thành lô ⟹ **ghi vào lô cùng id** (chỉ `SUPER_ADMIN`, chỉ ghi lô, audit `LICENSE_LOT.RESPONSIBLE_CHANGED`) — Owner T-2                                                                                                                                                                                                                    | Không (hình dạng giữ; nơi ghi đổi)                                                                  |
| B2    | `planWorkspaceProfileSet`, `planGet`                                                                                      | ghi/đọc qua workspace của hãng; hãng nhiều workspace ⟹ 409 `PLAN.WORKSPACE_AMBIGUOUS`; không hãng ⟹ 422; không phụ trách ⟹ 403                                                                                                                                                                                                                                    | **Có** (hẹp): ba lỗi mới                                                                            |
| B1    | `seatMonthChargeList`                                                                                                     | `poolLines[]` thêm `idleCost`, `idleCostByLabel`, `invoiceVariance`, `invoiceVarianceInReview`, `deviceLotPurchases`, `replacementKeys`, `flags`                                                                                                                                                                                                                  | Không (nghĩa `unallocated` đổi = tổng bốn dòng con)                                                 |
| B1    | `budgetSummary`                                                                                                           | `sharedPoolLines`; `runningUncommitted` theo CC; `sharedPoolOverReserve` so tổng                                                                                                                                                                                                                                                                                  | Không                                                                                               |
| B1    | `budgetReviewPeriodGet`, `budgetReviewPeriodClose`                                                                        | ảnh chụp bốn dòng con; dòng CC `priorYearReleased`                                                                                                                                                                                                                                                                                                                | Không                                                                                               |
| B1    | `purchaseInvoiceConfirm`, `purchaseInvoiceGet`                                                                            | `poolExpected`, `poolVariance`, `flags` (`NO_EXPECTED_AMOUNT`); hồ sơ `EXPECTED_AMOUNT`                                                                                                                                                                                                                                                                           | Không                                                                                               |
| B1    | `invoiceDiscrepancyClose`, `invoiceDiscrepancyGet`                                                                        | `outcome` + `EXCHANGE_RATE_LINE_PRICE_UPDATED`; `mismatches` + `EXPECTED_AMOUNT`                                                                                                                                                                                                                                                                                  | Không (enum thêm giá trị — §7.3)                                                                    |
| B1    | `ghostSeatRecommendationList`, `ghostSeatRecommendationGet`                                                               | `potentialSaving.realisableOn` có ngày; `realisableAt` dùng `RENEWAL`/`NEXT_BILLING` có sẵn; số theo kỳ cam kết                                                                                                                                                                                                                                                   | Không                                                                                               |
| B1    | `operatingParameterList`, `operatingParameterSet`                                                                         | 3 tham số mới                                                                                                                                                                                                                                                                                                                                                     | Không                                                                                               |
| B2    | `itAdminDashboardGet`                                                                                                     | số workspace có cờ thiếu admin                                                                                                                                                                                                                                                                                                                                    | Không                                                                                               |
| B3    | `subscriptionRenewalAdjustmentGet`, `subscriptionRenewalGet`, `subscriptionRenewalList`, `subscriptionRenewalSeatRanking` | `lines[]` theo dòng, `minimumSeatsTotal`, `shortfall`; list `lineCount`; ranking lọc `subscriptionLineId?`                                                                                                                                                                                                                                                        | Không                                                                                               |
| B3    | `subscriptionRenewalPropose`                                                                                              | thân thêm `lines[{ subscriptionLineId, quantity }]`; thân cũ chỉ khi kỳ một dòng                                                                                                                                                                                                                                                                                  | **Có** (hẹp): kỳ nhiều dòng gửi thân cũ ⟹ 422 `SUBSCRIPTION_RENEWAL.LINES_REQUIRED`                 |
| B3    | `subscriptionRenewalRecordOutcome`                                                                                        | `nextPeriod.lines[]`; số khác đề xuất ⟹ 422 `QUANTITY_INVALID` (`details.lines`)                                                                                                                                                                                                                                                                                  | Không (mã có sẵn)                                                                                   |
| B3    | `provisioningTaskGrant`                                                                                                   | `purchase` = lối tắt mua 1 qua sổ (không `roleBasis`)                                                                                                                                                                                                                                                                                                             | Không                                                                                               |
| B3    | `provisioningTaskComplete`                                                                                                | `K4`: khóa từ lô; `K1`: không chạm thuê bao                                                                                                                                                                                                                                                                                                                       | Không                                                                                               |
| B3    | `licenseKeyImport`, `licenseKeyList`                                                                                      | `subscriptionId` quy về lô chuyển đổi cùng id; list lọc/thêm `licenseLot`                                                                                                                                                                                                                                                                                         | Không (lô mới chỉ nhập qua route 17)                                                                |
| B3    | `purchaseInvoiceSubmit`, `purchaseInvoicePreview`, `purchaseInvoiceResubmit`                                              | `link` `SUBSCRIPTION` thêm `seatPurchaseId?` (hóa đơn nâng seat `K2` **chỉ** theo đường này — N9), `subscriptionLineIds?` (hóa đơn kỳ tách theo dòng — N7); `link` mới `LICENSE_LOT`; nhãn `SEAT_PURCHASE`; link `REQUEST` của `K2` có lần mua ⟹ 422 `PURCHASE_INVOICE.SEAT_PURCHASE_REQUIRED`; dòng đã có hóa đơn ⟹ 422 `PURCHASE_INVOICE.LINE_ALREADY_INVOICED` | **Có**: hóa đơn nâng seat `K2` không còn nộp qua link `REQUEST`                                     |
| B3    | `accessRequestSubmit`, `accessRequestGet`, `spendApprovalGet`                                                             | `K1` năm: `termMonths` cố định 12, hợp đồng ngắn ⟹ 422; `vendorChargeUntilRenewal`                                                                                                                                                                                                                                                                                | **Có** (hẹp): hai lỗi 422 mới cho `K1` năm                                                          |
| B3    | `stockSummaryList`, `subscriptionSeatUsage`                                                                               | tồn theo dòng / theo lô; bỏ `HOLDERS` của `K1`                                                                                                                                                                                                                                                                                                                    | Không (mảng ít mục hơn)                                                                             |
| B3    | `contractSubscriptionLink`                                                                                                | thuê bao `K4` ⟹ 422 `CONTRACT.SUBSCRIPTION_NOT_K2`                                                                                                                                                                                                                                                                                                                | **Có** (hẹp)                                                                                        |

### 7.3. Enum/nghĩa response FE phải biết

`poolLines[].unallocated` (nghĩa mới); `subscription.purchasedQuantity` (tổng sổ); `invoiceDiscrepancy.mismatches` + `EXPECTED_AMOUNT`;
`outcome` + `EXCHANGE_RATE_LINE_PRICE_UPDATED`; `purchaseInvoice.label` + `SEAT_PURCHASE`; `link.kind` + `LICENSE_LOT`; ghost seat
`subjectKind` + `LICENSE_LOT`; seat change `reason`/`source`/`basis`; workspace `flags`; `impactPreview.vendorAdminRoles[]` nay là tên workspace.

### 7.4. Không đổi

`contractSubscriptionUnlink`, `requestablePlanList`, `subscriptionDeadlineEventList`, `licenseKeyReveal`, `licenseKeyWithdraw`, `licenseKeyUpdate`,
mọi operation kích hoạt máy của đợt 2 (wire `lotId` giữ giá trị — lô cùng id).

### 7.5. Bàn giao FE (sau đợt; API description xuất từ `openapi.json`)

| Màn                              | Việc FE                                                                                                                                                    | Phần   |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| Khai/sửa gói                     | ô _Kỳ cam kết định mua_; nhãn giá `K4` _giá một license_                                                                                                   | B1     |
| Khai/sửa thuê bao                | gửi `monthlyUnitPrice`; bỏ `QUARTERLY`/`OTHER`; B2 chọn workspace (bắt buộc khi hãng ≥ 2), cách tính seat, ngày thanh toán (theo thành viên); B3 bảng dòng | B1–B3  |
| Màn kho / Finance                | bốn dòng con, `invoiceVarianceInReview`, nhãn seat Trống (hai nhãn _Bị khóa tới_ có thể là kỳ sau), tỷ lệ                                                  | B1, B3 |
| Màn Workspace (mới)              | danh sách, tạo (không chọn người phụ trách), sửa/admin (chỉ người phụ trách), Super Admin đổi người phụ trách; cờ                                          | B2     |
| Màn hồ sơ workspace của gói (cũ) | vẫn chạy; xử lý 409 `PLAN.WORKSPACE_AMBIGUOUS`, 403                                                                                                        | B2     |
| Màn dòng thuê bao (mới)          | sổ số seat (trang), mua thêm seat (lỗi 403 từng mục), ghi theo hãng, giảm giữa kỳ; ngày hiệu lực không trước tháng hiện tại                                | B3     |
| Điểm điều chỉnh                  | nhập số theo dòng; ghi kết quả theo dòng                                                                                                                   | B3     |
| Lô khóa (mới)                    | danh sách, tạo lô, nhập khóa vào lô, hợp đồng, Super Admin đổi người phụ trách (route cũ trên thuê bao `PERPETUAL` nay ghi vào lô cùng id)                 | B3     |
| Sửa số seat (ô cũ)               | **bỏ** ô; dùng màn dòng                                                                                                                                    | B3     |
| Request `K1`                     | gói năm: không chọn tháng; thông báo 422 hợp đồng ngắn                                                                                                     | B3     |
| Duyệt chi                        | dòng _Nhà cung cấp thu tới dd/mm: khoảng … đ_                                                                                                              | B3     |
| Hóa đơn                          | chọn lần mua (`seatPurchaseId`); nhiều dòng; lô khóa                                                                                                       | B3     |
| Hộp thư                          | 8 mã thông báo mới ([§8.2](#82-mã-thông-báo-mới)) — đích theo `notification-target.policy.ts`                                                              | B1–B3  |

## 8. Job và thông báo

### 8.1. Luật người nhận thông báo

- **R1 — việc của thuê bao/workspace/lô** (`QĐ-118f`, mẫu `seatIncreaseRecipients` —
  `catalog/subscription/seat-increase/subscription-seat-increase.policy.ts`, dùng ở `subscription-seat-increase.service.ts:48-65`): IT Admin phụ
  trách **nếu dùng được và không phải người thao tác**; không dùng được (nghỉ, khóa, đổi vai) hoặc `NULL` ⟹ **Super Admin dùng được**
  (`identity.findUsableSuperAdminEmployeeId`); người thao tác không tự nhận. Không IT Admin nào khác nhận thay.
- **R2 — Finance:** tài khoản `FINANCE` dùng được (tối đa một — `QĐ-52d`), thêm vào khi mục ghi "báo Finance".
- **R3 — việc của phòng** (không có trong đợt 3 ngoài đường cấp có sẵn): `OrganizationReadApi.itAdminsActingFor` (đợt 2), giữ.

### 8.2. Mã thông báo mới

Đăng ký ở `notifications/public/notifications.types.ts`, params ở `notifications/inbox/inbox.policy.ts`, câu chữ vi/en ở
`notifications/inbox/notification-text/notification-texts-*.types.ts`, đích ở `notifications/inbox/notification-target.policy.ts` (file chung, chỉ thêm dòng).

| Mã                              | Params                                                                                       | Đích (`operationId`, path)                                    | Người nhận         | Câu (vi)                                                                                                                | Mục   |
| ------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------- | ----- |
| `SUBSCRIPTION_SEATS_REDUCED`    | `subscriptionId`, `fromQuantity`, `toQuantity`, `changedByEmployeeId`                        | `subscriptionGet` `{ id: subscriptionId }`                    | R1 + R2            | {changedByEmployeeId:name} đã giảm số chỗ của thuê bao {subscriptionId:name} từ {fromQuantity} xuống {toQuantity}.      | W3-03 |
| `IDLE_SEAT_COST_RATIO_HIGH`     | `subscriptionId`, `month`, `ratioPercent`                                                    | `subscriptionGet` `{ id: subscriptionId }`                    | R1                 | Chi phí seat Trống của {subscriptionId:name} tháng {month} là {ratioPercent} %, vượt 10 %.                              | W3-06 |
| `SUBSCRIPTION_PRICE_REVIEW`     | `subscriptionId`, `purchaseInvoiceId`                                                        | `subscriptionGet` `{ id: subscriptionId }`                    | R1                 | Hóa đơn của {subscriptionId:name} lệch do tỷ giá hoặc phí thẻ; hãy cập nhật giá tháng.                                  | W3-05 |
| `WORKSPACE_ADMIN_NOT_WORKING`   | `workspaceId`, `employeeId`, `workingAdminCount`                                             | `workspaceGet` `{ id: workspaceId }`                          | R1 (workspace)     | {employeeId:name} không còn làm admin được ở workspace {workspaceId:name}; còn {workingAdminCount} admin đang làm việc. | W3-12 |
| `SUBSCRIPTION_SEATS_BOUGHT`     | `subscriptionId`, `subscriptionLineId`, `seatPurchaseId`, `quantity`, `recordedByEmployeeId` | `subscriptionGet` `{ id: subscriptionId }`                    | R1                 | {recordedByEmployeeId:name} đã mua thêm {quantity} seat cho {subscriptionId:name}.                                      | W3-18 |
| `SEAT_PURCHASE_INVOICE_OVERDUE` | `seatPurchaseId`, `subscriptionId`, `dueOn`                                                  | `subscriptionGet` `{ id: subscriptionId }`                    | người ghi + R1     | Lần mua seat của {subscriptionId:name} chưa có hóa đơn, hạn {dueOn}.                                                    | W3-18 |
| `SEAT_LEDGER_VENDOR_RECORDED`   | `subscriptionLineId`, `subscriptionId`, `delta`, `outOfProcess`, `recordedByEmployeeId`      | `subscriptionLineSeatChangeList` `{ id: subscriptionLineId }` | R1 + R2 (giảm: R2) | {recordedByEmployeeId:name} ghi số seat theo nhà cung cấp cho {subscriptionId:name}: {delta}.                           | W3-19 |
| `LICENSE_LOT_IDLE_COST_HIGH`    | `licenseLotId`, `month`, `ratioPercent`                                                      | `licenseLotGet` `{ id: licenseLotId }`                        | R1 (lô)            | License Trống của lô {licenseLotId:name} tháng {month} là {ratioPercent} % giá trị lô.                                  | W3-25 |

Mã cũ `VENDOR_ADMINS_BELOW_MINIMUM` thôi ghi mới (giữ để đọc dòng cũ).

### 8.3. Job

| Job                                                | Chạy ở                                                          | Làm gì                                                                                                     | Idempotent bởi                                                                    | Phần   |
| -------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ------ |
| Giải phóng cam kết cuối tháng                      | `SeatMonthSweeper` sau `chargeEndedMonths`                      | mỗi tháng của `endedMonthsOf(today)` mà mọi kỳ của tập `M` đã tính: giải phóng phần dư, chốt dòng          | `budget_commitment_months.settled_at` + advisory `commitment-month:<org>:<month>` | B1     |
| Dọn `K2` năm cũ                                    | cùng bước, khi tháng = 12 (chạy trong tháng 1)                  | phần còn giữ của cam kết `K2` năm đó ⟹ `YEAR_END_SEAT_MONTHS`                                              | cam kết `state ≠ HELD` sau lần đầu                                                | B1     |
| Cảnh báo tỷ lệ Trống 10 %                          | `BudgetReviewSweeper` (lượt giờ)                                | tháng vừa tính: thuê bao/dòng/lô tỷ lệ > 10 % ⟹ `IDLE_SEAT_COST_RATIO_HIGH` / `LICENSE_LOT_IDLE_COST_HIGH` | event key `<mã>:<id>:<YYYY-MM>`                                                   | B1, B3 |
| Cảnh báo vượt Dự phòng kho                         | có (`budgets/review/budget-review-pool-watch.service.ts:48-67`) | vế phải = lũy kế bốn dòng con                                                                              | key `sharedPoolOverReserve:<YYYY-MM>`                                             | B1     |
| Admin workspace thôi làm việc                      | `SubscriptionRenewalSweeper` (lượt giờ) + đường nghỉ việc       | một thông báo mỗi (workspace, admin)                                                                       | event key `WORKSPACE_ADMIN_NOT_WORKING:<W>:<E>`                                   | B2     |
| Điểm điều chỉnh theo dòng + cảnh báo đỏ            | `SubscriptionRenewalSweeper` (có)                               | số cần/mục tiêu **theo dòng**; thông báo giữ theo thuê bao                                                 | event key có                                                                      | B3     |
| Chốt mục tiêu, tự ghi `RENEWAL`, đóng dòng `ENDED` | `SubscriptionRenewalSweeper`, bước mới                          | qua ngày chốt: lưu mục tiêu; qua ngày gia hạn: tự gia hạn ⟹ mở kỳ + mang quyền; không ⟹ `ENDED`            | unique ca mỗi kỳ + `ON CONFLICT DO NOTHING`                                       | B3     |
| Nhắc hạn hóa đơn lần mua                           | `SubscriptionRenewalSweeper` (lượt giờ)                         | `invoice_due_on < hôm nay`, chưa hóa đơn ⟹ `SEAT_PURCHASE_INVOICE_OVERDUE`                                 | event key `SEAT_PURCHASE_INVOICE_OVERDUE:<purchase>`                              | B3     |

Mọi job: lỗi một chủ thể không dừng chủ thể khác; log `describeForOperator`; chạy lại không ghi hai lần (`docs/rules/security-jobs.md`, cập nhật đoạn
mô tả job ở P23 `biz`).

## 9. Câu hỏi Owner

Mọi câu đã trả lời ([§13.2](#132-quyết-định-owner-owner-answersmd)); Owner chốt thêm 24/11 bốn điểm tự chốt (T-1 giữ tháng lịch; **T-2 đổi** —
route cũ ghi vào lô cùng id; T-3 giữ; T-7 giữ). Không còn câu chặn. **Hệ quả cần biết của T-7** (ngày hiệu lực sổ ghi tay ≥ ngày 1 tháng hiện tại):
IT mua seat ngày 30/11/2026 nhưng ghi vào hệ thống ngày 01/12 ⟹ `purchasedOn` sớm nhất 01/12 ⟹ sổ lệch hãng **một ngày**; số tiền một ngày đó
(vd. 1 seat × 500.000 / 30 = 16.667) nằm ở _Chênh lệch hóa đơn kho_ khi hóa đơn lần mua về; không có đường sửa ngược tháng đã tính.

## 10. Phụ thuộc đợt 1 và đợt 2

**Đợt 1** đã ở `dev` (`4e029dbd`); đợt 3 dựa: thứ tự khóa đợt 1 (`lockPrimaryCandidates`), `PATCH purchasedQuantity` bắt `expectedUpdatedAt`/chặn
giảm/lý do tăng (W1-03, W1-14), cổng admin đếm IT còn làm việc (`workingAdminsAmong`), seat-tháng dưới khóa (W1-05/06), khoản 01/01 giá lúc duyệt
(W1-11), chỉ IT phụ trách ghi kết quả gia hạn (W1-12, `SUBSCRIPTION_RENEWAL.NOT_RESPONSIBLE`), số hóa đơn chuẩn hóa
(`20261123100000_purchase_invoice_number_normalized`).

**Đợt 2** — code thật trên `int/redesign-w2` `8a4c8b70`, merge vào `dev` trước khi tách nhánh đợt 3:

| Đợt 2 (code thật)                                                                                                                                                                                                                                                                                                                                                                                                                                    | Đợt 3 làm                                                                                                                                                                                     | Gói       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| `plans.key_binding` (`ACCOUNT` \| `DEVICE_KEY` \| `DEVICE_BUNDLED`), chặn `MF-1` gói gắn máy                                                                                                                                                                                                                                                                                                                                                         | đọc cột: lô `REQUEST` chỉ `ACCOUNT`; **`STOCK` mở cho `DEVICE_KEY`** (hóa đơn ⟹ `POOL_DEVICE_LOT`, dòng con 3 thật — không trả 0); `DEVICE_BUNDLED` không lô                                  | P14, P20  |
| `license_keys.max_activations`, `initial_activations_used`, `updated_at`; route `licenseKeyUpdate`                                                                                                                                                                                                                                                                                                                                                   | giữ; `license_key_guard` thêm `license_lot_id`, `cost_borne` vào cột cố định                                                                                                                  | P12a      |
| `device_activations` + 5 hàm SQL (cộng `license_assignment_check_capacity` cũ) ở `20261124100200_device_activations/migration.sql` đọc `subscription_id`                                                                                                                                                                                                                                                                                             | M6 `CREATE OR REPLACE` cả 6, đọc lô; quyền `K4` không còn đếm/khóa theo `subscriptions` (N1); backfill trước khi thay guard (SPEC-B3 §1.2)                                                    | P12a      |
| Code đọc `subscriptionId`/`purchasedQuantity` của khoản mua: `licensing/device-activation/device-activation.service.ts:103-157`, `device-activation-close.service.ts:47-180`, `device-activation.repo.ts:44-157`, `device-activation-query.service.ts:15` + `public/licensing-device-activation.api.ts:55` (`keySubscriptionIds`, gọi ở `devices/initial-record/initial-record-activation.service.ts:91` để sắp thứ tự khóa), `licensing/assignment/occupancy/seat-usage-occupancy.service.ts:27-29` (`seat-usage`), `device-activation.policy.ts:56`, `licensing/assignment/occupancy/assignment-seat-occupancy.listener.ts:32-62`, `catalog/public/catalog.extension-points.ts:16`, `licensing/stock-summary/stock-summary.policy.ts:55` (`LICENSES`) | P20b chuyển sang `licenseLotId`/`licenseCount` qua `LicenseLotApi.lockLot`/`lotFacts`; **giữ chữ ký** `LicensingDeviceActivationApi`; wire `lotId` đọc `license_lot_id`; comment tầng khóa 7b | P20b      |
| `subscriptionResponsibleItAdminChange` (`QĐ-118f`, `catalog/subscription/responsible/`)                                                                                                                                                                                                                                                                                                                                                              | mẫu cho route đổi người phụ trách workspace, lô; trên `PERPETUAL` ⟹ 422                                                                                                                       | P9, P14   |
| `OrganizationReadApi.itAdminsActingFor`, `ProvisioningTaskFrame.requireActingItAdmin` (`licensing/provisioning/provisioning-task-frame.service.ts:134`)                                                                                                                                                                                                                                                                                       | mua thêm seat kiểm từng mục; tạo lô `REQUEST`; cấp `K4`/`K1` giữ                                                                                                                              | P16b, P14 |
| W2 SPEC §2.3 "`licenseKeyImport` đổi sang `lotId` (phá contract)"                                                                                                                                                                                                                                                                                                                                                                                    | **đợt 3 thay** hàng đó: giữ tương thích, quy về lô cùng id (K-B7)                                                                                                                             | P14       |
| Bảng khóa W2 (0b, 0c, 2b, "6b" khóa)                                                                                                                                                                                                                                                                                                                                                                                                                 | gộp §6.2; khóa thành 7b                                                                                                                                                                       | P23 (biz) |

## 11. Ma trận test và ca diệt đột biến

| Luật tiền              | Ca biên                               | Ca diệt đột biến                                      | Nơi            |
| ---------------------- | ------------------------------------- | ----------------------------------------------------- | -------------- |
| Quy đổi giá tháng      | 1.000.002 năm ⟹ 83.334 (đúng nửa)     | 1.000.001 ⟹ 83.333 (giết `ceil`); 1.000.002 (`floor`) | SPEC-B1 W3-02  |
| Tháng lịch `K2`        | 31/01 → 15/03 = 3 tháng               | `K1` 3 tháng vẫn 3 (giết áp tháng lịch cho `K1`)      | W3-02, W3-07 J |
| Seat-ngày Trống        | `max(0, 280 − 308)` = 0               | 548.387 (giết `ceil`)                                 | W3-04          |
| Vượt Dự phòng          | lũy kế = Dự phòng ⟹ không             | +100.000 ⟹ có (giết `>=`)                             | W3-04          |
| Ngưỡng hóa đơn         | đúng 5,00 % ⟹ không                   | 5.775.001 ⟹ mở                                        | W3-05          |
| Thuế không tính ngưỡng | Premium 0 % + 6 tr thuế ⟹ không mở    | so `actual` thay `net` ⟹ 10 % (đỏ)                    | W3-05          |
| Tỷ lệ Trống 10 %       | 30/300 ⟹ không                        | 31/300 ⟹ có                                           | W3-06          |
| Nhãn sau hạn chót      | 01/06 _Giảm được_                     | 02/06 _Bị khóa tới 01/07/2028_                        | W3-06          |
| Áp tháng cam kết       | E: áp 500.000 khi seat-tháng 550.000  | bỏ `min` ⟹ áp 550.000 (đỏ)                            | W3-07          |
| Giải phóng cuối tháng  | D2 sửa giá sau khi tính ⟹ 0           | K đảo sau chốt ⟹ +100.000                             | W3-07          |
| Không cam kết          | 01/11 một ngày ⟹ tính tháng 11        | 01/08 trước lượt ⟹ vẫn 6 tháng                        | W3-08          |
| Tiết kiệm thực         | 88 × 180.000 ⟹ 0                      | trả tháng ⟹ 6.000.000 (không 66.500.000)              | W3-09          |
| Tránh được nhóm        | 1.000.000 ÷ 3 = 333.333               | 15.000.000 ÷ 3 (giết "cả Request")                    | W3-09          |
| Hạn hóa đơn            | 27/11 không nhắc                      | 28/11 nhắc (giết `<=`)                                | W3-18          |
| Giảm giữa kỳ           | 1 + 2 = 3 ⟹ được                      | 1 + 3 ⟹ 409                                           | W3-19          |
| Kỳ vọng đổi loại seat  | làm tròn một lần ⟹ 14.666.667         | tròn từng dòng ⟹ 14.666.666 (đỏ)                      | W3-19          |
| Phân bổ `K1` năm       | 5.940.001 ⟹ dòng cuối 495.001         | cam kết 01/01 không giữ thêm (giết đếm hai lần)       | W3-23          |
| Tiền lô `K4`           | 10.000.000 ⟹ dư cuối 3.333.334, kho 0 | cấp trước hóa đơn ⟹ 14.400.000                        | W3-25          |

Mỗi bảng tiêu chí ⟹ một `it.each` với đúng các số; mỗi luật tiền chạy lại test với đột biến bằng tay một lần (ghi kết quả ở PROGRESS).

## 12. Ranh giới cho người code

- Chỉ làm đúng SPEC; điều SPEC không nói mà đổi hành vi nghiệp vụ ⟹ ghi D-n "cần Owner", **giữ hành vi cũ** (CODE-PROMPT LUẬT CỨNG 1).
- Không chạm ngoài phạm vi §2.2 (đặc biệt `ROLE_RIGHT`).
- Quyền theo bảng §7.1/SPEC-B3 "Quyền trong B3"; không viết nhánh "IT khác làm thay" cho việc của thuê bao/workspace/lô.

## 13. Đã chốt

### 13.1. Tự chốt theo nguồn

| #    | Điểm                                                              | Chốt                                                                                                        | Căn cứ                                                  |
| ---- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| T-1  | Số tháng Request `K2` có ngày cuối                                | tháng lịch (31/01 → 15/03 = 3); `K1` giữ tháng cuốn                                                         | `QĐ-104k`(1), `QĐ-116an`, B1-R4                         |
| T-2  | `subscriptionResponsibleItAdminChange` trên `PERPETUAL`           | **Owner 24/11:** ghi vào lô cùng id (chỉ `SUPER_ADMIN`, chỉ ghi lô)                                         | Owner (OWNER-ANSWERS T-2), K-B4                         |
| T-3  | Chi phí không cam kết `K1` không Request                          | từ tháng hiện tại tới tháng cuối giữ; không giá ⟹ 0 + cờ                                                    | K-A2; không có liên kết hóa đơn cho quyền không Request |
| T-4  | Giải phóng tay `REMAINDER` rải tháng                              | từ tháng 12 ngược về                                                                                        | B1-R10; tháng đang chạy giữ phần cần nhất               |
| T-5  | Trạng thái cam kết theo dòng tháng                                | `held = 0` ⟹ `EXPENSED` nếu đã áp > 0, ngược lại `RELEASED`                                                 | B1-R10, nghĩa hiện có của enum                          |
| T-6  | Kỳ vọng lần nâng B1                                               | làm tròn một lần mỗi **nhóm ngày mua** (= một lần mua của B3)                                               | B1-R7, khớp W3-18                                       |
| T-7  | Ngày hiệu lực sổ ghi tay                                          | ≥ ngày 1 tháng hiện tại                                                                                     | B2-R15; catalog không đọc `seat_month_runs`             |
| T-8  | Thông báo admin thôi làm việc                                     | đường nghỉ việc + lượt giờ, một key mỗi (workspace, admin)                                                  | Q-D, `QĐ-117e`                                          |
| T-9  | `VendorAdminRole`                                                 | một mục mỗi workspace, thêm `workspaceId`; giữ trường gói để tương thích                                    | B2-R5                                                   |
| T-10 | Khóa `license_keys`                                               | tầng 7b (code thật), bỏ tên 6b                                                                              | K-B5, `seat-target.service.ts:73-87`                    |
| T-11 | Route cũ / `deprecated`                                           | giữ, không `deprecated`; phá vỡ hẹp ghi ở §7.2                                                              | CUT-6                                                   |
| T-12 | Lô khóa ở catalog; kỳ = một bản ghi                               | `catalog/license-lot/`; giữ chuỗi `renewed_from_id`                                                         | §6.1, §2.3                                              |
| T-13 | Mở sổ                                                             | `INITIAL` tại `GREATEST(ngày chuyển đổi, start)`; kỳ chưa bắt đầu có kỳ trước ⟹ `RENEWAL`; `DRAFT` không sổ | W1c-Q4, B2-R1, B2-R12                                   |
| T-14 | Ngưỡng hóa đơn; hạn hóa đơn lần nâng; cổng admin; mua n + lối tắt | như bản 1                                                                                                   | `QĐ-116ak`/`QĐ-117l`, `QĐ-117m`, `QĐ-117e`, W1c-Q3      |

### 13.2. Quyết định Owner (OWNER-ANSWERS.md)

| Mã    | Quyết định                                                                                                                        | Áp ở                                    |
| ----- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| W3-Q1 | **A** — chia đều chi phí thực chịu; tỷ lệ trên giá chưa thuế (n−1)×giá; dư dồn license dư cuối; chênh do thuế báo riêng           | W3-25, W3-04, SPEC §4                   |
| Q-A   | **C** — bỏ `ROLE_RIGHT` khỏi đợt 3 (sang đợt 7)                                                                                   | §2.2, SPEC-B3 §1.1, W3-16, W3-18, W3-19 |
| Q-B   | **Giữ** mua seat cho kỳ sau, trên dòng kỳ sau, hiệu lực ngày bắt đầu kỳ sau; không 409 mới                                        | W3-16                                   |
| Q-C   | Dòng kỳ cũ **đóng tại ngày kết thúc kỳ**; unique chỉ trên dòng chưa bị nối tiếp; sổ kỳ sau mở từ ngày bắt đầu kỳ sau              | SPEC-B3 §1.1, W3-15, W3-21              |
| Q-D   | **Một thông báo** cho IT phụ trách workspace; không dùng được ⟹ Super Admin                                                       | W3-12, §8                               |
| Q-E   | Ngưỡng so **tiền hàng chưa thuế**; thuế không khấu trừ vào _Chênh lệch hóa đơn kho_, không tính ngưỡng                            | W3-05                                   |
| Q-F   | Sau hạn chót: _Bị khóa tới_ ngày gia hạn **kỳ sau**; tiềm năng từ ngày đó; bảng 4A sửa ở Docs                                     | W3-06, W3-09                            |
| Q-G   | `priorYearReleased` gồm `MONTH_END` tháng 12; _tránh được_ nhóm = phần một người; _thực_ cam kết 12 trả tháng ở hóa đơn đầu, × 12 | W3-07, W3-09                            |

### 13.3. Đã áp REVIEW-SPEC

| ID     | Nơi sửa                                                         | ID     | Nơi sửa                                                            |
| ------ | --------------------------------------------------------------- | ------ | ------------------------------------------------------------------ |
| B1-R1  | W3-05 (hai hóa đơn Std/Prem), W3-09                             | B2-R1  | SPEC-B3 §1.1 (`closed_on`, unique, M5 b2), W3-15, W3-16, W3-21     |
| B1-R2  | W3-09 mục 3 + ca trả tháng                                      | B2-R2  | W3-16 (giữ mua kỳ sau)                                             |
| B1-R3  | W3-06 (điều kiện hạn chót, ca 06/2027), W3-09 (ca 10/02, 02/06) | B2-R3  | W3-10 route, §7.1 #6, #18                                          |
| B1-R4  | W3-02 mục 3, W3-07 mục 2 + ca J                                 | B2-R4  | SPEC-B3 "Quyền trong B3", §7.1 cột phạm vi, W3-10, W3-18           |
| B1-R5  | W3-04 (tập kỳ), W3-07 mục 8 + ca I, M                           | B2-R5  | W3-10 "Nơi đọc hồ sơ cũ", §6.1                                     |
| B1-R6  | W3-05 (so tiền hàng)                                            | B2-R6  | W3-14, §6.2 tầng 5b                                                |
| B1-R7  | W3-05 (cover, nhóm ngày mua, `R`, giới hạn `q`)                 | B2-R7  | SPEC-B3 §1.1 `subscriptions.plan_id`                               |
| B1-R8  | W3-09 mục 2 + ca nhóm                                           | B2-R8  | W3-12, §8.2 `WORKSPACE_ADMIN_NOT_WORKING`                          |
| B1-R9  | W3-02 mục 1 (khối kiểm `OTHER`)                                 | B2-R9  | SPEC-B3 §1.2 `license_lots.workspace_id`, W3-24 ca 9               |
| B1-R10 | W3-07 mục 5–7 + ca K, L                                         | B2-R10 | W3-11 (mặc định workspace), §7.2                                   |
| B1-R11 | W3-07 mục 9 + ca C, F'                                          | B2-R11 | §2.2, SPEC-B3 §1.1 `basis`, W3-18                                  |
| B1-R12 | W3-08 (bỏ "≥ tháng hiện tại", ca 01/08, 01/11, 01/01)           | B2-R12 | SPEC-B3 §1.1 M5 b2–b3 (`DRAFT` không sổ)                           |
| B1-R13 | W3-04 (tập kỳ, `NO_QUANTITY`)                                   | B2-R13 | W3-21 (tự gia hạn mang quyền, op, giá mặc định), §7.2              |
| B1-R14 | W3-07 mục 4 + ca D, D2, E                                       | B2-R14 | SPEC-B3 §1.1 CHECK cửa, W3-11 ngày thanh toán, W3-19 dùng lại seat |
| B1-R15 | §8.1, §8.2; W3-03, W3-05, W3-06                                 | B2-R15 | W3-16 ngày hiệu lực, W3-18, W3-19                                  |
| B1-R16 | W3-09 mục 1 (`RENEWAL`/`NEXT_BILLING`), §7.2                    | B2-R16 | W3-10 khối kiểm + `ADMINS_TOO_FEW` + `admin_note`, W3-13           |
| B1-R17 | W3-05 CHECK `invoices_pool_figures`                             | B2-R17 | W3-19, W3-20, W3-28 (Zoom; Jira theo `QĐ-119e`)                    |
| B1-R18 | W3-09 giới hạn B1 (một phần — §13.4)                            | B2-R18 | `file:line` B2/B3                                                  |
| B1-R19 | W3-02 mục 5 + ca `NULL`                                         | B2-R19 | W3-18 (`nthWorkingDayFrom`), W3-22 (dữ kiện 310/320)               |
| B1-R20 | `file:line` B1                                                  | K-A1   | W3-23 mục 3 + ca 01/01                                             |
| B1-R21 | PLAN điều kiện bắt đầu, §2.3 giả định 4                         | K-A2   | W3-23 mục 4                                                        |
| B1-R22 | §11, mọi bảng tiêu chí B1                                       | K-A3   | W3-23 mục 2, M7 `tax_part_minor`                                   |
| K-A4   | SPEC-B3 §1.2 `cost_borne`, W3-25 (công thức + 3 thứ tự)         | K-A5   | W3-24 giá Request + ca 5, 6                                        |
| K-A6   | W3-24 nhập khóa + ca 7                                          | K-A7   | SPEC-B3 §1.2 khối kiểm M6                                          |
| K-A8   | W3-25 tỷ lệ                                                     | K-A9   | W3-25 phần dư + ca                                                 |
| K-A10  | W3-26                                                           | K-B1   | §10, §2.2, W3-24 `STOCK`, W3-25, §4                                |
| K-B2   | SPEC-B3 §1.2 bảng sáu hàm, §5 M6                                | K-B3   | §10, PLAN P20b                                                     |
| K-B4   | W3-24 route + route cũ, §7.1 #18, §7.2                          | K-B5   | §6.2                                                               |
| K-B6   | §5 đoạn đầu, tên M1–M7                                          | K-B7   | W3-24 route cũ, §10                                                |
| K-C1   | PLAN "Nền và nhánh", CODE-PROMPT §1                             | K-C2   | PLAN (tên file cụ thể, kiểm chéo làn)                              |
| K-C3   | PLAN _Cửa_ (bản 2.4: PR từ nhánh chụp, đẩy B2 sau C1)          | K-C4   | PLAN P12a/P12b, P13a/P13b, P16a/P16b, P20b                         |
| K-C6   | CODE-PROMPT mục LUẬT CỨNG                                       |        |                                                                    |

### 13.4. Không áp hoặc áp một phần

| ID     | Đề xuất của review                                      | Làm gì                                                         | Lý do                                                                                                                                                                                                  |
| ------ | ------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| B1-R7  | Làm tròn `Σ_task roundHalfAway(…)` (mỗi tác vụ một lần) | Áp một phần: làm tròn một lần **mỗi nhóm ngày mua**            | Nhóm tác vụ cùng ngày mua chính là một lần mua ở B3 (W3-18 `expectedAmount` tròn một lần) — giữ một số cho cùng ca qua B1 → B3 (7.333.333, không 7.333.334). Tác vụ khác ngày vẫn tròn riêng           |
| B1-R18 | Credit note ⟹ `expected = 0`, vào `invoiceVariance`     | Không áp phần credit note; áp phần giới hạn tự gia hạn         | Mô hình không có hóa đơn âm/credit note (`budgets/invoice/purchase-invoice-recorder.service.ts:39` từ chối `net ≤ 0`; `PurchaseInvoiceLabel` không có loại điều chỉnh) — thêm là phạm vi mới; ghi §2.2 |
| K-B4   | "422 hoặc ghi vào lô" cho route cũ trên `PERPETUAL`     | Bản 2 chọn 422; **bản 2.1 theo Owner T-2: ghi vào lô cùng id** | Owner chốt 24/11 — nay áp đủ, không còn "không áp"                                                                                                                                                     |

### 13.5. Đã áp review lượt 2

| ID  | Mức   | Nơi sửa                                                                                                                             |
| --- | ----- | ----------------------------------------------------------------------------------------------------------------------------------- |
| N1  | Cao   | SPEC-B3 §1.2 (hàm thứ sáu `license_assignment_check_capacity`: bỏ qua gói `K4`), §5 M6, §10                                         |
| N2  | Cao   | SPEC-B3 §1.1 (M5: `seat_purchase_id`, `subscription_line_ids` vào trigger bất biến), §1.2 (M6: CHECK `link_kind`, `license_lot_id`) |
| N3  | Cao   | SPEC-B3 W3-23 mục 2–3 (chênh do thuế theo cặp hóa đơn–năm) + ca 4.400.000                                                           |
| N4  | Cao   | SPEC-B1 W3-05 (`R` theo chu kỳ trả) + ca 166.667; SPEC-B3 W3-18 `expectedAmount`, W3-20 + ca                                        |
| N5  | Cao   | SPEC-B2 W3-14 (quy trình đọc → khóa workspace → khóa kỳ → kiểm lại), §6.2 tầng 5b, CODE-PROMPT LUẬT CỨNG 11                         |
| N6  | TB    | SPEC-B3 W3-24 cấp `K4`, §6.2 tầng 6a                                                                                                |
| N7  | TB    | SPEC-B3 W3-18 (hóa đơn kỳ tách theo dòng `subscriptionLineIds`), §1.1 cột, §7.2                                                     |
| N8  | TB    | SPEC-B1 W3-05 (`QUARTERLY` × 3) + ca 3.600.000                                                                                      |
| N9  | TB    | SPEC-B3 W3-18 (hóa đơn nâng seat `K2` chỉ link `SUBSCRIPTION`), §7.2                                                                |
| N10 | TB    | SPEC-B3 §1.2 `license_lots_capacity` (`FOR UPDATE`, chặn mức cô lập)                                                                |
| N11 | TB    | PLAN _Nền và nhánh_, CODE-PROMPT §1 (`git diff --stat` đợt 2 rỗng)                                                                  |
| N12 | Thấp  | CODE-PROMPT LUẬT CỨNG 7, §8 (dạng PowerShell `$env:CI='true'`)                                                                      |
| Nhỏ | Thấp  | W3-25 ký hiệu `m` (số người) / `key` (khóa); W3-06 `adjustmentPointOf(…, windows)`; §9 hệ quả T-7; W3-23 giới hạn T-3               |
| T-2 | Owner | SPEC-B3 W3-24 route cũ + ca 10, §7.2, §13.1, §13.4                                                                                  |

### 13.6. Đã áp review lượt 3

Nguồn: [REVIEW-SPEC-3-FABLE.md](REVIEW-SPEC-3-FABLE.md) (chuỗi tiền có trạng thái, ngoài bảng ví dụ); 11 ca test đề xuất đã vào bảng tiêu chí.

| ID  | Mức            | Nơi sửa                                                                                                                                        |
| --- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | Cao            | SPEC-B1 W3-07 mục 5 (giải phóng = Σ dòng thực nhận) + ca F1                                                                                    |
| F2  | TB             | SPEC-B1 W3-07 mục 5 (`K2` tháng đầu/cuối từ dòng tháng) + ca F2                                                                                |
| F3  | TB             | SPEC-B1 W3-07 mục 6–8 (idempotent bằng `settled_at`, đảo ⟹ `HELD`, trạng thái tính lại mọi lần) + ca H, F3, F3'                                |
| F4  | TB             | SPEC-B1 W3-07 ca L (sửa theo `planRemainder`: toàn bộ `held`, Request đã kết thúc; không thêm API)                                             |
| F5  | TB             | SPEC-B1 W3-07 ca J (`LATE_GRANT` 483.871; `MONTH_END` 0 / 0 / 258.065)                                                                         |
| F6  | TB             | SPEC-B1 W3-07 mục 8–9 (dọn mọi năm cũ, mốc 01/02; 0 đ chỉ `settled_at`; `YEAR_END` rải dòng) + ca F6                                           |
| F7  | Cao            | SPEC-B1 W3-08 `monthsLeft` (từ tháng seat bắt đầu giữ) + 3 ca                                                                                  |
| F8  | Owner          | SPEC-B3 W3-23 mục 3a (dòng bù trừ `TRANSFER_OUT/IN`), M7 `kind` + ca F8; OWNER-ANSWERS                                                         |
| F9  | TB             | SPEC-B3 W3-23 mục 3b (advisory chung, mốc ngày đầu kỳ hóa đơn, thu hồi, tháng đã chốt), M7 `invoice_year_applications` + 3 ca                  |
| F10 | Cao            | SPEC-B3 W3-25 (khóa cho chính Request của lô không trả cam kết) + ca                                                                           |
| F11 | Cao            | SPEC-B3 W3-24 cấp `K4` (giữ m license; 409 `LICENSE_LOT.RESERVED_FOR_REQUEST`) + ca                                                            |
| F12 | Owner          | SPEC-B3 W3-25 `POOL_LOT_DIFFERENCE`, M7 bucket âm + 2 ca; OWNER-ANSWERS                                                                        |
| F13 | TB / Owner (c) | SPEC-B3 W3-25 (m = n; "cuối" theo số phí; người rút ⟹ `WITHDRAWAL`, phí 0 không ghi) + 3 ca; OWNER-ANSWERS F13c                                |
| F14 | TB             | SPEC-B3 §1.2 unique M6 (409 `PURCHASE_INVOICE.LOT_ALREADY_INVOICED`, `LICENSE_LOT.REQUEST_HAS_LOT`), W3-25 tỷ lệ trừ license đã ghi phí + 2 ca |
| F15 | Thấp           | SPEC-B1 W3-07 mục 5 + ca F15; W3-08 ca F15b (hành vi chấp nhận)                                                                                |

### 13.7. Đã áp sau rà file giải thích

| Điểm                                                                                                                                                                                                                           | Nơi sửa                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-LATE (Owner 24/11): ghi gia hạn sau hạn chót của gói cam kết 12 — mặc định số seat kỳ cũ; ghi giảm ⟹ 422 `SUBSCRIPTION_RENEWAL.REDUCTION_AFTER_DEADLINE`; ghi tăng được; phần vượt mục tiêu ⟹ _Lỡ điểm điều chỉnh_ + `KPI-4` | SPEC-B3 W3-21 (luật + 2 ca), W3-22 (ca 1.000.000); SPEC-B1 W3-06 (`q_next` mặc định); OWNER-ANSWERS                                                                 |
| Q-F làm rõ (Owner 24/11): sau hạn chót, seat Trống thuộc phần đã ghi giảm ⟹ _Bị khóa tới_ ngày gia hạn kỳ này; seat Trống còn trong số kỳ sau ⟹ ngày gia hạn kỳ sau                                                            | SPEC-B1 W3-06 luật (3) + ca 2 seat (33.333 / 483.333 / 483.334); OWNER-ANSWERS                                                                                      |
| Ca Q-B "gia hạn ghi sớm rồi cấp" ghi 05/06 là **sau** hạn chót                                                                                                                                                                 | SPEC-B3 W3-16, W3-15 tiêu chí 4: ghi 28/05/2027, cấp 20/06 giữ                                                                                                      |
| Tên lệch công ty mẫu (`Docs/Requiments/giai-thich-kho-gia-han-chi-phi-ngan-sach.md` mục _Công ty mẫu_): Minh ở Kỹ thuật, Khoa phụ trách Thiết kế, Bình là nhân viên, Nam phụ trách Kỹ thuật                                    | SPEC-B3 W3-16 (Mai thay Minh), W3-18 (Lan + Mai do Khoa; Nam ⟹ 403; ca một lần mua hai phòng ⟹ 403), W3-22 ví dụ 1A; SPEC-B2 W3-10 (admin chỉ IT: Khoa, Nam), W3-12 |
