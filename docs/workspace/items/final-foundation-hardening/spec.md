# Spec: Final Foundation Hardening — OpenAPI, test support, auth, PostgreSQL adapter, public contracts

- Phụ trách: AI theo giao việc Owner (Prompt 24, 20/10/2026).
- Thiết kế ban đầu bởi: Owner — finding `CP0-09`, `CP0-10` của
  [review CP-0](../../../reviews/cp0-h1-h3c-checkpoint-review-2026-10-19/README.md), F-18, F-30, F-31 của
  [audit nền tảng](../../../reviews/be-foundation-audit-2026-10-18/README.md) và
  [reconciliation H4.0](../../../reviews/be-full-src-architecture-audit-2026-10-19/reconciliation.md), `TEST-HARDEN.1`,
  `ROOT-HARDEN.1`, `OPENAPI-EXPORT.1` của tracker (review Prompt 22/23), Prompt 24.
- Thiết kế: `ready`. Owner review: chưa review.
- Nguồn: Docs `9416fe0` (không Story/AC mới; policy mật khẩu 12–128 của `US-01-10` đã pin), BE `bf9db0d` (`dev` =
  `origin/dev`, commit Prompt 23 của Owner). Không ADR mới; ADR-0011, ADR-0012 giữ trạng thái; H7 hoãn.
- Nhóm roadmap: hardening sau audit H4.0 — chỉ là container, không phải ranh giới (xem `## Sizing decision`).
- [Kế hoạch](plan.md).

## Business outcome

Sau lát này các finding nhỏ còn mở của đợt dọn nền tảng được khép bằng test độc lập và gate: OpenAPI được làm sạch đúng
ngữ cảnh schema và export không giả làm môi trường test; `test/support` chỉ chứa fixture/harness; header `Bearer` không
phân biệt hoa thường theo RFC; giới hạn vận chuyển `newPassword` của đổi mật khẩu để policy quyết định lý do; adapter
PostgreSQL không còn cảnh báo deprecation; mỗi hợp đồng injectable công khai có tệp riêng. Chỉ AUTH.2 đổi `openapi.json`.

## Sizing decision

- Container: CP0-09 + CP0-10 + OPENAPI-EXPORT.1 + TEST-HARDEN.1 + AUTH.1 + AUTH.2 + INF.1 + ROOT-HARDEN.1
- Mode: `technical-enabler`
- Outcome and owner: nền tảng không còn finding hardening mở; owner theo phase: `infrastructure/http` (OpenAPI),
  `scripts/dev` (export), `test/support` + gate (TEST-HARDEN.1), `infrastructure/security` và `identity-access` (AUTH.x),
  `infrastructure/database` (INF.1), `notifications` và `identity-access` (ROOT-HARDEN.1).
- Boundaries: không migration, không đổi session/refresh token, ký JWT, claim, hạn, mã lỗi xác thực, policy mật khẩu
  (12–128), outbox hay quyền; không nâng dependency major; một thay đổi wire duy nhất: `maxLength` của `newPassword` ở
  `meChangePassword` 256 → 1024.
- Not larger: loại BEH.1/A4-11, H7, G3–G10, deploy, sửa repo FE/Mobile (chỉ ghi tác động tái sinh client).
- Not smaller: tám finding đều nhỏ, độc lập về hành vi nhưng chung một cây làm việc và một full gate; tách thành tám
  hạng mục sẽ chạy tám lần full gate trên các thay đổi một-vài tệp, và hai phase (A, C) cùng đọc/ghi `openapi.json` phải
  tuần tự trong một lượt để diff OpenAPI duy nhất là AUTH.2.
- Siblings: `beh1-employee-row-validation-alignment` (tên dự kiến, chưa tạo; Prompt 25).
- Scope map: n/a — technical enabler ngoài nhóm G; không có Story/AC.

## Primary Story/AC

| Story | AC                                        | Coverage | Phần còn lại thuộc                                                                           |
| ----- | ----------------------------------------- | -------- | -------------------------------------------------------------------------------------------- |
| —     | Phase A: CP0-09, CP0-10, OPENAPI-EXPORT.1 | n/a      | gỡ chặn `beh1-employee-row-validation-alignment` (tên dự kiến): OpenAPI ổn định cho lát tiếp |
| —     | Phase B: TEST-HARDEN.1                    | n/a      | gỡ chặn mọi lát G3 viết harness (`beh1-employee-row-validation-alignment`)                   |
| —     | Phase C: AUTH.1 (F-18), AUTH.2 (F-31)     | n/a      | gỡ chặn client FE/Mobile tái sinh từ `openapi.json` (chưa có hạng mục đặt tên)               |
| —     | Phase D: INF.1 (F-30)                     | n/a      | gỡ chặn nâng `pg` có kiểm soát sau này (chưa có hạng mục đặt tên)                            |
| —     | Phase E: ROOT-HARDEN.1                    | n/a      | gỡ chặn mọi hợp đồng liên module mới (`beh1-employee-row-validation-alignment`)              |

## Supporting references

