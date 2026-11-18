# Plan: H4.3a — đưa chuẩn hóa display name vào `core`

- [Spec](spec.md); revision đầu vào: Docs `9416fe0`, BE `c4a8d5c`.
- Phụ trách: AI theo giao việc Owner. Thiết kế ban đầu bởi: Owner (`Q6`, audit H4.0 mục 9.2).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `verified` (local 19/10/2026; bằng chứng chạy trên cây làm việc chưa commit trên `c4a8d5c`). Revision:
  commit `e053664` trên `dev` = `origin/dev` (Owner commit/push trực tiếp 19/10/2026 cùng metadata 14B, không PR); remote
  CI chưa có bằng chứng.

## Before coding

Preflight trên `dev` = `origin/dev` = `c4a8d5c`, ahead/behind `0/0`, cây sạch; `c4a8d5c` là commit H4.1, cha `8fca0a4`.
`rg` thấy đúng các consumer ở bảng của [spec](spec.md#behavior-and-design): năm file organization (`project.service.ts`,
`organization.repo.ts`, `job-title.service.ts`, `department.service.ts`, `cost-center-name.ts` — alias dùng ở
`cost-center.service.ts`), hai file data-import, integration test migration job title và spec trực tiếp; ledger có đúng
hai cạnh data-import → `organization/job-title-name.ts`. Helper hiện hành: NFC, xóa hai đầu và gom run theo tập 25 ký tự
`\s`, giữ case; so khớp = display `.toLowerCase()`; giới hạn 100 code point sau chuẩn hóa. Baseline: spec helper, spec
data-import và ba gate — 7 suite/126 test xanh. `openapi.json` `14fd428b…`. Cap: `employee-import.service.ts` 545/545,
`department.service.ts` 518/519, `organization.repo.ts` 398/400.

## Tasks

### Task 1: characterization trên code cũ

- Files: `test/support/display-name-cases.ts` (mới, bảng dùng chung), `src/modules/organization/job-title-name.spec.ts`,
  `src/modules/data-import/employee-import-rows.spec.ts`.
- Depends on: none.
- Acceptance: bảng input → display → comparison → số code point chạy qua `displayJobTitleName`, `normalizeJobTitleName`,
  `isJobTitleNameTooLong` cũ; classifier tra được chức vụ qua Unicode space và dấu tách rời, bản không dấu là
  `JOB_TITLE_NOT_FOUND` — xanh trước mọi sửa product.
- Verify: `pnpm exec jest --runInBand <spec>`.

### Task 2: primitive core

- Files: `src/core/display-name.ts`, `src/core/display-name.spec.ts` (mới).
- Depends on: Task 1.
- Acceptance: spec đỏ vì chưa có module, rồi xanh với cùng bảng; bốn test display cũ chuyển nguyên văn sang spec core;
  file core không import gì.
- Verify: spec core.

### Task 3: chuyển consumer

- Files: `job-title-name.ts` và spec, `cost-center-name.ts`, `department.service.ts`, `project.service.ts`,
  `organization.repo.ts`, `job-title.service.ts`, `employee-import-rows.ts`, `employee-import.service.ts`.
- Depends on: Task 2.
- Acceptance: không còn `displayJobTitleName`; organization dùng core cho display và policy Job Title cho so khớp/độ dài;
  data-import chỉ dùng core qua `clean`/`jobTitleKey` (spec đỏ khi chưa export, rồi xanh); số dòng trong cap.
- Verify: focused unit organization + data-import + core.

### Task 4: ratchet ledger

- Files: `test/gates/architecture-boundaries.gate-spec.ts`.
- Depends on: Task 3.
- Acceptance: trước khi gỡ, gate báo đúng hai mục stale; sau khi gỡ, ba gate xanh; thêm lại một import data-import →
  `job-title-name.ts` làm gate đỏ (mutation tạm, khôi phục byte).
- Verify: ba architecture spec.

### Checkpoint

Sau Task 4: so sánh byte cũ ↔ mới ngoài repo, quét import/duplicate, tự review diff.

## Verification and handoff

Môi trường: Windows 11, Git Bash, pnpm 11.1.3, cây làm việc chưa commit trên `c4a8d5c`, 19/10/2026. Integration dùng
PostgreSQL 17 (`postgres:17-alpine`) trong container riêng của lượt (`127.0.0.1:55437`), role
`LOGIN NOSUPERUSER CREATEDB`, đã xóa sau khi chạy.

