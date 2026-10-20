# Spec: chia lát remediation và refactor nền tảng sau audit 18/10/2026

- Phụ trách: AI theo giao việc Owner (lập kế hoạch, 18/10/2026). Từng lát H1 → H8: chưa phân công lúc lập. _Cập nhật
  18/10/2026:_ H1, H2a, H2b, H3a, H3b, H3c đã có hạng mục riêng, phụ trách AI theo giao việc Owner; trạng thái từng lát
  ở [roadmap](../../../roadmap.md#hạng-mục). H4 trở đi chưa phân công.
- Thiết kế ban đầu bởi: AI theo giao việc Owner, từ [audit nền tảng](../../../reviews/be-foundation-audit-2026-10-18/README.md)
  và quyết định Owner Q1–Q9 ghi ở mục 10.2 của báo cáo.
- Thiết kế: `draft`. Owner review: chưa review.
- Nguồn: Docs `9416fe0` (BRD v3.46, Phạm vi v1.31, US v0.15 — 150 mã, 144 dùng, 1 433 AC; sổ quyết định `QĐ-01` →
  `QĐ-81`), BE `186ad5f` (`dev`, gate xanh trong audit). Q1–Q9 là quyết định **kỹ thuật** của Owner cho workstream BE,
  không phải `QĐ-*` nghiệp vụ.
- Nhóm roadmap: xuyên nhóm (G1, G2 và nền cho G3+) — planning container, không phải phạm vi của hạng mục này.
- [Kế hoạch](plan.md).

## Business outcome

Người nhận việc (dev hoặc AI) có một chuỗi lát nhỏ, có thứ tự, mỗi lát ghi rõ outcome, contract phải giữ, dependency,
cách kiểm chứng và mục legacy ledger nó gỡ — để làm remediation và refactor nền tảng mà không gộp thành một plan khổng
lồ. Hạng mục này **chỉ lập kế hoạch**: mỗi lát H\* trở thành một hạng mục riêng theo
[mẫu vertical slice](../../README.md#chia-hạng-mục-theo-vertical-slice) trước khi có dòng code nào.

## Primary Story/AC

| Story | AC                                                           | Coverage | Phần còn lại thuộc   |
| ----- | ------------------------------------------------------------ | -------- | -------------------- |
| —     | Finding F-01 → F-35 và quyết định Q1–Q9 của audit 18/10/2026 | n/a      | Lát H1 → H8 dưới đây |

## Supporting references

- `US-01-01` AC-6, AC-7, AC-20 và `QĐ-77c`, `QĐ-81` (R-2); `US-03-06` AC-19 và `QĐ-75` (R-1); `US-01-10` AC-10 — claim
  chưa có bằng chứng phát hiện ngày 18/10/2026 (luồng yêu cầu quên mật khẩu không kiểm phiếu khôi phục đang chờ,
  `password-reset.service.ts:82`, `account-policy.ts:92-102`; hành vi thật chưa chạy kiểm chứng).
- Phân tích tác động gốc: [baseline-impact-and-remediation-2026-10-17](../baseline-impact-and-remediation-2026-10-17/spec.md).
- [ADR-0011](../../../decisions/0011-internal-authentication-and-sessions.md) (Proposed, dev review `pending`),
  [module structure](../../../rules/module-structure.md), [security](../../../rules/security-jobs.md).

## Explicit out of scope

- Mọi implementation: hạng mục này không đổi source, test, migration, `openapi.json` hay runtime.
- G3 → G10 và thiết kế bounded context `approval-roles` (Q7 hoãn tới G3).
- Đổi refresh token sang JWT, thêm `jwt.verify` cho refresh token, Redis hay kho phiên thứ hai, grace window cho refresh
  đồng thời (Q2), đổi TTL hiện hành (Q3).
- Đổi mã guard/503 hiện tại (Q8 giữ tới khi phối hợp FE).
- Sửa repo Docs; nâng ADR nào lên Accepted.

## Dependencies and blockers

- Prompt 02 (rule, template, gate — 18/10/2026) phải xong trước mọi lát; ledger kiến trúc là baseline để lát gỡ dần.
- Owner Q4: R-1/R-2 (H3) chạy **sau** Prompt 02 và **trước** refactor lớn `organization` (H4).
- ADR-0011 cần dev review trước `accepted` của H1; không chặn bắt đầu H1.
- H7 cần môi trường cô lập để kiểm role PostgreSQL trước deploy (Q9); chưa có ⟹ H7 `blocked`.
- Mỗi lát đối chiếu lại HEAD `dev` thật trước khi code; không dùng `eae212a` làm baseline.

## Ownership: module, data, API

| Lát | Module/capability                                             | Dữ liệu                          | API / contract                                                         |
| --- | ------------------------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------- |
| H1  | `identity-access/auth`                                        | không migration                  | thêm `refreshExpiresAt` (cộng thêm) vào login/refresh                  |
| H2  | `infrastructure/http`, mọi controller                         | không                            | OpenAPI hiển thị; H2b đổi `message` của 4 operation                    |
| H3  | `organization` (R-1), `identity-access/accounts` (R-2, AC-10) | R-2 có thể một migration forward | 409 `DEPARTMENT.IN_USE` bỏ `sharedAccounts`; body lock/unlock có lý do |
| H4  | `organization`                                                | không                            | giữ nguyên, `openapi.json` byte-identical                              |
| H5  | `identity-access`                                             | không                            | giữ nguyên, `openapi.json` byte-identical                              |
| H6  | `installation`, CLI mới, `infrastructure/config`              | đọc; seed chỉ local/test         | lệnh CLI mới, không HTTP                                               |
| H7  | deploy (`docker-compose.prod.yml`, migration)                 | role PostgreSQL                  | không đổi API                                                          |
| H8  | `data-import`                                                 | không                            | giữ nguyên                                                             |

## Behavior and design

Mỗi lát dưới đây là đầu vào cho một hạng mục riêng; người nhận làm rõ chi tiết trong spec của hạng mục đó.

**H1 — auth/session contract (Q1, Q2, Q3, F-16, F-17, F-35).** Thêm `refreshExpiresAt` vào data của `POST /auth/login`
và `POST /auth/refresh` bằng đúng hạn của refresh token vừa cấp (hạn idle, không quá hạn tuyệt đối); **không** đổi TTL
nào. Viết contract FE/mobile: web giữ refresh token trong bộ nhớ, không `localStorage`; mất token khi reload theo UX thiết
kế sau; single-flight refresh vì gửi lại token đã dùng là replay và thu hồi phiên. Gỡ khoảng trống F-35: comment logout
còn nói cookie (`session.service.ts:118-119`), tên hằng số dùng chung với action token, unit test cho máy trạng thái
refresh của `SessionService`. Giữ nguyên: access token JWT HS256 ngắn hạn; refresh token opaque 256 bit, chỉ lưu SHA-256,
xác thực bằng tra hash + khóa dòng + trạng thái PostgreSQL, xoay vòng một lần, replay thu hồi phiên; không `jwt.verify`,
không Redis; không in/lưu raw token. Tùy chọn kỹ thuật cần AC riêng nếu làm: scheme Bearer không phân biệt hoa thường
(F-18).

**H2 — Swagger/OpenAPI (Q8, F-04, F-27, F-28, F-29).** Hai hạng mục: **H2a** chỉ hiển thị, runtime không đổi — gộp
`@ApiBearerAuth` vào `@AuthenticatedOnly`/`@RequireRoles` kèm e2e "mọi operation không public có `security`", summary
ngắn, example an toàn (placeholder như `<opaque-token>`, không token thật), bỏ `pattern` khi đã có `format`, đổi `const`
thành `enum`, gom mô tả lỗi lặp; **H2b** đổi wire — 4 operation `COMMON.SUCCESS` thành mã cụ thể, khai 422 còn thiếu ở 5
operation và 429 toàn cục. Giữ mã guard/503. FE regenerate client sau mỗi hạng mục.

**H3 — R-1/R-2 trên HEAD mới (Q4) và `US-01-10` AC-10.** Ba hạng mục, mỗi cái một PR: **H3a** R-1 bỏ `sharedAccounts`
khỏi `details` 409 `DEPARTMENT.IN_USE` (`organization.http-errors.ts:118`, test `departments-http.integration-spec.ts:466`);
**H3b** R-2 khóa **và** mở khóa bắt buộc lý do/tham chiếu không rỗng, thiếu ⟹ 422 và không đổi trạng thái, audit trước/sau

- lý do (`QĐ-81`, AC-6, AC-7, AC-20; pin Docs `9416fe0`); **H3c** viết test cho `US-01-10` AC-10 trước — nếu đỏ, sửa để
  yêu cầu quên mật khẩu khi đang có phiếu khôi phục trả phản hồi chung và không gửi thư; nếu xanh, ghi bằng chứng và giữ
  nguyên code.

**H4 — `organization` theo capability (behavior-preserving, F-11 → F-13, F-23, Q6).** Mỗi bước một PR, `openapi.json`
không đổi byte, không migration: H4.1 sửa nhỏ — `toProjectWire` ra mapper của project, `instanceof` thay chuỗi tên lỗi,
bỏ export repo không có consumer; H4.2 `project/` với `project.repo.ts` tách khỏi `department.repo.ts`; H4.3 `job-title/`
và `normalizeDisplayName` vào `src/core` (Q6); H4.4 `employee/`; H4.5 `cost-center/`; H4.6 `department/` (tách
`department-head` khỏi service/repo quá ngưỡng). Vị trí đích ở mục 4.4 của báo cáo audit.

**H5 — `identity-access` và chỗ đặt lỗi (F-19, F-24, F-25, Q6).** H5.1 lỗi theo capability: tách
`errors/identity-access.errors.ts`, mapper HTTP của approval-roles ra `*.http-errors.ts`, `SuperAdminTransferRefusedError`
ra tệp lỗi, `translateAccountWriteError` về repo; H5.2 ranh giới capability: capability khác dùng service/type thay vì
repo/policy, phá phụ thuộc hai chiều auth ↔ accounts; H5.3 `recovery.repo` thu hồi phiên qua `SessionRepo` (đổi lý do
thu hồi là thay đổi hành vi/migration riêng, cần quyết định trước); H5.4 tách `recovery.service.ts` và `account.repo.ts`
quá ngưỡng. `recovery.*` giữ ở root làm entry CLI (Q6). Contract không đổi.

**H6 — vận hành (Q5, F-20, F-21, F-34).** Hai hạng mục: **H6.1** `ops:inspect` read-only ngoài HTTP, chỉ validate env DB,
in trạng thái cài đặt, migration, tổ chức, người giữ `SUPER_ADMIN` (email che bớt), đếm tài khoản theo trạng thái/vai,
người giữ vai duyệt, phòng thiếu trưởng phòng/IT Admin; không in hash, token, mật khẩu, email đầy đủ; exit code phân
biệt chưa cài/đã cài/lỗi DB. **H6.2** `dev:seed` chỉ local/test, tách khỏi production bootstrap: từ chối khi
`NODE_ENV` khác `development`/`test` hoặc host không phải loopback, cần cờ xác nhận, idempotent theo mã ổn định, đi qua
service để giữ audit, mật khẩu nhập ẩn hoặc sinh ngẫu nhiên in một lần, không mật khẩu mặc định commit. Kèm: chuyển lỗi
và advisory lock của installation ra tệp lỗi/repo (ledger).

**H7 — role PostgreSQL (Q9, F-15).** Role runtime không superuser cho api/worker, role migration/deploy riêng; sửa
`docker-compose.prod.yml` và hướng dẫn container; kiểm trên môi trường cô lập trước deploy (gồm audit append-only vẫn
từ chối UPDATE/DELETE dưới role runtime).

**H8 — `data-import`.** Tách `employee-import.service.ts` quá ngưỡng, mapper HTTP khỏi `employee-import.errors.ts`, gom
`Page<T>` dùng chung (F-26). Contract không đổi.

### Legacy ledger mỗi lát gỡ

| Lát | Mục trong `src/architecture-structure.spec.ts` / `src/module-graph.spec.ts`                                                                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| H4  | `controllerImports`, `errorMatchedByName`, `oversizedFiles` (department.\*), `rootControllers`/`rootFiles` organization, export repo của `OrganizationModule`                                                                                          |
| H5  | `crossCapabilityImports` (21 mục), `errorClassesOutsideErrorFiles` (super-admin-transfer), `httpMappingInErrorFiles` (approval-role), `oversizedFiles` (recovery.service, account.repo), export repo/`PasswordHasher` của `IdentityAccessFacadeModule` |
| H6  | `errorClassesOutsideErrorFiles` và `rawSqlOutsideRepositories` của installation, `oversizedFiles` (env-schema)                                                                                                                                         |
| H8  | `httpMappingInErrorFiles` (employee-import), `oversizedFiles` (employee-import.service)                                                                                                                                                                |

## Test matrix

| AC / rủi ro                   | Tình huống (gồm từ chối, edge case)                                                        | Cấp test                       | Kết quả mong đợi                                 | Bằng chứng sau implement |
| ----------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------ | ------------------------------------------------ | ------------------------ |
| H1 `refreshExpiresAt`         | login, refresh; giá trị = hạn token cấp; refresh đồng thời vẫn thu hồi phiên; DB down 503  | unit, integration, e2e         | trường có mặt, đúng hạn; hành vi phiên không đổi | —                        |
| H2a `security` trên operation | mọi operation không public có `security`, public thì không                                 | e2e trên OpenAPI document      | 0 ngoại lệ; runtime không đổi                    | —                        |
| H3b lý do khóa/mở khóa        | thiếu/rỗng/khoảng trắng ⟹ 422, trạng thái không đổi, không audit thành công; có ⟹ audit đủ | integration                    | đúng `QĐ-81`                                     | —                        |
| H3c `US-01-10` AC-10          | quên mật khẩu khi phiếu khôi phục đang chờ                                                 | integration                    | phản hồi chung, không thư                        | —                        |
| H4/H5/H8 refactor             | toàn bộ suite; `openapi.json` không đổi byte                                               | `pnpm check`, e2e, integration | xanh; ledger co lại đúng mục đã gỡ               | —                        |
| H6.2 chặn seed                | `NODE_ENV=production`, host không loopback, thiếu cờ                                       | unit/integration               | từ chối, không ghi                               | —                        |
| H7 role runtime               | migrate bằng role deploy; API chạy bằng role runtime; UPDATE/DELETE audit bị từ chối       | môi trường cô lập              | chạy được, quyền tối thiểu                       | —                        |

## Definition of Done

- [ ] Mỗi lát H1 → H8 có hạng mục riêng (spec + plan theo mẫu mới, đăng ký ở items index và roadmap) trước khi code.
- [ ] Thứ tự và dependency trong [plan](plan.md) khớp quyết định Owner Q4 và mục 9 của báo cáo audit.
- [ ] Không lát nào thêm mục vào legacy ledger; lát refactor xóa đúng mục nó gỡ.
- [ ] Hạng mục này không đổi source, test, migration hay `openapi.json`.

## Changes and acceptance

18/10/2026: lập trong Prompt 02 từ audit nền tảng và Q1–Q9. Owner chưa review; chưa nghiệm thu.
