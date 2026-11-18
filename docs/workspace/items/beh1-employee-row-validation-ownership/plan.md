# Plan: BEH.1 — Employee Row Validation Ownership (A4-11)

- [Spec](spec.md); revision đầu vào: Docs `9416fe0`, BE `3a3db73`.
- Phụ trách: AI theo giao việc Owner. Thiết kế ban đầu bởi: Owner (A4-11, H8 D-1 → D-4, Prompt 25).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `verified` (local 20/10/2026, cây làm việc chưa commit trên `3a3db73`). PR: chưa có.

## Before coding

- `dev` = `origin/dev` = `3a3db73`, ahead/behind 0/0, cây sạch. `3a3db73` so `bf9db0d` đúng tập Prompt 24: 34 sửa, 11 mới,
  2 đổi tên spec (`identity-access-local-seed.service.spec.ts` → `local-demo-account.service.spec.ts`,
  `notifications.service.spec.ts` → `email-delivery.service.spec.ts`); diff `openapi.json` duy nhất `newPassword.maxLength`
  256 → 1024; không path `dynamic-content-translation` nào.
- Tệp EOL trộn của Prompt 24
  (`docs/workspace/items/dynamic-content-translation/spike/runtime/test/supervisor-lifecycle.test.mjs`): `git status`
  sạch trên `3a3db73` — không làm gì (không định dạng, không ghi lại). Đây là kiểm chứng preflight, không phải thay đổi của
  BEH.1.
- Docs `9416fe0` = `origin/main`; dirty của Owner giữ nguyên: `CI-CD/deployment.md`, `Diagrams/context-diagram/SaaS-Sentry-Context-Diagram.drawio`,
  `Diagrams/context-diagram/.$SaaS-Sentry-Context-Diagram.drawio.bkp` (chưa track).
- `openapi.json` `c1982f7df22c…`, 60 operation; spec characterization 13/13 xanh trên code cũ; unit organization +
  data-import + architecture 21 suite/476.
- Corpus hành vi trước refactor (script ngoài repo, gọi đúng hai đường production): 1500 ca nhập tay, 3360 dòng import
  chạy riêng, cả file một classifier, và cả file với khóa riêng mỗi dòng (có dòng `VALID` và id dùng) — SHA-256
  `bc27bebb1c1f…`.

## Tasks

### Task 1: policy (test trước)

- Files: `src/modules/organization/public/employee-placement.policy.ts` + spec.
- Depends on: none
- Acceptance: kỳ vọng literal mọi lý do, ưu tiên trong subject, phòng trước chức vụ; không `field`/`column`.
- Verify: unit policy; đột biến M1 → M3.

Bằng chứng: spec đỏ trước (`Cannot find module './employee-placement.policy'`), xanh 12/12 sau.

### Task 2: gate sở hữu (test trước)

- Files: `test/gates/policy-ownership.gate-spec.ts`.
- Depends on: Task 1
- Acceptance: literal lý do phòng/chức vụ chỉ trong policy (ngoại lệ chính xác: `dev-seed-plan.ts`, `dev-seed.types.ts`,
  `project.errors.ts`, `project.service.ts` — quyết định khác); policy thuần; consumer chính xác và có gọi
  `placementReasons`; `PUBLIC_ROOT_POLICY_FILES` bằng nhau ở ba nơi; self-test.
- Verify: gate; đột biến M8 → M12.

Bằng chứng: trên code cũ đỏ đúng 4 ca (hai thang chép ở `employee-row.validator.ts` và `employee-import-rows.ts`, chưa
consumer, chưa gọi, chưa registry); một lần đỏ do self-test của tôi sai thứ tự kỳ vọng, sửa kỳ vọng (không sửa gate).

### Task 3: hai adapter

- Files: `organization/employee/employee-row.policy.ts` + spec, `data-import/employee-import/employee-import-rows.policy.ts`,
  `employee-import-rows.placement.spec.ts`.
- Depends on: Task 1, Task 2
- Acceptance: hai adapter gọi policy, map `subject` sang `field`/`column`; thang chép bị xóa cùng lượt, không bản tương
  thích; 13 ca characterization nguyên văn; corpus byte-identical.
- Verify: unit parity/validator/rows/placement; corpus; đột biến M4 → M7.

Bằng chứng: `employee-import-rows.validation-parity.spec.ts` không đổi một byte trong lượt refactor (sau review chỉ sửa chú
thích đầu tệp, xem bảng cuối), 13/13; adapter literal 35/35; corpus sau =
trước (`bc27bebb1c1f…`); gate sở hữu chỉ còn đỏ ca registry; hai gate kiến trúc đỏ đúng hai cạnh mới
(`data-import → organization/public/employee-placement.policy.ts`, capability `employee/` → root).

### Task 4: registry public + rule

- Files: `test/gates/architecture-boundaries.gate-spec.ts`, `test/gates/architecture-structure.gate-spec.ts`, `docs/rules/module-structure.md`.
- Depends on: Task 3
- Acceptance: một đường dẫn chính xác, không hậu tố; rule Đúng/Sai/Lách sai; gate kiến trúc xanh.
- Verify: gate kiến trúc 137/137; đột biến.

Đột biến (mỗi tệp khôi phục, SHA-256 khớp; trạng thái Git trước/sau bằng nhau):

