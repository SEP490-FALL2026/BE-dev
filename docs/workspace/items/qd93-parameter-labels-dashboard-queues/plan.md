# Plan: qd93-parameter-labels-dashboard-queues

- [Spec](spec.md); revision đầu vào: Docs `69e8a3d`, BE `1a77ffe8`.
- Bổ sung sau pin: `D-S17`…`D-S26` (Owner 01/11/2026, Docs chưa commit); plan dùng `D-S26` (mục _Before coding_).
- Tên thư mục là tên lịch sử: hạng mục chỉ gồm nhãn/nhóm/`constraints` của tham số vận hành; phần trang tổng quan nằm ở
  [`dashboard-request-queues-wiring`](../dashboard-request-queues-wiring/plan.md).
- Phụ trách: chưa phân công (người nhận ghi tên). Thiết kế ban đầu bởi: AI theo giao việc của điều phối (01/11/2026).
- Owner review: đã duyệt các đề xuất kỹ thuật 01/11/2026; chưa review toàn spec. Peer review: tùy chọn.
- Triển khai: `in-progress` — implemented-local (phase A; full integration/e2e/timing pending phase B), nhánh `feat/qd93-parameter-labels-dashboard-queues` xếp trên `feat/qd93-remove-in-app-super-admin-transfer` @7daf6856; commit task 1–3: 9f720744, cf33c7b1, 799da96f. PR: chưa có. Sửa sau audit độc lập 01/11/2026: xem spec `## Changes and acceptance`.

## Before coding

- Quyền chạy test (Owner 01/11/2026, `D-S26`): được tự chạy
  `pnpm typecheck`/`pnpm lint`/`pnpm arch:check`/`pnpm rules:check`, unit test (`pnpm test -- <tệp>`), gate theo tệp
  (`pnpm test:gates -- <tệp>`), HTTP và integration test **theo file đã sửa** (`pnpm test:http -- <tệp>`,
  `pnpm test:integration -- <tệp>`), và `pnpm check`; **phải hỏi Owner trước** khi chạy toàn bộ `pnpm test:integration`,
  `pnpm test:e2e` hoặc `pnpm test:integration:timing`. Chạy cả thư mục (ví dụ
  `pnpm test:integration -- test/integration/requests`) là chạy hàng loạt, tính như toàn bộ bộ ⟹ hỏi Owner trước; ngoài ra
  chỉ chạy theo file.
- Thứ tự merge: sóng W1 của lượt `QĐ-93` (cùng `qd93-remove-hr-basis-org-writes`, `qd93-remove-in-app-super-admin-transfer`; merge
  từng hạng mục một, rebase lên `dev` ngay trước khi merge); không chờ hạng mục nào. `qd93-budget-record-attachments` merge sau và
  rebase lên đây, nên hạng mục này giữ nguyên `description` của `DOCUMENT_MAX_SIZE_MB` ở `dev`.
- Migration: không có. Nếu buộc phải thêm: timestamp thật lúc tạo, đổi lại cho lớn hơn migration mới nhất trên `dev` trước
  merge; KHÔNG sửa `scripts/verify/merged-migrations.txt` trên nhánh hạng mục (thư mục migration mới xếp sau cùng nên gate
  `migration-order` vẫn xanh); Owner thêm vào danh sách khi phát hành.
- Đọc `AGENTS.md`, `CONTRIBUTING.md`, `test/README.md`, [API contract](../../../rules/api-contract.md) (mục `API-LIST-DETAIL.1`,
  OpenAPI 3.0, ví dụ), module card `src/modules/operating-parameters/README.md`.
