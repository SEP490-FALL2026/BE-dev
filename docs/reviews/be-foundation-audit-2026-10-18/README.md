# Audit nền tảng BE — 18/10/2026

Lượt audit **read-only** theo Prompt 01 (`Prompts/BE-audit-and-architecture-2026-10-18`). Không sửa product
code, test, migration, config, OpenAPI, rule, guide, roadmap, spec/plan hay Docs. Tệp này là thay đổi duy nhất
của lượt. Báo cáo **không** phải Owner review, peer review hay nghiệm thu; mọi trạng thái `merged-dev` vẫn giữ
nguyên nghĩa của roadmap.

Người thực hiện: AI theo giao việc Owner (Claude Code, Opus 5.5), với ba subagent read-only cho ma trận module,
Swagger/OpenAPI và roadmap/slicing. Mọi finding dùng ở đây đã được agent chính kiểm chứng lại bằng file:dòng hoặc
lệnh; chỗ subagent sai đã được sửa (ví dụ số migration, xem mục 11).

**Trạng thái: đã khép (Prompt 01B, 18/10/2026).** Owner trả lời Q1–Q9; quyết định ghi ở mục 10, disposition cập nhật ở
mục 3 và thứ tự việc ở mục 9. Đây là **quyết định kỹ thuật của Owner cho workstream BE ngày 18/10/2026**, không phải
quyết định nghiệp vụ `QĐ-*`; không nâng ADR-0011 hay ADR nào lên `Accepted`, và chưa có dev review nào được ghi là
xong. Lượt 01B bổ sung finding cấu hình local (F-34, mục 7.3) và finding refresh token opaque (F-35, mục 5.1); không
chạy lại test vì không đổi code. Audit còn **0** câu hỏi Owner cho Prompt 02.

## 1. Baseline Git/Docs và giới hạn môi trường

