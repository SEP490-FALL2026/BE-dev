# AUDIT — gói sửa bug (`BUG-A`, `BUG-B`, CO-1…CO-10), chat Opus 12/11/2026

> Phạm vi: diff `b71ed330..6966f29e` trên `feat/mf2-mf3` (12 commit của chat Sonnet) so với [SPEC](SPEC.md) v1.2, [PLAN](PLAN.md) và
> quyết định Owner ở [HANDOFF-CODE](HANDOFF-CODE.md). Ba review độc lập chạy song song (BUG-A + CO-1; Business Owner phía
> catalog/identity + CO-10; module còn lại + CO-6/CO-8 + toàn bộ test bị sửa/xóa), rồi chat điều phối tự đọc migration, phân quyền,
> SQL và tự chạy test, mutation. Bản sửa của lượt audit **chưa commit** (Owner commit).

## 1. Kết luận

- **D1–D7:** đạt sau các sửa ở §2. D4 trước khi sửa chỉ đạt một phần (F1).
- **Business Owner:** đã gỡ sạch khỏi code đang chạy, chỉ còn model Prisma và quan hệ `ApplicationLegacyBusinessOwner`, bỏ ở đợt dọn.
- **Migration** `20261112000000_application_responsible_it_admin`: chỉ thêm cột, FK `RESTRICT`, index và backfill; không drop. Backfill theo
  vị từ cũ (chưa loại người đã nghỉ). Cờ `needsResponsible` tính lúc đọc nên tự đúng sau F1, không sửa migration.
- **Chuyển phụ trách:** quyền đúng SPEC §3, khóa `FOR UPDATE` trước khi đọc, audit trong cùng transaction.
- **Test bị xóa hoặc sửa:** đều đi theo route/tính năng đã bỏ. Không có `.skip`/`.only`; trần lint-debt còn được siết.

## 2. Phát hiện và sửa (chưa commit)

| #   | Mức                   | Phát hiện                                                                                                                                                                                                                                                                                                          | Sửa                                                                                                                                                                                                                              |
| --- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | Bắt buộc              | `findUsableItAdminEmployeeIds` không loại người đã nghỉ việc mà tài khoản chưa khóa (lệch SPEC §4 "nhân viên chưa nghỉ"; hai hàm cùng file có điều kiện này). Hệ quả: `needsResponsible=false`, IT khác nhận bị 403, chuyển cho người đã nghỉ trả 200, CO-10 gán người đã nghỉ, cảnh báo gia hạn gửi người đã nghỉ | `app-user.repo.ts`: thêm `employee: { status: 'ACTIVE' }`. Test integration mới: nghỉ việc chưa khóa ⟹ `needsResponsible`, IT khác nhận, chuyển cho người đó 422; sweep gia hạn rơi về IT phòng                                  |
| F2  | Bắt buộc              | `GET /it-admins` đọc cả tập rồi cắt trang trong bộ nhớ (`API-LIST-DETAIL.1` mục 4, 6); tìm tên không khớp nguyên văn                                                                                                                                                                                               | `OrganizationReadApi.getEmployeePageAmong` (một snapshot `RepeatableRead`, `ILIKE` có escape, `ORDER BY employee_code, id`); `ItAdminQueryService` gọi nó. Test: tìm theo tên, `%` là ký tự, số câu lệnh không đổi theo cỡ trang |
| F3  | Bắt buộc              | Không có test chứng minh thông báo `SUBSCRIPTION_RENEWAL_DECIDED` gửi IT phụ trách thuê bao (CO-6)                                                                                                                                                                                                                 | Test integration trong `subscription-renewal-decision`                                                                                                                                                                           |
| F4  | Owner chọn A          | Bảng ghost seat mặc định `departmentScope=ALL` ⟹ IT Admin đọc usage của mọi phòng, trái `QĐ-111ax` (chặn cứng theo phòng phụ trách)                                                                                                                                                                                | Hai route luôn đọc phạm vi `getItAdminScope`; `departmentScope` giữ để không gãy client, mặc định `MINE`, `ALL` không còn mở rộng. Seed đọc khuyến nghị gộp qua mọi IT Admin phụ trách thuê bao của dataset. Changelog FE        |
| F5  | Owner chọn A          | Seat `K4` cấp trước khi có kho khóa vẫn bị bắt `keyDisposition`, audit ghi "trả về kho" kèm `licenseKeyId` rỗng                                                                                                                                                                                                    | `planKeyReturn(input, type, holdsKey)`; `RevocationAftermath.holdsKey` (khóa dòng khóa). Không có khóa ⟹ không hỏi, audit không ghi khóa. Test policy + integration                                                              |
| F6  | Nhỏ                   | Thiếu test 404 hai route Business Owner; module card `notifications/README.md` còn mã cũ                                                                                                                                                                                                                           | Test http 404; README sửa (mã cũ không ghi mới, dòng đã lưu vẫn đọc được)                                                                                                                                                        |
| —   | Lỗi phát sinh khi sửa | Mô tả OpenAPI của `departmentScope` chứa mã nội bộ `QĐ-111ax` (test `openapi-presentation` cấm)                                                                                                                                                                                                                    | Bỏ mã khỏi mô tả                                                                                                                                                                                                                 |

