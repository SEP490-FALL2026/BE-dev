# Plan: identity-access Wave B — capability surface, session ownership của recovery và repo theo aggregate (H5.5 → H5.7)

- [Spec](spec.md); revision đầu vào: Docs `9416fe0`, BE `19cf3b1`.
- Phụ trách: AI theo giao việc Owner. Thiết kế ban đầu bởi: Owner (audit H4.0 mục 9.3, E5 = A, E6 = A, E7 = B; Prompt 19).
- Owner review: chưa review. Peer review: tùy chọn.
- Triển khai: `verified` (local 19/10/2026, cây làm việc chưa commit trên `19cf3b1`). PR: chưa có.

## Before coding

Preflight: `dev` = `origin/dev` = `19cf3b1c4481f4a4a73d38e1e066223bf4488caf`, ahead/behind `0/0`, cây sạch; `19cf3b1`
chứa Wave A (root `identity-access` 10 file/0 controller); `openapi.json` `14fd428b…`; Docs `9416fe0`; ADR-0011/0012
`Proposed`.

Inventory (đọc trực tiếp, không subagent):

- 21 mục `crossCapabilityImports` (bảng ở [spec](spec.md#21-cạnh-crosscapabilityimports)); chu trình capability auth ↔
  accounts, accounts ↔ approval-roles, root ↔ auth, root ↔ accounts.
- `accounts/account.repo.ts` 411 dòng, 35 method, ghi `app_users`, `password_credentials`, `role_grants`,
  `account_action_tokens`; consumer: 13 file trong auth/accounts/access/approval-roles/root/recovery.
- `recovery.service.ts` 608 dòng, 9 dependency; `recovery.repo.ts` ghi `recovery_tickets` **và** `auth_sessions`
  (`revokeSessions`, lý do `PASSWORD_RESET`) — `auth_sessions` có hai writer.
- `IdentityAccessFacadeModule` export năm token riêng (`LEGACY_PRIVATE_EXPORTS`): `AccountRepo`, `ApprovalRoleRepo`,
  `PasswordHasher`, `RecoveryRepo`, `SuccessorEligibility`.
- Sáu service > 6 dependency: `password-reset` 10, `recovery` 9, `login` 8, `account-invitation` 7, `password-change` 7,
  `session` 7.
- Baseline cổng (cây Wave A, cùng nội dung `19cf3b1`): unit 66 suite/968, e2e 14 suite/274, integration 46 suite/623.

## Tasks

### Task 1: Phase 0 — `CP0-05` → `CP0-08`

- Files: `test/integration/auth-concurrency.integration-spec.ts`, `auth-http.integration-spec.ts`,
  `super-admin-recovery.integration-spec.ts`.
- Depends on: none.
- Acceptance: `CP0-05` — audit thu hồi phiên lọc `resource_id` của chính phiên ca kiểm, kỳ vọng đúng một
  `SESSION.REVOKED` (cả ca phát lại refresh token); `CP0-06` — chờ khóa bằng `pg_blocking_pids` của đúng backend giữ khóa
  (`pg_backend_pid()`), không suy từ activity toàn cluster; `CP0-07` — mỗi ca ghi ticket nó mở, `afterEach` chỉ supersede
  ticket đó, `beforeEach` khẳng định không còn ticket chờ; `CP0-08` — hai ca chặn mới (`AWAITING_ACTIVATION`, link của
  phiếu PENDING đã hết hạn). Không đổi product code.
- Verify: Checkpoint 0 trên code cũ + hai mutant.

### Task 2: Phase A — H5.5(a–c) capability surface, phá chu trình

- Files: `accounts/{account-directory,role-grant,action-link,credential,action-link-revocation,invitation-mail,
invitation-redemption}.service.ts`, `accounts/account.types.ts` (hai port); hasher, `password.policy`, `action-token`
  chuyển `auth/` → `accounts/`; `auth/{session-directory,session-token}.service.ts`, bốn service đặt lại mật khẩu (tách
  `password-reset.service.ts`); `approval-roles/approval-role-directory.service.ts`; `successor-eligibility.ts` →
  `successor-eligibility.service.ts`; consumer trong auth/access/accounts/approval-roles/root; ba module; spec; ledger.
- Depends on: Task 1.
- Acceptance: không capability nào import repo/hasher/policy/helper của capability khác; chu trình auth ↔ accounts và
  accounts ↔ approval-roles hết; mọi service chạm ≤ 6 dependency; ledger chỉ xóa mục đã gỡ.
- Verify: Checkpoint A.

### Task 3: Phase B — H5.6 session ownership trong recovery, `recovery/` (E7), `RecoveryTicketService`

- Files: `recovery/recovery.repo.ts` (bỏ `revokeSessions`), `recovery/recovery-ticket.service.ts`, chuyển
  `recovery.{repo,errors,arguments(+spec)}` vào `recovery/`; tách root `recovery.service.ts` (608 dòng) thành
  `recovery/` theo use case, `recovery.types.ts`, `recovery-procedure.ts`; `src/recovery-cli.ts`; `recovery.module.ts` (E6);
  hai service đặt lại mật khẩu dùng ticket service; facade module (gỡ export `AccountRepo`, `RecoveryRepo`);
  `module-graph.spec.ts` (E6, `RecoveryCliModule`); `CLI_ENTRY_FILES`; integration recovery.
- Depends on: Task 2.
- Acceptance: 0 SQL `auth_sessions` ở recovery; thu hồi phiên qua `SessionRepo` trong cùng giao dịch, cùng lý do;
  không export `SessionRepo`/`RecoveryRepo`; giao diện CLI không đổi; `crossCapabilityImports` rỗng; mọi file recovery
  < 400 dòng, ≤ 6 dependency.
- Verify: Checkpoint B.

### Task 4: Phase C — H5.7/H5.5(d) repo theo aggregate

- Files: `accounts/{app-user,credential,role-grant,action-token}.repo.ts` (tách nguyên văn), xóa `accounts/account.repo.ts`;
  bốn contract service đổi sang repo mới; facade module; `module-graph.spec.ts`; `architecture-structure.spec.ts`;
  spec và integration dùng repo cũ.
- Depends on: Task 3.
- Acceptance: mỗi bảng một writer; mọi file < 400 dòng (gỡ hai mục oversized của module); năm private export gỡ;
  `crossCapabilityImports` rỗng; root ≤ 12 file, ≤ 2 controller.
- Verify: Checkpoint C + ratchet hai chiều.

### Task 5: consolidation

- Files: `ARCHITECTURE.md`, `docs/rules/module-structure.md`, item này, `items/README.md`, `docs/roadmap.md`, metadata
  Wave A (`19cf3b1`), tracker ngoài repo.
- Depends on: Task 4.
- Acceptance: tài liệu hiện hành mô tả đúng cây cuối; lịch sử có ngày giữ nguyên; diff cuối đã tự review.
- Verify: full gate một lần trên cây cuối (bảng dưới).

## Ghi chú thiết kế và lệch so với prompt

- **Thứ tự phase.** Prompt đặt folder `recovery/` và tách service recovery ở Phase C. Chúng làm ở Phase B cùng E6: cạnh
  14 cần chỗ ở capability cho `RecoveryTicketService` (không thể là file private ở root), và thu hồi phiên qua
  `SessionRepo` chạm đúng đoạn service đó. Tách `AccountRepo` ở Phase C như prompt.
- **E6 qua port.** Prompt nói inject `SessionRepo` trực tiếp vào recovery implementation. Gate cấm `recovery/` import
  `auth/session.repo.ts` (cạnh repo xuyên capability), nên recovery gọi `revokeAllSessions` qua port `ACCOUNT_SESSIONS`
  (`SessionDirectoryService`, một dòng ủy quyền). `SessionRepo` vẫn được khai trong `RecoveryModule` theo E6 và chạy
  trong cùng giao dịch, cùng câu lệnh, cùng lý do; không ledger mới.
- **Khai báo kép.** Chín token khai ở cả API và recovery (danh sách chính xác, có test) thay vì export qua facade.
- **Credential về `accounts`.** Hasher, `password.policy` và `action-token` chuyển từ `auth/` vào `accounts/` (chủ của
  `password_credentials` và `account_action_tokens`); auth dùng `CredentialService`/`ActionLinkService`.
- **Hai entry recovery.** CLI gọi `HolderRecoveryService` và `RoleTransferRecoveryService` trực tiếp thay vì một entry
  chuyển tiếp rỗng.
- **Test TTL.** Hai test TTL action token chuyển từ `auth/token.service.spec.ts` sang `accounts/action-link.service.spec.ts`
  (method đã chuyển chủ).
- **Port accounts ↔ approval-roles.** Chu trình có sẵn accounts ↔ approval-roles (ngoài auth ↔ accounts) cũng bị cắt bằng
  `APPROVAL_ROLE_HOLDINGS`; root ↔ accounts còn lại chỉ là type/lỗi public (accounts → root) và contract service (root →
  accounts), không có chu trình ở cấp file.

## Verification and handoff

Môi trường: Windows 11, Git Bash, pnpm 11.1.3, Docker 29.1.2, cây làm việc chưa commit trên `19cf3b1`, 19/10/2026.
Integration dùng PostgreSQL 17 (`postgres:17-alpine`) trong container riêng của từng lượt (`127.0.0.1:55438`), role
`LOGIN NOSUPERUSER CREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`; container xóa sau mỗi lượt.

| Lệnh / kiểm tra                                                                                                                              | Revision / môi trường      | Kết quả                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Chưa chạy / giới hạn |
| -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| Checkpoint 0: suite session/recovery/concurrency (auth-http, auth-concurrency, super-admin-recovery, recovery-cli, password-self-service ×3) | `19cf3b1` + test           | 7 suite/110 test xanh trên code **chưa sửa**; mutant bỏ kiểm tra ticket chờ ở quên mật khẩu → 3 test fail; mutant chỉ coi PENDING là chờ → ca `AWAITING_ACTIVATION` fail; cả hai khôi phục byte-identical                                                                                                                                                                                                                                                                                                   | —                    |
| Checkpoint A (H5.5 a–c): typecheck, ESLint, unit + ba gate, integration, e2e, quét graph                                                     | cây sau Phase A            | exit 0; gate 56/56; unit `identity-access` 18 suite/213; integration focused 24 suite/275 (lượt lưu log: 264 s, 0 `42501`, 0 DB sót); e2e 14 suite/274; `crossCapabilityImports` 21 → 2; chu trình auth ↔ accounts hết; 3 private export gỡ (`PasswordHasher`, `ApprovalRoleRepo`, `SuccessorEligibility`)                                                                                                                                                                                                  | xem U-01 dưới        |
| Checkpoint B (H5.6): typecheck, unit + gate, module graph, integration focused, quét SQL                                                     | cây sau Phase B            | exit 0; module graph 15/15; unit + gate 20 suite/260; integration 24 suite/275 (147 s, 0 `42501`, 0 DB sót); 0 `authSession` trong `recovery.repo.ts`; `crossCapabilityImports` 2 → 0; gỡ export `AccountRepo`, `RecoveryRepo` và mục oversized `recovery.service.ts`; 0 service > 6 dependency                                                                                                                                                                                                             | —                    |
| Checkpoint C (H5.7): typecheck, unit + ba gate, integration focused, zero-hit, ratchet hai chiều                                             | cây sau Phase C            | exit 0; unit `identity-access` 17 suite/201; integration 24 suite/275 (167 s, 0 `42501`, 0 DB sót); ratchet: thêm lại một mục ledger → fail “stale”; thêm lại import `auth/session.repo` vào `account-status.service.ts` → fail “new violation”; khai `SessionRepo` trong facade → 4 test module graph fail; khôi phục byte-identical, gate 59/59                                                                                                                                                           | —                    |
| Quét cuối: move không mất code, single writer, dependency, kích thước, zero-hit                                                              | cây cuối                   | 334/336 dòng code `account.repo.ts` có ở bốn repo (thiếu hai dòng header class); `recovery.repo.ts` chỉ thiếu `revokeSessions`; 19 refusal, audit action, outcome, status, lock mode, lý do thu hồi của recovery giữ; mỗi bảng một writer; 0 service > 6 dependency; file lớn nhất 296; root 6 file/0 controller; 0 import `accounts/account.repo`, `auth/password-hasher`, `auth/password.policy`, `auth/action-token`, root `recovery.{service,repo,errors,arguments,types}` trong `src`/`test`/`scripts` | —                    |
| `pnpm check`                                                                                                                                 | cây cuối                   | exit 0: rules 101 tệp/853 link 0 lỗi, format, prisma, lint, typecheck, unit 67 suite/971 test (+1 suite, +3 test so với Wave A), script 18 + 19, test discovery, build                                                                                                                                                                                                                                                                                                                                      | —                    |
| `pnpm test:e2e`                                                                                                                              | cây cuối                   | exit 0; 14 suite/274 test                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | —                    |
| `pnpm test:integration` (toàn bộ)                                                                                                            | cây cuối, PostgreSQL riêng | exit 0; 46 suite/625 test (+2 ca `CP0-08`), 313 s; không `42501`; 0 database `slm_*_test` sót; container đã xóa                                                                                                                                                                                                                                                                                                                                                                                             | remote CI chưa chạy  |
| `pnpm openapi:export` + `cmp` + inventory                                                                                                    | cây cuối                   | `openapi.json` byte-identical `14fd428b…` (`cmp` với `19cf3b1`, git không đổi); 60 operation, 61 schema; 20 operation identity-access giữ operationId, status, security, request/response schema (inventory trước/sau trùng)                                                                                                                                                                                                                                                                                | —                    |
| `pnpm rules:check`, `pnpm rules:format`, Prettier/ESLint, `git diff --check`, tracker `prettier --check`                                     | cây cuối                   | exit 0; Prettier/ESLint sạch; `git diff --check` sạch; tracker sạch                                                                                                                                                                                                                                                                                                                                                                                                                                         | —                    |

**U-01 (quan sát, chưa xác nhận):** lượt integration đầu ở Checkpoint A có 2 suite fail ở mức suite (275/275 test vẫn
pass) và 2 database sót; log lượt đó không lưu nên không xác định được nguyên nhân (nghi teardown, như quan sát U-01 trước
đây). Ba lượt sau (A chạy lại, B, C) và lượt full cuối xanh, không DB sót; runner nay luôn lưu log.

**Kiểm soát còn lại / giới hạn:** `LEGACY_PRIVATE_EXPORTS` còn 6 mục ngoài `identity-access` (E4 `organization` ×3 — G3;
data-import, notifications, operating-parameters — H6/H8); `oversizedFiles` còn env-schema và `employee-import.service.ts`;
remote CI, Owner review chưa có.

- [x] AC trong scope có bằng chứng; lỗi đã xử lý hoặc ghi blocker.
- [x] Spec/plan/test design phản ánh đúng implementation cuối.
- [x] Diff cuối đã tự review; phần chưa kiểm chứng ghi rõ (remote CI, Owner review, U-01).
- [ ] Giao Owner review trên revision cụ thể; cập nhật roadmap/PR. Chỉ ghi `merged-dev`, `accepted`, `released` sau
      đúng sự kiện thật.
