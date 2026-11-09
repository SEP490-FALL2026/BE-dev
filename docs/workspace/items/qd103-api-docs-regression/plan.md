# Plan: qd103-api-docs-regression

- [Spec](spec.md); revision đầu vào: Docs `9c7f386`, BE `bc10bd1c` (so với `1c41354e`).
- Phụ trách: chat code `SEP-Start 75: coder mainflow` (Task 1–4); chat review ký bảng và khối prompt; bước Docs (Task 5) chạy sau deploy, có Owner cho phép.
- Owner review: chưa review. Peer review: chat review (R2).
- Triển khai: `not-started`. PR: chưa có.
- Giao code: **một lượt** (Task 1–4), sau khi bốn hạng mục gói W8 khác PASS (gói W8b không chặn); Task 3a chạy sớm được sau mỗi đợt. Ước ~6 file.
  Gói **W8**, lượt cuối của đợt.

## Before coding

Đọc `docs/rules/api-contract.md` _Handoff_; `docs/reviews/qd96-100-alignment-2026-11-05/fe-batch/FIELD-CHANGES-DOT-1.md` và
`PROMPT-FE-DOCS-DOT-1.md` (mẫu); `D:\FPT\FALL2026\Docs\Figma UI-UX\API-Integration\changes\maintenance.md` (_Lệnh_, _Phép so contract_, _Khi BE đổi
contract_) — **chỉ đọc** repo Docs; mục _Ownership_ và _Lệch so với thiết kế_ của mọi `docs/workspace/items/qd103-*/{spec,plan}.md`;
`test/flows/mf2-offboarding.flow-spec.ts`, `test/flows/mf3-transfer.flow-spec.ts` (fixture, nhãn, cách gọi API trong flow). Lệnh dưới đã kiểm trong
`package.json`.

## Design review

- Thiết kế: `ready` — cổng thiết kế W8 (09/11/2026) đã chạy; chat review sửa theo kết quả và quyết định phạm vi (W8).

| Finding | Mức  | Kết luận                                                                         | Sửa ở                                     |
| ------- | ---- | -------------------------------------------------------------------------------- | ----------------------------------------- |
| DA8-15  | TB   | Đúng — luật 6 tracker cấm tắt test; hạng mục chạy sau cùng nên không cần `skip`  | spec mục 5(b), _Test matrix_, DoD; Task 3 |
| DA8-21  | Thấp | Đúng — Sizing mỗi trường một dòng                                                | spec _Sizing decision_                    |
| DA8-01  | Cao  | Đúng — hạt giống W8 chỉ còn bốn hạng mục gói W8; ca `GROUP_RENEWAL` bỏ (gói W8b) | spec mục 3, 5(b)                          |

Đã kiểm lại (audit): 17 đường dẫn test MF-2/MF-3 ở Task 3 có thật; `1c41354e` có thật; generator Docs có `--compare`/`--old-openapi`.

## Tasks

### Task 1: so contract `1c41354e` ↔ HEAD

- Files: không ghi repo (kết quả so lưu ở thư mục tạm của chat code, dán phần tóm tắt vào Task 2).
- Depends on: bốn hạng mục gói W8 khác PASS (bản chốt); chạy thử được sớm hơn.
- Acceptance: có danh sách operation thêm/bỏ/đổi + schema dùng chung đổi; ghi cách so đã dùng (generator `--compare` hay `jq`).
- Verify: `git show 1c41354e:openapi.json > <tmp>/openapi-1c41354e.json`; `pnpm openapi:export` (HEAD không drift);
  từ `D:\FPT\FALL2026\Docs\Figma UI-UX\API-Integration`: `node tools/build-api-docs.mjs --be <clone BE ở HEAD> --compare coverage-manifest.json --old-openapi <tmp>/openapi-1c41354e.json`.

### Task 2: `FIELD-CHANGES-W1-W8.md`

- Files: `docs/reviews/qd103-108-alignment-2026-11-08/fe-batch/FIELD-CHANGES-W1-W8.md` (mới).
- Depends on: Task 1.
- Acceptance: test matrix _bảng đủ_ (mọi dòng của kết quả so có trong bảng), _bảng đúng_ (5 dòng kiểm bằng test HTTP hiện có); hạt giống spec
  mục 3 đối chiếu từng dòng, dòng lệch ghi "chưa vào code"/"chỉ hành vi".
- Verify: `pnpm test:http -- test/http/platform/api-inventory.http-spec.ts test/http/requests/dot-1-removed-fields.http-spec.ts`; `pnpm test:gates`;
  `pnpm rules:check`.

### Task 3: hồi quy MF-2/MF-3 — (a) test hiện có, (b) flow mới