Để lại (Optional, ghi để làm sau): nhánh fallback của người nhận gia hạn chưa kiểm "dùng được" và luôn tính trước; `holdersInScope` gọi
`getDepartmentMemberIds` từng phòng (2 câu lệnh mỗi phòng); hai tab bảng ghost seat lọc phòng theo hai nghĩa (phòng của khuyến nghị và
phòng hiện tại của người giữ); CO-10 đọc ứng dụng nặng hơn cần (`PlanFactsService.responsibleItAdminIdOf` có sẵn); hàng đợi trưởng phòng
(`GET /ghost-seat-queue`) vẫn trả họ tên người giữ (ngoài phạm vi màn usage của BRD 7.5 — Owner xác nhận nếu cần); test đua nhận phụ trách
phụ thuộc thời điểm.

## 3. Mutation (cố ý làm sai, test phải đỏ)

| Mutant                                                      | Test bắt                                                | Kết quả |
| ----------------------------------------------------------- | ------------------------------------------------------- | ------- |
| Bỏ kiểm `KEY_DISPOSITION_REQUIRED` (K4 có khóa)             | `revocation-key-return.policy.spec`                     | bị bắt  |
| Bỏ `if (!holdsKey) return null` (F5)                        | `revocation-key-return.policy.spec`                     | bị bắt  |
| Bỏ `employee.status = ACTIVE` khỏi vị từ (F1)               | `application-responsibility-http.integration-spec`      | bị bắt  |
| Bỏ tìm theo họ tên ở `/it-admins` (F2)                      | `application-responsibility-http.integration-spec`      | bị bắt  |
| `ALL` đọc cả công ty (F4)                                   | `board-query.service.spec`                              | bị bắt  |
| Thông báo quyết gia hạn bỏ qua IT phụ trách thuê bao (CO-6) | `subscription-renewal-decision.integration-spec` (CO-6) | bị bắt  |
| Người phụ trách bị khóa vẫn nhận cảnh báo (CO-6)            | `subscription-renewal-sweep.integration-spec` (BB-9)    | bị bắt  |

Ba mutation chuyển phụ trách của review catalog (bỏ "chỉ nhận cho chính mình", đảo thứ tự kiểm) bị bắt; bỏ vế `!needsResponsible` là
mutant tương đương.

## 4. Kiểm chứng (chạy thật, DB test docker cổng 35432)

| Lượt                             | Lệnh                                                     | Kết quả                                                                                                      |
| -------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 1 — code Sonnet `6966f29e`       | `pnpm check`                                             | đỏ 1 test script do biến `TEST_DATABASE_BOOTSTRAP_URL` của người chạy lọt vào (chạy lại không có biến: xanh) |
|                                  | `test:http` · `test:integration:serial` · `test:flows`   | 2125/2125 · 96/96 · 60/60                                                                                    |
|                                  | `test:integration` (50 % lõi, máy đang chạy 3 review)    | 34 suite đỏ, phần lớn `TransientDatabaseError`/quá thời gian (quá tải DB)                                    |
| 2 — sau sửa F1–F6 (working tree) | `pnpm check`                                             | xanh (gồm build, `test:discovery`, `test:scripts`)                                                           |
|                                  | `test:integration --maxWorkers=4`                        | 403/411 suite; 2 suite ghost seat đỏ thật do F4 ⟹ sửa test (31/31); 6 suite chạy lại `--maxWorkers=2`: 60/60 |
|                                  | `test:integration:serial` · `:timing` · `test:flows`     | 96/96 · 28/28 · 60/60 (flows seed cả dataset qua HTTP)                                                       |
|                                  | `test:http` (sau sửa mô tả OpenAPI)                      | 2126/2126                                                                                                    |
|                                  | `test:gates` · `rules:check` · lint · typecheck · format | 331/331 · 0 lỗi · sạch                                                                                       |

Tài liệu API FE (`Docs/Figma UI-UX/API-Integration`): sinh lại từ working tree, `--check` OK 378 operation 4947/4947 trường, test
45/45; CHANGELOG thêm mục audit. **Chưa commit Docs** — sinh lại theo sha khi Owner commit BE.

## 5. Seed local (CO-9)

`pnpm seed:local -- --continue` trên database mới `slm_smoke` (container test cổng 35432; `.env.seed.local` trỏ cổng 55432 bị Windows
chặn nên đổi tạm cổng rồi khôi phục file): **50 bước ĐÃ GHI, mã thoát 0**, gồm `rules.first-run` và `ghost.decisions` (đọc khuyến nghị
gộp qua các IT Admin sau F4). Đếm trên DB seed: 12/12 ứng dụng có IT phụ trách (0 `NULL`) nhưng **cả 12 do một IT Admin** (seed tạo mọi
ứng dụng bằng một tài khoản); 12/12 thuê bao có người phụ trách. Đề xuất cho gói `Z2`: chia ứng dụng cho 2–3 IT Admin để FE demo ô
_IT phụ trách_ và chuyển phụ trách.