- [Review CP-0](../../../reviews/cp0-h1-h3c-checkpoint-review-2026-10-19/README.md) (CP0-09, CP0-10);
  [audit nền tảng](../../../reviews/be-foundation-audit-2026-10-18/README.md) (F-18, F-30, F-31);
  [reconciliation](../../../reviews/be-full-src-architecture-audit-2026-10-19/reconciliation.md).
- [Operations Foundation](../operations-foundation-h6-3-h6-4-root1/spec.md) (export `NODE_ENV=test`, `EmailDeliveryService`
  trong `notifications.service.ts`); [Installation & Local Data](../installation-local-data-h6-1-h6-2/spec.md) (hai lớp
  injectable thứ hai, ba trong `identity-access.service.ts`).
- [API contract](../../../rules/api-contract.md), [module structure](../../../rules/module-structure.md),
  [security rules](../../../rules/security-jobs.md), [test guide](../../../../test/README.md).

## Explicit out of scope

- BEH.1/A4-11, H7 (role PostgreSQL), G3–G10, staging/production deploy, nâng `pg`/`pg-pool` hay dependency khác.
- Đổi policy mật khẩu, giới hạn `password` đăng nhập, `currentPassword`, token đặt lại/kích hoạt hay mọi DTO khác.
- Sửa hoặc tái sinh client FE/Mobile.

## Dependencies and blockers

- Đầu vào: Prompt 23 ở `bf9db0d` (87 path, gồm ba sửa `P23-RV-01`, `P23-RV-02`, `P23-DOC-01`), `dev` = `origin/dev`,
  cây sạch. Docs `CI-CD/deployment.md` của Prompt 23 còn chưa commit ở repo Docs (việc của Owner, không thuộc lát này).
- Không blocker. Integration cần PostgreSQL cô lập theo [test guide](../../../../test/README.md).

## Ownership: module, data, API

| Phase | Finding          | Tệp chính                                                                                                                                                                                  | Đổi `openapi.json`                 |
| ----- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| A     | CP0-09           | `test/e2e/api-inventory.e2e-spec.ts` (pattern literal độc lập)                                                                                                                             | không                              |
| A     | CP0-10           | `src/infrastructure/http/openapi-presentation.ts` (đi theo ngữ cảnh schema)                                                                                                                | không                              |
| A     | OPENAPI-EXPORT.1 | `scripts/dev/export-openapi.ts`, `scripts/dev/export-environment.ts`                                                                                                                       | không                              |
| B     | TEST-HARDEN.1    | `src/test-support-structure.spec.ts` (gate, phân tích cú pháp TypeScript), `test/README.md`, `module-structure.md`                                                                         | không                              |
| C     | AUTH.1 (F-18)    | `src/infrastructure/security/tokens/bearer-token.ts`                                                                                                                                       | không                              |
| C     | AUTH.2 (F-31)    | `src/modules/identity-access/dto/auth.dto.ts` (`changePasswordBodySchema.newPassword`)                                                                                                     | **có**: chỉ `maxLength` 256 → 1024 |
| D     | INF.1 (F-30)     | `src/infrastructure/database/pg-pool.ts` + spec                                                                                                                                            | không                              |
| E     | ROOT-HARDEN.1    | `notifications/email-delivery.service.ts`, `identity-access/identity-access-inspection.service.ts`, `identity-access/local-demo-account.service.ts`, gate một injectable công khai mỗi tệp | không                              |

Không bảng/migration mới. Hợp đồng công khai mới không thêm token: ba tệp root được đăng ký chính xác thay cho lớp thứ
hai/ba trong tệp `<module>.service.ts`.

## Behavior and design

- **CP0-09:** e2e kỳ vọng bằng hằng literal: hai regex uuid/date-time mà generator thật đang sinh (một ca riêng ghim
  generator vẫn sinh đúng chúng — báo động khi nâng `zod`), không node `format` uuid/date-time nào còn `pattern`, bốn
  pattern nghiệp vụ còn nguyên. Không gọi `isRedundantFormatPattern` hay helper làm sạch nào để tính kỳ vọng.
- **CP0-10:** `const` → `enum` một phần tử chỉ trên node schema: `components.schemas.*`, `schema` của parameter/header/media
  type, và các vị trí subschema (`properties` giá trị, `items`, `prefixItems`, `additionalProperties`, `allOf`/`anyOf`/
  `oneOf`, `not`, `if`/`then`/`else`, `patternProperties`, `$defs`/`definitions`, `dependentSchemas`, `propertyNames`,
  `contains`, `unevaluated*`). Khóa của `properties` là tên, không phải keyword; `example`, `examples`, `default`, `enum`,
  `const` (giá trị), `x-*` và mọi giá trị ngoài schema chép nguyên. Làm sạch pattern cũng chỉ trên node schema. Không
  sửa input; áp hai lần cho cùng kết quả.