| Mã  | Đột biến                                                                | Kết quả                      |
| --- | ----------------------------------------------------------------------- | ---------------------------- |
| M1  | policy: mã `JOB_TITLE_INACTIVE` → `JOB_TITLE_NOT_FOUND`                 | 11 đỏ                        |
| M2  | policy: ưu tiên phòng ngừng dùng/Cost Center ngừng dùng đảo             | 2 đỏ                         |
| M3  | policy: chức vụ trước phòng (`reverse()`)                               | đỏ (policy, adapter, parity) |
| M4  | form: `DEPARTMENT` → field `jobTitleId`                                 | đỏ (12 khác biệt `field`)    |
| M5  | import: `DEPARTMENT` → column `job_title`                               | đỏ (12 khác biệt `column`)   |
| M6  | form: phòng luôn `named`                                                | 7 đỏ                         |
| M7  | import: phòng luôn `named`                                              | 5 đỏ                         |
| M8  | import: thêm literal `'DEPARTMENT_INACTIVE'` (thang chép)               | gate sở hữu đỏ               |
| M9  | import: import `organization/employee/employee-row.policy.ts` (private) | gate ranh giới đỏ            |
| M10 | bỏ mục `PUBLIC_ROOT_POLICY_FILES` ở boundaries                          | 2 đỏ (ranh giới + registry)  |
| M11 | policy: thêm `class`                                                    | gate thuần đỏ                |
| M12 | form: thay lời gọi policy bằng hàm tự viết                              | 28 đỏ                        |

### Task 5: metadata và full gate

- Files: H8 spec, item này, `docs/workspace/items/README.md`, `docs/roadmap.md`, `final-foundation-hardening` (pin
  `3a3db73`, tên item thật), tracker Prompts.
- Depends on: Task 4
- Acceptance: A4-11 khép; tài liệu khớp; full gate xanh; OpenAPI byte-identical; tài nguyên 0.
- Verify: `pnpm check`, `pnpm test:e2e`, `pnpm test:integration` cô lập, `pnpm openapi:export`, kiểm kê.

## Verification and handoff

Môi trường: Windows 11, Git Bash, Node v24.0.1, pnpm 11.1.3, Docker; PostgreSQL 17-alpine container riêng
`slm-p25-test-db` (`127.0.0.1:55443`, role `ci_integration` theo test guide, ghi ledger trước khi tạo, đã xóa); cây làm
việc chưa commit trên `3a3db73`.

| Lệnh / kiểm tra AC                                 | Revision / môi trường                                          | Kết quả thực chạy                                                                                                                                                         | Giới hạn / việc còn lại                                                                                                                |
| -------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Task 1 → 4                                         | cây làm việc                                                   | xanh; đỏ trước và đột biến ở từng task                                                                                                                                    | —                                                                                                                                      |
| Spec characterization H8                           | cây cuối                                                       | 13/13; cả 13 ca, fixture và kỳ vọng không đổi (import và thân tệp sau chú thích đầu: SHA-256 trước/sau bằng nhau)                                                         | sau review chỉ sửa chú thích đầu tệp: bỏ tên dự kiến `-alignment`, ghi Prompt 25 chỉ dùng chung policy ngữ nghĩa và cố ý giữ D-1 → D-4 |
| Corpus hành vi                                     | script ngoài repo, trước/sau                                   | byte-identical `bc27bebb1c1f…` (1500 ca nhập tay; 3360 dòng import riêng, một file, khóa riêng; id khóa khi xác nhận)                                                     | —                                                                                                                                      |
| Unit/integration/e2e trọng tâm                     | cây cuối, PostgreSQL riêng                                     | unit organization + data-import + installation 33 suite/545; integration nhập tay, import, onboarding, phòng, Cost Center, chức vụ 6 suite/186; e2e 2/40                  | —                                                                                                                                      |
| `pnpm check`                                       | cây cuối                                                       | exit 0: rules 115 tệp/1033 link, `rules:test` 38/38, Prettier, Prisma, ESLint, `tsc`, unit 104 suite/1369, `test:scripts` 20/20, discovery, build; 0 `DeprecationWarning` | —                                                                                                                                      |
| `pnpm test:e2e`                                    | cây cuối                                                       | 15 suite/278; 0 `DeprecationWarning`                                                                                                                                      | —                                                                                                                                      |
| `pnpm test:integration`                            | cây cuối, PostgreSQL riêng, `NODE_OPTIONS=--trace-deprecation` | 50 suite/661, 537 s; 0 `DeprecationWarning`, 0 `42501`, 0 database/backend sót                                                                                            | —                                                                                                                                      |
| Preview đã lưu, audit                              | đọc code + corpus                                              | `errors` lưu = `judgeEmployeeRows(...).errors` (repo); audit chỉ đếm outcome; corpus byte-identical ⟹ không đổi                                                           | không chạy so sánh dump DB riêng                                                                                                       |
| `pnpm openapi:export`                              | cây cuối                                                       | byte-identical `c1982f7df22c…`; inventory operation/status/security/schema giống hệt                                                                                      | —                                                                                                                                      |
| Quét zero-hit                                      | cây cuối                                                       | 0 thang lý do phòng/chức vụ ngoài policy; 0 import validator private từ module khác; `package.json`/lockfile không đổi                                                    | —                                                                                                                                      |
| `rules:format`, `format:check`, `git diff --check` | cây cuối                                                       | sạch                                                                                                                                                                      | —                                                                                                                                      |
| Remote CI                                          | —                                                              | chưa có (cây chưa push)                                                                                                                                                   | —                                                                                                                                      |

- [x] Hành vi trong scope có bằng chứng.
- [x] Spec/plan/test design phản ánh implementation cuối.
- [ ] Giao Owner review trên revision cụ thể; chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện thật.
