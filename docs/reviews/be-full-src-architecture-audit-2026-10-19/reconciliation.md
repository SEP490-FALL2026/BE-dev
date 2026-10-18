# Đối chiếu mã công việc — audit H4.0 ngày 19/10/2026

Phụ lục của [báo cáo audit H4.0](README.md). Mỗi mã có đúng một dòng. Trạng thái dùng bộ từ của Prompt 09:

- **đã giải quyết** — H1 → H3c hoặc Prompt 02/06 đã xử lý, có bằng chứng (link);
- **còn hợp lệ** — vẫn đúng trên cây hiện tại (HEAD `bd05007` + 68 file chưa commit của chuỗi H1 → H3c; cây cuối H4.0 có thêm 2 tệp báo cáo, tổng 70), kèm lát đề xuất;
- **superseded** — bị thay bằng quyết định/lát khác;
- **lịch sử** — chỉ là ghi nhận quá khứ, không phải việc mở;
- **cần tái kiểm chứng** — chưa chạy được bằng chứng trong lượt chỉ đọc này;
- **chưa có lát** — còn hợp lệ nhưng trước H4.0 chưa có lát sở hữu (H4.0 đề xuất lát ở cột cuối).

Mã lát đề xuất (`H4.x`, `H5.x`, `H6.x`, `H8.x`, `GATE.1`, `DOC.1`, `AUTH.x`, `INF.1`, `ROOT.1`, `BEH.1`) định nghĩa ở mục 9
của README. Mã finding mới của lượt này là `A4-01` → `A4-23` (mục 8.2 của README) để không trùng `N-1` → `N-6` của
review G0/G1.

## 1. Remediation `R-0`, `R-1`, `R-2`

