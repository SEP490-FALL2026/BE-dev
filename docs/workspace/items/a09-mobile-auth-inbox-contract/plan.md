# Plan: A-09 — đăng nhập, phiên, hộp thông báo và bàn giao contract Mobile (`US-16-04`)

- [Spec](spec.md); revision đầu vào: Docs `d6d868c`, BE `6eb12d1`.
- Phụ trách: AI theo giao việc của điều phối (31/10/2026). Thiết kế ban đầu bởi: AI theo giao việc của điều phối (31/10/2026).
- Owner review: chưa review. Peer review: tùy chọn, chưa có.
- Triển khai: `verified` (local, chưa commit, 31/10/2026; chỉ phần đã ghi ở bảng dưới). PR: chưa có (không commit/push theo giao việc).

## Before coding

Đã đọc DEV-A.md (A-07→A-09), README audit, `EP-16`, `US-01-01` AC-16/17, `docs/rules/security-jobs.md` và
`api-contract.md`, source `identity-access` (`auth`, `access`), `notifications/inbox`, các route Employee của `requests`, và
test sẵn có (`auth-http`, `account-lock-http`, `account-roles-http`, `in-app-notifications`, `auth-session.e2e`). Phần đã
có test (đăng nhập đồng nhất cho email lạ/sai/chưa kích hoạt, khóa và nhân viên nghỉ ở request kế tiếp, 404 inbox của
người khác, nhãn client không đổi inbox) không viết lại: test mới thêm góc nhìn Mobile (hai nhãn kênh, mọi thao tác Mobile,
vai suy ra, vai mặc định, ma trận vai × route, inbox theo người qua mất vai/khóa, chuỗi smoke). Dependency: không cần item
nào xong trước; A-01, A-02, A-03, B-02, B-03, B-10 chỉ làm bảng ánh xạ hết dòng _pending_. Bằng chứng đến từ worktree cô lập tại `6eb12d1` (tạo ở
revision cũ hơn baseline nên đã căn về `6eb12d1` trước khi làm).

## Tasks

### Task 1: spec, plan, hợp đồng bàn giao

- Files: `spec.md`, `plan.md`, `mobile-contract.md` trong thư mục hạng mục
- Depends on: none
- Acceptance: spec đủ AC → test, ranh giới, finding; hợp đồng ánh xạ đủ bốn Story với trạng thái operation
- Verify: `pnpm rules:check` và `pnpm rules:format` → xanh (roadmap và items index đã có dòng của hạng mục)

### Task 2: integration — phiên, vai, lỗi đồng nhất

- Files: `test/integration/identity-access/mobile-session-roles.integration-spec.ts`
- Depends on: none
- Acceptance: `US-16-04` AC-1, AC-3 (vế không bảng thiết bị), AC-5, AC-6 theo bảng test của spec
- Verify: `pnpm exec jest --config ./test/config/jest.integration.cjs test/integration/identity-access/mobile-session` → 22 test đạt

### Task 3: integration — inbox theo người nhận

- Files: `test/integration/notifications/mobile-inbox-isolation.integration-spec.ts`
- Depends on: none
- Acceptance: `US-16-04` AC-2 (đúng người, đúng nội dung, không thêm loại), AC-5 (mọi vai có inbox của mình), AC-6
- Verify: `pnpm exec jest --config ./test/config/jest.integration.cjs test/integration/notifications/mobile-inbox` → 7 test đạt

### Task 4: E2E smoke đăng nhập → danh sách → hành động → inbox

- Files: `test/e2e/mobile-channel-smoke.e2e-spec.ts`
- Depends on: Task 2, Task 3 (cùng harness, không phụ thuộc dữ liệu)
- Acceptance: chuỗi chạy trên cùng route với web; khóa và đăng xuất chặn ở thao tác kế tiếp
- Verify: `pnpm exec jest --config ./test/config/jest.e2e.cjs --runInBand test/e2e/mobile-channel` → 6 test đạt

### Checkpoint

Sau Task 2→4: `pnpm typecheck`, `eslint` trên ba file test, `pnpm test:discovery`, các lệnh jest ở trên, rồi gate tài
liệu. Tự review diff theo bảng test của spec.

## Verification and handoff

Môi trường: PostgreSQL 17 trong container Docker riêng `slm-test-a09` (cổng 55437, role thường `ci_integration`), Node
trên Windows; HTTP thật qua supertest vào app Nest đầy đủ, không mock repo; không SMTP/storage thật (invitation đọc từ
outbox đã niêm phong như các suite hiện có). Cây: BE `6eb12d1` + các file mới của hạng mục (chưa commit).

| Lệnh / kiểm tra AC                                                                                                                           | Revision / môi trường                                                    | Kết quả thực chạy                                                                                                                                                                                                       | Giới hạn / việc còn lại                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `jest --config test/config/jest.integration.cjs test/integration/identity-access/mobile-session test/integration/notifications/mobile-inbox` | `6eb12d1` + cây chưa commit; PostgreSQL 17 Docker `slm-test-a09` (55437) | 2 suite, 29 test đạt (22 + 7)                                                                                                                                                                                           | Chưa chạy full integration (điều phối)                                                                |
| `jest --config test/config/jest.e2e.cjs --runInBand test/e2e/mobile-channel`                                                                 | như trên                                                                 | 1 suite, 6 test đạt                                                                                                                                                                                                     | Chỉ BE; không có client native                                                                        |
| `pnpm typecheck`; `eslint` ba file test; `prettier --check` ba file test                                                                     | như trên                                                                 | đạt                                                                                                                                                                                                                     | `pnpm format:check` toàn repo bị Node crash do tải máy, chưa chạy lại toàn bộ                         |
| `pnpm test:gates`                                                                                                                            | như trên                                                                 | 16 suite, 317 test đạt                                                                                                                                                                                                  | —                                                                                                     |
| `pnpm test:discovery`                                                                                                                        | như trên                                                                 | đạt (integration 274, e2e 9 spec)                                                                                                                                                                                       | —                                                                                                     |
| `pnpm rules:format`, `pnpm rules:test`                                                                                                       | như trên                                                                 | đạt                                                                                                                                                                                                                     | —                                                                                                     |
| `pnpm rules:check`                                                                                                                           | như trên                                                                 | 8 lỗi lúc làm hạng mục, tất cả do roadmap/items index chưa có dòng G10 và dòng đăng ký (lúc đó hạng mục không sửa hai file này); từ khi điều phối ghép dòng vào roadmap và items index, phải chạy lại trên cây tích hợp | Chạy lại `pnpm rules:check` trên cây tích hợp                                                         |
| Không chạy                                                                                                                                   | —                                                                        | —                                                                                                                                                                                                                       | `pnpm test:http`, `openapi:export`, migration drift, `arch:check`: không đổi source, route hay schema |

- [x] AC trong scope có bằng chứng; finding `DEF-A09-01` ghi blocker, chưa sửa.
- [x] Spec/plan phản ánh đúng implementation cuối.
- [x] Diff cuối đã tự review; không có runbook bị ảnh hưởng.
- [ ] Giao Owner review trên revision cụ thể; PR chưa có (roadmap đã có dòng hạng mục). Chưa ghi
      `merged-dev`, `accepted` hay `released`.
