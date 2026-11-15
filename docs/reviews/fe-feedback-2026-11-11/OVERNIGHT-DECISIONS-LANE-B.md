# OVERNIGHT-DECISIONS-LANE-B — chạy đêm lane B (15/11/2026)

> Nhánh `feat/fe-feedback-lane-b`. Owner không trả lời lúc chạy; mọi điểm dưới đây là **tạm chốt**, audit hỏi lại từng `D-Bn`. Mỗi mục: câu
> hỏi · phương án · đã chọn + căn cứ · file/commit · cách đổi lại. Thứ tự căn cứ: QĐ → BRD → OWNER-REVIEW → SPEC/PLAN → code → thông lệ.

## Chờ Owner quyết

| Mã        | Câu hỏi | A   | B   | Khuyến nghị |
| --------- | ------- | --- | --- | ----------- |
| (chưa có) |         |     |     |             |

## Quyết định tự chốt (D-Bn)

### D-B1 — thêm `GET /policies/{code}/draft` cho Super Admin

- **Câu hỏi:** SPEC PL-1 có `PUT`/`DELETE` nháp nhưng không có route đọc nháp; Super Admin cần đọc nháp đang soạn.
- **Phương án:** (A) thêm `GET /policies/{code}/draft` (SUPER_ADMIN); (B) chỉ trả nháp trong `PUT`; (C) thêm trường `draft` vào `GET /policies/{code}`.
- **Chọn A:** thêm một route chỉ đọc, không đổi route nào của SPEC; `GET /policies/{code}` không lộ nháp cho người đọc thường.
- **File/commit:** `policies/library/` (task PL-1.3). **Đổi lại:** xóa route, FE dùng kết quả `PUT`.

### D-B2 — "người có vai áp dụng" tính theo vai được cấp (`directRoles`), không theo vai đang hiệu lực

- **Câu hỏi:** MANAGER chưa là trưởng phòng của phòng nào có vai (cấp) nhưng không hiệu lực; có phải xác nhận chính sách không?
- **Phương án:** (A) vai được cấp và còn hiệu lực (`directRoles`, giống `roles` của `GET /me`); (B) vai hiệu lực (`roles` của principal).
- **Chọn A:** khớp `GET /me` (FE chặn theo danh sách này) và khớp người nhận thông báo xuất bản (tài khoản giữ grant). **Đổi lại:** đổi nguồn vai ở `acknowledgement.service.ts`.

### D-B3 — chủ sở hữu mục sổ collection của PL-1 là work item `us-01-bootstrap-login-session`

- **Câu hỏi:** gate `api-collection-contract` đòi mỗi mảng lồng mới có `owner`/`item` là một thư mục có sẵn dưới `docs/workspace/items`; không có thư mục cho thư viện chính sách.
- **Phương án:** (A) dùng work item EP-01 gần nhất có sẵn; (B) tạo thư mục work item mới (kèm README, dòng trong chỉ mục, rules:check).
- **Chọn A** (US-01-13/14 thuộc EP-01; không tạo tài liệu chỉ để qua gate). **File:** `test/support/api-collection-registry-nested-pl1.ts`, `…-events-pl1.ts`. **Đổi lại:** đổi `OWNER`/`item` khi có work item riêng.

### D-B4 — báo cáo xác nhận đã đọc không lọc theo trạng thái

- **Câu hỏi:** `GET /policies/{code}/acknowledgements` ("báo cáo đã/chưa, phân trang") có cần lọc `state=PENDING|DONE`?
- **Phương án:** (A) không lọc, trả trang theo mã nhân viên với `state` từng dòng; (B) lọc bằng SQL join `app_users`/`role_grants` (bảng của module khác) hoặc đọc cả tập rồi cắt trang trong bộ nhớ (cả hai vi phạm luật).
- **Chọn A** (đúng chữ SPEC, không lách luật module/phân trang); FE lọc trang đang xem. **Đổi lại:** thêm điều kiện `state` vào `IdentityAccessApi.pageUsableRoleHolders` cùng một câu join `policy_acknowledgements` qua facade.

### D-B5 — căn cứ ban hành bản 1 và nơi nạp 8 chính sách (SỬA theo FIX-LB1 LB1-01, LB1-02)

- **Câu hỏi:** nạp 8 chính sách ở đâu và căn cứ bản 1 ghi gì khi tổ chức mới cài và khi tổ chức đã cài từ trước.
- **Phương án:** (A) lệnh cài đặt nạp cho tổ chức mới; (B) thêm migration bù cho mọi tổ chức đã có (tiền lệ CT-1.1); (C) chỉ seed demo nạp.
- **Chọn A + B** (bản đầu chọn A và loại B vì "không có tổ chức lúc migrate" — sai với môi trường đã cài; reviewer chỉ ra, đã sửa). Cài đặt mới: `PoliciesBootstrapApi.seedInitialPolicies` qua `InstallationInitialDataService`. Môi trường có sẵn: migration `20261113100300_fixlb1_policies_backfill` (SQL sinh từ `INITIAL_POLICIES`, mỗi câu bỏ qua cái đã có nên chạy lại không nhân đôi và không đụng bản Super Admin đã xuất bản; test DB thật đọc lại và so với code). Căn cứ bản 1 = đúng văn bản chính thức: _"Bộ mẫu SaaS-Sentry 1.0 — công ty xuất bản phiên bản 2 kèm quyết định của mình"_ (không còn "v1.9").
- **File:** `policies/initial/*`, `installation/installation-initial-data.service.ts`, `prisma/migrations/20261113100300_*`. **Đổi lại:** sửa `INITIAL_CHANGE_NOTE` trước khi cài; migration đã chạy thì bản 1 bất biến — sửa bằng bản 2.