- Files: `test/flows/mf2-mf3-qd103-regression.flow-spec.ts` (mới, 7 ca spec mục 5(b), nhãn `@MF2`/`@MF3`); không sửa test cũ trừ khi kỳ vọng
  cũ trái luật mới **của hạng mục W1–W8 đã PASS** (ghi lý do ở _Lệch_).
- Depends on: Task 2 (3a chạy được sớm).
- Acceptance: test matrix _hồi quy (a)_, _hồi quy (b) 1–7_, _phủ định (b)_; đỏ ở (a) được phân loại: finding cho hạng mục gây ra hoặc dòng ledger
  `NGOÀI-PHẠM-VI` (chat review ghi); flow mới không có `it.skip`/`describe.skip` (grep trước khi báo PASS).
- Verify: (a)
  `pnpm test:flows -- test/flows/mf2-offboarding.flow-spec.ts test/flows/mf2-abrupt-departure.flow-spec.ts test/flows/mf3-transfer.flow-spec.ts`;
  `pnpm test:e2e -- test/e2e/offboarding-revocation.e2e-spec.ts test/e2e/department-transfer-review.e2e-spec.ts test/e2e/department-without-head-journey.e2e-spec.ts`;
  `pnpm test:integration -- test/integration/personnel/offboarding-departure.integration-spec.ts test/integration/personnel/offboarding-access-block.integration-spec.ts test/integration/personnel/offboarding-block-lifecycle.integration-spec.ts test/integration/personnel/transfer-review-decide.integration-spec.ts test/integration/personnel/transfer-review-open.integration-spec.ts test/integration/personnel/transfer-review-still-needed.integration-spec.ts test/integration/requests/beneficiary-transferred-closure.integration-spec.ts test/integration/requests/group-line-closure.integration-spec.ts test/integration/requests/handover-duty-departure.integration-spec.ts test/integration/requests/department-transfer-record.integration-spec.ts test/integration/licensing/provisioning-revocation-open.integration-spec.ts test/integration/licensing/provisioning-revocation-complete.integration-spec.ts test/integration/licensing/return-request-conditions.integration-spec.ts`.
- Verify (b): `pnpm test:flows -- test/flows/mf2-mf3-qd103-regression.flow-spec.ts`.

### Task 4: `PROMPT-FE-DOCS-W8.md`

- Files: `docs/reviews/qd103-108-alignment-2026-11-08/fe-batch/PROMPT-FE-DOCS-W8.md` (mới; khối `text` theo mẫu `PROMPT-FE-DOCS-DOT-1.md`, đủ bước
  spec mục 4; chỗ điền sha/nhánh/sha cũ `1c41354e`; trỏ `FIELD-CHANGES-W1-W8.md`, spec các hạng mục W8, `src/cli/seed/fixture/<demo v4>/README.md`).
- Depends on: Task 2, W7 PASS.
- Acceptance: test matrix _prompt Docs_; không chứa mật khẩu/token; ghi rõ "chỉ chạy sau khi Owner deploy và cho phép ghi Docs".
- Verify: `pnpm rules:check`; chat review đọc ký.

### Checkpoint (hết lượt)

Kiểm tra nhanh tracker §4.5 (`pnpm typecheck`, `pnpm lint`, `pnpm arch:check`, `pnpm rules:check`, `pnpm test:gates`, `pnpm openapi:export` — không
drift). Ghi _Verification_. Commit cục bộ một commit. `pnpm check` và full suite **chưa chạy** (W9).

### Task 5 (sau deploy, ngoài lượt chat code): chạy khối prompt ở repo Docs

- Files: `D:\FPT\FALL2026\Docs\Figma UI-UX\API-Integration\**` (phần sinh qua generator, phần viết tay theo prompt).
- Depends on: Owner deploy + báo sha + cho phép ghi Docs.
- Acceptance: `--check` exit 0; `node --test "tools/test/*.test.mjs"` xanh; changelog mới; grep từ đã bỏ chỉ còn trong changelog.
- Verify: `node tools/build-api-docs.mjs --be <clone> --check`; `node --test "tools/test/*.test.mjs"`.

## Lệch so với thiết kế

(chat code ghi khi implement)

## Verification and handoff

| Lệnh / kiểm tra AC | Revision / môi trường | Kết quả thực chạy | Giới hạn / việc còn lại |
| ------------------ | --------------------- | ----------------- | ----------------------- |

- [ ] AC trong scope có bằng chứng.
- [ ] Spec/plan phản ánh implementation cuối.
- [ ] `pnpm check` và full suite CHƯA chạy (ghi rõ).
