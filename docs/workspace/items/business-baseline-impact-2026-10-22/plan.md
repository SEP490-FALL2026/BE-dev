# Plan: tác động baseline `QĐ-82` → `QĐ-86` lên BE G0–G4 và đồng bộ roadmap/spec

- [Spec](spec.md); revision đầu vào: Docs `72e1480`, BE `69f4891`.
- Phụ trách: AI theo giao việc Owner. Thiết kế ban đầu bởi: AI theo giao việc Owner (Prompt 07, 22/10/2026).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `verified` — Phase 1 (Task 1, chỉ tài liệu) kiểm chứng local 22/10/2026 trên cây chưa commit trên
  `69f4891`; Phase 2 theo dõi ở dòng riêng của từng hạng mục. PR: chưa có (Owner tự review và checkpoint).

## Before coding

Hạng mục chỉ có tài liệu. Đã đọc `AGENTS.md`, `CONTRIBUTING.md`, `ARCHITECTURE.md`, `docs/workspace/README.md`,
`docs/rules/documentation.md`, `docs/rules/work-item-sizing.md`, roadmap, `sources.md`, items index, mẫu và spec/plan
G2–G4; sổ quyết định, BRD, User Stories tại Docs `72e1480`; code, Prisma, migration, test và OpenAPI tại BE `69f4891`.
Snapshot trước khi sửa (danh sách tệp Git, trạng thái, SHA-256 mọi tệp `src`, `test`, `prisma`, `scripts`, `infra`,
`openapi.json` và config) lưu ngoài repo để so sau.

## Tasks

### Phase 1 — lượt Prompt 07 (tài liệu)

### Task 1: ma trận tác động, scope map và đồng bộ tài liệu

- Files: `docs/workspace/items/business-baseline-impact-2026-10-22/*`, sáu hạng mục mới, `docs/roadmap.md`,
  `docs/workspace/sources.md`, `docs/workspace/items/README.md`, ghi chú tác động ở spec bị ảnh hưởng, `README.md`,
  `AGENTS.md`, `ARCHITECTURE.md`, `docs/README.md`, `docs/examples/employee-import/README.md`.
- Depends on: none.
- Acceptance: ma trận A–E ở spec; scope map G2 (11 Story, 122 AC), G3 (12, 114), G4 (4, 53) pin `72e1480`/`69f4891`;
  năm hạng mục remediation và một khung có spec/plan đăng ký; pin hiện hành ở `sources.md` là `72e1480`; không tệp
  product nào đổi.
- Verify: `pnpm rules:check` → 0 lỗi; `pnpm rules:format` → sạch; so snapshot trước/sau → product không đổi;
  `git diff --check` → sạch.

### Checkpoint

Owner review gói tài liệu này trên một revision cụ thể (Owner tự checkpoint/commit). Sau đó Prompt 08 review delivery
G0→G4 và contract list/detail; các hạng mục dưới chỉ chuyển `ready` sau Owner review spec/plan của chính nó.

### Phase 2 — lát forward (mỗi lát một hạng mục riêng; chỉ code sau Owner review)

### Task 2: `g3-catalog-kind-contract-cleanup`

- Files: theo [spec](../g3-catalog-kind-contract-cleanup/spec.md).
- Depends on: Task 1; Owner review spec; nên sau Prompt 08 nếu Prompt 08 chạm `/applications`.
- Acceptance: contract khai báo ứng dụng chỉ còn `SAAS`, `LICENSED`, `INTERNAL`; diff OpenAPI đúng dự kiến.
- Verify: theo plan của hạng mục (`pnpm check`, `pnpm test:e2e`, integration, `pnpm openapi:export`).

### Task 3: `g2-g4-unit-only-cost-attribution`

- Files: theo [spec](../g2-g4-unit-only-cost-attribution/spec.md); migration mới là task đầu.
- Depends on: Task 1; Owner review cách migration dữ liệu `COMPANY`; nên sau Prompt 08.
- Acceptance: Cost Center chỉ `UNIT`; tài khoản dịch vụ có phòng sở hữu; phòng còn tài khoản dịch vụ không ngừng được.
- Verify: theo plan của hạng mục (gồm integration trên PostgreSQL riêng và kiểm migration trên CSDL tạm).

### Task 4: `g2-fiscal-year-operating-parameters`

- Files: theo [spec](../g2-fiscal-year-operating-parameters/spec.md).
- Depends on: Task 1; Owner review giá trị mặc định.
- Acceptance: không còn `BUDGET_PERIOD_KIND`; có tháng bắt đầu năm tài chính và thời hạn chờ trình duyệt chi.
- Verify: theo plan của hạng mục.

### Task 5: `g2-employee-intake-by-super-admin`

- Files: theo [spec](../g2-employee-intake-by-super-admin/spec.md).
- Depends on: Task 1; Owner review điểm kiểm soát bù AC-17 (hộp thông báo chưa có).
- Acceptance: chỉ Super Admin nhập hồ sơ mới, căn cứ HR bắt buộc, không nhập hồ sơ của chính mình.
- Verify: theo plan của hạng mục.

### Task 6: `g2-employee-official-field-maintenance`