| Đối tượng                            | Giá trị đã kiểm                                                                                                                                                                                                                                                                             |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BE branch / HEAD                     | `dev` / `186ad5f5f96f5af971a7818544425f8d9fbb4a39`                                                                                                                                                                                                                                          |
| Tracking                             | `origin/dev` = `7c7d360`; local **ahead 2, behind 0** (`7c95e7d` _feat: update roadmap_, merge `186ad5f`)                                                                                                                                                                                   |
| Working tree đầu lượt                | sạch (`git status --porcelain` rỗng); 666 tệp tracked, hash SHA-256 lưu ở scratchpad trước khi chạy lệnh                                                                                                                                                                                    |
| Diff local so với `origin/dev`       | chỉ tài liệu: 14 tệp, +422/−87 (`docs/roadmap.md`, `docs/workspace/**`, `AGENTS.md`, `ARCHITECTURE.md`, `README.md`) và item mới `baseline-impact-and-remediation-2026-10-17`                                                                                                               |
| Commit mới sau baseline cũ `eae212a` | `1336bd5` _fix auth login_ (PR #12, merge `7c7d360`) — 29 tệp, đổi refresh token từ cookie HttpOnly sang body (mục 5)                                                                                                                                                                       |
| Docs                                 | `main` `9416fe0`, sạch                                                                                                                                                                                                                                                                      |
| Metadata nghiệp vụ                   | `QĐ-81` có ở `Docs/Decisions/project-decisions.md:2524-2526`; BRD **3.46** (BRD dòng 5); Scope **1.31**; User Stories v0.15: **150** mã Story (đếm heading trong `Docs/BE-UserStory/epics`), 144 dùng, **1433** AC (`user-stories-and-epics.md:537`, `:1481`) — khớp prompt, không có delta |

Môi trường: Windows 11, Node `v24.0.1`, pnpm `11.1.3`, Docker `29.1.2`. Integration chạy trên container
PostgreSQL 17 dùng riêng (`slm-audit-20261018-test-db`, `127.0.0.1:55471`, role `ci_integration` theo
`test/README.md`), container bị xóa sau lượt. Không chạm database dùng chung. Prompt 01 không đọc
`.env`/`.env.production`; lượt 01B chỉ trích **tên biến** (cắt bỏ mọi thứ từ dấu `=`), không đọc hay in giá trị.

## 2. Executive verdict

**Chưa đủ điều kiện bắt đầu refactor lớn hoặc feature G3.** Đủ điều kiện bắt đầu ngay các việc nhỏ ở bước 1–3 của
mục 9 (rule/gate, Swagger hiển thị, đồng bộ tài liệu với `1336bd5`).

Lý do:

1. Code và test hiện tại **xanh** trên HEAD `186ad5f` (mục 11), nên R-0 cũ (chạy lại cổng trên `eae212a`) đã lạc
   hậu: baseline chạy code phải là HEAD hiện tại.
2. Có **hai sai lệch nghiệp vụ đang tồn tại trong code** so với Docs tới `QĐ-81`: khóa/mở khóa không có lý do
   (`QĐ-81`, R-2) và `sharedAccounts` còn trong lỗi ngừng phòng (`QĐ-75`, R-1). Owner đã **hoãn** mọi remediation
   BE tới khi review riêng code BE mới (`Docs/Decisions/project-decisions.md:1790`), nên hai việc này chờ quyết.
3. `1336bd5` đổi **hợp đồng auth công khai** (refresh token vào body) nhưng spec/plan/roadmap vẫn mô tả cookie, và
   ADR-0011 bản sửa ghi rõ developer review còn chờ. Đây là thay đổi bảo mật cần review trước khi FE/mobile dựa vào.
4. OpenAPI không khai `security` cho operation nào (0/60): Swagger UI không gửi token và client sinh tự động sẽ coi
   mọi route là public. FE-web còn dùng `openapi/openapi.yaml` cũ.
5. Kiến trúc tổng thể giữ được ranh giới liên module (Prisma ownership đúng, không import ruột module khác), nhưng
   `organization` phẳng 26 tệp với repo ôm 5 aggregate, lỗi trộn capability, và gate kiến trúc **không kiểm import
   bên trong một module**. Refactor nên đi sau khi gate mới được thêm, để không tái diễn.

**Cập nhật 01B:** verdict giữ nguyên. Điểm 2 nay có lịch theo Q4: R-1/R-2 mở lại sau foundation rules/gates của
Prompt 02 và trước refactor lớn `organization`. Điểm 3 theo Q1: giữ refresh token trong body; ADR-0011 vẫn chờ dev
review trước `accepted`. Điểm 4 theo Q8: sửa trong prompt API/Swagger riêng.

## 3. Ma trận finding

Severity: **H** (sai nghiệp vụ/bảo mật/contract đang ảnh hưởng consumer), **M** (sai lệch cần sửa trước công việc
kế tiếp), **L** (nhỏ). Disposition: **Fix** = lỗi/regression bắt buộc sửa; **Debt** = nợ kỹ thuật; **Owner** = cần
Owner chọn; **OK** = hiện trạng đúng; **Unverified** = giới hạn chưa kiểm chứng. Owner đề xuất là người phụ trách
dự kiến, chưa phân công. Sau 01B, mọi ô **Owner** đã được thay bằng quyết định `Qn` tương ứng ở mục 10; không còn
finding nào chờ Owner chọn.

| ID   | Sev | Finding                                                                                                                                                                                                                                                                                                                                 | Evidence                                                                                                                                                                                                                                                            | Impact                                                                                                      | Disposition                                                                                | Owner đề xuất            |
| ---- | --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------ |
| F-01 | H   | Khóa **và** mở khóa AppUser không nhận lý do/tham chiếu; audit không ghi lý do                                                                                                                                                                                                                                                          | `app-users.controller.ts:192`, `:214` (chỉ `:id`); `account-status.service.ts:45`, `:74`, audit `:65-69`, `:88-90`; nguồn `QĐ-81a/b` (`project-decisions.md:2524-2525`), `EP-01` AC-6/7/20                                                                          | Sai `QĐ-81`, `QĐ-77c`; FE sẽ gọi contract sắp đổi                                                           | Fix (R-2) — Q4: mở lại sau Prompt 02, trước refactor `organization`; áp cả khóa và mở khóa | BE dev nhận R-2          |
| F-02 | M   | Lỗi 409 `DEPARTMENT.IN_USE` còn trường `sharedAccounts`                                                                                                                                                                                                                                                                                 | `organization.http-errors.ts:118`; `department.service.ts:290`; test `departments-http.integration-spec.ts:466`                                                                                                                                                     | Sai `QĐ-75` (không còn tài khoản dùng chung)                                                                | Fix (R-1) — Q4: cùng lịch với R-2                                                          | BE dev nhận R-1          |
| F-03 | H   | `1336bd5` đổi hợp đồng auth (cookie → body) mà không cập nhật spec/plan/roadmap; ADR-0011 sửa "developer review pending"                                                                                                                                                                                                                | ADR-0011 mục 3 (diff `1336bd5`); spec cũ `us-01-bootstrap-login-session/spec.md:56-90`, `foundation-org-identity-boundary/spec.md:183-184`, `us-01-password-self-service/spec.md:87,139`                                                                            | Tài liệu bàn giao sai; tradeoff XSS chưa được review; vi phạm `docs/workspace/README.md:30`                 | Fix (tài liệu, Prompt 02) — Q1: giữ body; ADR-0011 vẫn chờ dev review                      | Owner + dev review auth  |
| F-04 | H   | OpenAPI: 0/60 operation có `security`; chỉ có `securitySchemes.bearer`                                                                                                                                                                                                                                                                  | `app/configure-application.ts:56` (`addBearerAuth()`); không có `ApiBearerAuth` trong `src`; lệnh kiểm mục 11                                                                                                                                                                       | Swagger "Authorize" vô dụng; Orval/codegen không gắn token                                                  | Fix (hiển thị, không đổi runtime)                                                          | BE dev                   |
| F-05 | M   | Status quá mức: "G1/G2 are complete" trong khi US-01-05 chưa có lát, nhiều AC một phần                                                                                                                                                                                                                                                  | `AGENTS.md:15`; `docs/roadmap.md:11`; `docs/workspace/items/README.md:36,44,46`                                                                                                                                                                                     | Dễ hiểu nhầm là đã nghiệm thu                                                                               | Fix (tài liệu)                                                                             | người duy trì roadmap    |
| F-06 | M   | Claim AC lệch giữa roadmap, items README và spec                                                                                                                                                                                                                                                                                        | department-profile `roadmap.md:29` vs `items/README.md:40`; approval-roles `spec.md:6` vs `roadmap.md:30`; cost-center `spec.md:6` vs `roadmap.md:28`; onboarding, import (báo cáo subagent, đã đối chiếu mẫu)                                                      | Không biết AC nào thật sự đã giao                                                                           | Fix (tài liệu)                                                                             | người duy trì roadmap    |
| F-07 | M   | Pin cũ: item remediation pin BE `eae212a` và Docs `73e7379` + working tree; `sources.md` dừng ở `QĐ-80`; không tệp BE nào nhắc `QĐ-81`/`9416fe0`                                                                                                                                                                                        | `baseline-impact-and-remediation-2026-10-17/spec.md:30`, `plan.md:3`; `docs/workspace/sources.md:7-10`; `grep` rỗng                                                                                                                                                 | R-0/R-2 lập trên nền sai                                                                                    | Fix (tài liệu)                                                                             | người lập lại kế hoạch R |
| F-08 | L   | Câu lạc hậu: "Password change/reset is a later slice"                                                                                                                                                                                                                                                                                   | `docs/rules/security-jobs.md:10` (lát 1c đã có `auth.controller.ts:159,188`, `me.controller.ts:51`)                                                                                                                                                                 | Rule sai hiện trạng                                                                                         | Fix (tài liệu)                                                                             | BE dev                   |
| F-09 | L   | `api-contract.md` lấy catalog làm mẫu, nhưng catalog không có access decorator và không mount                                                                                                                                                                                                                                           | `docs/rules/api-contract.md:37`; `catalog.controller.ts:13-16`; `app/app.module.ts:34-35`                                                                                                                                                                               | Dev mới copy mẫu thiếu phân quyền                                                                           | Fix (tài liệu)                                                                             | BE dev                   |
| F-10 | M   | Gate kiến trúc không kiểm import **trong cùng module**                                                                                                                                                                                                                                                                                  | `architecture-boundaries.spec.ts:251` (`return []` khi cùng module)                                                                                                                                                                                                 | Cho qua chu trình auth↔accounts, controller→controller                                                      | Fix (gate)                                                                                 | BE dev                   |
| F-11 | M   | Controller import controller                                                                                                                                                                                                                                                                                                            | `projects.controller.ts:8` (`toProjectWire` từ `departments.controller.ts:69`)                                                                                                                                                                                      | Coupling HTTP, cản tách capability                                                                          | Fix (refactor nhỏ)                                                                         | BE dev                   |
| F-12 | L   | So khớp lỗi bằng chuỗi tên                                                                                                                                                                                                                                                                                                              | `department.service.ts:485` (`error.name === 'EmployeeNotFoundError'`)                                                                                                                                                                                              | Đổi tên lớp sẽ âm thầm vỡ                                                                                   | Fix (refactor nhỏ)                                                                         | BE dev                   |
| F-13 | L   | Export repo không có consumer; tài liệu chỉ nói `OrganizationRepo`                                                                                                                                                                                                                                                                      | `organization.module.ts:14` (`ImportLookupRepo`, `CostCenterRepo`, `DepartmentRepo`); `ARCHITECTURE.md:165-166`                                                                                                                                                     | Bề mặt public rộng hơn thiết kế                                                                             | Fix (refactor nhỏ + tài liệu)                                                              | BE dev                   |
| F-14 | M   | Gate core chỉ cấm `/infrastructure/`, không cấm `/modules/`; không kiểm Nest `exports`, raw SQL ngoài repo, vòng phụ thuộc                                                                                                                                                                                                              | `architecture-boundaries.spec.ts:78-80`; raw SQL ở `installation.service.ts:66`                                                                                                                                                                                     | Ranh giới có thể trôi mà test vẫn xanh                                                                      | Fix (gate)                                                                                 | BE dev                   |
| F-15 | M   | Prod compose cho api/worker dùng `POSTGRES_USER` của image (superuser cluster)                                                                                                                                                                                                                                                          | `docker-compose.prod.yml:68`, `:94`; trái hướng tách role ở `docs/guides/containers.md:41-46`                                                                                                                                                                       | Runtime có quyền vượt mức; audit append-only (INV-05) có thể bị vô hiệu bởi superuser                       | Fix (ops/deployment prompt riêng) — Q9; Unverified môi trường thật                         | Owner + người deploy     |
| F-16 | M   | Refresh đồng thời cùng token ⟹ phiên bị thu hồi; không có grace window; mất phản hồi rồi gửi lại ⟹ đăng xuất                                                                                                                                                                                                                            | `session.service.ts:65-80`; test chủ đích `auth-concurrency.integration-spec.ts:138`                                                                                                                                                                                | FE/mobile phải single-flight refresh, nếu không người dùng bị đăng xuất ngẫu nhiên                          | Q2: giữ hành vi, không grace window; Fix (ghi single-flight vào contract FE/mobile)        | Owner, FE                |
| F-17 | L   | Login/refresh không trả hạn refresh/phiên; `expiresAt` tính riêng với claim `exp`                                                                                                                                                                                                                                                       | `token.service.ts:30-35`; `auth.controller.ts` `toSessionTokens`                                                                                                                                                                                                    | Client không biết phiên sắp hết tuyệt đối                                                                   | Fix (prompt auth/session riêng) — Q3: thêm `refreshExpiresAt`, không đổi TTL               | BE dev                   |
| F-18 | L   | Bearer parser phân biệt hoa/thường scheme                                                                                                                                                                                                                                                                                               | `bearer-token.ts:6` (`^Bearer ([^\s]+)$`)                                                                                                                                                                                                                           | `bearer x` ⟹ 401 `AUTHENTICATION_REQUIRED` (RFC 7235 coi scheme không phân biệt hoa thường)                 | Debt                                                                                       | BE dev                   |
| F-19 | M   | `recovery.repo` tự ghi `auth_sessions` với lý do `PASSWORD_RESET`                                                                                                                                                                                                                                                                       | `recovery.repo.ts:138-141`; owner bảng là `session.repo.ts`                                                                                                                                                                                                         | Hai nơi ghi một bảng; audit phiên không phân biệt khôi phục                                                 | Debt                                                                                       | BE dev                   |
| F-20 | M   | Không có lệnh kiểm tra trạng thái cài đặt; README yêu cầu "kiểm trạng thái cài đặt"                                                                                                                                                                                                                                                     | `README.md:37-38`; chạy lại bootstrap phải nhập mật khẩu trước khi biết đã cài (`installation.service.ts:62` rồi `:68`)                                                                                                                                             | Operator không có cách an toàn để kiểm                                                                      | Fix (lát `ops:inspect` read-only) — Q5                                                     | BE dev                   |
| F-21 | M   | Không có local/demo seed; chỉ có helper test                                                                                                                                                                                                                                                                                            | `test/support/http-test-app.ts:84` (`seedInstallation`); không có script seed trong `package.json`                                                                                                                                                                  | Dev/FE dựng dữ liệu bằng tay hoặc qua Prisma Studio                                                         | Fix (lát `dev:seed` chỉ local/test, tách bootstrap) — Q5                                   | BE dev                   |
| F-22 | M   | Template/checker không chặn item quá lớn, AC một phần không đánh dấu, step không có lệnh verify                                                                                                                                                                                                                                         | `_template/spec.md:12,29`, `_template/plan.md:14`; `scripts/check-rules.mjs` chỉ kiểm link/anchor/edge                                                                                                                                                              | Tái diễn F-05/F-06                                                                                          | Fix (rule, Prompt 02)                                                                      | Prompt 02                |
| F-23 | M   | `organization` phẳng 26 tệp; `OrganizationRepo` 23 method trên 6 bảng; project nằm trong tệp department                                                                                                                                                                                                                                 | `organization.repo.ts` (398 dòng); `department.repo.ts:406-470`; `dto/department.dto.ts:123-153`; `errors/department.errors.ts:90-102`; trái `ARCHITECTURE.md:74-75`                                                                                                | Khó tìm, khó tách G3+                                                                                       | Debt (refactor giữ hành vi)                                                                | BE dev                   |
| F-24 | M   | Lỗi trộn capability; mapper HTTP trong tệp errors; lớp lỗi khai trong service; mapping trùng                                                                                                                                                                                                                                            | `errors/identity-access.errors.ts` (22 lớp auth + accounts, `translateAccountWriteError` :167); `approval-role.errors.ts:25`; `super-admin-transfer.service.ts:13`; `ORGANIZATION.EMPLOYEE_NOT_FOUND` ở `account.http-errors.ts:44` và `approval-role.errors.ts:29` | Không rõ lỗi thuộc ai, mã lệch                                                                              | Debt                                                                                       | BE dev                   |
| F-25 | L   | `auth` ↔ `accounts` phụ thuộc hai chiều                                                                                                                                                                                                                                                                                                 | `login.service.ts:7-8`, `session.service.ts:7-8` → accounts; `account-status.service.ts:6`, `account-invitation.service.ts:10-12` → auth                                                                                                                            | Cản tách module; gate không thấy (F-10)                                                                     | Debt                                                                                       | BE dev                   |
| F-26 | L   | Controller lặp try/catch mapping và hằng số OpenAPI; `Page<T>` định nghĩa 3 lần                                                                                                                                                                                                                                                         | 42 bản mô tả 503 lặp (mục 6); `department.service.ts:40`, `cost-center.service.ts:22`, `employee-import.service.ts:77`                                                                                                                                              | Trùng lặp, dễ lệch                                                                                          | Debt                                                                                       | BE dev                   |
| F-27 | L   | Swagger: 60/60 `summary` rỗng; 0 example; ~26 KB regex uuid/date-time; message key không có trong spec; `const` trong OAS 3.0                                                                                                                                                                                                           | mục 6                                                                                                                                                                                                                                                               | Swagger khó dùng, codegen yếu                                                                               | Fix (hiển thị)                                                                             | BE dev                   |
| F-28 | M   | 422 thiếu trong spec ở 5 operation; 429 global chỉ khai 4 operation                                                                                                                                                                                                                                                                     | `cost-center.dto.ts:18-24`, data-import dto `:5`; `security.module.ts:34`                                                                                                                                                                                           | Contract khai thiếu so với runtime                                                                          | Fix (contract docs)                                                                        | BE dev                   |
| F-29 | L   | 4 operation trả `COMMON.SUCCESS`                                                                                                                                                                                                                                                                                                        | `app-users.controller.ts:121,138`; `health.controller.ts:35,49`                                                                                                                                                                                                     | FE không phân biệt được                                                                                     | Fix (prompt API/Swagger) — Q8: đổi thành mã cụ thể; giữ mã guard/503                       | BE dev                   |
| F-30 | L   | Cảnh báo deprecation `pg` khi chạy unit test (custom Promise, query chồng)                                                                                                                                                                                                                                                              | log `pnpm check` (mục 11)                                                                                                                                                                                                                                           | Rủi ro khi lên `pg@9` cho `RetireOnTimeoutClient`                                                           | Debt                                                                                       | BE dev                   |
| F-31 | L   | Giới hạn độ dài mật khẩu ở DTO không thống nhất (256/1024) so với policy 128                                                                                                                                                                                                                                                            | `auth.dto.ts:11,43,51`; `account-management.dto.ts:44`; `password.policy.ts:4`                                                                                                                                                                                      | Không lỗi runtime, contract khó hiểu                                                                        | Debt                                                                                       | BE dev                   |
| F-34 | M   | Cấu hình local: `.env` không khai biến `AUTH_*` nào nên development dùng secret/pepper/TTL mặc định công khai trong source; repo không có `.env.example`; `.env.production` còn biến `AUTH_COOKIE_SECURE` đã bị bỏ (bị bỏ qua âm thầm). **Không** phải lỗi "JWT không có secret"                                                        | Chỉ tên biến (mục 7.3); `env-schema.ts:96`, `:89-90`, `:178-199`, `:241` (`.unknown(true)`), `:362-369`; `README.md:26-28`                                                                                                                                          | Môi trường `NODE_ENV` khác `production` (kể cả `test`, staging cấu hình sai) ký token bằng secret công khai | Fix (tài liệu + `.env.example` trong lát ops/dev setup)                                    | BE dev                   |
| F-35 | L   | Refresh token là token opaque nhưng code/tài liệu khó đọc: không có hàm "xác thực refresh token" đặt tên rõ (logic nằm trong `performRefresh`); comment logout còn nói cookie; action token dùng lại `REFRESH_TOKEN_SHAPE`/`hashRefreshToken`; không có unit test cho máy trạng thái refresh của `SessionService` (chỉ integration/e2e) | `session.service.ts:43-114`, `:118-119`; `token.service.ts:16`, `:81`, `:85`; `auth/` chỉ có `token.service.spec.ts`, `password.policy.spec.ts`                                                                                                                     | Người đọc dễ tưởng thiếu bước verify và đòi thêm `jwt.verify` sai chỗ                                       | Debt (đặt tên/tài liệu/test, không đổi hành vi)                                            | BE dev                   |
| F-32 | —   | Hiện trạng đúng: JWT, refresh rotation, replay, guard 401/403/503, thu hồi phiên khi khóa/đổi/đặt lại mật khẩu/khôi phục, không lộ token trong log                                                                                                                                                                                      | mục 5                                                                                                                                                                                                                                                               | —                                                                                                           | OK                                                                                         | —                        |
| F-33 | —   | Hiện trạng đúng: Prisma ownership, không import ruột module khác, 16 migration, 60 operation khớp manifest                                                                                                                                                                                                                              | mục 4, 6                                                                                                                                                                                                                                                            | —                                                                                                           | OK                                                                                         | —                        |

## 4. Bản đồ module, capability, controller và lỗi

### 4.1 Ma trận

Đếm tệp `.ts` không phải spec. ctl/svc/repo/dto/err = số tệp controller/service/repo/DTO/lỗi.

| Thư mục                                   | ts  | ctl | svc | repo | dto | err | spec | Nest module | Dòng  |
| ----------------------------------------- | --- | --- | --- | ---- | --- | --- | ---- | ----------- | ----- |
| modules/identity-access                   | 45  | 5   | 16  | 4    | 5   | 5   | 7    | 3           | 5509  |
| ├ auth/                                   | 12  | 1   | 8   | 1    | 0   | 0   | 2    | 0           | 1421  |
| ├ accounts/                               | 10  | 2   | 4   | 1    | 0   | 1   | 2    | 0           | 1751  |
| ├ approval-roles/                         | 4   | 1   | 1   | 1    | 0   | 1   | 0    | 0           | 365   |
| ├ access/                                 | 3   | 1   | 1   | 0    | 0   | 0   | 2    | 0           | 232   |
| └ gốc + dto/ + errors/ (gồm `recovery.*`) | 16  | 0   | 2   | 1    | 5   | 3   | 1    | 3           | —     |
| modules/organization (phẳng)              | 33  | 5   | 6   | 4    | 4   | 5   | 3    | 2           | 4428  |
| modules/data-import                       | 8   | 1   | 1   | 1    | 1   | 1   | 2    | 1           | 1607  |
| modules/operating-parameters              | 10  | 1   | 2   | 1    | 1   | 2   | 1    | 2           | 998   |
| modules/notifications                     | 7   | 0   | 2   | 1    | 0   | 0   | 2    | 1           | 609   |
| modules/installation                      | 5   | 0   | 1   | 0    | 0   | 0   | 3    | 1           | 462   |
| modules/audit                             | 11  | 1   | 2   | 2    | 1   | 1   | 3    | 2           | 379   |
| modules/catalog (không mount)             | 12  | 1   | 1   | 1    | 4   | 1   | 3    | 1           | 372   |
| modules/onboarding                        | 3   | 1   | 1   | 0    | 0   | 0   | 1    | 1           | 219   |
| core                                      | 3   | —   | —   | —    | —   | —   | 3    | 0           | 77    |
| infrastructure (9 thư mục)                | 44  | 1   | 2   | 0    | 2   | 2   | 14   | 8           | ~1990 |

Tệp lớn (không tệp nào vượt 700 dòng):

| Tệp                                        | Dòng | Trách nhiệm bị trộn                                                                              |
| ------------------------------------------ | ---- | ------------------------------------------------------------------------------------------------ |
| `identity-access/recovery.service.ts`      | 608  | ba workflow khôi phục; `transferRole` một method ~200 dòng (`:274-475`); dựng audit; parse email |
| `data-import/employee-import.service.ts`   | 545  | upload/parse CSV, lookup, chấm dòng, xác nhận, map view, `Page<T>` riêng                         |
| `organization/department.service.ts`       | 519  | CRUD phòng, giai đoạn trưởng phòng (`:336-470`), cảnh báo, kiểm IT Admin qua identity            |
| `organization/department.repo.ts`          | 507  | phòng, thành viên, giai đoạn trưởng phòng, **project** (`:406-470`), đếm cho onboarding          |
| `identity-access/accounts/account.repo.ts` | 411  | 35 method trên AppUser, credential, role grant, action token                                     |
| `organization/organization.repo.ts`        | 398  | Organization, CostCenter, Department, JobTitle, Employee/Placement                               |

### 4.2 organization

| Capability                                 | Controller                                                 | Service                                                             | Persistence                                            | DTO                                       | Lỗi                                                                                |
| ------------------------------------------ | ---------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------- | ---------------------------------------------------------------------------------- |
| cost-center                                | `cost-centers.controller.ts`                               | `cost-center.service.ts`                                            | `cost-center.repo.ts` **và** `organization.repo.ts:67` | `dto/cost-center.dto.ts`                  | `errors/cost-center.errors.ts`                                                     |
| department + trưởng phòng + Manager suy ra | `departments.controller.ts` (294 dòng, mapper `:44-83`)    | `department.service.ts` (7 dependency, gồm `IdentityAccessService`) | `department.repo.ts`; `organization.repo.ts:71,178`    | `dto/department.dto.ts`                   | `errors/department.errors.ts`                                                      |
| project                                    | `projects.controller.ts` (import từ controller khác, F-11) | `project.service.ts`                                                | **trong** `department.repo.ts:406-470`                 | **trong** `dto/department.dto.ts:123-153` | **trong** `errors/department.errors.ts:90-102`                                     |
| job-title                                  | `job-titles.controller.ts`                                 | `job-title.service.ts`                                              | **trong** `organization.repo.ts:76-176`                | `dto/job-title.dto.ts`                    | **trong** `errors/organization.errors.ts:40-70`                                    |
| employee/placement                         | `employees.controller.ts`                                  | `employee-manual.service.ts`                                        | `organization.repo.ts:206-398`                         | `dto/employee.dto.ts`                     | gốc `organization.errors.ts` + `errors/organization.errors.ts` (re-export ở `:10`) |
| import lookup                              | —                                                          | facade `organization.service.ts:136-151`                            | `import-lookup.repo.ts`                                | —                                         | —                                                                                  |

Lớp HTTP (`organization-http.module.ts:22-32`) là Nest submodule riêng, chỉ `AppModule` nạp, import
`IdentityAccessFacadeModule` để kiểm IT Admin phụ trách — ngoại lệ đã ghi ở `ARCHITECTURE.md:47`. Mọi controller bọc
cùng một try/catch quanh mapper 30 nhánh `organization.http-errors.ts`; hằng số OpenAPI lỗi chép lại ở từng
controller.

### 4.3 identity-access

Đã nhóm theo capability (`auth/`, `accounts/`, `approval-roles/`, `access/`), nhưng `dto/` và `errors/` dùng chung ở
gốc, `recovery.*` nằm ở gốc. Lỗi nằm ở bảy chỗ:

| Vị trí                                          | Nội dung                                                                                          |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `identity-access.errors.ts` (gốc, public)       | `PasswordPolicyError` — installation bắt lỗi này                                                  |
| `errors/identity-access.errors.ts`              | 22 lớp auth + accounts; `translateAccountWriteError` (`:167`) là logic adapter DB                 |
| `accounts/account.http-errors.ts`               | mapper HTTP 21 lỗi; re-export `toUnavailableApiException` (`:33-34`) mà `me.controller.ts:8` dùng |
| `accounts/super-admin-transfer.service.ts:13`   | `SuperAdminTransferRefusedError` khai trong service                                               |
| `approval-roles/approval-role.errors.ts`        | 2 lỗi nghiệp vụ **và** mapper HTTP (`:25`)                                                        |
| `recovery.errors.ts`, `recovery.arguments.ts:4` | lỗi CLI khôi phục                                                                                 |
| `auth/auth.controller.ts:81-125`                | mapping lỗi auth viết thẳng trong controller                                                      |

### 4.4 Disposition và vị trí đích

| Capability                                                | Disposition                                                                      | Lý do                                                                                                  |
| --------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| org/cost-center, department, project, job-title, employee | (1) folder                                                                       | Cùng transaction/thứ tự khóa, cùng entry point API, chia sẻ facade; Nest submodule không giảm coupling |
| `OrganizationHttpModule`                                  | (2) giữ Nest submodule                                                           | Vòng đời khác: chỉ API nạp, CLI/worker chỉ dùng facade (`ARCHITECTURE.md:163-166`)                     |
| ia/auth, accounts, access                                 | (1) folder                                                                       | Dùng chung `AccountRepo`/`SessionRepo`/JWT trong `IdentityAccessModule`                                |
| ia/approval-roles                                         | (1) folder; Q7: hoãn quyết định (3) tới thiết kế G3, không chuyển ownership bảng | Sở hữu `approval_role_holders`, là hạt giống context phê duyệt                                         |
| ia/recovery                                               | (2) giữ Nest submodule                                                           | Entry point riêng `ops:recover` (`recovery.module.ts:13`)                                              |
| `IdentityAccessFacadeModule`                              | (2) giữ                                                                          | Graph CLI/worker cần (`module-graph.spec.ts:146-158`)                                                  |

Vị trí đích đề xuất (refactor giữ hành vi, không đổi contract):

```text
src/modules/organization/
  organization.module.ts, organization-http.module.ts, organization.service.ts (facade),
  organization.types.ts (chỉ type public), organization.errors.ts (lỗi public: EmployeeNotFound,
  EmployeeCodeTaken, EmployeeEmailTaken, OrganizationAlreadyExists), organization.repo.ts (chỉ Organization)
  cost-center/   controller, service, repo (+ createCostCenter), types, dto/, errors/, mappers/, policies/cost-center-name.ts
  department/    controller, service (+ department-head.service.ts tách từ :336-470), repo (bỏ project), dto/, errors/, mappers/
  project/       controller, service, project.repo.ts (từ department.repo :406-470), dto/, errors/, mappers/
  job-title/     controller, service, job-title.repo.ts (từ organization.repo :76-176), dto/, errors/, policies/
  employee/      controller, employee-manual.service, employee.repo.ts (từ organization.repo :206-398),
                 import-lookup.repo.ts, policies/employee-row.validator.ts, dto/, errors/
src/modules/identity-access/
  identity-access.module.ts, identity-access-facade.module.ts, identity-access.service.ts,
  identity-access.types.ts, identity-access.errors.ts
  auth/          + dto/auth.dto.ts, errors/auth.errors.ts, auth.http-errors.ts (từ auth.controller :81-125), policies/password.policy.ts
  accounts/      + dto/, errors/account.errors.ts (+ SuperAdminTransferRefusedError), mappers/, policies/account-policy.ts
  approval-roles/ errors/ chỉ lớp lỗi; approval-role.http-errors.ts nhận mapper từ :25
  access/        + dto/me.dto.ts
  recovery.*     giữ ở gốc làm entry CLI (Q6); phần cài đặt riêng có thể nhóm theo capability theo rule mới
src/core/
  normalizeDisplayName (primitive, Q6) thay cho phần chuẩn hóa tên đang ở organization/job-title-name.ts
```

Quy tắc lỗi: lỗi nghiệp vụ thuộc capability sở hữu; `translateAccountWriteError` chuyển về repo (adapter DB); lớp HTTP
chỉ map lỗi; mô tả lỗi OpenAPI dùng chung đặt ở `infrastructure/http/decorators`. Hai điểm từng cần Owner chọn đã
được quyết ở Q6: `job-title-name.ts` đang được `data-import` dùng (`employee-import-rows.ts:3`) ⟹ đưa primitive
`normalizeDisplayName` vào `core`; `recovery.*` giữ ở gốc `identity-access` làm entry capability của CLI, phần cài đặt
riêng có thể nhóm theo capability theo rule mới.

## 5. Auth: access token và refresh token

Theo dấu DTO → controller → service → repo → database → guard → test → OpenAPI trên HEAD `186ad5f`.

| #   | Invariant                                                                              | Kết luận                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Bằng chứng                                                                                                                                                                                                                                |
| --- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Login trả cả access token và refresh token, `tokenType`, expiry; envelope đúng runtime | **Đạt.** `data` gồm `accessToken`, `tokenType: 'Bearer'`, `expiresAt` (hạn access token), `refreshToken`, bọc envelope `AUTH.LOGGED_IN`, HTTP 200. Không có hạn refresh/phiên (F-17)                                                                                                                                                                                                                                                                                                                                     | `auth.dto.ts` `sessionTokenSchema`; `auth.controller.ts:61-97`, `toSessionTokens`; `api-success-response.decorator.ts:16-20`; `SessionTokenResponseDto` trong `openapi.json` (4 trường bắt buộc); test `auth-http.integration-spec.ts:53` |
| 2   | Ký/xác minh access token                                                               | **Đạt.** HS256 ghim cả khi verify (chặn `alg: none`), issuer/audience/TTL theo cấu hình; secret ≥ 32 ký tự, production bắt buộc và từ chối giá trị mặc định; payload chỉ `sub` + `sid` (UUID, kiểm hình dạng) — **không** mang vai                                                                                                                                                                                                                                                                                       | `identity-access.module.ts:39-56`; `env-schema.ts:178-199`, `:362-369`; `token.service.ts:30-50`                                                                                                                                          |
| 3   | Bearer parser                                                                          | **Đạt, một điểm nhỏ.** Thiếu header, sai scheme, `Bearer` trống, token có khoảng trắng ⟹ `null` ⟹ 401 `AUTHENTICATION_REQUIRED`; token không vào log. Scheme phân biệt hoa thường (F-18); Node giữ một header `authorization`                                                                                                                                                                                                                                                                                            | `bearer-token.ts:1-8`, `bearer-token.spec.ts:8-13`; `authentication.guard.ts:46-53`, test không log token `authentication.guard.spec.ts:147`                                                                                              |
| 4   | Kiểm mỗi request; phân biệt 401/403/503                                                | **Đạt.** Mỗi request đọc session (thu hồi, hạn idle, hạn tuyệt đối), account (`ACTIVE`, `ACTIVATED`), employee chưa nghỉ, vai trực tiếp + suy ra từ DB. DB lỗi tạm thời ⟹ 503 `TOKEN_VERIFICATION_UNAVAILABLE`, lỗi khác ⟹ 500; sai vai ⟹ 403                                                                                                                                                                                                                                                                            | `jwt-access-token.verifier.ts:31-87`; `authentication.guard.ts:55-87`; test `auth-http.integration-spec.ts:137-176`, `auth-unavailable.e2e-spec.ts:92`, `account-management-http.integration-spec.ts:391,474`                             |
| 5   | Refresh token: entropy, hash, expiry, single-use, replay, concurrency                  | **Đạt theo thiết kế; F-16 đã quyết ở Q2.** 256 bit `randomBytes(32)`, lưu SHA-256; hạn = hạn idle (không quá hạn tuyệt đối); khóa theo thứ tự AppUser (SHARE) → session → token, đọc lại dưới khóa; token hết hạn ⟹ 401 **trước** khi xét consumed (không thu hồi); token đã dùng còn hạn ⟹ thu hồi phiên + audit, commit trước khi trả 401. Hai refresh đồng thời ⟹ một thành công, phiên bị thu hồi (chủ đích)                                                                                                         | `token.service.ts:53-62`; `session.service.ts:43-114`; `session.repo.ts:38-62`; test `auth-http.integration-spec.ts:267-414`, `auth-concurrency.integration-spec.ts:100-159`                                                              |
| 6   | Logout, khóa, đổi/đặt lại mật khẩu, lời mời, khôi phục, chuyển giao                    | **Đạt.** Logout thu hồi đúng phiên của token, idempotent, bỏ qua `Authorization` (`session.service.ts:122-147`); khóa ⟹ thu hồi mọi phiên + action token (`account-status.service.ts:55-59`); đổi/đặt lại ⟹ `CredentialChangeService.replace` thu hồi phiên, link, xóa throttle (`credential-change.service.ts:42-56`); khôi phục ⟹ thu hồi phiên nhưng qua repo riêng (F-19); chuyển giao Super Admin chỉ đổi grant, vai đọc mỗi request nên có hiệu lực ngay                                                           | các dòng nêu; test `auth-http.integration-spec.ts:415-479`, `password-self-service-http.integration-spec.ts`, `super-admin-recovery.integration-spec.ts`, `super-admin-transfer-http.integration-spec.ts`                                 |
| 7   | Token/credential không lộ                                                              | **Đạt.** Audit từ chối khóa giống secret; guard không log token; audit replay chỉ có id phiên; OpenAPI không có example (không có token thật)                                                                                                                                                                                                                                                                                                                                                                            | `docs/rules/security-jobs.md` (AuditService); `authentication.guard.ts:74-81`; test `auth-http.integration-spec.ts:480-509`; mục 6                                                                                                        |
| 8   | Độ phủ test                                                                            | **Phần lớn đạt.** Có happy path, token giả, đã dùng lại, hết hạn (refresh), refresh cạnh tranh, khóa, nhân viên nghỉ, DB down, đổi vai. Còn thiếu: access token **hết hạn** (`exp` quá khứ) ở unit/HTTP, scheme viết thường, nhiều `Authorization` header                                                                                                                                                                                                                                                                | danh sách test ở mục 11                                                                                                                                                                                                                   |
| 9   | Tác động `1336bd5` _fix auth login_                                                    | Bỏ `cookie-parser`, `AUTH_COOKIE_SECURE`, `RefreshCookie`; CORS bỏ `credentials: true`; login/refresh trả `refreshToken` trong body; refresh/logout nhận `{ refreshToken }` (1–512 ký tự, thiếu ⟹ 422); cookie bị bỏ qua. Regression test đã cập nhật (`auth-http`, `auth-concurrency`, `auth-unavailable`, `password-self-service-http`) và **chạy xanh** (mục 11). Tác động: hợp đồng FE/mobile đổi; client phải giữ refresh token ngoài log/URL; XSS có thể lấy token (ADR-0011 tự ghi); spec/plan cũ chưa sửa (F-03) | `git show 1336bd5`; ADR-0011 mục 3                                                                                                                                                                                                        |

Kết luận Pha C: **không** thấy lỗi bảo mật làm sai invariant trong code auth hiện tại. Rủi ro còn lại là quyết định
thiết kế (refresh token trong body, không grace window) — Owner đã chốt ở Q1/Q2, dev review ADR-0011 vẫn chờ — và tài
liệu bàn giao lệch.
Không đề xuất rút ngắn TTL runtime vì lý do hiển thị Swagger.

### 5.1 Refresh token là token opaque, PostgreSQL là nguồn có thẩm quyền (01B)

Refresh token hiện là **opaque random token**, **không** phải JWT:

| Thuộc tính | Hiện trạng                                                                                                                                                                                                                                                           | Bằng chứng                                          |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Sinh token | 256 bit ngẫu nhiên (`randomBytes(32)`, base64url 43 ký tự); client giữ raw token                                                                                                                                                                                     | `token.service.ts:54-58`, `:16`                     |
| Lưu trữ    | PostgreSQL chỉ giữ SHA-256 hex (`refresh_tokens.token_hash`); **không** lưu raw token ở đâu                                                                                                                                                                          | `token.service.ts:60-62`; `session.repo.ts:24-26`   |
| Xác thực   | Kiểm hình dạng ⟹ băm ⟹ tra chủ token ⟹ trong giao dịch khóa AppUser (SHARE) → session → token (`FOR UPDATE`) ⟹ đọc lại và kiểm session (chưa thu hồi, hạn idle, hạn tuyệt đối), account (`ACTIVE`, `ACTIVATED`), employee chưa nghỉ, hạn token, đã consumed hay chưa | `session.service.ts:43-63`; `session.repo.ts:29-60` |
| Xoay vòng  | Dùng một lần: đánh dấu consumed + `replacedBy`, cấp token mới, kéo dài hạn idle không quá hạn tuyệt đối                                                                                                                                                              | `session.service.ts:83-94`; `session.repo.ts:62-64` |
| Replay     | Token đã consumed còn hạn ⟹ thu hồi cả phiên + audit, commit trước khi trả 401                                                                                                                                                                                       | `session.service.ts:65-80`                          |

Quyết định kỹ thuật kèm theo (ràng buộc cho mọi prompt code sau):

- Access token tiếp tục là JWT HS256 ngắn hạn; refresh token tiếp tục là credential opaque ngẫu nhiên 256 bit, được
  xác thực bằng băm rồi tra trạng thái có thẩm quyền trong PostgreSQL; chỉ lưu hash; xoay vòng một lần với phát hiện
  replay. Không bao giờ lưu hoặc in raw token.
- PostgreSQL tiếp tục là nguồn có thẩm quyền duy nhất cho session và trạng thái refresh token. **Không** thêm Redis
  cho refresh token ở giai đoạn này và **không** tạo dual source of truth. Chỉ xem xét Redis hoặc store khác bằng ADR
  riêng khi có số đo tải, latency hoặc yêu cầu HA cụ thể.
- **Không** đổi refresh token sang JWT. JWT không tự làm bearer token an toàn hơn, mà làm revocation, rotation và
  phát hiện replay khó hơn; hệ thống này vẫn cần trạng thái bền phía server, nên token opaque + hash trong PostgreSQL
  là lựa chọn phù hợp hơn.
- **Không** cần và **không** được thêm `jwt.verify` cho refresh token chỉ vì tên hàm xác thực không hiện rõ. Bước xác
  thực là chuỗi kiểm ở trên.
- Khoảng trống đọc hiểu được ghi ở F-35 (đặt tên, comment cookie cũ ở `session.service.ts:118-119`, hằng số dùng chung
  với action token, thiếu unit test cho máy trạng thái refresh); không sửa code trong lượt này.

## 6. Swagger/OpenAPI

Nguồn sinh: `app/configure-application.ts` (`createOpenApiDocument`, `cleanupOpenApiDoc` của nestjs-zod) và
`scripts/dev/export-openapi.ts`. Artifact `openapi.json` (sha256 `e4d5c1a7…3646`) **không** được export lại trong
lượt này (lệnh export ghi đè tệp); audit trên source + artifact đã commit.

Đã kiểm bằng script đọc (`openapi 3.0.0`, 60 operation):

| Hạng mục                                                                    | Kết quả                                                                                                                                                                                        |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Drift controller ↔ `openapi.json` ↔ `test/support/api-coverage-manifest.ts` | Không lệch: 60 = 60 = 60, không trùng operationId (e2e `api-inventory.e2e-spec.ts:64-69`). Catalog (3 operation) không mount, chủ đích                                                         |
| `security`                                                                  | **0/60** operation; không có root `security`; chỉ `components.securitySchemes.bearer` (F-04)                                                                                                   |
| `summary`                                                                   | **0/60** có nội dung (F-27)                                                                                                                                                                    |
| Example                                                                     | **0** khóa `example`/`examples`: Swagger tự sinh `"string"` cho token/email                                                                                                                    |
| Regex                                                                       | uuid 166 ký tự × 80, date-time 261 × 47, date-time có offset 293 × 2, tất cả đã có `format` — khoảng 26 KB / 159,6 KB                                                                          |
| Envelope                                                                    | Mọi success dùng `successEnvelopeSchema`, mọi error dùng `ErrorEnvelopeDto`; `data` luôn `nullable: true`; `ErrorEnvelopeDto.success` dùng `const` (không hợp lệ OAS 3.0)                      |
| Message key                                                                 | 56 key ổn định dạng `DOMAIN.ACTION`, nhưng **không** xuất hiện trong spec (chỉ regex); 4 operation dùng `COMMON.SUCCESS` (F-29); động từ đọc không thống nhất (`RETRIEVED`/`FETCHED`/`LISTED`) |
| Mã lỗi                                                                      | Có mã chủ đích, nhưng spec chỉ có regex `code`; mã guard dạng phẳng (`INVALID_ACCESS_TOKEN`) cạnh dạng chấm (`AUTHORIZATION.FORBIDDEN`, `AUTH.UNAVAILABLE`)                                    |
| Mô tả                                                                       | Tiếng Anh; mô tả 503 135 ký tự lặp 42 lần ở ≥ 5 controller; dài nhất 332 ký tự; lộ mã nội bộ (`US-03-06 AC-16`, `QĐ-41c`) và ký tự `⟹`                                                         |
| Thiếu response                                                              | 422 thiếu ở `costCenterList` và 4 operation `employeeImport*` theo id; 429 global chỉ khai 4 operation (F-28)                                                                                  |
| Auth                                                                        | Login: 200/401/422/429/503; refresh: 200/401/422/503; logout: 204/422/503 (không 401, chủ đích); không lộ dữ liệu nhạy cảm                                                                     |

Cách sửa nhỏ nhất, không đổi runtime:

1. Gộp `@ApiBearerAuth('bearer')` vào `@AuthenticatedOnly()` và `@RequireRoles()` trong `access.decorators.ts`;
   thêm e2e: operation không public có `security: [{ bearer: [] }]`, public thì không.
2. `ApiOperation({ operationId, summary })` ngắn (≤ 60 ký tự) cho mọi route.
3. Hậu xử lý trong `createOpenApiDocument` sau `cleanupOpenApiDoc`: bỏ `pattern` khi đã có `format: uuid|date-time`,
   đổi `const` thành `enum`. Zod vẫn validate runtime; lưu ý validator FE sinh từ `pattern` sẽ lỏng hơn.
4. Example an toàn qua schema metadata (chưa kiểm nestjs-zod 5.5 có map `.meta({ example })` không):
   `"<access-token>"`, `"<opaque-token>"`, `"user@example.com"`, `"00000000-0000-4000-8000-000000000000"`,
   `"2026-01-01T00:00:00Z"`.
5. Hằng số mô tả lỗi dùng chung ở `infrastructure/http/decorators`; bỏ mã AC/US/QĐ khỏi mô tả public.
6. `ApiSuccessResponse` thêm example có `message`; `ApiErrorResponses` nhận `codes` và sinh example theo status.

Thay đổi contract runtime (regenerate FE): khai 422/429 còn thiếu và đổi `COMMON.SUCCESS` thành mã cụ thể trong prompt
API/Swagger; **giữ** mã guard/503 hiện tại cho tới khi phối hợp FE (Q8). Sau khi sửa, FE-web phải đồng bộ
`openapi/openapi.yaml` (hiện cũ hơn `openapi.json` của BE).

## 7. Bootstrap, kiểm tra vai và dữ liệu local

### 7.1 Ba loại "role"

| Loại                | Hiện trạng                                                                                                                                                                                                                                                                        |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Role PostgreSQL     | Local Compose dùng user `app` (`compose.yaml:8`). Test dùng role `ci_integration` không superuser (`test/README.md:37-48`). Hướng dẫn container tách quyền migration với runtime (`containers.md:41-46`), nhưng prod compose cho api/worker dùng `POSTGRES_USER` của image (F-15) |
| Vai ứng dụng        | `SUPER_ADMIN`, `IT_ADMIN`, `FINANCE`, `EMPLOYEE` là grant trực tiếp (`role_grants`); không tự thêm `EMPLOYEE` (QĐ-47c)                                                                                                                                                            |
| Vai suy ra/cấu hình | Manager suy ra từ giai đoạn trưởng phòng có hiệu lực; Người duyệt chi từ `approval_role_holders`; cả hai đọc mỗi request (`jwt-access-token.verifier.ts:60-76`)                                                                                                                   |

### 7.2 Trả lời sáu câu hỏi

1. **Bootstrap tạo gì.** Một giao dịch có advisory lock `6173204001`: Organization (múi giờ, tiền tệ báo cáo), một
   Cost Center `UNIT`, một phòng, một chức vụ, hai Employee (Super Admin và IT, IT **không** có tài khoản), một
   AppUser Super Admin `ACTIVATED` với grant `SUPER_ADMIN`; mỗi bước ghi audit `actorKind: OPERATOR`. Không gán trưởng
   phòng, không tạo vai khác. Chạy lại ⟹ `AlreadyInstalledError`, không đổi gì (`installation.service.ts:51-161`).
   Khớp `FR-9.8`, `QĐ-67a/b`, `QĐ-73b`.
2. **Kiểm sau bootstrap.** Hiện chỉ có: đầu ra CLI một lần (id tổ chức, AppUser, Employee IT, correlation id —
   `installation-cli.ts:87-96`); đăng nhập Super Admin rồi gọi `GET /me`, `GET /app-users`, `GET /audit-events`,
   checklist onboarding; hoặc `pnpm db:studio` (thấy cả hash credential, hash token, PII — không phù hợp DB dùng
   chung). Chạy lại bootstrap không phải phép kiểm vì phải nhập mật khẩu và hash trước (F-20).
3. **Có cần `ops:inspect` không.** **Có** — Owner chốt ở Q5, một lát riêng. Lệnh read-only, không HTTP, chỉ validate env DB như
   bootstrap, in: đã cài hay chưa; số migration áp dụng so với thư mục; id/tên/múi giờ/tiền tệ tổ chức; người giữ
   `SUPER_ADMIN` (id AppUser, trạng thái, activation, email **che bớt**); số tài khoản theo trạng thái và theo vai;
   người giữ Người duyệt chi/thay thế/dự phòng (id); số phòng thiếu trưởng phòng/IT Admin; checklist bước 1. Không in
   hash, token, mật khẩu, email đầy đủ hay danh sách nhân viên. Exit code phân biệt chưa cài / đã cài / lỗi DB.
4. **Có cần local/demo seed không.** **Có, tách khỏi bootstrap production** — Owner chốt ở Q5, lát `dev:seed` riêng chỉ
   cho local/test. Ví dụ
   `pnpm dev:seed`: dựng dữ liệu mẫu đủ để FE gọi API (vài phòng, chức vụ, nhân viên, tài khoản IT/Finance/Employee,
   trưởng phòng, Người duyệt chi) **qua chính service** để giữ audit và ràng buộc.
5. **Chặn seed ở production/DB dùng chung.** Từ chối khi `NODE_ENV` khác `development`/`test`; chỉ chấp nhận host
   `localhost`/`127.0.0.1` (như helper test); yêu cầu cờ xác nhận rõ ràng; ghi marker (ví dụ audit
   `actorKind: OPERATOR`, `operatorReference: LOCAL_SEED`) và từ chối nếu tổ chức đã có mà không có marker;
   idempotent theo mã ổn định. Mật khẩu nhập ở prompt ẩn hoặc sinh ngẫu nhiên in **một lần**; không commit mật khẩu
   mặc định, không nhận qua biến môi trường (giữ quy tắc `docs/rules/security-jobs.md`).
6. **Phải qua flow nghiệp vụ.** Trên môi trường thật: tài khoản IT Admin/Finance/Employee qua mời và kích hoạt
   (`US-01-01`); Manager qua giai đoạn trưởng phòng (`US-01-02`, `US-03-06`); Người duyệt chi/thay thế/dự phòng qua
   `PUT /approval-roles` (`US-01-03`); nhân viên qua import hoặc nhập tay (`FR-2.1`, `FR-9.7`); Super Admin chỉ đổi
   qua chuyển giao hoặc khôi phục. Production bootstrap **không** tạo hàng loạt tài khoản mặc định (`FR-9.8`).

### 7.3 Cấu hình auth ở môi trường local (01B, F-34)

Chỉ kiểm **tên biến**: lệnh cắt bỏ mọi thứ từ dấu `=` trở đi; không đọc, không in và không chép giá trị nào từ
`.env`/`.env.production` vào báo cáo.

| Tệp                             | Tên biến auth có mặt                                                                                                                                                                                                                                               | Hệ quả                                                                                                                                                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `.env` (21 tên biến)            | Không có biến `AUTH_*` nào; có `NODE_ENV`, `SWAGGER_ENABLED`                                                                                                                                                                                                       | Development dùng mặc định của `env-schema.ts`: `AUTH_ACCESS_TOKEN_SECRET` và `AUTH_THROTTLE_PEPPER` lấy hằng số development commit trong source (`:89-90`, `:178-197`), TTL/session lấy default (`:185-202`) |
| `.env.production` (43 tên biến) | `AUTH_ACCESS_TOKEN_SECRET`, `AUTH_THROTTLE_PEPPER`, `AUTH_ACCESS_TOKEN_TTL_SECONDS`, `AUTH_SESSION_IDLE_SECONDS`, `AUTH_SESSION_ABSOLUTE_SECONDS`, `AUTH_JWT_ISSUER`, `AUTH_JWT_AUDIENCE`, `AUTH_LOGIN_*`, `AUTH_INVITATION_TTL_SECONDS`; còn `AUTH_COOKIE_SECURE` | Đủ biến auth bắt buộc. `AUTH_COOKIE_SECURE` đã bị `1336bd5` bỏ khỏi schema và bị bỏ qua âm thầm vì schema `.unknown(true)` (`:241`). Hai biến reset mật khẩu dùng default                                    |

Validator production (`NODE_ENV` chỉ nhận `development`/`test`/`production`, `env-schema.ts:96`) **bắt buộc**
`AUTH_ACCESS_TOKEN_SECRET` (≥ 32 ký tự) và `AUTH_THROTTLE_PEPPER` (`:178-197`), và **từ chối** nếu dùng đúng giá trị
development mặc định (`:362-369`). Vì vậy đây **không** phải lỗi "JWT không có secret". Khoảng trống còn lại:

- Repo không có `.env.example` (`README.md:26-28` tự ghi); cần mẫu chỉ có tên biến và placeholder, không có giá trị
  thật.
- Cần hướng dẫn tạo secret local riêng (ví dụ sinh ngẫu nhiên ≥ 32 byte) thay vì dựa vào hằng số công khai.
- Cần cảnh báo phạm vi: mọi môi trường `NODE_ENV` khác `production` — kể cả `test` hay staging cấu hình sai — ký access
  token bằng secret công khai trong source, nên token của môi trường đó không được tin ở nơi khác.
- Bỏ `AUTH_COOKIE_SECURE` khỏi `.env.production` khi người giữ tệp cập nhật (ngoài phạm vi lượt này).

Thực hiện trong lát ops/dev setup (cùng nhóm với `dev:seed`, Q5); lượt 01B không sửa tệp env nào.

## 8. Spec/plan slicing

| Nhóm | Story / AC (đếm từ `EP-*.md`) | Item hiện có               |
| ---- | ----------------------------- | -------------------------- |
| G1   | 5 / 65                        | 6 item                     |
| G2   | 11 / 116                      | 7 item                     |
| G3   | 12 / 115                      | 0                          |
| G4   | 4 / 52                        | 0                          |
| G5   | 31 / 277                      | 1 (dịch nội dung, blocked) |
| G6   | 11 / 156                      | 0                          |
| G7   | 33 / 264                      | 0                          |
| G8   | 18 / 228                      | 0                          |
| G9   | 5 / 80                        | 0                          |
| G10  | 6 / 59                        | 0                          |

Quan sát (nguồn: báo cáo subagent, agent chính đối chiếu mẫu):

- **G quá lớn cho một item:** G5, G7, G8, G6, G3, G2 — mỗi nhóm cần nhiều item.
- **Item gom nhiều outcome:** 1b (tạo, mời, kích hoạt, khóa, vai + outbox/SMTP), 1a (CLI, auth, `/me`, guard, gỡ
  catalog), department-profile (4 Story), `us-01-09` (HTTP + CLI, 2 migration), job-title + nhập tay nhân viên,
  operating-parameters + ngày nghỉ, import (4 Story).
- **Story chỉ là trace dễ bị hiểu là đã làm:** "US-01-06 AC-1–3 (sự kiện của lát)" ở 1a; US-01-11 AC-4/7 ở
  department-profile; US-01-05 ghi G1 nhưng không có lát; câu "G1/G2 complete".
- **Plan step quá lớn:** 1a step 6 (login, refresh, logout, verifier, guard, cookie, env, e2e); 1b step 1 (outbox,
  worker, SMTP, env); các plan G2 theo mẫu "repo/service/controller một step, test step sau", không có lệnh verify
  riêng (`g2-department-profile/plan.md:16-17` và tương tự).
- **Template/checker không chặn:** thiếu tách Primary/Supporting, AC một phần không đánh dấu, claim lệch giữa
  roadmap và spec, step không có file/lệnh verify, kích thước item, từ trạng thái lạ hoặc vượt bằng chứng, pin cũ,
  thay contract mà không sửa spec (như `1336bd5`). `scripts/check-rules.mjs` chỉ kiểm link, anchor, khả năng tới
  được từ `AGENTS.md` và edge bắt buộc.

Đề xuất rule (để Prompt 02 cân nhắc, **chưa sửa**):

1. G là planning container, không mang trạng thái; trạng thái theo item.
2. Mỗi item một business outcome/vertical slice; mục tiêu 1–3 primary Story; vượt thì ghi `## Ngoại lệ kích thước`
   với lý do cohesion (cùng aggregate, transaction boundary hoặc lock protocol) và người chấp nhận.
3. Spec bắt buộc ba mục: `## Primary Story/AC` (bảng Story, AC, đủ/một phần, phần còn lại thuộc item/nhóm nào),
   `## Supporting references` (không tính là đã giao), `## Explicit out of scope`.
4. Không ghi Story hoàn thành khi còn AC một phần; ô roadmap/README sinh hoặc đối chiếu từ bảng Primary của spec.
5. Mỗi task của plan có dependency, tệp/module dự kiến (gợi ý ≤ 8 tệp hoặc 1 module, vượt thì ghi ngoại lệ), AC phủ,
   lệnh verify và kết quả mong đợi; test đi cùng task, không dồn về step sau.
6. Đổi contract công khai (diff `openapi.json`, env schema, migration) phải sửa spec của item sở hữu trong cùng PR.
7. Từ vựng trạng thái chỉ theo `docs/roadmap.md:112-117`; `merged-dev` chỉ sau khi chạy lại gate trên SHA đã merge.
8. Header spec có `Docs:<sha>` và `BE:<sha>`; checker cảnh báo khi pin không còn là tổ tiên của mốc hiện hành.
9. Ratchet: thêm chế độ `--items` với `legacyItems` trong `rules-check.config.json`; item mới hoặc bị sửa phải đạt;
   item cũ chỉ kiểm link tới khi có người chạm vào.

## 9. Danh sách task theo dependency

Không task nào được bắt đầu trong lượt này. Mỗi task nên là một item/PR riêng.

1. **Foundation rules/gates** (Prompt 02, không đổi product code):
   - Rule slicing mục 8; sửa template spec/plan; ratchet checker.
   - Đồng bộ tài liệu với hiện trạng: spec 1a/1c/G0 theo `1336bd5` (F-03), `security-jobs.md:10` (F-08),
     `api-contract.md:37` (F-09), "G1/G2 complete" (F-05), claim AC lệch (F-06), pin (F-07).
   - Lập lại R-0: baseline là HEAD hiện tại (đã xanh ở mục 11), ghi kết quả vào plan.
2. **Gate kiến trúc** (test only): import trong module giữa capability (F-10), core cấm `/modules/`, Nest `exports`
   chỉ facade + ngoại lệ ghi rõ, raw SQL ngoài repo (F-14). Chạy đỏ trên vi phạm hiện có ⟹ dùng allowlist có hạn.
3. **Refactor giữ hành vi** (mỗi capability một PR, không đổi contract, `openapi.json` không đổi):
   F-11, F-12, F-13 trước; rồi `organization` theo mục 4.4 (project → job-title → employee → cost-center →
   department); rồi lỗi `identity-access` (F-24), `recovery.repo` dùng `SessionRepo` (F-19), phá chu trình
   auth↔accounts (F-25), gộp `Page<T>`/hằng số OpenAPI (F-26).
4. **Swagger** (hiển thị trước, contract sau): F-04, F-27 rồi F-28/F-29 khi Owner đồng ý; regenerate FE.
5. **Ops inspection/local seed:** `ops:inspect` (F-20), `dev:seed` (F-21) theo mục 7; xem lại F-15 với người deploy.
6. **R-1/R-2** khi Owner mở lại remediation: R-2 theo `QĐ-81` (khóa **và** mở khóa có lý do, audit trước/sau +
   lý do; AC-6/7/20), R-1 bỏ `sharedAccounts`. Pin Docs `9416fe0`.
7. **G3 trở đi**: chỉ sau bước 1–2 và quyết định Owner ở mục 10, chia item theo rule mục 8.

**Thứ tự chốt sau quyết định Owner (01B)** — thay thứ tự 1–7 ở trên khi lập prompt; mỗi bước là prompt/item/PR riêng:

1. **Prompt 02 — foundation rules/gates** (không đổi product code): rule slicing mục 8, template, ratchet checker,
   gate kiến trúc (F-10, F-14), đồng bộ tài liệu/metadata/spec bị drift (F-03, F-05 → F-09), ghi contract FE cho
   refresh token (Q1: không `localStorage`, giữ trong memory; Q2: single-flight), lập lại R-0 trên HEAD hiện tại.
2. **Auth/session contract** (prompt code riêng): thêm `refreshExpiresAt` vào login/refresh, không đổi TTL (Q3);
   giữ nguyên ràng buộc mục 5.1; khoảng trống đọc hiểu/test của F-35.
3. **Swagger/OpenAPI** (prompt API/Swagger): F-04, F-27, F-28; đổi `COMMON.SUCCESS` thành mã cụ thể, giữ mã guard/503
   (Q8); regenerate client FE.
4. **R-1/R-2** (Q4): sau Prompt 02, **trước** refactor lớn `organization`; R-2 áp cả khóa và mở khóa (`QĐ-81`), R-1
   bỏ `sharedAccounts` (`QĐ-75`).
5. **Refactor giữ hành vi theo từng capability:** F-11 → F-13, rồi `organization` (mục 4.4), `normalizeDisplayName`
   vào `core` (Q6), lỗi `identity-access` (F-24), F-19, F-25, F-26. `approval-roles` giữ nguyên ownership (Q7).
6. **Ops/database:** lát `ops:inspect` read-only và lát `dev:seed` chỉ local/test, kèm `.env.example` và hướng dẫn
   secret local (Q5, F-34); role PostgreSQL runtime không superuser + role migration/deploy riêng, kiểm trên môi
   trường cô lập trước deploy (Q9, F-15).
7. **G3 trở đi** sau các bước trên; quyết định tách `approval-roles` làm khi thiết kế G3 (Q7).

## 10. Câu hỏi và quyết định Owner

### 10.1 Câu hỏi đã nêu ở Prompt 01 (giữ làm lịch sử)

Mọi finding deterministic đã ghi ở mục 3. Còn các lựa chọn sau:

| #   | Câu hỏi                                                            | Khuyến nghị                                                                                                                           | Hệ quả                                                            |
| --- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Q1  | Giữ refresh token trong body (`1336bd5`) và chấp nhận rủi ro XSS?  | Giữ (một contract cho web + mobile), bắt buộc dev review ADR-0011 trước `accepted`, FE lưu token trong bộ nhớ + single-flight refresh | Nếu quay lại cookie: web an toàn hơn, mobile cần contract thứ hai |
| Q2  | Thêm grace window cho refresh đồng thời (F-16)?                    | Chưa thêm; ghi yêu cầu single-flight vào contract FE/mobile                                                                           | Thêm grace làm yếu phát hiện replay, cần thiết kế lại             |
| Q3  | Trả thêm hạn phiên/refresh trong login/refresh (F-17)?             | Thêm `refreshExpiresAt` (không đổi TTL)                                                                                               | Đổi schema response, FE regenerate                                |
| Q4  | Mở lại R-1/R-2 trước refactor?                                     | Mở sau bước 1 của mục 9, trước refactor `organization`                                                                                | Giữ hoãn thì FE xây trên contract khóa sắp đổi                    |
| Q5  | Thêm `ops:inspect` và `dev:seed` (mục 7)?                          | Có, hai lệnh riêng, seed chỉ local                                                                                                    | Không có thì dev tiếp tục dùng Prisma Studio trên dữ liệu thật    |
| Q6  | Vị trí `job-title-name` và `recovery`                              | `normalizeDisplayName` vào `core`; `recovery.*` giữ gốc làm entry CLI                                                                 | Ảnh hưởng thứ tự PR refactor                                      |
| Q7  | `approval-roles` thành bounded context riêng ở G3?                 | Quyết khi thiết kế G3                                                                                                                 | Ảnh hưởng ownership `approval_role_holders`                       |
| Q8  | Đổi wire `message` của `COMMON.SUCCESS` và thống nhất mã guard/503 | Đổi `COMMON.SUCCESS` (ít consumer); giữ mã guard tới khi FE sẵn sàng                                                                  | Breaking cho FE nếu đổi mã guard                                  |
| Q9  | Role DB của prod compose (F-15)                                    | Tạo role runtime riêng không superuser, role migration riêng                                                                          | Cần thay đổi deploy, kiểm trên môi trường thật                    |

### 10.2 Quyết định Owner — 18/10/2026 (Prompt 01B)

Nguồn: gói trả lời Q1–Q9 trong `Prompts/BE-audit-and-architecture-2026-10-18/01b-record-owner-decisions-and-close-audit.md`,
được Owner giao làm quyết định chính thức cho lượt lập kế hoạch BE này. Đây là quyết định **kỹ thuật** cho workstream
BE, **không** phải `QĐ-*` nghiệp vụ; không đổi trạng thái ADR (ADR-0011 vẫn `Proposed`, dev review vẫn `pending`).

| #   | Quyết định Owner                                                                                                                                                                                                                                                                                                    | Disposition và nơi thực hiện                                                                                                                     | Finding          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------- |
| Q1  | **Refresh-token transport:** giữ refresh token trong response/body theo `1336bd5` để Web và Mobile dùng cùng contract. Web **không** lưu refresh token trong `localStorage`; contract FE phải nêu lưu trong memory và xử lý mất token khi reload theo UX thiết kế sau. ADR-0011 vẫn cần dev review trước `accepted` | Giữ code hiện tại. Prompt 02 sửa spec 1a/1c/G0 theo body và ghi contract FE; dev review ADR-0011 là gate trước `accepted`                        | F-03             |
| Q2  | **Concurrent refresh:** chưa thêm grace window. FE/Mobile **bắt buộc** single-flight refresh; gửi lại token đã consume là replay và thu hồi session như code/test hiện tại                                                                                                                                          | Giữ hành vi (`session.service.ts:65-80`, `auth-concurrency.integration-spec.ts:138`). Prompt 02 ghi yêu cầu single-flight vào contract FE/mobile | F-16             |
| Q3  | **Expiry contract:** thêm `refreshExpiresAt` trong login/refresh ở một prompt code riêng, **không** đổi TTL hiện hành. Không tự thêm trường khác nếu chưa có nguồn/thiết kế                                                                                                                                         | Prompt auth/session contract (mục 9, thứ tự chốt bước 2)                                                                                         | F-17             |
| Q4  | **R-1/R-2:** mở lại sau khi hoàn tất foundation rules/gates của Prompt 02 và **trước** refactor lớn `organization`. R-2 áp dụng cả khóa và mở khóa theo `QĐ-81`; R-1 bỏ `sharedAccounts` theo `QĐ-75`                                                                                                               | Bước 4 của thứ tự chốt; kế hoạch R pin lại BE HEAD thực tế và Docs `9416fe0`                                                                     | F-01, F-02, F-07 |
| Q5  | **Operations:** thêm hai lát riêng — `ops:inspect` read-only và `dev:seed` chỉ local/test. **Không** gộp seed với production bootstrap                                                                                                                                                                              | Bước 6; thiết kế theo mục 7.2 câu 3–5; kèm `.env.example` và hướng dẫn secret local                                                              | F-20, F-21, F-34 |
| Q6  | **Vị trí code:** đưa primitive `normalizeDisplayName` vào `core`; giữ `recovery.*` ở root `identity-access` như CLI entry capability, private implementation có thể nhóm theo capability theo rule mới                                                                                                              | Bước 5; mục 4.4 đã cập nhật                                                                                                                      | F-23             |
| Q7  | **Approval roles:** hoãn quyết định tách `approval-roles` thành bounded context riêng tới lúc thiết kế G3. Hiện **không** di chuyển ownership bảng                                                                                                                                                                  | Giữ disposition (1) folder; mở lại khi thiết kế G3                                                                                               | —                |
| Q8  | **Wire messages:** đổi các `COMMON.SUCCESS` còn lại thành message code cụ thể trong prompt API/Swagger; **giữ** mã guard/503 hiện tại cho tới khi phối hợp FE, không đổi cùng lượt foundation                                                                                                                       | Bước 3 (prompt API/Swagger)                                                                                                                      | F-29, F-28       |
| Q9  | **PostgreSQL roles:** thiết kế runtime role riêng, **không** superuser; migration/deploy role riêng. Thực hiện trong prompt ops/deployment riêng và phải kiểm chứng trên môi trường cô lập trước deploy                                                                                                             | Bước 6 (ops/deployment)                                                                                                                          | F-15             |

**Không còn câu hỏi Owner nào mở cho Prompt 02.** Các việc còn lại là thực thi hoặc gate đã nêu tên (dev review
ADR-0011, Owner review cuối của từng item), không phải lựa chọn chưa có câu trả lời.

## 11. Lệnh, kết quả, phần chưa kiểm chứng

Tất cả chạy từ gốc BE trên HEAD `186ad5f`, Windows 11, Node 24.0.1, pnpm 11.1.3.

| Lệnh                                                                                                                                          | Kết quả                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `git status --porcelain`, `git log`, `git rev-list --left-right --count @{u}...HEAD`, `git diff --stat origin/dev...HEAD`, `git show 1336bd5` | như mục 1                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `git ls-files -z \| xargs -0 sha256sum` (trước)                                                                                               | 666 tệp; danh sách hash lưu ở scratchpad                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `pnpm check` (15:59–16:00 18/10/2026)                                                                                                         | **exit 0**. rules:check 72 tệp/474 link/0 lỗi; rules:test 14/14; format, prisma validate, generate, lint, typecheck đạt; unit **46 suite, 510/510**; test:scripts 19/19; test:discovery đạt (unit 46, e2e 14, integration 46 tệp); build đạt. Có cảnh báo deprecation `pg` (F-30) và log ERROR chủ đích của test guard/outbox                                                                                                                                                                        |
| `pnpm test:e2e`                                                                                                                               | **exit 0**, 14 suite, **261/261**                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `pnpm test:integration` (container riêng, xem mục 1; 16:02–16:06)                                                                             | **exit 0**, 46 suite, **575/575**; sau lượt còn 0 database `slm_%_test`, container đã xóa                                                                                                                                                                                                                                                                                                                                                                                                            |
| Script đọc `openapi.json`                                                                                                                     | 60 operation, 0 `security`, 0 `summary`, 0 example, regex như mục 6                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `git diff --check`, so status/hash đầu–cuối                                                                                                   | `git diff --check` exit 0; hash 666 tệp tracked **trùng khớp** trước/sau; status chỉ còn `?? docs/reviews/be-foundation-audit-2026-10-18/README.md`; `openapi.json` vẫn `e4d5c1a7…`. `pnpm rules:check` sau khi thêm báo cáo: 0 lỗi; `prettier --check` báo cáo: đạt. Docs `9416fe0`: lượt này không ghi; lúc 16:04 xuất hiện thay đổi `Diagrams/context-diagram/SaaS-Sentry-Context-Diagram.drawio` và tệp backup `.$…drawio.bkp` của draw.io desktop, không do lệnh nào của lượt audit — để nguyên |

Chưa kiểm chứng:

- `pnpm openapi:export` không chạy (ghi đè `openapi.json`); chưa chứng minh artifact export lại byte-identical.
- Remote CI của PR #11/#12; môi trường dùng chung; prod compose trên server thật (F-15).
- Hành vi Swagger UI thực tế; nestjs-zod có map `.meta({ example })` không.
- `pnpm ops:bootstrap`/`ops:recover` trên shell tương tác (chỉ có integration test của recovery CLI).
- Consumer FE/mobile của contract khóa và refresh token.
- Subagent quét cấu trúc đầu phiên báo 10 migration; kiểm lại thấy **16** thư mục migration, khớp `ARCHITECTURE.md:14`.

### 11.1 Lượt 01B — ghi quyết định Owner và khép audit

Phạm vi: chỉ sửa tệp báo cáo này. Không sửa product code, test, config, OpenAPI, ADR, rule, guide, roadmap, spec/plan,
repo Docs hay prompt khác; không commit/push; không dùng subagent; không chạy lại test vì không có thay đổi code.

Đính chính so với bản Prompt 01: một số tham chiếu dòng ở mục 5, 7.1 và F-17 đã lấy số từ output `cat -n` của nhiều
tệp nối liền nên bị lệch. Đã kiểm lại bằng `grep -n` trên từng tệp và sửa: `token.service.ts:30-50`, `:53-62`,
`:30-35`; `jwt-access-token.verifier.ts:31-87`, `:60-76`; `authentication.guard.ts:46-53`, `:55-87`, `:74-81`;
`bearer-token.spec.ts:8-13`; `account-status.service.ts:55-59`. Kết luận của các dòng đó không đổi.

| Lệnh                                                                                              | Kết quả                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `git status`, `git rev-parse`, `git rev-list --left-right --count @{u}...HEAD` (đầu lượt)         | `dev` `186ad5f`, ahead 2/behind 0; status chỉ `?? docs/reviews/be-foundation-audit-2026-10-18/README.md`; hash 666 tệp tracked trùng với cuối Prompt 01                                                                                                                                                                 |
| Trích tên biến `.env`, `.env.production` (cắt từ `=`), đối chiếu `env-schema.ts`                  | như mục 7.3; không có giá trị nào được đọc ra màn hình hay ghi vào báo cáo                                                                                                                                                                                                                                              |
| `grep -n` các hàm refresh token trong `token.service.ts`, `session.service.ts`, `session.repo.ts` | như mục 5.1                                                                                                                                                                                                                                                                                                             |
| Kiểm tra cuối (18/10/2026)                                                                        | `pnpm exec prettier --check` tệp này: đạt; `pnpm rules:check`: 72 tệp, 474 link, 0 lỗi; `git diff --check`: exit 0; `git diff --no-index --check` cho tệp untracked này: không có lỗi whitespace; hash 666 tệp tracked trùng trước/sau lượt; status cuối chỉ `?? docs/reviews/be-foundation-audit-2026-10-18/README.md` |