- Đọc code: `src/modules/operating-parameters/parameter-definitions.policy.ts` + spec, `operating-parameters.dto.ts`,
  `operating-parameters.controller.ts` (`toWire`), `public/operating-parameters.api.ts` (`ParameterView`, `list`); registry
  `test/support/api-collection-registry-exceptions.ts` (mục `operatingParameterList`), `api-collection-registry-nested-first-half.ts`,
  `api-collection-registry-events.ts` (`boundedNested` cố định ngày — không dùng), `api-collection-registry.ts` (`RegistryEvent`);
  gate `test/gates/api-collection-contract.gate-spec.ts` (`FINDING`, `eventHygiene`, `nestedEventProblems`); ledger `LD-*` của
  `docs/reviews/g0-g4-post-merge-review-2026-10-22/README.md`; test
  `test/integration/operating-parameters/operating-parameters-http.integration-spec.ts`, `test/http/operating-parameters/operating-parameters.http-spec.ts`.
- Khóa registry `operatingParameterList#constraints.options` đã được Owner duyệt 01/11/2026 (spec, mục Dependencies).
- `api-collection-registry-nested-first-half.ts` có 374 dòng ở `1a77ffe8` (trần `test/support` 400 dòng, R9): khóa mới (~12 dòng)
  vẫn dưới trần; nếu vượt, đặt khóa vào `api-collection-registry-nested.ts` (nửa sau) thay vì tách tệp mới.

## Tasks

### Task 1: Nhãn, nhóm, nhãn đơn vị, nhãn lựa chọn và hai mô tả trong định nghĩa

- Files: `src/modules/operating-parameters/parameter-definitions.policy.ts`,
  `src/modules/operating-parameters/parameter-definitions.policy.spec.ts`.
- Depends on: none.
- Acceptance: `ParameterDefinition` có `label`, `group`, `unitLabel`; `Shape` `enum` có `optionLabels`; `PARAMETER_GROUPS`,
  `GROUP_LABELS`, `ENUM_OPTIONS_MAX` export; `PARAMETER_DEFINITIONS` xếp theo nhóm đúng bảng spec mục 2; hai mô tả đổi đúng spec
  mục 3; `key`, `shape` (ngoài `optionLabels`), `default`, `unit`, `source` không đổi; unit test mới ở ba dòng đầu và dòng
  `API-DOC-F07` của test matrix; ca cũ của spec không sửa (trừ ca nào ghim thứ tự mảng thì đổi sang ghim tập `key`).
- Verify: thêm ca mới trước → `pnpm test -- src/modules/operating-parameters` đỏ (thiếu trường) → sửa định nghĩa → xanh;
  `pnpm typecheck` exit 0 (mọi nơi đọc `shape` vẫn biên dịch).

### Task 2: Wire có nhãn và `constraints` có kiểu, registry, OpenAPI

- Files: `src/modules/operating-parameters/operating-parameters.dto.ts` (`constraintsSchema`, trường mới),
  `src/modules/operating-parameters/public/operating-parameters.api.ts` (`ParameterView`, `list`),
  `src/modules/operating-parameters/operating-parameters.controller.ts` (`toWire`),
  `test/support/api-collection-registry-exceptions.ts` (mục `operatingParameterList`: `itemProperties`, `businessMaximum`),
  `test/support/api-collection-registry-nested-first-half.ts` (khóa `operatingParameterList#constraints.options`),
  `test/support/api-collection-registry-events.ts` (sự kiện `added` dạng object literal: `finding: 'LD-17'`,
  `bound: 'ENUM_OPTIONS_MAX'`, `date` = ngày viết, `item` = thư mục này — spec mục 4),
  `docs/reviews/g0-g4-post-merge-review-2026-10-22/README.md` (một dòng `LD-17` trong bảng defect `LD-*`; kiểm `git grep "LD-17"`
  trước — đã dùng thì lấy số kế tiếp và sửa cả spec), `test/integration/operating-parameters/operating-parameters-http.integration-spec.ts`,
  `test/http/operating-parameters/operating-parameters.http-spec.ts`, `openapi.json` (sinh).
- Depends on: Task 1.
- Acceptance: dòng _Wire danh sách_, _Wire khi đặt_, _Quyền không đổi_, _OpenAPI_, _Registry mảng lồng_ của test matrix xanh;
  `constraints` là `oneOf` ba dạng trong `openapi.json`; không đổi status/mã lỗi/message; **không** sửa code gate hay helper
  `boundedNested`.