| Lệnh / kiểm tra AC                                                                                                                                                       | Revision / môi trường           | Kết quả thực chạy                                                                                                                                                                                                       | Giới hạn / việc còn lại                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Baseline: spec helper + cost-center-name + data-import + ba gate                                                                                                         | `c4a8d5c`                       | exit 0; 7 suite/126 test                                                                                                                                                                                                | —                                                                                                         |
| Characterization trên code **chưa sửa**: bảng dùng chung qua helper cũ; classifier Unicode/dấu tách rời                                                                  | `c4a8d5c` + spec/fixture mới    | exit 0; `job-title-name.spec` 140 test (11 cũ + 43 dòng × 3); `employee-import-rows.spec` 29 test                                                                                                                       | —                                                                                                         |
| Spec core trước khi có module; spec `clean`/`jobTitleKey` trước khi export                                                                                               | cây đang sửa                    | đỏ đúng lý do: `Cannot find module './display-name'`; `clean`/`jobTitleKey is not a function`                                                                                                                           | —                                                                                                         |
| Focused sau sửa: core + `job-title-name` + data-import                                                                                                                   | cây cuối                        | exit 0; 7 suite/300 test                                                                                                                                                                                                | —                                                                                                         |
| Gate trước khi gỡ ledger                                                                                                                                                 | cây cuối trừ ledger             | đỏ đúng hai mục stale H4.3a, không mục khác                                                                                                                                                                             | —                                                                                                         |
| Ba architecture spec sau khi gỡ                                                                                                                                          | cây cuối                        | exit 0; 3 suite/56 test                                                                                                                                                                                                 | —                                                                                                         |
| Mutation tạm: thêm lại import data-import → `job-title-name.ts`; bỏ `　` khỏi tập whitespace core                                                                        | cây cuối, khôi phục sau mỗi lần | gate đỏ đúng cạnh đó; 14 test đỏ ở đúng ba spec dùng bảng; cả hai file khôi phục byte-identical (sha256)                                                                                                                | —                                                                                                         |
| So byte cũ ↔ mới (script ngoài repo, `ts-node` transpile-only): `job-title-name.ts` của `c4a8d5c` với core, policy, `clean`, `jobTitleKey`, `jobTitleKey(clean)`, độ dài | cây cuối                        | 2 524 132 input (mọi code point một mình và giữa chữ, 300 000 chuỗi ngẫu nhiên seed cố định, biên 100/101), 0 lệch; dòng `WHITESPACE` của core trùng byte với file cũ                                                   | script không vào repo                                                                                     |
| Quét                                                                                                                                                                     | cây cuối                        | 0 import data-import → `job-title-name.ts`; tập whitespace chỉ ở `src/core/display-name.ts` trong code chạy; core không import gì; 0 `displayJobTitleName`                                                              | đoạn NFC/`trim` khác có sẵn ngoài phạm vi (spec)                                                          |
| `pnpm check`                                                                                                                                                             | cây cuối                        | exit 0; rules 91 tệp/757 link/0 lỗi; rules test 18/18; unit 58 suite/850 test; scripts 19/19; discovery 58/14/46; build                                                                                                 | lần chạy đầu fail `format:check` ở hai spec — đã format bằng Prettier rồi chạy lại xanh                   |
| `pnpm test:e2e`                                                                                                                                                          | cây cuối                        | exit 0; 14 suite/274 test                                                                                                                                                                                               | —                                                                                                         |
| Integration focused: job title lifecycle/migration, job-titles, employee imports, cost centers, departments, onboarding                                                  | PostgreSQL riêng                | exit 0; 6 suite/148 test                                                                                                                                                                                                | —                                                                                                         |
| `pnpm test:integration`                                                                                                                                                  | PostgreSQL riêng                | exit 0; 46 suite/597 test, 227 s; không `42501`; 0 database sót; container đã xóa                                                                                                                                       | remote CI chưa chạy                                                                                       |
| `pnpm openapi:export` rồi `cmp` với bản sao đầu lượt                                                                                                                     | cây cuối                        | exit 0; byte-identical `14fd428b…`                                                                                                                                                                                      | —                                                                                                         |
| `pnpm rules:check`, `pnpm rules:format`, `git diff --check`                                                                                                              | cây cuối                        | exit 0 / 0 / 0                                                                                                                                                                                                          | —                                                                                                         |
| Ledger                                                                                                                                                                   | cây cuối                        | gỡ đúng hai cạnh data-import → `organization/job-title-name.ts`; cạnh H8.3 và ROOT.1 giữ; không mục mới, không allowlist mới; cap oversized giữ (`employee-import.service.ts` 544/545, `department.service.ts` 518/519) | `DeprecationWarning` của `pg` khi chạy unit có sẵn từ spec `src/infrastructure/database`, không thuộc lát |

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan/test design phản ánh đúng implementation cuối.
- [x] Diff cuối đã tự review; phần chưa kiểm chứng ghi rõ (remote CI, Owner review).
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau
      đúng sự kiện thật.