### D-B6 — chưa bỏ mục đích tệp `COST_STATEMENT` ("sao kê") khỏi enum nhận mới

- **Câu hỏi:** PLAN PL-3.1 bảo bỏ mục đích tệp sao kê khỏi enum nhận mới (US-01-12 AC-10, US-04-04 AC-11). Mục đích đó là `COST_STATEMENT` trong `catalog/contract/contract.dto.ts` + `contract.policy.ts`.
- **Phương án:** (A) bỏ ngay ở lane B; (B) để lại tới lượt hợp nhất vì cùng file lane A (CO-1 sửa hợp đồng/tệp, PI-1 thêm mục đích tệp cho hóa đơn); (C) giữ vĩnh viễn.
- **Chọn B** (tránh xung đột file chung, không mất gì: không có route nào của PL-3 nhận file sao kê, và **không có mẫu sao kê**). **Việc cho chat điều phối:** sau khi lane A xong PI-1, bỏ `COST_STATEMENT` khỏi danh sách nhận mới (`contract.dto.ts:95`, `contract.policy.ts:20,35`, `contract.policy.spec.ts`), giữ giá trị trong DB để đọc tệp cũ.

### D-B7 — các điểm Optional/Nit của review để lại (LB1-07…LB1-20, LB3-07…LB3-16)

Không làm ở FIX-LB1 (rẻ nhưng đổi hợp đồng hoặc chạm file lane A); chờ lượt hợp nhất: LB1-07 khóa ngoại `organization_id` của ba bảng; LB1-09 thông báo xuất bản theo lô (hiện tuần tự trong transaction, quy mô cỡ 100–500 tài khoản); LB1-10 `POLICY_ROLES` suy từ `AppRole`; LB1-12 báo cáo xác nhận chưa có tổng đã/chưa (FE ghi chú); LB1-13 `GET /policy-steps/{stepCode}` để FE khỏi cứng hóa bước ⟹ chính sách; LB1-14 `applicableRoles` của xuất bản tùy chọn; LB1-16 `totalItems` đếm cả chính sách chưa có bản; LB1-17 `versionNumber` trả về khi DONE là bản hiện hành chứ không phải bản đã xác nhận; LB1-18 tên file `initial/pol-*.types.ts`; LB1-19 owner sổ collection (D-B3); LB1-20 migration không `IF NOT EXISTS`; LB3-07 `COST_STATEMENT` (D-B6); LB3-08 quyền tải mẫu do module sở hữu import khai; LB3-09 hai nguồn cùng một `kind`; LB3-10 dòng ví dụ có thể bị nhập thật; LB3-11 cách mở CSV trên máy Việt Nam; LB3-12 spec nhân sự ghim cột bằng literal; LB3-13 BOM viết bằng ký tự vô hình; LB3-14 nhánh `??` chết ở mẫu usage; LB3-15 tên `*-template.policy.ts` chứa hằng dữ liệu; LB3-16 tên file `mau-usage-csv.xlsx`. Chi tiết ở AUDIT-LB-PL1.md và AUDIT-LB-PL3.md.

### D-B8 — kỳ ngân sách: "hết hạn nộp" = ngày sau hạn nộp; luật sửa theo trạng thái; cửa sổ tạo phòng (BG-1)

- **Câu hỏi:** (1) `QĐ-111z` nói "hết hạn nộp là khóa": ngày đúng bằng hạn còn trong hạn không; (2) lý do bắt buộc ở kỳ đang mở áp cho thay đổi nào; (3) cửa sổ tạo phòng khi kỳ năm sau còn nháp.
- **Chọn:** (1) khóa từ **ngày sau** hạn nộp (cùng quy ước đã có của nhắc hạn: "ngày bằng hạn còn trong hạn"); (2) kỳ đang mở: dời hạn nộp (về hôm nay hoặc sau, không về quá khứ), đổi Trần năm, đổi Dự phòng kho đều **bắt buộc lý do** và lưu trước/sau; hạn quyết và ưu tiên đổi tự do; nháp sửa tự do, không lý do, hạn nộp có thể ở quá khứ nhưng **không mở được** (422 `BUDGET_CYCLE.DEADLINE_PASSED`, sửa trước); (3) nháp ⟹ cửa sổ **đóng** (đúng chữ SPEC "kỳ năm sau đã mở"); mở và chưa có phiên bản nào có `sent_at` ⟹ mở; không có kỳ nào ⟹ như cài đặt.
- **Mã mới:** `BUDGET_CYCLE.LOCKED`, `.NOT_DRAFT`, `.ALREADY_OPEN` (409), `.DEADLINE_PASSED` (422), `.NOT_OPEN` (409, thay `BUDGET.CYCLE_NOT_PUBLISHED`); các mã cũ `BUDGET.CYCLE_*` còn lại giữ nguyên. Danh sách kỳ trả bản tóm tắt không có `priorities` (cổng collection-contract không cho phần tử danh sách trùng hình dạng chi tiết).
- **Đổi lại:** nếu Owner muốn "đúng ngày hạn là khóa" hoặc nháp cũng cho tạo phòng thì đổi `cycleStateOf` / `windowOf` (một dòng mỗi nơi, có test).

