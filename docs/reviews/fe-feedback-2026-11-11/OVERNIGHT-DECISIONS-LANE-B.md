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

### D-B5 — căn cứ ban hành bản 1 khi cài đặt và nơi nạp 8 chính sách

- **Câu hỏi:** POLICY-SEED-DRAFT ghi căn cứ demo ("Quyết định số 01/2026/QĐ-GĐ") và đề xuất cho cài đặt thật "Bộ mẫu SaaS-Sentry v1.9 — công ty xuất bản phiên bản 2 kèm quyết định của mình"; nạp ở đâu khi PLAN ghi `src/cli/seed/**`, bootstrap cài đặt còn lệnh giao việc cấm sửa demo seed?
- **Phương án:** (A) lệnh cài đặt nạp bản 1 với căn cứ bộ mẫu, seed demo gọi cùng API với căn cứ riêng; (B) chỉ seed demo nạp (cài đặt thật không có chính sách ⟹ mọi bước duyệt bị khóa vì không có bản hiện hành); (C) migration dữ liệu (không có tổ chức lúc migrate).
- **Chọn A:** đúng "Không nạp nháp, vì checklist cần bản hiện hành" (điểm Owner 6) và không đụng demo seed. `PoliciesBootstrapApi.seedInitialPolicies(tx, orgId, changeNote?)` chạy lại an toàn. Cài đặt gọi qua `InstallationInitialDataService` (nhóm chức năng + chính sách) vì constructor `InstallationApi` đã 8 tham số.
- **File:** `policies/initial/*`, `policies/public/policies-bootstrap.api.ts`, `installation/installation-initial-data.service.ts`. **Đổi lại:** bỏ lời gọi ở service; hoặc đổi `INITIAL_CHANGE_NOTE`.

## Optional và việc để lại

- Báo cáo xác nhận chưa có tổng `done`/`pending` toàn tập (cần join chéo module); thêm khi FE đòi.
- `GET /policies/{code}` cho phiên bản cũ trả `myAcknowledgement = null` (chỉ bản hiện hành có trạng thái).
- Mã thông báo cũ `BUDGET_DEPARTMENT_CEILING_PUBLISHED` giữ (đọc được hàng cũ) — BG-1.3 chỉ ngừng phát.

## Seed cần cho Z2

- (chưa có)

## Bị chặn

- (chưa có)

## Dừng ở đâu

- Xong cả PL-1 (PL-1.1–PL-1.5, commit cuối `e20b09e6`). Việc tiếp: PL-3 → PF-1 → BG-1 → BG-2.
