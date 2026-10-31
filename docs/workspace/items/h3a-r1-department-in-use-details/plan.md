# Plan: H3a — R-1, bỏ `sharedAccounts` khỏi `DEPARTMENT.IN_USE`

- [Spec](spec.md); revision đầu vào: Docs `9416fe0`, BE `bd05007` cộng H2a/04B/H2b chưa commit.
- Phụ trách: AI theo giao việc Owner. Thiết kế ban đầu bởi: AI theo giao việc Owner.
- Owner review: chưa review. Peer review: tùy chọn, chưa có.
- Triển khai: `verified` (local 18/10/2026; bằng chứng chạy trên cây làm việc chưa commit trên `bd05007`). Revision:
  commit `5aac33f` trên `dev` = `origin/dev` (Owner push trực tiếp 19/10/2026, không PR); remote CI chưa có bằng chứng.

## Before coding

Đã đọc AGENTS.md, CONTRIBUTING.md, ARCHITECTURE.md, rule `module-structure`, `api-contract`, `documentation`, test guide,
audit (F-02, Q4), H3a của handoff, R-1/Bước 1 của remediation, spec/plan `g2-department-profile`, và đối chiếu Docs
`9416fe0` (chỉ đọc): `US-03-06` AC-19 nêu hai nhóm _thành viên · việc đang mở_, ghi _vế tài khoản dùng chung bỏ theo
`QĐ-75`_; sổ quyết định ghi `QĐ-75` thay vế dùng chung của `QĐ-66b`. Cây lúc bắt đầu: `bd05007` cộng 37 mục H2 chưa commit
(hash chụp đầu lượt); `openapi.json` sha256 `04f24d24…`. Quét đầu lượt: `sharedAccounts` ở
`organization.http-errors.ts:118`, `departments-http.integration-spec.ts:466` và chú thích `department.service.ts:290`.

## Tasks

### Task 1: test đỏ cho response 409

- Files: `test/integration/organization/departments-http.integration-spec.ts`.
- Depends on: none.
- Acceptance: test khẳng định 409, code, message, đúng ba khóa `details`, không `sharedAccounts`, phòng `ACTIVE`, audit
  không thêm; đỏ trên code hiện tại chỉ vì khóa còn tồn tại.
- Verify: `pnpm test:integration -- test/integration/organization/departments-http.integration-spec.ts` trên PostgreSQL riêng → 1 đỏ.

### Task 2: sửa tối thiểu

- Files: `src/modules/organization/organization.http-errors.ts`, `src/modules/organization/department.service.ts`.
- Depends on: Task 1.
- Acceptance: bỏ `sharedAccounts` khỏi `details`; chú thích không còn hứa thêm tài khoản dùng chung.
- Verify: test Task 1 xanh; `pnpm openapi:export` byte-identical.

### Task 3: đồng bộ tài liệu BE

- Files: plan/spec này, roadmap, items index, remediation R-1, handoff Task 4, ghi chú `g2-department-profile`.
- Depends on: Task 2 và gate cuối.
- Acceptance: trạng thái theo bằng chứng thật; không viết lại lịch sử.
- Verify: `pnpm rules:check`, `pnpm rules:format`.

### Checkpoint

Sau Task 2: `pnpm check`, `pnpm test:e2e`, `pnpm test:integration` trên PostgreSQL riêng; tự review toàn bộ diff.

## Verification and handoff

Môi trường: Windows, cây làm việc chưa commit trên `bd05007` (H2a/04B/H2b + H3a), 18/10/2026. Integration dùng
PostgreSQL 17 (`postgres:17-alpine`) trong container dùng một lần, role `LOGIN NOSUPERUSER CREATEDB`, cổng loopback
riêng; container đã xóa, không còn database thừa, không chạm database dùng chung.

| Lệnh / kiểm tra AC                                    | Revision / môi trường       | Kết quả thực chạy                                                                                                             | Giới hạn / việc còn lại                   |
| ----------------------------------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Đỏ trước: `pnpm test:integration -- departments-http` | trước fix, PostgreSQL riêng | 1 fail: khóa `details` nhận được có thêm `sharedAccounts`; code, message, thành viên, phòng `ACTIVE`, audit đều đúng; 43 pass | —                                         |
| `pnpm test:integration -- departments-http`           | sau fix                     | 44 test pass                                                                                                                  | —                                         |
| `pnpm openapi:export`                                 | cây cuối                    | sha256 `04f24d24…` trước và sau — giống hệt từng byte                                                                         | `details` là object mở; OpenAPI không đổi |
| `pnpm rules:check`, `pnpm rules:format`               | cây cuối                    | 0 lỗi; format sạch                                                                                                            | —                                         |
| `pnpm check` (lần 1)                                  | cây có chú thích 3 dòng     | exit 1: gate kích thước `department.service.ts` 520 > 519 (ledger H4)                                                         | sửa chú thích về 2 dòng, không đổi ledger |
| `pnpm check`                                          | cây cuối                    | exit 0; unit 53 suite, 553 test                                                                                               | —                                         |
| `pnpm test:e2e`                                       | cây cuối                    | 14 suite, 273 test pass                                                                                                       | —                                         |
| `pnpm test:integration`                               | cây cuối, PostgreSQL riêng  | 46 suite, 588 test pass                                                                                                       | remote CI chưa chạy                       |
| Quét `sharedAccounts`                                 | cây cuối                    | `src`, `openapi.json`: 0; test: 2 khẳng định vắng mặt; tài liệu: lịch sử/câu loại bỏ                                          | —                                         |

**Consumer handoff:** `POST /api/v1/departments/{id}/deactivate` 409 `DEPARTMENT.IN_USE` không còn
`details.sharedAccounts`; client nào đọc khóa đó phải bỏ phụ thuộc. OpenAPI không đổi nên không cần regenerate client vì
lát này.

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan/test design phản ánh đúng implementation cuối; peer review: chưa có.
- [x] Diff cuối đã tự review; remediation, handoff, roadmap và ghi chú `g2-department-profile` cập nhật.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau
      đúng sự kiện thật. Còn chờ: remote CI, Owner review, consumer bỏ `details.sharedAccounts` (nếu có).