| Mã    | Trạng thái    | Bằng chứng / ghi chú                                                                                                                                                                        |
| ----- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `R-0` | đã giải quyết | Gate trên HEAD `186ad5f` ([audit nền tảng](../be-foundation-audit-2026-10-18/README.md)), rồi full gate H1 → H3c trên `bd05007` + cây chưa commit. Còn remote CI trên revision được commit  |
| `R-1` | đã giải quyết | [H3a](../../workspace/items/h3a-r1-department-in-use-details/plan.md#verification-and-handoff) `verified` local; `grep sharedAccounts src` = 0                                              |
| `R-2` | đã giải quyết | [H3b](../../workspace/items/h3b-r2-lock-unlock-reason/plan.md#verification-and-handoff) `verified` local; `app-users.controller.ts` nhận `AccountStatusChangeBodyDto`, audit `after.reason` |

## 2. Finding lịch sử `R-00` → `R-16` (review G0/G1, 15/10/2026)

Nguồn: [review G0/G1](../g0-g1-remediation-2026-10-15/README.md#diễn-biến-finding). Không mã nào bị mở lại: H4.0 không
thấy regression cụ thể trên cây hiện tại.

| Mã                                                     | Trạng thái                 | Ghi chú                                                                                                |
| ------------------------------------------------------ | -------------------------- | ------------------------------------------------------------------------------------------------------ |
| `R-00`                                                 | lịch sử                    | Nhãn baseline trong báo cáo, không phải remediation                                                    |
| `R-01`, `R-04`, `R-05`, `R-08`, `R-16`                 | lịch sử (đóng ở `a8ba88f`) | `R-08` còn được kiểm bởi test service `account-management-http` (khóa người giữ vai từ tài khoản khác) |
| `R-06`                                                 | lịch sử (giữ chủ đích)     | Chỉ đăng nhập sai tăng bộ đếm thất bại                                                                 |
| `R-07`                                                 | lịch sử (giữ chủ đích)     | Rate limit riêng theo route trên mỗi IP (`password-self-service-http` T-9 vẫn kiểm)                    |
| `R-02`, `R-03`, `R-09`, `R-12`, `R-13`, `R-14`, `R-15` | lịch sử (sửa ở `a0cf5f1`)  | `R-13` còn được kiểm bởi gate R-13 trong `architecture-boundaries.spec.ts` (đồ thị lệnh cài đặt)       |
| `R-10`, `R-11`                                         | lịch sử (chuyển G2)        | Đã làm ở lát G2 đầu (`g2-job-title-catalogue-and-manual-employee`)                                     |

## 3. Foundation finding `F-01` → `F-35`

| Mã   | Trạng thái                    | Bằng chứng trên cây hiện tại                                                                                                                                                                                          | Lát                    |
| ---- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| F-01 | đã giải quyết                 | H3b `verified` local                                                                                                                                                                                                  | —                      |
| F-02 | đã giải quyết                 | H3a `verified` local                                                                                                                                                                                                  | —                      |
| F-03 | đã giải quyết (tài liệu)      | Prompt 02, H1B; ADR-0011 vẫn `Proposed`, chờ dev review                                                                                                                                                               | gate ngoài code        |
| F-04 | đã giải quyết                 | H2a: 60/60 operation có `security` khi không public                                                                                                                                                                   | —                      |
| F-05 | đã giải quyết                 | `AGENTS.md` không còn "complete"; `docs/roadmap.md:3` "Chưa có US nào hoàn thành"                                                                                                                                     | —                      |
| F-06 | đã giải quyết                 | Đính chính 18/10 ở roadmap, `items/README.md:56` và từng spec; H4.0 không thấy lệch mới ở các dòng đã đọc                                                                                                             | —                      |
| F-07 | đã giải quyết                 | 20 tệp trong `docs/` pin Docs `9416fe0`                                                                                                                                                                               | —                      |
| F-08 | đã giải quyết                 | Prompt 02                                                                                                                                                                                                             | —                      |
| F-09 | còn hợp lệ (một phần)         | `api-contract.md` đã bỏ catalog làm mẫu, nhưng `CONTRIBUTING.md:9`, `README.md:4,10`, `ARCHITECTURE.md` (12, 19, 54), ADR-0003:47 vẫn gọi catalog là mẫu — A4-14                                                      | DOC.1 (E1 = A)         |
| F-10 | còn hợp lệ (một phần)         | Gate nội module có ở `architecture-structure.spec.ts:157`, nhưng bỏ qua tệp ở root module (`:160`, `:166`) — A4-01                                                                                                    | GATE.1                 |
| F-11 | còn hợp lệ                    | `organization/projects.controller.ts:12` import `./departments.controller`                                                                                                                                            | H4.1                   |
| F-12 | còn hợp lệ                    | `organization/department.service.ts:485` `error.name === 'EmployeeNotFoundError'`                                                                                                                                     | H4.1                   |
| F-13 | còn hợp lệ                    | `organization.module.ts` export `ImportLookupRepo` (chỉ dùng trong module + một test); ba repo còn lại do `OrganizationHttpModule` dùng                                                                               | H4.1 (+ E4 = A ở H4.7) |
| F-14 | còn hợp lệ (một phần)         | Gate core/exports/raw SQL đã có; còn mù: cross-module "mọi tệp root là public" (`architecture-boundaries.spec.ts:254`), export gate chỉ thấy `*Repo`/`PasswordHasher` (`module-graph.spec.ts:228`) — A4-02, A4-03     | GATE.1                 |
| F-15 | còn hợp lệ, `blocked`         | `docker-compose.prod.yml` chưa đổi (không đọc lại trong lượt này); cần môi trường PostgreSQL cô lập                                                                                                                   | H7                     |
| F-16 | đã giải quyết (quyết định Q2) | Giữ hành vi; FE/Mobile phải single-flight                                                                                                                                                                             | handoff FE             |
| F-17 | đã giải quyết                 | H1 `refreshExpiresAt`                                                                                                                                                                                                 | —                      |
| F-18 | chưa có lát                   | `infrastructure/security/tokens/bearer-token.ts:6` `/^Bearer ([^\s]+)$/` phân biệt hoa/thường; không test nào ghim hành vi                                                                                            | AUTH.1                 |
| F-19 | còn hợp lệ                    | `identity-access/recovery.repo.ts:159-166` tự `authSession.updateMany`, trùng `auth/session.repo.ts:85-91`; gọi ở `recovery.service.ts:164`                                                                           | H5.6 (E6 = A)          |
| F-20 | còn hợp lệ                    | Chưa có `ops:inspect`                                                                                                                                                                                                 | H6.1                   |
| F-21 | còn hợp lệ                    | Chưa có `dev:seed`                                                                                                                                                                                                    | H6.2                   |
| F-22 | đã giải quyết                 | Template/checker Prompt 02 (H3c: checker bắt thiếu `Acceptance` ở plan)                                                                                                                                               | —                      |
| F-23 | còn hợp lệ                    | `organization` 26 tệp root, 5 controller; project trong `department.repo.ts:404-498`, job-title và employee trong `organization.repo.ts:76-398`                                                                       | H4.2 → H4.7            |
| F-24 | còn hợp lệ                    | `identity-access/errors/identity-access.errors.ts` 22 lớp + `translateAccountWriteError` (`:167-177`); mapper HTTP trong `approval-role.errors.ts:25-47`; lớp lỗi trong `super-admin-transfer.service.ts:13`          | H5.2, H5.3; H8.1       |
| F-25 | còn hợp lệ                    | auth → accounts (`login.service.ts:7-8`, `session.service.ts:7-8`, …); accounts → auth (`account-invitation.service.ts:10-12`, `account-status.service.ts:6`)                                                         | H5.5                   |
| F-26 | còn hợp lệ (mở rộng)          | Mô tả 401/503 đã dùng chung (H2a). Còn: 7 bản `Page`/`*Page` (A4-12), hằng số 422 cục bộ ở 6 controller (A4-13), try/catch lặp                                                                                        | theo từng lát module   |
| F-27 | đã giải quyết                 | H2a/04B                                                                                                                                                                                                               | —                      |
| F-28 | đã giải quyết                 | H2b                                                                                                                                                                                                                   | —                      |
| F-29 | đã giải quyết                 | H2b                                                                                                                                                                                                                   | —                      |
| F-30 | chưa có lát                   | `pg@8.23.0`; cảnh báo đến từ test (`pg-pool.spec.ts:207` truyền `Promise`, `:98-101` xếp hàng query); code dựa vào nội bộ `pg`/`pg-pool` (`pg-pool.ts:126`, `:248-251`) với phạm vi `^8.23.0`                         | INF.1                  |
| F-31 | chưa có lát                   | Policy 12–128 (`password.policy.ts:3-4`); DTO: login 256 (`auth.dto.ts:11`), reset 1024 (`:52`), đổi — current 256 (`:58`), new **256** (`:60`), redeem 1024 (`account-management.dto.ts:49`)                         | AUTH.2                 |
| F-32 | giữ (OK)                      | Regression gate: integration auth/session; không thay đổi                                                                                                                                                             | —                      |
| F-33 | giữ (OK, đã tái kiểm)         | 16 migration; manifest 60 = OpenAPI 60; gate ownership Prisma xanh (35 test kiến trúc)                                                                                                                                | —                      |
| F-34 | còn hợp lệ (một phần)         | `.env.example` có và được test (`env-example.spec.ts`); ngoài production vẫn có giá trị mặc định công khai cho secret (`env-schema.ts:183`, `:196`, `:216`, `:223`)                                                   | H6.3 (E3 = C)          |
| F-35 | đã giải quyết                 | `session.service.ts:43-49` bước `authenticateAndRotate` có tên; suite máy trạng thái `session.service.spec.ts:142-216`; không còn "cookie" trong `src`. Dư nhỏ: `hashRefreshToken` trùng thân `hashActionToken` — giữ | —                      |

## 4. Ma trận `M-01` → `M-57`

Nguồn: [remediation](../../workspace/items/baseline-impact-and-remediation-2026-10-17/spec.md#ma-trận-tác-động). Cột
_Refactor phải giữ_ đánh dấu dòng mà một lát H4/H5/H8 có thể vô tình phá.

| Mã                     | Lớp | Trạng thái                                                                    | Refactor phải giữ                                                                |
| ---------------------- | --- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| M-01, M-02, M-03       | D   | đã giải quyết (R-1/H3a)                                                       | H4.6: `details` của `DEPARTMENT.IN_USE` đúng ba khóa                             |
| M-04                   | A   | lịch sử (không cần đổi)                                                       | —                                                                                |
| M-05, M-06, M-07       | B   | đã giải quyết (ghi chú tác động trong spec/roadmap)                           | —                                                                                |
| M-08                   | B   | đã giải quyết (roadmap ghi `US-07-08` Retired)                                | —                                                                                |
| M-09, M-10, M-11, M-12 | C   | còn hợp lệ — đầu vào G3/G4/G5/G6, chưa tới lượt                               | —                                                                                |
| M-13, M-14             | A   | lịch sử                                                                       | H5.7: `recovery_tickets.environment = 'SHARED'` nghĩa môi trường                 |
| M-15                   | B   | đã giải quyết (roadmap đăng ký `US-03-10`, `US-03-11`)                        | —                                                                                |
| M-16, M-17             | C   | còn hợp lệ — đầu vào G6                                                       | —                                                                                |
| M-18, M-19             | D   | đã giải quyết (R-2/H3b)                                                       | H5.x: body `{ reason }` và `after.reason` của lock/unlock                        |
| M-20                   | B   | đã giải quyết (ghi chú tác động + contract note sau H3b ở spec 1b)            | —                                                                                |
| M-21                   | E   | đã giải quyết (E-1 = A → `QĐ-81` → H3b)                                       | —                                                                                |
| M-22, M-23             | C   | còn hợp lệ — đầu vào G6                                                       | H4.6: trigger "trưởng phòng ⊆ thành viên" giữ nguyên                             |
| M-24                   | A   | lịch sử                                                                       | H5.x: `approval-role.service.ts` `set()` chỉ đóng người giữ cũ khi gán người mới |
| M-25, M-26, M-27       | C   | còn hợp lệ — đầu vào G4/G5/G6                                                 | H4.6: `assignHead`/`vacateHead` là hai thao tác service dùng lại được            |
| M-28                   | A   | lịch sử                                                                       | H5.x: `successor-eligibility.ts` kiểm người kế nhiệm                             |
| M-29 → M-35            | C   | còn hợp lệ — đầu vào G3/G4/G5/G6                                              | —                                                                                |
| M-36                   | A   | lịch sử                                                                       | trạng thái `EmailOutbox` không đổi tên                                           |
| M-37                   | B   | đã giải quyết (roadmap đăng ký `US-05-21`)                                    | —                                                                                |
| M-38, M-39, M-40       | C   | còn hợp lệ — đầu vào G5/G6/G7/G8                                              | —                                                                                |
| M-41                   | B   | đã giải quyết (ghi chú ở spec nền G0)                                         | —                                                                                |
| M-42, M-43, M-45       | B   | đã giải quyết (roadmap G7)                                                    | —                                                                                |
| M-44                   | C   | còn hợp lệ — G7, `RESEARCH-DEPENDENT` (`OQ-27`)                               | —                                                                                |
| M-46                   | A   | lịch sử                                                                       | chú thích `parameter-definitions.ts` (collector) giữ                             |
| M-47                   | B   | đã giải quyết (nhãn trùng số ở `dynamic-content-translation`)                 | —                                                                                |
| M-48                   | E   | còn hợp lệ — E-2 = B: dịch EN–VI `draft`/`blocked`, ngoài foundation refactor | —                                                                                |
| M-49, M-52             | B   | đã giải quyết (roadmap G10)                                                   | —                                                                                |
| M-50                   | C   | còn hợp lệ — G10                                                              | —                                                                                |
| M-51                   | A   | lịch sử                                                                       | —                                                                                |
| M-53, M-54             | B   | đã giải quyết; M-54 nay thay bằng R-0                                         | —                                                                                |
| M-55, M-56             | B   | đã giải quyết (bảng phủ 150 mã; snapshot `S-2026-10-18`)                      | —                                                                                |
| M-57                   | A   | lịch sử                                                                       | spec cũ giữ nguồn đã pin                                                         |

Số đếm kiểm lại từ spec: 57 dòng — A 9 · B 18 · C 23 · D 5 · E 2 (khớp nguồn).

## 5. Lát nền tảng `H1` → `H8`

| Mã  | Trạng thái                       | Ghi chú H4.0                                                                                                                                                                 |
| --- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1  | đã giải quyết (`verified` local) | Còn dev review ADR-0011                                                                                                                                                      |
| H2  | đã giải quyết (`verified` local) | H2a/04B, H2b                                                                                                                                                                 |
| H3  | đã giải quyết (`verified` local) | H3a/R-1, H3b/R-2, H3c                                                                                                                                                        |
| H4  | còn hợp lệ — mở rộng             | Tách thành H4.1 → H4.7 (mục 9 README); thêm GATE.1 trước                                                                                                                     |
| H5  | còn hợp lệ — mở rộng             | Tách thành H5.0 → H5.7; Owner đã quyết E5 = A, E6 = A, E7 = B (09B)                                                                                                          |
| H6  | còn hợp lệ — mở rộng             | H6.1 inspect, H6.2 seed, H6.3 installation + env-schema, H6.4 hạ tầng chưa dùng (E2 = A: gỡ khỏi đồ thị runtime); vị trí inspect/seed (E8 = A: folder trong `installation/`) |
| H7  | còn hợp lệ, `blocked`            | Role PostgreSQL; cần môi trường cô lập                                                                                                                                       |
| H8  | còn hợp lệ                       | H8.1 → H8.3; phụ thuộc H4.3a                                                                                                                                                 |

## 6. Nhóm roadmap `G0` → `G10`

| Nhóm | Trạng thái                    | Ảnh hưởng tới backlog H4.0                                                                                                                                             |
| ---- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G0   | `merged-dev`                  | Ranh giới tổ chức–danh tính; H4/H5 không đổi contract                                                                                                                  |
| G1   | `merged-dev` (+ H1–H3c local) | identity-access; H5.x giữ hành vi                                                                                                                                      |
| G2   | `merged-dev` (+ H3a local)    | organization, operating-parameters, data-import, onboarding; H4.x/H8.x giữ hành vi                                                                                     |
| G3   | chưa bắt đầu                  | Cần cost-center/department/job-title ổn định (H4.1 → H4.6) và quyết định catalog (E1 = A: giữ tới thiết kế G3); gate GATE.1 trước khi onboarding bước 2 nối module mới |
| G4   | chưa bắt đầu                  | Đụng accounts/workspace (M-30, M-33): nên sau H5.2 → H5.5                                                                                                              |
| G5   | chưa bắt đầu                  | Request/approval: đụng approval-roles (Q7), `Page<T>` chung                                                                                                            |
| G6   | chưa bắt đầu                  | Điều chuyển/nghỉ việc: đụng department-head (H4.6), employee (H4.4), khóa tài khoản (H3b)                                                                              |
| G7   | chưa bắt đầu                  | Usage: `RESEARCH-DEPENDENT`; không ràng buộc backlog H4.0                                                                                                              |
| G8   | chưa bắt đầu                  | Báo cáo: dùng `Page<T>` chung                                                                                                                                          |
| G9   | chưa bắt đầu                  | Đối soát: có thể là loại import thứ hai — trigger cho H8                                                                                                               |
| G10  | chưa bắt đầu, hoãn            | AI/Mobile; FE/Mobile client regenerate sau merge H2b/H3b                                                                                                               |