### D-B9 — phiên bản ngân sách: một số cho cả năm, tên trường giữ nguyên, mã 409 đổi theo SPEC (BG-2)

- **Chọn:** giữ tên trường đang có trên dây (`base`, `reserve`, `reserveReason`) cho `baseAmount`/`reserveAmount` của SPEC, để FE hiện tại không phải đổi tên; chỉ bỏ `quarters`. Mã vượt Trần: `BUDGET_VERSION.OVER_CEILING`, `details.overBy` và `details.availableMinor` là số nhỏ nhất dạng chữ (cùng kiểu mọi `details` tiền khác). Cột `q1..q4_minor` và dòng `BM-10` cũ **không ghi nữa nhưng không xóa** (expand–contract).
- **Việc BG-2 còn lại, chưa làm ở lượt này:** BG-2.1 `CarriedOverContributions` (budgets mở điểm mở rộng, `requests` gắn bằng hàm 01/01 của XY-1 — lane A đang sửa chính hàm đó nên chờ), BG-2.2 `BM-10` = tệp + `requestedAmount` + `note` + khóa sau hạn, BG-2.3 xóa route dòng/import, BG-2.5 phần còn lại (`reservePercent`, ≥ 1 tệp khi gửi, mặc định cơ sở = số chạy sang), BG-2.6 số liệu nền (`carriedOverNextYear`, `noProposalSubmitted`, `BASELINE_NO_PROPOSAL`, bỏ chặn `HAS_HEAD`), BG-2.7 quyết định chỉ `APPROVE`|`RETURN`.

## Optional và việc để lại

- Báo cáo xác nhận chưa có tổng `done`/`pending` toàn tập (cần join chéo module); thêm khi FE đòi.
- `GET /policies/{code}` cho phiên bản cũ trả `myAcknowledgement = null` (chỉ bản hiện hành có trạng thái).
- FIX-LB2 Optional: LBF-04 (CHECK của migration `…100200` làm deploy hỏng nếu một DB đã có bản xuất bản vi phạm — chưa DB nào ngoài máy dev chạy PL-1, FYI, không cần Owner); LBF-05 (ca gọi `insertOnce` hai lần trong một transaction; CHECK bản 1 luôn đòi xác nhận lại; quyền runtime của `policy_acknowledgements`); LBF-06 phần còn lại (so mã `SYSTEM` theo cặp bước + mục, khóa chữ mục `SYSTEM` — cần Owner chốt nếu khóa chữ); LBF-07 (`publishedBy` có tên); LBF-08/09/10 (ghi chú thứ tự, lệch OVERNIGHT/HANDOFF, backfill so snapshot 1.0); PF1-04 (request bay lúc ghi `LEFT` đặt lại ảnh/SĐT), PF1-05 (sweeper gọi storage trong một transaction), PF1-06 (README module + `security-jobs.md` + chú thích client vẽ lại ảnh), PF1-07 (giới hạn điểm ảnh), PF1-08…12. Chi tiết ở `AUDIT-LB-FIX1-PF1.md`.
- Mã thông báo cũ `BUDGET_DEPARTMENT_CEILING_PUBLISHED` giữ (đọc được hàng cũ) — BG-1.3 chỉ ngừng phát.

## Seed cần cho Z2

- **Seed hiện đỏ với BG-1:** `src/cli/seed/steps/finance.steps.ts` gọi `POST /budget-cycles` không có `sharedPoolReserve` (nay bắt buộc ⟹ 422), rồi `PUT …/department-ceilings` và `POST …/publish` (nay 404). Z2 đổi thành: `POST /budget-cycles` kèm `sharedPoolReserve`, rồi `POST /budget-cycles/{year}/opening`; bỏ hai bước kia và bỏ `ceilings` ở fixture. Khi đó `test/integration/installation/seed-calendar.integration-spec.ts` (đọc `first_published_at`) cũng phải đổi sang `opened_at IS NOT NULL`.

## Bị chặn

- (chưa có)

## Dừng ở đâu

- Xong PL-1, PL-3, PF-1, FIX-LB1, BG-1 (`1282e391`), FIX-LB2, BG-2.0 (`4d58016a`), BG-2.4 + một phần BG-2.5 (`09fb1d0e`). Việc tiếp: phần còn lại của BG-2 (xem D-B9), rồi dừng "LANE B CHỜ MERGE".