- Files: theo [spec](../g2-employee-official-field-maintenance/spec.md).
- Depends on: Task 5 (dùng lại tham chiếu căn cứ HR).
- Acceptance: IT Admin phụ trách sửa trường chính thức kèm căn cứ HR; Super Admin không có thao tác sửa.
- Verify: theo plan của hạng mục.

### Task 7: thiết kế G5 theo nhóm C

- Files: hạng mục G5 lập sau (scope map G5 trước hạng mục đầu tiên).
- Depends on: Task 1; có thể song song với Task 2–6 vì chỉ thiết kế.
- Acceptance: scope map G5 pin `72e1480`; thiết kế ngân sách năm (C01) trước lát có tiền; không đưa lại hành vi cấm ở
  mục _Acceptance criteria cho lượt sau_ của spec.
- Verify: `pnpm rules:check`.

### Checkpoint

Sau mỗi Task 2–6: gate của hạng mục xanh, roadmap/items index/scope map cập nhật, Owner review trên revision cụ thể.
`g2-downstream-integration` giữ `blocked` tới khi G5–G7 có hạng mục tương ứng.

## Verification and handoff

| Lệnh / kiểm tra AC                                                | Revision / môi trường                                                   | Kết quả thực chạy                                                                                                                                                                                                                                                                                                                                          | Giới hạn / việc còn lại                                                                                                                  |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm rules:check`                                                | cây chưa commit trên BE `69f4891`; Windows 11, Node 24.0.1, pnpm 11.1.3 | exit 0 — `BE: 173 files, 1425 links, 0 errors` (gồm link/anchor của tệp mới và scope map G2/G3/G4)                                                                                                                                                                                                                                                         | —                                                                                                                                        |
| `pnpm rules:format` (kiểm tra)                                    | như trên                                                                | exit 0 — hai lượt "All matched files use Prettier code style!"                                                                                                                                                                                                                                                                                             | `prettier --write` chỉ chạy trên đúng các tệp `.md` đã sửa/tạo                                                                           |
| `git diff --check`                                                | như trên                                                                | exit 0; tệp mới (chưa track) quét riêng: không khoảng trắng cuối dòng, không tab                                                                                                                                                                                                                                                                           | —                                                                                                                                        |
| Scope map so với Docs                                             | Docs `72e1480` qua `git show`, script chỉ đọc ngoài repo                | G2 11 Story/122 AC, G3 12/114, G4 4/53 khớp dòng `Active`; 0 AC thiếu, trùng hay không còn dùng                                                                                                                                                                                                                                                            | script không nằm trong repo                                                                                                              |
| Không chạm product                                                | snapshot trước/sau, lệnh chỉ đọc                                        | SHA-256 của 901 tệp (`src` 673, `test` 152, `prisma` 51, `scripts` 14, `infra`, `openapi.json`, `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `compose.yaml`, `Dockerfile`, `rules-check.config.json`, …) giống hệt; `git ls-files -s` giống hệt (không stage); mọi đường dẫn đổi là `.md`; HEAD `69f4891`, ahead `origin/dev` 2; Docs `72e1480` sạch | —                                                                                                                                        |
| Quét metadata cũ                                                  | `grep` trên tài liệu BE                                                 | `QĐ-80`, v3.45, 150/144/1 433, `eae212a` chỉ còn ở dòng lịch sử có ngày; phụ thuộc cũ _Docs commit `QĐ-78` → `QĐ-80`_ ghi đã đáp ứng                                                                                                                                                                                                                       | —                                                                                                                                        |
| Quét `QĐ-82` → `QĐ-86`, `OQ-32`, `INV-16`, `CERD5-16`, `CERD5-17` | như trên                                                                | đều truy vết ở ma trận, roadmap hoặc spec bị ảnh hưởng; `OQ-32` chỉ ở `BBI-C05` (đóng bởi `QĐ-84`, không mở lại)                                                                                                                                                                                                                                           | —                                                                                                                                        |
| Quét nhánh đã loại                                                | như trên                                                                | `sharedAccounts`: lịch sử R-1 và test khẳng định không có khóa; `FREE_EXTERNAL`: dòng ghi _sai_ (D09) và lịch sử; _seat trống_ ở `ARCHITECTURE.md`/G4 là số seat còn trống, không phải nhánh chi phí 0; nhiều Finance, Finance hậu duyệt, AI Gateway/OTel/Desktop Agent: chỉ ở câu _không_/_đã loại_                                                       | —                                                                                                                                        |
| Không chạy                                                        | —                                                                       | —                                                                                                                                                                                                                                                                                                                                                          | `pnpm check`, e2e, integration, `openapi:export`: không chạy vì không đổi code; gate trên cây merge của PR #14 chưa chạy lại (Prompt 08) |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker — enabler không claim AC; finding ghi ở ma trận.
- [x] Spec/plan/test design phản ánh đúng kết quả cuối; không có peer review.
- [x] Diff cuối đã tự review (gồm toàn bộ tệp mới); phần chưa kiểm chứng ghi ở dòng _Không chạy_.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau
      đúng sự kiện thật.