- **OPENAPI-EXPORT.1:** export không đặt `NODE_ENV`; trước khi nạp đồ thị, sinh trong bộ nhớ bốn giá trị E3 hợp lệ chỉ cho
  process export, khôi phục môi trường cũ trong `finally`; nạp đồ thị khi thư mục làm việc là một thư mục tạm rỗng nên
  `ConfigModule` không đọc `.env`; ghi ra đường dẫn tuyệt đối (mặc định `openapi.json` ở gốc repo). Không kết nối
  PostgreSQL/SMTP/Redis/storage. Đồ thị không khởi động được thì Nest không được `process.exit` (`abortOnError: false`):
  `finally` vẫn chạy, export in một dòng tên lỗi và exit 1.
- **TEST-HARDEN.1:** mọi `test/support/**/*.ts` ≤ 400 dòng vật lý, không ledger/ngoại lệ; không gọi global
  `describe`/`it`/`test`/`expect`/hook (kể cả `.only`/`.skip`/`.each`, `fit`/`xit`/…), không tham chiếu chúng qua
  `globalThis`/`global` hay bí danh, không import thư viện assertion/test (`@jest/globals`, `vitest`, `chai`, `assert`,
  `node:assert`, `node:test`, `expect`), tên tệp không giống spec; vẫn cho SuperTest `.expect(...)`, regex `.test(...)`,
  method/property tên `it`, chuỗi và chú thích.
- **AUTH.1:** `^bearer ([^\s]+)$` không phân biệt hoa thường chỉ ở scheme; đúng một dấu cách, token không khoảng trắng.
- **AUTH.2:** `changePasswordBodySchema.newPassword` `.max(1024)`; 129–1024 ký tự ⟹ 422 `AUTH.PASSWORD_POLICY_VIOLATION`
  (policy), > 1024 ⟹ 422 `VALIDATION_ERROR`. Client FE/Mobile sinh từ `openapi.json` cần tái sinh (chỉ `maxLength` đổi).
- **INF.1:** kiểm cấu hình (`pipeline`, `Promise`) trước `super()`; spec không còn xếp hàng query đồng thời trên một client;
  không pin version nếu bằng chứng không cần (xem plan); test hợp đồng nâng cấp cho thứ tự `release` của `pg-pool`.
- **ROOT-HARDEN.1:** mỗi tệp nguồn non-spec dưới `src/modules/**` export tối đa một lớp `@Injectable`; ba tệp root mới
  đăng ký chính xác trong bề mặt công khai; không wildcard/hậu tố.

## Test matrix

| AC / rủi ro      | Tình huống                                                                               | Cấp test                            | Kết quả mong đợi                   | Bằng chứng sau implement |
| ---------------- | ---------------------------------------------------------------------------------------- | ----------------------------------- | ---------------------------------- | ------------------------ |
| CP0-09           | kỳ vọng literal, đột biến làm sạch                                                       | e2e `api-inventory`                 | đột biến đỏ                        | plan                     |
| CP0-10           | schema lồng, combinator, property tên `const`, example/default/x-*, bất biến, idempotent | unit `openapi-presentation.spec.ts` | đỏ trên code cũ, xanh sau          | plan                     |
| OPENAPI-EXPORT.1 | export không có E3, không `.env`; bỏ injection; lỗi khởi động không sót thư mục tạm      | process test                        | xanh; đột biến đỏ; không lộ secret | plan                     |
| TEST-HARDEN.1    | tệp vi phạm tổng hợp, ca dương tính giả                                                  | gate + script test                  | đúng                               | plan                     |
| AUTH.1           | `Bearer`/`bearer`/hoa thường lẫn; scheme khác, thiếu token, khoảng trắng                 | unit + e2e                          | đúng                               | plan                     |
| AUTH.2           | 128/129/1024/1025, phân biệt lỗi                                                         | unit + integration + OpenAPI        | đúng                               | plan                     |
| INF.1            | cấu hình trước `super()`, timeout/release/retire, hợp đồng `pg-pool`                     | unit + integration + process        | 0 cảnh báo                         | plan                     |
| ROOT-HARDEN.1    | gộp lại hai injectable, bỏ đăng ký                                                       | gate                                | đỏ                                 | plan                     |

## Definition of Done

- [x] Mỗi finding có test đỏ trước/xanh sau hoặc đột biến đỏ; full gate xanh trên cây cuối.
- [x] `openapi.json` chỉ đổi `maxLength` của `newPassword` ở đổi mật khẩu; inventory operation/status/security giữ nguyên.
- [x] Rule/test guide/ARCHITECTURE/roadmap/items index/tracker khớp; tác động client ghi lại.
- [x] Không thêm ledger; không nâng dependency; kiểm kê tài nguyên cuối 0.

## Changes and acceptance

20/10/2026 — lập theo Prompt 24 trên `bf9db0d`. Owner review chưa có; chưa nghiệm thu.

20/10/2026 — `verified` local (bằng chứng ở [plan](plan.md#verification-and-handoff)). Hai việc bổ sung phát hiện ở bước
dọn tài nguyên cuối, cùng phạm vi: export OpenAPI lỗi khởi động nay vẫn chạy `finally` (`abortOnError: false`, OPENAPI-EXPORT.1)
và fixture integration đổi mật khẩu không xếp hàng query trên một client (INF.1). Tác động client: FE/Mobile tái sinh client
từ `openapi.json` (chỉ `maxLength` của `newPassword`).