- Verify: ca integration và HTTP mới viết trước →
  `pnpm test:integration -- test/integration/operating-parameters/operating-parameters-http.integration-spec.ts` đỏ → implement →
  xanh; `pnpm openapi:export` rồi
  `pnpm test:http -- test/http/operating-parameters/operating-parameters.http-spec.ts test/http/platform/openapi-dialect.http-spec.ts test/http/platform/api-inventory.http-spec.ts test/http/platform/openapi-export.http-spec.ts`
  xanh; `pnpm test:gates -- test/gates/api-collection-contract.gate-spec.ts test/gates/test-support-structure.gate-spec.ts` xanh
  (không lỗi `eventHygiene`, tệp registry ≤ 400 dòng); `pnpm rules:check` exit 0 (ledger review có link hợp lệ).

### Task 3: Module card và bàn giao contract

- Files: `src/modules/operating-parameters/README.md` (nhãn/nhóm/`constraints` có kiểu; hai luật xuyên tham số chưa có trong
  `constraints`), `docs/workspace/items/qd93-parameter-labels-dashboard-queues/plan.md` (bảng bằng chứng).
- Depends on: Task 2.
- Acceptance: module card khớp code; mô tả PR liệt kê thay đổi contract của spec mục 5 cho FE.
- Verify: `pnpm rules:check` và `pnpm rules:format` exit 0.

### Checkpoint

Sau Task 2 và sau Task 3: `pnpm check` exit 0;
`pnpm test:http -- test/http/operating-parameters/operating-parameters.http-spec.ts test/http/platform/openapi-dialect.http-spec.ts test/http/platform/api-inventory.http-spec.ts test/http/platform/openapi-export.http-spec.ts`
xanh; `pnpm test:integration -- test/integration/operating-parameters/operating-parameters-http.integration-spec.ts` và mọi tệp
integration khác của `test/integration/operating-parameters/` (liệt kê tên tệp; theo file, `D-S26`) xanh; `pnpm openapi:export`
không diff; tự review diff theo spec mục 2–5 (không `key`/giá trị/miền nào đổi).

## Verification and handoff

| Lệnh / kiểm tra AC                                                                                | Revision / môi trường                         | Kết quả thực chạy                                                                   | Giới hạn / việc còn lại                                               |
| ------------------------------------------------------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `pnpm check`                                                                                      | 799da96f, Windows local                       | exit 0 (lint, typecheck, unit, gates, arch, scripts, discovery, build)              | `test:scripts` mất ~12 phút trên host này (`deploy-release.test.mjs`) |
| `pnpm test:http -- <4 tệp của Checkpoint>`                                                        | cf33c7b1, local                               | 4 suite, 42 test xanh; thêm `openapi-presentation`, `openapi-read-wording`: 33 xanh | không DB                                                              |
| `pnpm test:integration -- <3 tệp trong test/integration/operating-parameters>`                    | 799da96f, PostgreSQL 17 `slm-test-db` (local) | 3 suite, 42 test xanh                                                               | chạy theo file (`D-S26`)                                              |
| `pnpm test:gates -- test/gates/api-collection-contract.gate-spec.ts` (+ `test-support-structure`) | cf33c7b1, local                               | 54 test xanh (đỏ trước khi thêm khóa registry/`itemProperties`)                     | —                                                                     |
| `pnpm test:integration` toàn bộ / `pnpm test:e2e` / timing                                        | —                                             | deferred to phase B                                                                 | chỉ sau khi hỏi Owner (`D-S26`)                                       |
| `pnpm openapi:export` (không diff sau commit)                                                     | cf33c7b1, local                               | exit 0, `openapi.json` +154/-3 (đã commit), chạy lại không đổi thêm                 | báo FE sinh lại client                                                |

- [ ] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [ ] Spec/plan phản ánh implementation cuối; quyết định Owner về khóa registry và finding `LD-17` đã ghi ở spec và ledger review.
- [ ] Diff cuối đã tự review; module card đã cập nhật; phần chưa kiểm chứng ghi rõ.
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau đúng sự kiện
      thật.
